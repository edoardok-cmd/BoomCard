process.env.NODE_ENV = 'test';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      diagnostics: { warnOnly: true },
    }],
  },
  // @scure/base and @noble/* ship pure ESM via package.json `exports`. Jest's
  // default transformIgnorePatterns skips node_modules, so the bare `export`
  // keyword reaches Node and crashes integration tests at import time. The
  // .* in the lookahead handles *nested* node_modules too (e.g. otplib pulls
  // @noble/hashes through @otplib/plugin-crypto-noble/node_modules/@noble/...).
  transformIgnorePatterns: ['/node_modules/(?!.*(@scure|@noble)/)'],
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // ── Flake mitigation (two distinct causes, both addressed) ────────────────
  // The unit suite was green-but-flaky: full runs failed intermittently, a
  // different unrelated suite each time, deep in the run. There are TWO distinct
  // causes:
  //
  //  1. In-process async leakage (SOLVED, deterministically). Production paths
  //     fire-and-forget side effects (`notifyPartnerStatusChange(...).catch()`,
  //     `writeAudit(...).catch()`, the verification-resend setImmediate, etc.)
  //     whose trailing prisma-mock calls settle a tick AFTER the HTTP response
  //     the test awaited, drifting across test/file boundaries. Every such
  //     detached site in src/** is now dispatched through `detach(...)` /
  //     `detachImmediate(...)` (src/utils/detach.ts); under NODE_ENV=test those
  //     register the settled promise, and tests/setup.ts `drainDetached()`s the
  //     whole registry (looped to empty) in beforeEach/afterEach. That AWAITS
  //     the detached work as real promises rather than guessing a number of
  //     ticks, so even the deep setImmediate→sequential-await chains that the
  //     old fixed-round drain could not walk are now settled before the next
  //     test sets up its mocks. `detach` is a strict no-op over the old `.catch`
  //     outside NODE_ENV=test (registry never populated), so production
  //     behaviour is unchanged. Backed by maxWorkers:1 + clearMocks + the
  //     afterAll jest.resetModules + fake-timer flush-and-restore.
  //
  //  2. supertest/Node transport race under HOST CONTENTION (ADDRESSED via a
  //     persistent-server layer in tests/setup.ts). Stock supertest 6.x, given
  //     an Express app, calls `http.createServer(app).listen(0)` per `request()`
  //     call and tears it down after the response. With 376 call sites that is
  //     376 ephemeral listen/close cycles; Node 19+ keepAlive pools sockets that
  //     get reused against an already-closed ephemeral server, which under this
  //     machine's heavy parallel-agent load surfaced as `socket hang up` /
  //     `ECONNRESET` / `426 Upgrade Required` / stray 401/403/404 with the
  //     route mock showing "Number of calls: 0" (the request never reached the
  //     mounted router). tests/setup.ts now transparently wraps supertest so
  //     each app reuses ONE persistent listening server per file (closed at the
  //     file boundary), so keepAlive sockets only ever reuse against a server
  //     that is still up. This removes the documented reuse-against-closed-server
  //     race and cuts churn from 376 cycles to ~one per app per file. It is
  //     test-only; production code is untouched. Determinism under heavy host
  //     contention should still be verified by running the suite under load —
  //     no fixed "N/N clean" rate is claimed here. Tracked as task
  //     BC-SUPERTEST-TRANSPORT-FLAKE.
  //
  //   • maxWorkers:1  — removes parallel event-loop + test-DB contention and
  //     gives the per-test async drain a stable single-threaded loop.
  //   • clearMocks    — clears mock.calls/results before each test so a drained
  //     stray call cannot pollute the next test's count/argument assertions. It
  //     does NOT reset implementations, so module-level mock behaviour survives.
  //
  // NB: do not re-introduce any hardcoded "deterministic N/N clean" claim here.
  // Cause (2)'s persistent-server layer removes the documented transport race;
  // residual determinism under heavy host contention is established by running
  // the suite, not asserted in this comment.
  maxWorkers: 1,
  clearMocks: true,
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
};
