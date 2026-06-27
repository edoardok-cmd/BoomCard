// Load .env.test BEFORE importing prisma. prisma.ts calls dotenv.config('.env')
// at import time, but dotenv won't override already-set env vars — so loading
// .env.test here pins DATABASE_URL to the local test DB. Without this, tests
// silently run against whatever DATABASE_URL is in .env (historically: Neon prod).
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env.test') });

// Hard guard: if .env.test is missing in CI/fresh clones, dotenv silently
// falls back to .env (Neon prod). Refuse to run unless DATABASE_URL clearly
// points at a local/test database.
if (process.env.NODE_ENV === 'test') {
  const url = process.env.DATABASE_URL || '';
  const looksLikeTestDb = /localhost|127\.0\.0\.1|::1|_test(\b|\?)/i.test(url);
  if (!looksLikeTestDb) {
    throw new Error(
      `tests/setup.ts: refusing to run with DATABASE_URL=${url || '(unset)'}. ` +
        `Expected localhost or a *_test database — did .env.test fail to load? ` +
        `Create backend-api/.env.test from the example before running tests.`,
    );
  }
}

// Safety: prevent tests from accidentally calling real external services
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || '';
// Inbound-email webhook: integration tests post unsigned payloads and rely on
// the dev auth bypass. The bypass is now an explicit opt-in (no longer implied
// by merely unset secrets — see emailWebhook.routes.ts verifyAuth, FIX 2), so
// turn it on here for the test suite. emailWebhookAuth.test.ts overrides this
// per-case to exercise the fail-closed path.
process.env.ALLOW_UNSIGNED_WEBHOOK = process.env.ALLOW_UNSIGNED_WEBHOOK || '1';

import http from 'http';
import { execSync } from 'child_process';
import { prisma } from '../src/lib/prisma';
import { drainDetached } from '../src/utils/detach';

// ─── Ensure test database schema is up-to-date ──────────────────────────────
// Before running integration tests, deploy all pending Prisma migrations to the
// test database. This ensures the schema matches the current state of
// prisma/schema.prisma. Without this step, tests may fail with "column does not
// exist" errors when trying to use fields defined in the schema but not yet
// migrated in the test DB.
//
// This runs synchronously at setup time (before jest loads test files) so we
// can fail fast if migrations fail. It is test-only and has no effect on
// production.
if (process.env.NODE_ENV === 'test') {
  try {
    console.log('tests/setup.ts: deploying pending migrations to test database...');
    execSync('npx prisma migrate deploy', {
      cwd: __dirname.replace('/tests', ''),
      stdio: 'inherit',
      env: { ...process.env },
    });
    console.log('tests/setup.ts: migrations deployed successfully.');
  } catch (error) {
    console.error(
      'tests/setup.ts: migration deployment failed. This usually means:\n' +
        '  1. The test database does not exist — create it with `createdb boomcard_test`\n' +
        '  2. The test database is not reachable — check DATABASE_URL in .env.test\n' +
        '  3. A migration conflicts with existing schema — manually reset with `npm run db:reset` (warning: destructive)\n' +
        'Full error:',
      error,
    );
    process.exit(1);
  }
}

