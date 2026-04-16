/**
 * Worker process entrypoint.
 *
 * Runs as a separate service from the API (npm run worker / `web` vs `worker` on
 * Render). Hosts BullMQ workers — currently merchant verification, with room for
 * more queues later.
 *
 * Why a separate process: OCR is CPU-bound and can take 10–30s per receipt. Mixing
 * that into the API event loop starves request handling. Running it standalone
 * also means we can scale the worker independently of the API.
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import { logger } from './utils/logger';
import { startMerchantVerificationWorker } from './queues/merchantVerification.worker';

async function main() {
  if (!process.env.REDIS_URL) {
    logger.error('FATAL: REDIS_URL is required to run the worker process.');
    process.exit(1);
  }

  const worker = startMerchantVerificationWorker();
  if (!worker) {
    logger.error('FATAL: failed to start merchant-verification worker.');
    process.exit(1);
  }

  logger.info('Worker process up — listening for jobs.');

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — closing worker.`);
    await worker.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error(`Worker startup failed: ${err?.message ?? err}`);
  process.exit(1);
});
