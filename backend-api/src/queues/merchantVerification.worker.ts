import { Worker } from 'bullmq';
import { getRedisConnection } from './redis';
import { MERCHANT_VERIFICATION_QUEUE, MerchantVerificationJob } from './merchantVerification.queue';
import { stickerService } from '../services/sticker.service';
import { logger } from '../utils/logger';

/**
 * Concurrency: bounded so a burst of uploads can't OOM the Tesseract process.
 * Default 4 matches the OCR_MAX_CONCURRENT semaphore the API used to enforce
 * inline. Keep them in sync — moving merchant verification to the worker means
 * the API's inline ceiling no longer applies to this codepath.
 */
const WORKER_CONCURRENCY = parseInt(process.env.OCR_MAX_CONCURRENT || '4', 10);

const JOB_TIMEOUT_MS = 90_000;

export function startMerchantVerificationWorker(): Worker | null {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn('REDIS_URL not set — merchant verification worker NOT started.');
    return null;
  }

  const worker = new Worker<MerchantVerificationJob>(
    MERCHANT_VERIFICATION_QUEUE,
    async (job) => {
      const { scanId } = job.data;
      logger.info(`merchant-verification: processing scan ${scanId} (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1})`);
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`merchant-verification job timed out after ${JOB_TIMEOUT_MS}ms`)),
          JOB_TIMEOUT_MS,
        );
      });
      try {
        await Promise.race([stickerService.runMerchantVerification(scanId), timeout]);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    },
    {
      connection,
      concurrency: WORKER_CONCURRENCY,
    },
  );

  worker.on('completed', (job) => {
    logger.info(`merchant-verification: completed scan ${job.data.scanId}`);
  });

  worker.on('failed', (job, err) => {
    // BullMQ will retry per the queue's attempts/backoff config. Only the final
    // failure (after all retries exhausted) lands here with no more attempts left.
    const final = job && job.attemptsMade >= (job.opts.attempts ?? 1);
    const level: 'error' | 'warn' = final ? 'error' : 'warn';
    logger[level](`merchant-verification: ${final ? 'final' : 'transient'} failure for scan ${job?.data?.scanId}: ${err.message}`);
  });

  worker.on('error', (err) => {
    logger.error(`merchant-verification worker error: ${err.message}`);
  });

  logger.info(`merchant-verification worker started (concurrency=${WORKER_CONCURRENCY})`);
  return worker;
}
