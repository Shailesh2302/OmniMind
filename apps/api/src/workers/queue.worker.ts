import { Redis } from 'ioredis';
import path from 'path';
import fs from 'fs';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/db.js';
import { trimVideo, generateThumbnail } from '../utils/ffmpeg.js';
import type { DocumentJobData, ClipJobData } from '../services/queue.service.js';

// Queue ownership:
//   aether:video:queue    -> Rust worker (ffmpeg, transcription, thumbnails)
//   aether:document:queue -> Node worker (document indexing via AI service)
//   aether:clip:queue     -> Node worker (ffmpeg clip cutting)
const QUEUES = {
  document: 'aether:document:queue',
  clip: 'aether:clip:queue',
};

async function processDocumentJob(redis: Redis, job: DocumentJobData & { id: string }) {
  const jobKey = job.id;
  logger.info({ jobId: jobKey, type: 'document', fileId: job.document_id }, 'Processing document job');

  try {
    await redis.hset(`aether:job:${jobKey}`, 'status', 'PROCESSING').catch(() => undefined);

    const aiUrl = config.aiServiceUrl;

    const indexResp = await fetch(`${aiUrl}/api/v1/documents/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: job.document_id,
        file_path: path.resolve(job.input_path),
        user_id: job.parameters?.userId || 'unknown',
        mime_type: job.parameters?.mimeType || 'application/octet-stream',
      }),
    });

    if (!indexResp.ok) {
      const errText = await indexResp.text();
      throw new Error(`Indexing failed: ${errText}`);
    }

    await prisma.file.update({
      where: { id: job.document_id },
      data: { status: 'COMPLETED' },
    }).catch(() => undefined);

    await redis.hset(`aether:job:${jobKey}`, 'status', 'COMPLETED').catch(() => undefined);
    logger.info({ jobId: jobKey, fileId: job.document_id }, 'Document job completed');
  } catch (err) {
    logger.error({ jobId: jobKey, err }, 'Document job failed');

    if (job?.document_id) {
      await prisma.file.update({
        where: { id: job.document_id },
        data: { status: 'FAILED' },
      }).catch(() => undefined);
    }

    await redis.hset(`aether:job:${jobKey}`, 'status', 'FAILED').catch(() => undefined);
    await redis.hset(`aether:job:${jobKey}`, 'error', (err as Error).message).catch(() => undefined);
  }
}

async function processClipJob(redis: Redis, job: ClipJobData & { id: string }) {
  const jobKey = job.id;
  logger.info({ jobId: jobKey, type: 'clip', fileId: job.video_id }, 'Processing clip job');

  try {
    await redis.hset(`aether:job:${jobKey}`, 'status', 'PROCESSING').catch(() => undefined);

    if (!fs.existsSync(job.input_path)) {
      throw new Error(`Source video not found: ${job.input_path}`);
    }

    const clipsDir = path.resolve(config.storage.clipsDir);
    fs.mkdirSync(clipsDir, { recursive: true });
    const clipFilename = `${jobKey.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
    const clipPath = path.join(clipsDir, clipFilename);

    await trimVideo(job.input_path, clipPath, Number(job.start_time) || 0, Number(job.end_time) || 10);

    let thumbnail: string | null = null;
    try {
      const thumbPath = path.join(clipsDir, clipFilename.replace(/\.mp4$/, '.jpg'));
      await generateThumbnail(clipPath, thumbPath, 0);
      thumbnail = `/storage/clips/${path.basename(thumbPath)}`;
    } catch (thumbErr) {
      logger.warn({ thumbErr }, 'Thumbnail generation failed');
    }

    const clipId = job.parameters?.clipId;
    if (clipId) {
      await prisma.clip.update({
        where: { id: clipId },
        data: {
          status: 'COMPLETED',
          videoUrl: `/storage/clips/${clipFilename}`,
          thumbnail,
        },
      });
    }

    await redis.hset(`aether:job:${jobKey}`, 'status', 'COMPLETED');
    logger.info({ jobId: jobKey, clipPath }, 'Clip job completed');
  } catch (err) {
    logger.error({ jobId: jobKey, err }, 'Clip job failed');

    const clipId = job?.parameters?.clipId;
    if (clipId) {
      try {
        await prisma.clip.update({
          where: { id: clipId },
          data: { status: 'FAILED' },
        });
      } catch (dbErr) {
        logger.warn({ dbErr }, 'Failed to mark clip as FAILED');
      }
    }

    await redis.hset(`aether:job:${jobKey}`, 'status', 'FAILED');
    await redis.hset(`aether:job:${jobKey}`, 'error', (err as Error).message);
  }
}

async function pollQueues(redis: Redis) {
  for (const [type, queueKey] of Object.entries(QUEUES)) {
    try {
      // Non-blocking pop: a dead connection can leave BRPOP(0)
      // suspended forever, silently stalling the whole worker.
      const jobStr = await redis.lpop(queueKey);
      if (!jobStr) continue;

      let job;
      try {
        job = JSON.parse(jobStr);
      } catch {
        logger.warn({ queue: queueKey }, 'Skipping malformed job payload');
        continue;
      }

      switch (type) {
        case 'document':
          await processDocumentJob(redis, job);
          break;
        case 'clip':
          await processClipJob(redis, job);
          break;
      }
    } catch (err) {
      logger.warn({ err, queue: queueKey }, 'Queue poll error');
    }
  }
}

async function main() {
  logger.info('Starting queue worker');

  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
    reconnectOnError: () => true,
    commandTimeout: 15_000,
  });

  redis.on('connect', () => logger.info('Queue worker connected to Redis'));
  redis.on('error', (err) => logger.warn({ err }, 'Queue worker Redis error'));

  const pollInterval = parseInt(process.env.QUEUE_POLL_INTERVAL || '1000', 10);

  for (;;) {
    await pollQueues(redis);
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

main().catch((err) => {
  logger.error({ err }, 'Queue worker exited');
  process.exit(1);
});