// ─── supertest transport-race fix: persistent server per app per file ─────────
//
// Cause: stock supertest 6.x, given an Express app (a Function, not an
// already-listening server), calls `http.createServer(app)` then `app.listen(0)`
// to spin up a NEW ephemeral server PER `request(app)` call and closes it right
// after the response (index.js + lib/test.js serverAddress). With 376 call sites
// across the suite that is 376 ephemeral listen/close cycles in quick succession.
// Node 19+ defaults `http.globalAgent` to `keepAlive: true`, pooling sockets that
// the NEXT request may try to reuse against a DIFFERENT, already-closed ephemeral
// server. Under this machine's heavy parallel-agent load (many node procs, high
// load avg, lots of TIME_WAIT sockets) that reuse-against-closed-server race
// surfaced intermittently as `socket hang up`, `ECONNRESET`, `426 Upgrade
// Required`, and stray `401/403/404`/`200` with the route's service mock showing
// "Number of calls: 0" (the request never reached the mounted router).
//
// Fix (test-only, ZERO production impact, NO test call-site edits): transparently
// wrap supertest's default export via jest.mock below so that when it is called
// with a Function `app`, we get-or-create ONE persistent listening server for
// that app and delegate to the REAL supertest with that already-listening server
// (index.js sees a Server object, skips createServer, and serverAddress never
// re-listens or closes it). Every `request(app)` in a file therefore reuses the
// SAME stable server/port, so Node's keepAlive pool only ever reuses sockets
// against a server that is STILL UP — the documented race disappears — and churn
// drops from 376 ephemeral listen/close cycles to ~one per app per file.
//
// FD-leak guard: tests/setup.ts `afterAll` calls `jest.resetModules()` every
// file, so `app` (imported from src/server) is a NEW object per file; keyed by
// app, the registry holds one server per app per file. We CLOSE every server at
// the file boundary (afterAll, below) and clear the registry, bounding live FDs
// to ~1-2 at a time. (A previous naive persistent-server attempt that never
// closed them leaked 42 listening servers across a full run → FD exhaustion →
// segfault; closing at the file boundary is what makes this safe.)
//
// The registry is anchored on `globalThis` so it survives `jest.resetModules()`
// and so the jest.mock factory (which is hoisted and may only reference globals /
// require / jest.requireActual) can reach it without an outer-scope variable.
// Non-function args (an already-listening Server, or a base-URL string) are
// passed straight through unchanged. The wrapper preserves the `.Test` and
// `.agent` statics. Determinism under heavy host contention should be verified by
// running the suite — no fixed "N/N clean" rate is claimed.
jest.mock('supertest', () => {
  const actualRequest = jest.requireActual('supertest');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const httpMod = require('http');

  type Srv = import('http').Server;
  const getServers = (): Map<unknown, Srv> => {
    const g = globalThis as { __supertestServers?: Map<unknown, Srv> };
    return (g.__supertestServers ??= new Map());
  };

  // How supertest 6.x handles an app/server (lib/test.js):
  //   serverAddress(): `const addr = app.address(); if (!addr) this._server = app.listen(0);`
  //   end():           `if (server && server._handle) return server.close(...)`
  // i.e. on the FIRST request against a not-yet-listening server it calls
  // `server.listen(0)`, records `_server`, and CLOSES it after the response.
  //
  // On this Node, `server.address()` IS populated synchronously right after
  // `listen(0)` returns — supertest depends on this, reading `address().port`
  // synchronously in `serverAddress` on the line after it may call `listen(0)`.
  // Our wrapper creates ONE server per app but does NOT listen it itself; it
  // hands the un-listened server to the REAL supertest, which calls `listen(0)`
  // on the first request. We neutralise `server.close()` so supertest's
  // per-request teardown cannot stop our persistent server; the real `close` is
  // stashed and run at the file boundary (afterAll). Because the address is
  // available synchronously, supertest never re-listens and never sets `_server`:
  // every subsequent `request(app)` reuses the SAME listening port.
  // (Listening it ourselves would also work given the sync address; letting
  // supertest do it keeps the wrapper minimal and avoids a double-listen.)
  //
  // The returned object is the REAL supertest request object built around a real
  // http.Server, so all superagent chaining (.set/.send/.field/.attach/.expect/
  // callbacks/await) behaves exactly as stock supertest — no proxy in the path.
  const wrapped = function (app: unknown, options?: unknown) {
    if (typeof app !== 'function') {
      // Already-listening Server or base-URL string: delegate unchanged.
      return actualRequest(app, options);
    }
    const servers = getServers();
    let server = servers.get(app);
    if (!server) {
      server = httpMod.createServer(app as never) as Srv;
      // Neutralise supertest's per-request close so the FIRST request (which
      // makes supertest listen this server) cannot also tear it down. The real
      // close is stashed for the file-boundary teardown in afterAll.
      const realClose = server.close.bind(server);
      (server as Srv & { __realClose?: () => void }).__realClose = realClose;
      // close(cb) is called by supertest's end(); keep the cb contract (invoke
      // it on next tick) but DO NOT actually stop listening.
      (server as unknown as { close: (cb?: () => void) => Srv }).close = (cb?: () => void) => {
        if (cb) process.nextTick(cb);
        return server as Srv;
      };
      // Never keep the process alive on a lingering persistent server.
      server.unref();
      servers.set(app, server);
    }
    return actualRequest(server, options);
  } as typeof actualRequest;

  // Preserve statics so `request.Test` / `request.agent` keep working.
  wrapped.Test = actualRequest.Test;
  wrapped.agent = actualRequest.agent;
  return wrapped;
});

// Increase test timeout for integration tests
jest.setTimeout(30000);

