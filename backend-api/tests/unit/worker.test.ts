/**
 * Unit/integration test for the worker process's liveness HTTP listener
 * (BC-QA-058).
 *
 * Strategy: mock `startMerchantVerificationWorker` (never touch real BullMQ
 * or Redis — same approach as tests/unit/merchantVerification.worker.test.ts)
 * so we fully control "did the worker start" and can drive `main()` from
 * src/worker.ts directly. This pins the behaviour Fly's new `[[services]]
 * processes = ['worker']` check in fly.toml relies on:
 *
 *  - the worker fails to start (REDIS_URL unset, or the queue helper
 *    returns null) -> the liveness port is NEVER opened, so Fly's check
 *    correctly reports the machine unhealthy instead of green.
 *  - the worker starts -> the liveness port opens and answers 200.
 *  - SIGTERM -> the BullMQ worker AND the liveness listener both close.
 *  - `worker.isRunning()` flipping false -> 503.
 *  - BC-QA-058-task-r1 F1: a sustained Redis outage (the connection staying
 *    non-'ready') -> 503, even though `isRunning()` alone never catches this
 *    (see the comment above `isRedisSustainedOutage()` in src/worker.ts).
 *    `getRedisConnection` is mocked with a real `EventEmitter` (`status` +
 *    `.on()`/`.emit()`) so these tests can drive the exact same
 *    'ready'/'close'/'reconnecting'/'end' events the real ioredis connection
 *    emits, without touching a real Redis — the live-Redis-kill
 *    reproduction (documented in the task's final report) is what actually
 *    proves this against a real connection; this suite pins the state
 *    machine's logic.
 */

jest.mock('../../src/queues/merchantVerification.worker', () => ({
  startMerchantVerificationWorker: jest.fn(),
}));

jest.mock('../../src/queues/redis', () => ({
  getRedisConnection: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import http from 'http';
import { EventEmitter } from 'events';

/** Stand-in for ioredis's `Redis` instance: real EventEmitter + a mutable
 * `status` field, matching the two things src/worker.ts reads off it
 * (`.status` and `.on('ready' | 'close' | 'reconnecting' | 'end', ...)`). */
class FakeRedisConnection extends EventEmitter {
  status: string;
  constructor(status: string = 'ready') {
    super();
    this.status = status;
  }
}

// Fixed, distinct-from-3001/3002 port so this suite can't collide with a
// developer's locally running `npm run dev:worker`. jest.config.js pins
// maxWorkers:1, so there is no in-suite parallelism risk either.
const TEST_WORKER_PORT = '31532';

function get(port: string, path = '/health'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: Number(port), path }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
  });
}

