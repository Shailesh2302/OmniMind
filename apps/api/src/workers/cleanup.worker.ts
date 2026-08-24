import { prisma } from '../config/db.js';
import { logger } from '../config/logger.js';
import fs from 'fs';
import path from 'path';

const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL || '3600000', 10);
const FILE_RETENTION_MS = parseInt(process.env.FILE_RETENTION_MS || '604800000', 10);
const UPLOAD_DIR = process.env.UPLOAD_DIR || './storage/uploads';
const CLIPS_DIR = process.env.CLIPS_DIR || './storage/clips';

async function cleanupStaleFiles() {
  const cutoff = new Date(Date.now() - FILE_RETENTION_MS);
  logger.info({ cutoff }, 'Running file cleanup');

  try {
    const staleFiles = await prisma.file.findMany({
      where: { createdAt: { lt: cutoff }, status: 'PENDING' },
      select: { id: true, path: true },
    });

    for (const file of staleFiles) {
      try {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          logger.info({ fileId: file.id, path: file.path }, 'Deleted stale file');
        }
      } catch (err) {
        logger.warn({ fileId: file.id, err }, 'Failed to delete stale file');
      }

      await prisma.file.delete({ where: { id: file.id } });
    }

    if (staleFiles.length > 0) {
      logger.info({ count: staleFiles.length }, 'Cleanup completed');
    }
  } catch (err) {
    logger.error({ err }, 'Cleanup error');
  }
}

async function cleanTempDirectories() {
  for (const dir of [UPLOAD_DIR, CLIPS_DIR]) {
    try {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && Date.now() - stat.mtimeMs > FILE_RETENTION_MS) {
          fs.unlinkSync(fullPath);
          logger.info({ path: fullPath }, 'Cleaned temp file');
        }
      }
    } catch (err) {
      logger.warn({ dir, err }, 'Temp directory cleanup error');
    }
  }
}

async function main() {
  logger.info({ interval: CLEANUP_INTERVAL, retention: FILE_RETENTION_MS }, 'Starting cleanup worker');

  for (;;) {
    await cleanupStaleFiles();
    await cleanTempDirectories();
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_INTERVAL));
  }
}

main().catch((err) => {
  logger.error({ err }, 'Cleanup worker exited');
  process.exit(1);
});
