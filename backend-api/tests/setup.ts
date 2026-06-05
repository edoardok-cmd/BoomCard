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

import { prisma } from '../src/lib/prisma';
import { drainDetached } from '../src/utils/detach';

// ─── Partial flake mitigation: supertest transport race under host contention ─
//
// HONEST STATUS (do not over-claim): the residual intermittent failures are a
// supertest/Node transport race, NOT in-process async leakage, and this mitigation
// REDUCES but does not fully ELIMINATE them on a contended host. See the block
// comment in jest.config.js for the full determinism caveat.
//
// Mechanism: supertest 6.x, given an Express app (not an already-listening
// server), calls `app.listen(0)` to spin up a NEW ephemeral server PER REQUEST
// and closes it right after the response (lib/test.js serverAddress + end). A
// suite that fires dozens of `request(app)` calls churns dozens of ephemeral
// servers/ports in quick succession. Node 19+ also defaults `http.globalAgent`
// to `keepAlive: true`, pooling sockets that the NEXT request may try to reuse
// against a DIFFERENT (already-closed) server. Symptoms observed: `socket hang
// up`, `ECONNRESET`, `426 Upgrade Required`, and stray `401/403/404`/`200` with
// the route's service mock showing "Number of calls: 0" (the request never
// reached the mounted router).
//
// Measured driver of the BATCH-TO-BATCH variance: HOST CONTENTION. This machine
// runs many parallel agents (observed ~230 node procs, load ~5-8, 200-700+
// sockets in TIME_WAIT). The same suite measured 0/80 then 11/80 solo across
// back-to-back batches purely as load shifted — ephemeral-port/TIME_WAIT pressure
// and CPU-scheduling jitter intermittently break supertest's per-request sockets.
//
// Mitigation note (purely test-only, zero production impact): several transport
// configs were measured head-to-head under load on this host. A supertest-
// internal "persistent server per app" patch was prototyped and REJECTED (no
// reliable improvement, and FD exhaustion → segfault in the single-worker full
// run). Toggling keep-alive off was also measured and did NOT beat Node's default
// agent under load (keepAlive:false creates more short-lived sockets → more
// TIME_WAIT → more ephemeral-port pressure). We therefore leave Node's default
// HTTP agent in place and accept the residual host-dependent transport flake,
// documented in jest.config.js. No HTTP-agent override is applied here.

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
