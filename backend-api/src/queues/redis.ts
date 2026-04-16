import IORedis, { Redis, RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

// Single shared Redis connection for the process. BullMQ requires a connection
// per Queue/Worker, but they all share the same underlying ioredis instance to
// keep the FD count and reconnection logic centralised.
//
// Returns null when REDIS_URL is unset — callers must handle that and fall back
// to the legacy detached-promise path. We never want to throw here, because that
// would crash the API process at startup just because the durable-job feature
// hasn't been provisioned yet.
let cached: Redis | null | undefined;

export function getRedisConnection(): Redis | null {
  if (cached !== undefined) return cached;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('REDIS_URL not set — durable job queue disabled. Merchant verification will run as a detached promise (legacy behavior).');
    cached = null;
    return cached;
  }

  // BullMQ requires maxRetriesPerRequest=null so blocking commands (BRPOPLPUSH)
  // don't get aborted after the default 20 retries. Without this, workers die
  // silently after a few minutes of idle.
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };

  try {
    cached = new IORedis(url, options);
    cached.on('error', (err) => {
      // Don't crash on transient connection errors — BullMQ will retry.
      logger.error(`Redis connection error: ${err.message}`);
    });
    cached.on('connect', () => logger.info('Redis connected'));
    return cached;
  } catch (err: any) {
    logger.error(`Failed to create Redis connection: ${err?.message ?? err}`);
    cached = null;
    return cached;
  }
}
