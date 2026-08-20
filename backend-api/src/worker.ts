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

import http from 'http';
import { logger } from './utils/logger';
import { startMerchantVerificationWorker } from './queues/merchantVerification.worker';
import { getRedisConnection } from './queues/redis';
import { detach } from './utils/detach';

// BC-QA-058: dedicated liveness port for Fly's worker health check (see
// `[[services]] processes = ['worker']` in fly.toml). Deliberately distinct
// from the app's PORT/3001 so `npm run dev` (app) and `npm run dev:worker`
// can run side by side locally without a port collision.
//
// Explicit undefined check rather than `Number(...) || 3002`: the latter
// would silently coerce an operator-supplied `WORKER_PORT=0` (a common
// convention for "let the OS assign an ephemeral port") into the 3002
// default, since 0 is falsy in JS.
const WORKER_HEALTH_PORT =
  process.env.WORKER_PORT !== undefined ? Number(process.env.WORKER_PORT) : 3002;

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

  // BC-QA-058-task-r1 F1: `worker.isRunning()` (used below) does NOT catch a
  // Redis disconnect that happens after the worker has already started.
  // Traced in BullMQ's source: `isRunning()`'s backing flag is only cleared
  // in `run()`'s `finally` block, which only runs if `mainLoop()` itself
  // throws or returns — but BullMQ wraps job-fetch failures in
  // `retryIfFailed(..., { onlyEmitError: true })`, which retries forever
  // (matching this codebase's `enableReadyCheck: false` / no custom
  // `retryStrategy` ioredis options in redis.ts), so `mainLoop()` never
  // exits during an outage and `isRunning()` never flips false. Confirmed
  // live: killing a real Redis process this worker was connected to left
  // `worker.isRunning()` (and thus the old handler) returning healthy for
  // 15+ continuous seconds of genuine, ongoing outage.
  //
  // Fix: track the shared Redis connection's own status (ioredis's ground
  // truth for "can this connection currently serve commands", set
  // synchronously by ioredis on every connect/close/reconnect transition —
  // see node_modules/ioredis/built/Redis.js's `setStatus`) as a second,
  // independent liveness signal. `startMerchantVerificationWorker()` already
  // returned non-null above, which only happens when `getRedisConnection()`
  // produced a connection (see redis.ts) — so `getRedisConnection()` here
  // returns that SAME cached singleton, the actual connection BullMQ is
  // running jobs against, not a new one.
  const redisConnection = getRedisConnection();

  // A single dropped-connection blip (one 'close'/'reconnecting' event that
  // resolves before the next poll) shouldn't flip liveness to unhealthy —
  // that would just be noisy flapping against Fly's check. Require the
  // connection to have been continuously non-ready for REDIS_UNHEALTHY_MS
  // before failing the check, so a transient reconnect self-heals
  // invisibly, while a genuine, sustained outage (whose connection never
  // returns to 'ready') is still caught well within Fly's own check cadence
  // (10s interval / 30s grace — see fly.toml's `[[services.http_checks]]`
  // for `processes = ['worker']`).
  const REDIS_UNHEALTHY_MS = 5_000;
  let redisNotReadySince: number | null =
    redisConnection && redisConnection.status !== 'ready' ? Date.now() : null;

  if (redisConnection) {
    redisConnection.on('ready', () => {
      redisNotReadySince = null;
    });
    const markRedisNotReady = () => {
      if (redisNotReadySince === null) redisNotReadySince = Date.now();
    };
    redisConnection.on('close', markRedisNotReady);
    redisConnection.on('reconnecting', markRedisNotReady);
    redisConnection.on('end', markRedisNotReady);
  }

  function isRedisSustainedOutage(): boolean {
    // No durable-queue Redis configured is a state `startMerchantVerification
    // Worker()` already refuses to start in (see the `!worker` exit above),
    // so `redisConnection` is non-null in every reachable case — this guard
    // is defensive rather than a real runtime branch.
    if (!redisConnection) return false;
    return redisNotReadySince !== null && Date.now() - redisNotReadySince >= REDIS_UNHEALTHY_MS;
  }

  // Minimal liveness listener — purely so Fly has a port to check against.
  // No routes, no auth, no business logic: it exists only to answer "is this
  // process alive", mirroring src/server.ts's /health handler in spirit but
  // deliberately not reusing the app's HTTP stack (express, CORS, helmet,
  // rate limiters, etc. — none of that applies to a queue consumer).
  //
  // Bound only AFTER `startMerchantVerificationWorker()` has returned a live
  // worker above: a worker that crashes or exits before that point never
  // opens this port, so Fly's check (fly.toml `[[services]] processes =
  // ['worker']`) correctly reports it unhealthy instead of green — closing
  // the gap BC-QA-054 documented but could not fix without this listener.
  //
  // Each request re-checks two independent signals rather than answering a
  // static 200 forever: `worker.isRunning()` (BullMQ's live flag, flipped
  // false once the worker has been told to close) catches the worker being
  // explicitly shut down; `isRedisSustainedOutage()` (above) catches the
  // case `isRunning()` cannot — a Redis disconnect after initial connect
  // that BullMQ's own retry loop otherwise papers over indefinitely.
  const healthServer = http.createServer((_req, res) => {
    if (!worker.isRunning()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'not_running', timestamp: new Date().toISOString() }));
      return;
    }
    if (isRedisSustainedOutage()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'redis_unhealthy', timestamp: new Date().toISOString() }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  });
  healthServer.listen(WORKER_HEALTH_PORT, '0.0.0.0', () => {
    logger.info(`Worker liveness check listening on port ${WORKER_HEALTH_PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — closing worker.`);
    await worker.close();
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  return { worker, healthServer };
}

// Don't auto-start in test environment — mirrors src/server.ts's identical
// NODE_ENV guard. Tests import `main` directly and drive it against mocked
// deps instead of letting module import trigger a real process.exit().
if (process.env.NODE_ENV !== 'test') {
  detach(main(), (err: any) => {
    logger.error(`Worker startup failed: ${err?.message ?? err}`);
    process.exit(1);
  });
}

export { main };
