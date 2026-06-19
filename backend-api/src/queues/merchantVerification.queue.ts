import { Queue, JobsOptions } from 'bullmq';
import { getRedisConnection } from './redis';
import { logger } from '../utils/logger';

export interface MerchantVerificationJob {
  scanId: string;
}

export const MERCHANT_VERIFICATION_QUEUE = 'merchant-verification';

const DEFAULT_JOB_OPTS: JobsOptions = {
  // 3 attempts with exponential backoff: ~5s, ~25s, ~125s. OCR is the dominant
  // cost; a transient S3/OCR failure shouldn't block the scan permanently.
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  // Keep a modest number of completed/failed jobs for observability. Lower counts
  // reduce Redis memory growth and limit the cleanup scan work after cap resets.
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 200 },
};

let cachedQueue: Queue<MerchantVerificationJob> | null | undefined;

export function getMerchantVerificationQueue(): Queue<MerchantVerificationJob> | null {
  if (cachedQueue !== undefined) return cachedQueue;

  const connection = getRedisConnection();
  if (!connection) {
    cachedQueue = null;
    return cachedQueue;
  }

  cachedQueue = new Queue<MerchantVerificationJob>(MERCHANT_VERIFICATION_QUEUE, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });

  cachedQueue.on('error', (err) => {
    logger.error(`merchant-verification queue error: ${err.message}`);
  });

  return cachedQueue;
}

/**
 * Enqueue a merchant-verification job. Returns true if the job was enqueued,
 * false if Redis is unavailable (caller should fall back to detached-promise).
 */
export async function enqueueMerchantVerification(scanId: string): Promise<boolean> {
  const queue = getMerchantVerificationQueue();
  if (!queue) return false;
  try {
    await queue.add('verify', { scanId }, { jobId: `scan:${scanId}` });
    return true;
  } catch (err: any) {
    logger.error(`Failed to enqueue merchant verification for scan ${scanId}: ${err?.message ?? err}`);
    return false;
  }
}
