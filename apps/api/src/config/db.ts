import { PrismaClient } from '@prisma/client';
import { config } from './env.js';
import { logger } from './logger.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

if (!process.env.POSTGRES_URL) {
  logger.warn('POSTGRES_URL is not set - database operations will fail until it is provided');
}

const redactedUrl = process.env.POSTGRES_URL?.replace(/:[^:@/]+@/, ':***@');
logger.info({ url: redactedUrl ?? '(not set)' }, 'Initializing Prisma client');

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  });

if (config.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to database');
    throw error;
  }

  // Serverless Postgres (Neon) drops idle connections, making the first
  // request after a gap fail. Ping periodically to keep the pool warm and
  // force Prisma to recycle dead connections before real traffic hits them.
  const KEEPALIVE_MS = 45_000;
  const ping = async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'DB keepalive ping failed - will retry');
      try {
        await prisma.$disconnect();
        await prisma.$connect();
        logger.info('DB connection recycled after keepalive failure');
      } catch (reconnectError) {
        logger.error({ err: reconnectError }, 'DB reconnect failed - next ping will retry');
      }
    }
  };
  setInterval(ping, KEEPALIVE_MS);
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}