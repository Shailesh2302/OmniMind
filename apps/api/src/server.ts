import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import fs from 'fs';

import { config } from './config/env.js';
import { connectDatabase, prisma } from './config/db.js';
import { logger } from './config/logger.js';
import { vectorService } from './services/vector.service.js';
import { queueService } from './services/queue.service.js';

import authRoutes from './modules/auth/auth.routes.js';
import chatRoutes from './routes/chat.routes.js';
import searchRoutes from './routes/search.routes.js';
import fileRoutes from './routes/file.routes.js';
import clipRoutes from './routes/clip.routes.js';
import userRoutes from './routes/user.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import indexRoutes from './routes/index.routes.js';
import storageRoutes from './routes/storage.routes.js';
import videoIntelligenceRoutes from './routes/videoIntelligence.routes.js';
import videoRoutes from './routes/video.routes.js';
import internalRoutes from './routes/internal.routes.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync('./storage/uploads')) {
  fs.mkdirSync('./storage/uploads', { recursive: true });
}
if (!fs.existsSync('./storage/clips')) {
  fs.mkdirSync('./storage/clips', { recursive: true });
}
if (!fs.existsSync('./storage/thumbnails')) {
  fs.mkdirSync('./storage/thumbnails', { recursive: true });
}

app.use('/storage/uploads', express.static('./storage/uploads'));
app.use('/storage/clips', express.static('./storage/clips'));
app.use('/storage/thumbnails', express.static('./storage/thumbnails'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'api',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/api/health/detailed', async (req, res) => {
  const health: any = {
    api: { status: 'ok', timestamp: new Date().toISOString() },
    database: { status: 'unknown' },
    redis: { status: 'unknown' },
    aiService: { status: 'unknown' },
    qdrant: { status: 'unknown' },
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database.status = 'ok';
  } catch (error) {
    health.database.status = 'error';
    health.database.error = (error as Error).message;
  }

  health.redis.status = queueService.isConnected() ? 'ok' : 'disconnected';

  try {
      const aiResponse = await fetch(`${config.aiServiceUrl}/api/v1/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    health.aiService.status = aiResponse.ok ? 'ok' : 'error';
  } catch (error) {
    health.aiService.status = 'unavailable';
  }

  try {
    const qdrantHealthy = await vectorService.checkHealth();
    health.qdrant.status = qdrantHealthy ? 'ok' : 'error';
  } catch (error) {
    health.qdrant.status = 'unavailable';
  }

  const allHealthy =
    health.database.status === 'ok' &&
    health.redis.status === 'ok' &&
    health.aiService.status === 'ok' &&
    health.qdrant.status === 'ok';
  res.status(allHealthy ? 200 : 503).json(health);
});

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/files/upload', uploadRoutes);
app.use('/api/clips', clipRoutes);
app.use('/api/users', userRoutes);
app.use('/api/index', indexRoutes);
app.use('/storage', storageRoutes);
app.use('/api/video', videoIntelligenceRoutes);
app.use('/api/video-features', videoRoutes);
app.use('/api/internal', internalRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  const isClientError = err.status && err.status < 500;
  res.status(err.status || 500).json({
    error: isClientError
      ? err.message
      : config.nodeEnv === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error',
  });
});

async function startServer() {
  try {
    await connectDatabase();
    logger.info('Database connected');

    // Auto-recovery: files left in PROCESSING/PENDING by a previous crash
    // get requeued so they never stay stuck forever.
    try {
      const cutoff = new Date(Date.now() - 2 * 60 * 1000); // ignore fresh uploads
      const stale = await prisma.file.findMany({
        where: { status: { in: ['PROCESSING', 'PENDING'] }, createdAt: { lt: cutoff } },
        select: { id: true, path: true, mimeType: true, userId: true },
      });
      for (const f of stale) {
        const isMedia = f.mimeType.startsWith('video/') || f.mimeType.startsWith('audio/');
        if (isMedia) {
          await queueService.addVideoProcessingJob({
            fileId: f.id,
            filePath: f.path,
            mimeType: f.mimeType,
            userId: f.userId,
          });
        } else {
          await queueService.addDocumentProcessingJob({
            fileId: f.id,
            filePath: f.path,
            mimeType: f.mimeType,
            userId: f.userId,
          });
        }
        await prisma.file.update({ where: { id: f.id }, data: { status: 'PENDING' } }).catch(() => undefined);
      }
      if (stale.length > 0) logger.info({ recovered: stale.length }, 'Requeued stale files from previous run');
    } catch (recoverErr) {
      logger.warn({ recoverErr }, 'Stale-file recovery scan failed');
    }

    const server = app.listen(config.port, () => {
      logger.info(`🚀 Aether API running on http://localhost:${config.port}`);
      logger.info(`📚 Health check: http://localhost:${config.port}/api/health`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);
      server.close(async () => {
        try {
          await prisma.$disconnect();
          await queueService.disconnect();
        } catch (error) {
          logger.warn({ error }, 'Error during shutdown cleanup');
        }
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();