function isPortOpen(port: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = http.get({ host: '127.0.0.1', port: Number(port), path: '/health', timeout: 300 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

describe('worker.ts liveness listener', () => {
  const ORIGINAL_ENV = { ...process.env };
  let exitSpy: jest.SpiedFunction<typeof process.exit>;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      REDIS_URL: 'redis://localhost:6379',
      WORKER_PORT: TEST_WORKER_PORT,
    };
    // code 1 (fatal-startup paths): throw, so `main()` rejects the way a real
    // process.exit(1) would halt execution — the two negative tests below
    // assert on that rejection.
    // code 0 (graceful shutdown path): no-op instead of throwing. shutdown()
    // in src/worker.ts calls this fire-and-forget (`void shutdown(signal)`),
    // so a throw here would surface as an unhandled rejection rather than a
    // clean assertion — a real process.exit(0) doesn't throw either, it just
    // never returns, so a no-op that lets the function finish is the closer
    // simulation.
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      if (code === 0) return undefined as never;
      throw new Error(`process.exit(${code}) called`);
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    process.env = { ...ORIGINAL_ENV };
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  });

  // Resolves `startMerchantVerificationWorker` from the SAME module registry
  // epoch that `src/worker.ts` will import from — must be called (and its
  // mock configured) BEFORE dynamically importing '../../src/worker' below,
  // since jest.resetModules() in beforeEach means the mock factory produces a
  // brand-new jest.fn() each test; a stale top-level reference would silently
  // target a discarded instance (see src/utils/detach.ts's header comment for
  // the same resetModules pitfall in this codebase).
  async function mockQueueWorker(): Promise<jest.Mock> {
    const mod = await import('../../src/queues/merchantVerification.worker');
    return mod.startMerchantVerificationWorker as jest.Mock;
  }

  // Same epoch-freshness reasoning as mockQueueWorker() above — must be
  // called (and configured) before dynamically importing '../../src/worker'.
  async function mockRedisConnection(): Promise<jest.Mock> {
    const mod = await import('../../src/queues/redis');
    return mod.getRedisConnection as jest.Mock;
  }

  it('never opens the liveness port when the queue worker fails to start', async () => {
    (await mockQueueWorker()).mockReturnValue(null);
    const { main } = await import('../../src/worker');

    await expect(main()).rejects.toThrow('process.exit(1) called');
    await expect(isPortOpen(TEST_WORKER_PORT)).resolves.toBe(false);
  });

  it('never opens the liveness port when REDIS_URL is unset', async () => {
    delete (process.env as { REDIS_URL?: string }).REDIS_URL;
    const { main } = await import('../../src/worker');

    await expect(main()).rejects.toThrow('process.exit(1) called');
    await expect(isPortOpen(TEST_WORKER_PORT)).resolves.toBe(false);
  });

  it('opens the liveness port and answers 200 once the worker is confirmed up, then closes both cleanly on SIGTERM', async () => {
    const mockWorker = {
      close: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(true),
    };
    (await mockQueueWorker()).mockReturnValue(mockWorker);
    (await mockRedisConnection()).mockReturnValue(new FakeRedisConnection('ready'));
    const { main } = await import('../../src/worker');

    const { worker, healthServer } = await main();
    expect(worker).toBe(mockWorker);

    const res = await get(TEST_WORKER_PORT);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'ok' });

    // Exercise the real SIGTERM handler installed by main() rather than
    // calling shutdown() directly (it isn't exported) — matches how Fly
    // actually stops the process.
    process.emit('SIGTERM', 'SIGTERM');

    // shutdown() is async; wait for worker.close() + healthServer.close()
    // to actually complete before asserting.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockWorker.close).toHaveBeenCalledTimes(1);
    expect(healthServer.listening).toBe(false);
    await expect(isPortOpen(TEST_WORKER_PORT)).resolves.toBe(false);
  });

  // BC-QA-058-impl-r1 F1: the health handler must reflect ongoing worker
  // liveness, not just "the port is bound" — a Redis disconnect after
  // initial connect (the task's own motivating scenario) flips BullMQ's
  // `worker.isRunning()` to false without ever closing the health port
  // itself, so the handler must consult it per-request.
  it('answers a non-200 status when the worker is bound but no longer running', async () => {
    const mockWorker = {
      close: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(false),
    };
    (await mockQueueWorker()).mockReturnValue(mockWorker);
    (await mockRedisConnection()).mockReturnValue(new FakeRedisConnection('ready'));
    const { main } = await import('../../src/worker');

    const { healthServer } = await main();

    const res = await get(TEST_WORKER_PORT);
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'not_running' });

    // Close explicitly (this test never sends SIGTERM) — the next test in
    // this suite binds the same fixed TEST_WORKER_PORT and would otherwise
    // fail with EADDRINUSE.
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  });

  // BC-QA-058-task-r1 F1: `worker.isRunning()` alone never catches a Redis
  // disconnect that happens after the worker has already started (confirmed
  // by live reproduction — see the task's final report). The fix tracks the
  // Redis connection's own status instead, debounced so a single transient
  // blip doesn't flip liveness. This test drives that state machine directly
  // via the fake connection's real EventEmitter, mocking `Date.now()` to
  // control the debounce window deterministically (no real 5s sleep).
  it('answers redis_unhealthy only after the connection has been continuously non-ready for the sustained-outage threshold, and recovers once ready fires again', async () => {
    const mockWorker = {
      close: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(true),
    };
    (await mockQueueWorker()).mockReturnValue(mockWorker);
    const redisConnection = new FakeRedisConnection('ready');
    (await mockRedisConnection()).mockReturnValue(redisConnection);

    const nowSpy = jest.spyOn(Date, 'now');
    const t0 = 1_700_000_000_000;
    nowSpy.mockReturnValue(t0);

    const { main } = await import('../../src/worker');
    const { healthServer } = await main();

    // Healthy at startup: connection reports 'ready'.
    let res = await get(TEST_WORKER_PORT);
    expect(res.status).toBe(200);

    // Redis connection drops (e.g. TCP close ahead of ioredis's automatic
    // reconnect attempts) — 1s into the outage.
    nowSpy.mockReturnValue(t0 + 1_000);
    redisConnection.status = 'reconnecting';
    redisConnection.emit('reconnecting');

    // Still inside the debounce window (< 5s of continuous non-ready) — a
    // brief blip like this must NOT flip liveness, or Fly's check would flap
    // on ordinary transient reconnects.
    res = await get(TEST_WORKER_PORT);
    expect(res.status).toBe(200);

    // 6s into the (still ongoing) outage — past the sustained threshold.
    nowSpy.mockReturnValue(t0 + 6_000);
    res = await get(TEST_WORKER_PORT);
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'redis_unhealthy' });

    // Redis recovers — ioredis fires 'ready' again on the same connection.
    redisConnection.status = 'ready';
    redisConnection.emit('ready');
    res = await get(TEST_WORKER_PORT);
    expect(res.status).toBe(200);

    nowSpy.mockRestore();
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  });

  // BC-QA-058-impl-r2: pins the `WORKER_PORT !== undefined ? Number(...) :
  // 3002` fix. The prior `Number(process.env.WORKER_PORT) || 3002` form
  // silently coerced an explicit `WORKER_PORT=0` (the OS-assigned-ephemeral-
  // port convention Node's own `http.Server.listen()` honours) into the 3002
  // default, since 0 is falsy in JS. This test must go red if that
  // regresses: it overrides WORKER_PORT to '0' and asserts the server
  // actually bound to a real OS-assigned port distinct from 3002 (and from
  // literal 0, which is never a real bound-socket port number).
  it('binds to an OS-assigned ephemeral port when WORKER_PORT=0, not the 3002 default', async () => {
    process.env.WORKER_PORT = '0';
    const mockWorker = {
      close: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(true),
    };
    (await mockQueueWorker()).mockReturnValue(mockWorker);
    (await mockRedisConnection()).mockReturnValue(new FakeRedisConnection('ready'));
    const { main } = await import('../../src/worker');

    const { healthServer } = await main();

    // main() calls healthServer.listen(...) but doesn't await the
    // 'listening' event before returning, so the bind may not have
    // completed yet — wait for it (or move on immediately if it already
    // has) before reading the assigned port off the socket.
    if (!healthServer.listening) {
      await new Promise<void>((resolve) => healthServer.once('listening', resolve));
    }

    const address = healthServer.address();
    const boundPort = typeof address === 'object' && address !== null ? address.port : undefined;
    expect(boundPort).toBeDefined();
    expect(boundPort).not.toBe(3002);
    expect(boundPort).not.toBe(0);

    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  });
});