// ─── Cross-suite flake fix: timer clamp + deep async drain + timer restore ───
//
// The unit suite was green-but-flaky: full runs failed intermittently (a
// different, unrelated suite each time, deep in the run; every suite green in
// isolation). Three independent in-process leaks combine to produce it, all
// rooted in jest reusing one worker/event-loop across every test file:
//
//  (1) Real-timer detached retry backoff. partner.service `syncQrCodesForPartner`
//      retries a sticker update with `setTimeout(resolve, 200|400ms)`. This is
//      `await`ed by the request path, so when the test `await`s the response the
//      backoff has settled — UNLESS a caller fires the status-change without
//      awaiting (the `notifyPartnerStatusChange(...).catch()` detached branch),
//      in which case the trailing prisma mock calls can drift into a later test.
//
//  (2) Detached fire-and-forget side effects. `notifyPartnerStatusChange(...).catch()`,
//      `writeAudit(...).catch()`, `linkResendLog.create(...).catch()`, and the
//      public verification-resend `setImmediate(async () => { await ...; await ...; })`
//      all settle one or more ticks AFTER the response. The setImmediate case is
//      the deepest: a macrotask whose async body then chains several sequential
//      `await prisma.*` microtasks, each resolving on its own microtask hop. To
//      attribute it to the test that triggered it, the drain must interleave
//      macrotask + microtask flushing and loop enough rounds to walk the whole
//      chain to completion BEFORE the next test's beforeEach sets up its mocks.
//
//  (3) Fake-timer bleed. A couple of suites enable `jest.useFakeTimers()` /
//      `setSystemTime(...)`. If the modern fake clock is left installed at a file
//      boundary, the NEXT file inherits a frozen `Date.now()` and any time-based
//      assertion fails. Worse, a leaked fake clock would also freeze the macrotask
//      drain below (real `setImmediate` is faked) and hang the run.
//
// Fix — test-only, NO production behaviour changed, NO assertion weakened:
//
//  • If a fake clock is active at teardown, flush its pending timers
//    (`runOnlyPendingTimers`) THEN `useRealTimers()` — so leak (1)'s backoff
//    cannot survive under a fake clock, and leak (3) cannot freeze the next file
//    or the drain.
//
//  • DETERMINISTIC detached-work drain (the real fix for leak 2). The earlier
//    revision relied solely on a fixed-round macrotask/microtask sweep
//    (`drainPendingAsync`, ROUNDS=8). That caught shallow 1-hop chains but could
//    NOT, in general, walk the deep setImmediate→sequential-await chains (e.g.
//    auth `requestEmailVerificationByEmail`: findMany → per-user loop →
//    issueAndSendVerification → create().catch() → writeAudit().catch()), which
//    exceed any fixed round count. That is why the suite plateaued at ~7/10 green.
//
//    Every fire-and-forget side effect in src/** is now dispatched through
//    `detach(...)` / `detachImmediate(...)` (src/utils/detach.ts). Under
//    NODE_ENV=test those register the settled promise on a module-level registry;
//    `drainDetached()` awaits the whole registry in a loop until it stays empty.
//    `drainAll()` (below) interleaves the macrotask sweep with `drainDetached()`
//    before AND after every test, so detached work is awaited as REAL promises,
//    not a guessed number of ticks — deterministic by construction. A straggler
//    from a prior file therefore cannot consume a fresh once-queue or inflate a
//    call-count in a later, unrelated test. (Outside NODE_ENV=test the registry
//    is never populated and `detach` is a strict no-op over the old `.catch`.)
//
// Combined with jest.config maxWorkers:1 + clearMocks + the afterAll
// jest.resetModules(), this removes the in-process async-leakage class of flake.
// It does NOT, by itself, remove the separate supertest/Node transport race
// documented at the top of this file, which is host-load dependent. Measured
// determinism of `npx jest tests/unit` after this change is recorded in the task
// deliverable, not asserted here — do NOT re-introduce a hardcoded "N/N clean"
// claim in this comment; verify by running the suite.

// Captured at module load — before any suite installs jest fake timers — so it is
// always the pristine real implementation. When a suite calls jest.useFakeTimers(),
// jest swaps global.setTimeout for a mock; identity comparison against this
// reference is a cheap, reliable "is a fake clock active?" probe.
const REAL_SET_TIMEOUT = global.setTimeout;
const REAL_SET_IMMEDIATE = global.setImmediate;
const fakeTimersActive = (): boolean => global.setTimeout !== REAL_SET_TIMEOUT;

// Macrotask hop that survives a (mistakenly) leaked fake clock: bind to the real
// setImmediate captured at load so the drain can never deadlock on a fake timer.
const macrotask = (): Promise<void> =>
  new Promise<void>((resolve) => REAL_SET_IMMEDIATE(resolve));

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
  }
};

