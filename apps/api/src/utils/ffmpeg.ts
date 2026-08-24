import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { logger } from '../config/logger.js';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
  bitrate: number;
  fps: number;
}

export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    let output = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}`));
        return;
      }

      try {
        const data = JSON.parse(output);
        const videoStream = data.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
        const format = data.format;

        const [num, den] = String(videoStream?.r_frame_rate || '0/1').split('/').map(Number);
        const fps = den ? num / den : 0;

        resolve({
          duration: parseFloat(format.duration || '0'),
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          codec: videoStream?.codec_name || 'unknown',
          bitrate: parseInt(format.bit_rate || '0', 10),
          fps,
        });
      } catch (error) {
        reject(error);
      }
    });

    ffprobe.on('error', reject);
  });
}

export async function generateThumbnail(
  videoPath: string,
  outputPath: string,
  timestamp = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-ss', timestamp.toString(),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      outputPath,
    ]);

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      resolve(outputPath);
    });

    ffmpeg.on('error', reject);
  });
}

export async function extractAudio(videoPath: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-q:a', '2',
      outputPath,
    ]);

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      resolve(outputPath);
    });

    ffmpeg.on('error', reject);
  });
}

export async function trimVideo(
  videoPath: string,
  outputPath: string,
  startTime: number,
  endTime: number
): Promise<string> {
  const duration = Math.max(endTime - startTime, 0.5);

  const run = (args: string[]) =>
    new Promise<boolean>((resolve) => {
      const ffmpeg = spawn('ffmpeg', args);
      let stderr = '';
      ffmpeg.stderr.on('data', (d) => {
        stderr += d;
      });
      ffmpeg.on('close', (code) => resolve(code === 0));
      ffmpeg.on('error', () => resolve(false));
      void stderr;
    });

  // Attempt 1: lossless stream copy (fast path).
  const copied = await run([
    '-y',
    '-ss', String(startTime),
    '-t', String(duration),
    '-i', videoPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]);
  if (copied) return outputPath;

  // Attempt 2: professional codecs (DNxHD/ProRes etc.) or odd containers
  // cannot always be muxed into MP4 - re-encode to universally playable
  // H.264/AAC instead of failing.
  logger.info({ videoPath }, 'Stream copy failed, re-encoding clip');
  const encoded = await run([
    '-y',
    '-ss', String(startTime),
    '-t', String(duration),
    '-i', videoPath,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]);
  if (!encoded) {
    throw new Error(`ffmpeg could not trim video (${videoPath})`);
  }
  return outputPath;
}

export async function getVideoDuration(filePath: string): Promise<number> {
  const metadata = await getVideoMetadata(filePath);
  return metadata.duration;
}

export async function createClipDirectory(clipsDir: string): Promise<void> {
  try {
    await fs.mkdir(clipsDir, { recursive: true });
  } catch (error) {
    logger.error({ error, clipsDir }, 'Failed to create clips directory');
    throw error;
  }
}