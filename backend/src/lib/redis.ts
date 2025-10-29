import Redis from 'ioredis';
import { env } from './env';

const redisConfig = {
  host: env.REDIS_HOST,
  port: parseInt(env.REDIS_PORT),
  password: env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: null,
};

export const redis = new (Redis as any)(redisConfig);

export async function checkRedisConnection() {
  try {
    await redis.ping();
    return { connected: true, message: 'Redis connected' };
  } catch (error) {
    return { connected: false, message: `Redis connection failed: ${error}` };
  }
}