// Best-effort macrotask/microtask drain. This is the OLD heuristic: it walks a
// fixed number of event-loop hops to settle shallow detached chains. It is kept
// only as a belt-and-braces sweep for any stray async not routed through the
// detach registry — it is NOT the determinism guarantee on its own (a fixed
// round count cannot, in general, walk an arbitrarily deep chain; that was the
// root cause of the residual ~3/10 flake).
const drainPendingAsync = async (): Promise<void> => {
  for (let round = 0; round < 8; round++) {
    await macrotask();
    await flushMicrotasks();
  }
};

// Deterministic drain (the actual fix). Every fire-and-forget side effect in
// src/** is now dispatched through `detach(...)` / `detachImmediate(...)`
// (src/utils/detach.ts), which — under NODE_ENV=test only — registers the
// settled promise. `drainDetached()` awaits ALL of them in a loop until the
// registry stays empty, so detached work CANNOT settle during a later, unrelated
// test and consume its mockResolvedValueOnce queues or inflate its call counts.
//
// We interleave it with the heuristic sweep: a macrotask hop first lets any
// setImmediate-scheduled body actually start and register itself, then we await
// the registry; we repeat so a chain that registers more work as it settles is
// fully walked. This is deterministic by construction — it awaits real promises,
// not a guessed number of ticks.
const drainAll = async (): Promise<void> => {
  for (let round = 0; round < 8; round++) {
    await macrotask();
    await flushMicrotasks();
    await drainDetached();
  }
  // Final settle of anything the last drainDetached just woke.
  await drainDetached();
};

// Restore real timers first (so the drain's macrotask hops are real), flushing any
// pending fake timers so a scheduled backoff/callback runs now rather than leaking.
const restoreTimers = (): void => {
  if (fakeTimersActive()) {
    try {
      jest.runOnlyPendingTimers();
    } catch {
      // runOnlyPendingTimers throws only if no fake timers are installed — which
      // fakeTimersActive() just ruled out; ignore defensively.
    }
    jest.useRealTimers();
  }
};

beforeEach(async () => {
  restoreTimers();
  await drainAll();
});

afterEach(async () => {
  restoreTimers();
  await drainAll();
});

// Global test setup
beforeAll(async () => {
  // Ensure database connection is ready
  await prisma.$connect();
});

// Global test teardown
afterAll(async () => {
  // Settle any detached chain still in flight at the FILE boundary before jest
  // tears down this file's module registry and starts the next file. Without
  // this, a straggler from this file can execute during the next file's
  // beforeAll/await-import window and run against the next file's mocks
  // (observed: an auth-middleware mock from one suite answering a route in the
  // next suite → spurious 403s). afterEach drains per-test; this drains the
  // file as a whole, including anything spawned by afterAll-ordered hooks.
  restoreTimers();
  await drainAll();
  // Close every persistent supertest server created during THIS file before
  // resetModules drops the `app` objects they are keyed by. Without this, each
  // file leaks one listening server per app; across 42 files that exhausts FDs
  // (→ segfault). closeAllConnections() first so idle keepAlive sockets cannot
  // hang close(). Failures are swallowed so teardown never throws.
  {
    const servers = (globalThis as { __supertestServers?: Map<unknown, http.Server> })
      .__supertestServers;
    if (servers) {
      for (const server of servers.values()) {
        try {
          (server as http.Server & { closeAllConnections?: () => void }).closeAllConnections?.();
        } catch {
          /* non-fatal */
        }
        try {
          // Use the REAL close stashed at creation — the per-request `close`
          // override is a no-op, so calling it here would leak the FD.
          const realClose = (server as http.Server & { __realClose?: () => void }).__realClose;
          if (realClose) realClose();
          else server.close();
        } catch {
          /* non-fatal */
        }
      }
      servers.clear();
    }
  }
  // Drop this file's cached module instances so the NEXT file's jest.mock
  // factories rebind fresh. Without this, a route module first required by an
  // earlier file stays cached in the shared worker registry (maxWorkers:1, no
  // global resetModules) and a later file that re-requires it gets the EARLIER
  // file's mocked auth.middleware / prisma bindings — producing spurious
  // 401/403/404s and consumed-mock assertions deep in the run. Doing this only
  // at the file boundary (not per-test) preserves within-file module-level mock
  // state that suites rely on.
  jest.resetModules();
  // Cleanup and disconnect
  await prisma.$disconnect();
});

// ─── Test app factory ─────────────────────────────────────────────────────────
// createTestApp imports src/server which mounts all routes and initializes
// the Express app. It is called once per test file (jest.resetModules() clears
// the cached module, so each file gets a fresh app instance).
export async function createTestApp() {
  const { app } = await import('../src/server');
  return app;
}
