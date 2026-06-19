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

export const RATE_LIMIT_BACKOFF_BASE_MS = 10_000;
export const MAX_RATE_LIMIT_BACKOFF_MS = 10 * 60_000; // 10 min
export const RATE_LIMIT_RESET_QUIET_MS = 60_000; // reset after 60 s with no rate-limit errors

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
      stalledInterval: 30_000,  // ¼ of lockDuration; keeps stall-checks clear of lock-renewal window (operational best-practice, not a BullMQ invariant)
      lockDuration: 120_000,   // default 30 s → 2 min; OCR runs up to 90 s, avoids mid-job lock renewals
    },
  );

  let rateLimitBackoffMs = RATE_LIMIT_BACKOFF_BASE_MS;
  let rateLimitResetTimer: NodeJS.Timeout | undefined;
  let isPaused = false;
  let resumeTimer: NodeJS.Timeout | undefined;

  /** Schedule (or reschedule) a quiet-period reset of the backoff counter. */
  function scheduleRateLimitReset(): void {
    if (rateLimitBackoffMs <= RATE_LIMIT_BACKOFF_BASE_MS) return; // already at base, nothing to reset
    if (rateLimitResetTimer) clearTimeout(rateLimitResetTimer);
    rateLimitResetTimer = setTimeout(() => {
      rateLimitResetTimer = undefined;
      rateLimitBackoffMs = RATE_LIMIT_BACKOFF_BASE_MS;
      logger.info('merchant-verification: rate-limit backoff reset to base after quiet period');
    }, RATE_LIMIT_RESET_QUIET_MS);
  }

  worker.on('completed', (job) => {
    logger.info(`merchant-verification: completed scan ${job.data.scanId}`);
    // Reschedule the quiet-period reset on each successful completion so the
    // timer only fires after 60 s of sustained success with no new rate-limit errors.
    // Guard: do not start the reset countdown while paused — in-flight jobs can
    // complete during a pause window, and a premature reset would defeat the
    // exponential backoff at high back-pressure (e.g. 10-min ceiling).
    if (!isPaused) {
      scheduleRateLimitReset();
    }
  });

  worker.on('failed', (job, err) => {
    // The `failed` event fires on every failed attempt. The `final` flag
    // distinguishes the terminal failure (all retries exhausted) from a transient one.
    const final = job && job.attemptsMade >= (job.opts.attempts ?? 1);
    const level: 'error' | 'warn' = final ? 'error' : 'warn';
    logger[level](`merchant-verification: ${final ? 'final' : 'transient'} failure for scan ${job?.data?.scanId}: ${err.message}`);
  });

  worker.on('error', (err) => {
    logger.error(`merchant-verification worker error: ${err.message}`);
    if (err.message.includes('max requests limit exceeded')) {
      // Cancel any pending reset — a new rate-limit error means we are not yet
      // in the clear. Reschedule after the worker resumes so the quiet window
      // only starts counting from the next successful completion.
      if (rateLimitResetTimer) {
        clearTimeout(rateLimitResetTimer);
        rateLimitResetTimer = undefined;
      }
      // Cancel any pending resume timer so the new (higher-backoff) delay wins.
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = undefined;
      }
      const delay = rateLimitBackoffMs;
      rateLimitBackoffMs = Math.min(rateLimitBackoffMs * 2, MAX_RATE_LIMIT_BACKOFF_MS);
      logger.warn(`merchant-verification: Redis rate limit hit — pausing worker for ${delay / 1000}s`);
      // Only call pause() when not already paused
      if (!isPaused) {
        isPaused = true;
        worker.pause(true).catch((pauseErr) => {
          isPaused = false; // revert: pause failed, worker is still running
          logger.warn(`merchant-verification: pause failed: ${pauseErr?.message ?? pauseErr}`);
        });
      }
      // Always arm a new resume timer — even when already paused — so a stacked
      // error replaces the cancelled timer rather than leaving the worker permanently paused.
      resumeTimer = setTimeout(() => {
        resumeTimer = undefined;
        isPaused = false;
        // BullMQ resume() never throws synchronously — errors are emitted via the
        // 'error' event, which the handler above already processes.
        worker.resume();
      }, delay);
    }
  });

  worker.on('resumed', () => {
    isPaused = false;
  });

  worker.on('closing', () => {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = undefined;
    }
    if (rateLimitResetTimer) {
      clearTimeout(rateLimitResetTimer);
      rateLimitResetTimer = undefined;
    }
  });

  logger.info(`merchant-verification worker started (concurrency=${WORKER_CONCURRENCY})`);
  return worker;
}
