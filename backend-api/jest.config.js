process.env.NODE_ENV = 'test';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', {
      tsconfig: {
        types: ['node', 'jest'],
        allowJs: true,
      },
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
  // ── Flake mitigation (NOT yet fully deterministic — read this) ────────────
  // The unit suite is green-but-flaky: full runs fail intermittently, a different
  // unrelated suite each time, deep in the run. There are TWO distinct causes,
  // and only the first is fully solved here:
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
  //  2. supertest/Node transport race under HOST CONTENTION (PARTIAL). Supertest
  //     spins up a fresh ephemeral server PER `request(app)` call and tears it
  //     down after the response; under this machine's heavy parallel-agent load
  //     (observed load ~5-8, ~230 node procs, 200-700+ TIME_WAIT sockets) those
  //     per-request sockets intermittently break (`socket hang up` / `ECONNRESET`
  //     / `426` / stray 401/403/404 with "Number of calls: 0"). This reproduces
  //     even when a heavy supertest suite runs in COMPLETE ISOLATION, so it is NOT
  //     async leakage. No HTTP-agent override is applied (keep-alive toggling and
  //     a persistent-server patch were both measured and REJECTED — see the
  //     block comment at the top of tests/setup.ts); no setup-level transport
  //     tuning measured here drives it to zero on a contended host (rates swung
  //     0/80 ↔ 11/80 solo as load shifted). After the cause-1 fix above, a 20x
  //     full-run determinism sweep on this contended host produced clean runs
  //     except for contiguous bursts where ALL failures fell in supertest suites
  //     (stray 401/403 before the handler ran) — i.e. this cause, not leakage.
  //     Fully deterministic CI requires a quiet host / dedicated runner, or a
  //     per-suite persistent-server refactor across the supertest suites. Tracked
  //     as task BC-SUPERTEST-TRANSPORT-FLAKE.
  //
  //   • maxWorkers:1  — removes parallel event-loop + test-DB contention and
  //     gives the per-test async drain a stable single-threaded loop.
  //   • clearMocks    — clears mock.calls/results before each test so a drained
  //     stray call cannot pollute the next test's count/argument assertions. It
  //     does NOT reset implementations, so module-level mock behaviour survives.
  //
  // NB: earlier revisions of this comment falsely claimed "deterministic 10/10".
  // That was aspirational and is corrected above — cause (2) is load-dependent.
  maxWorkers: 1,
  clearMocks: true,
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
};
