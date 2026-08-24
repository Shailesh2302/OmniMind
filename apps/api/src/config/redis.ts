import Redis from 'ioredis';
import { config } from './env.js';
import { logger } from './logger.js';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (_times) => null,
  ...(String(config.redis.port) === '6379' ? {} : { tls: {} }),
  connectTimeout: 10000,
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (error) => {
  logger.error({ error }, 'Redis connection error');
});

export async function connectRedis() {
  try {
    await redis.ping();
    logger.info('Redis ping successful');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to Redis');
    throw error;
  }
}

export async function disconnectRedis() {
  await redis.quit();
}
