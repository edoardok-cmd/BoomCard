#!/usr/bin/env node
/**
 * report-sweep-results.js
 *
 * Runs all BoomCard sweep test files against the test DB and writes
 * backend-api/tests/sweep-results.json with per-sweep pass/fail status.
 *
 * Safety rules:
 *   - Loads .env.test and requires DATABASE_URL pointing to a local/test DB.
 *   - Refuses if DATABASE_URL is missing or looks like a remote/prod URL.
 *   - Refuses if DATABASE_URL looks like a cloud provider URL.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const BACKEND_API_DIR = path.resolve(__dirname, '..');
const ENV_TEST_FILE = path.join(BACKEND_API_DIR, '.env.test');
const TESTS_DIR = path.join(BACKEND_API_DIR, 'tests');
const OUTPUT_FILE = path.join(TESTS_DIR, 'sweep-results.json');
const TMP_JSON = path.join(os.tmpdir(), `sweep-jest-output-${Date.now()}.json`);

// Ensure TMP_JSON is always cleaned up, even when process.exit() is called early.
process.on('exit', () => {
  try { if (fs.existsSync(TMP_JSON)) fs.unlinkSync(TMP_JSON); } catch {}
});

// ---------------------------------------------------------------------------
// .env.test parser (manual KEY=VALUE parsing — no dotenv install required)
// ---------------------------------------------------------------------------

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    // Value may be quoted; strip surrounding quotes
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Safety checks on DATABASE_URL
// ---------------------------------------------------------------------------

const LOCAL_HOST_RE = /localhost|127\.0\.0\.1|::1/i;
const TEST_DB_RE = /_test(\b|\?)/i;
const UNSAFE_URL_RE = /neon\.tech|fly\.io|amazonaws\.com|supabase\./i;

function validateDatabaseUrl(url) {
  if (!url) {
    console.error('[ERROR] DATABASE_URL is missing in .env.test — refusing to run against unknown DB.');
    process.exit(1);
  }
  const isLocal = LOCAL_HOST_RE.test(url);
  const isTestDb = TEST_DB_RE.test(url);
  if (!isLocal && !isTestDb) {
    console.error(`[ERROR] DATABASE_URL does not look like a local or test DB: ${url.replace(/\/\/[^@]*@/, '//***@')}`);
    console.error('        Expected: localhost/127.0.0.1/::1 host or _test suffix in the DB name.');
    process.exit(1);
  }
  if (isLocal && !isTestDb) {
    console.error(`[ERROR] DATABASE_URL is local but the database name does not contain "_test": ${url.replace(/\/\/[^@]*@/, '//***@')}`);
    console.error('        To prevent accidental sweeps against a local prod mirror, rename the DB to include "_test".');
    process.exit(1);
  }
  if (UNSAFE_URL_RE.test(url)) {
    console.error(`[ERROR] DATABASE_URL matches a known cloud provider pattern — refusing to run: ${url.replace(/\/\/[^@]*@/, '//***@')}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Git SHA
// ---------------------------------------------------------------------------

function getGitSha() {
  const result = spawnSync('git', ['-C', BACKEND_API_DIR, 'rev-parse', 'HEAD'], {
    encoding: 'utf-8',
  });
  if (result.status !== 0 || result.error) {
    console.warn('[WARN] Could not determine git SHA:', result.error || result.stderr);
    return 'unknown';
  }
  return result.stdout.trim();
}

// ---------------------------------------------------------------------------
// Sweep → file path mapping
// ---------------------------------------------------------------------------

const INTEGRATION = path.join(TESTS_DIR, 'integration');
const UNIT = path.join(TESTS_DIR, 'unit');

// Sweeps that are run by jest.
//
// BC-QA-031 — the dual-currency (BGN+EUR) display feature was retired along with
// Bulgaria's BGN→EUR transition window, and the CUR-class sweeps went with it.
// Five entries were removed from this map because a missing file only produces a
// `[SKIP]` line (see buildPatternAndActiveSweeps below), which silently degrades
// the roll-up rather than failing it:
//   - admin-currency-leak-sweep        deleted, no replacement
//   - public-currency-display-sweep    deleted, no replacement
//   - partner-currency-leak-sweep      RENAMED   → partner-internal-field-leak-sweep
//   - user-currency-leak-sweep         EXTRACTED → user-internal-field-leak-sweep
//   - user-money-introspect-sweep      deleted; the subscriber-surface counterpart
//                                      survives as subscriber-internal-field-introspect-sweep
// The three surviving replacements are registered below so their pass/fail state
// appears in `npm run sweeps:report` instead of vanishing from it.
const JEST_SWEEP_MAP = {
  'admin-uuid-500-sweep':                    path.join(INTEGRATION, 'admin-uuid-500-sweep.test.ts'),
  'partner-cross-scope-sweep':               path.join(INTEGRATION, 'partner-cross-scope-sweep.test.ts'),
  'partner-internal-field-leak-sweep':       path.join(INTEGRATION, 'partner-internal-field-leak-sweep.test.ts'),
  'partner-uuid-500-sweep':                  path.join(INTEGRATION, 'partner-uuid-500-sweep.test.ts'),
  'user-cross-scope-sweep':                  path.join(INTEGRATION, 'user-cross-scope-sweep.test.ts'),
  'user-input-500-sweep':                    path.join(INTEGRATION, 'user-input-500-sweep.test.ts'),
  'user-auth-gate-sweep':                    path.join(INTEGRATION, 'user-auth-gate-sweep.test.ts'),
  'user-internal-field-leak-sweep':          path.join(INTEGRATION, 'user-internal-field-leak-sweep.test.ts'),
  'user-acl-matrix-sweep':                   path.join(INTEGRATION, 'user-acl-matrix-sweep.test.ts'),
  'user-sub-upgrade-gate-sweep':             path.join(INTEGRATION, 'user-sub-upgrade-gate-sweep.test.ts'),
  'subscriber-internal-field-introspect-sweep': path.join(INTEGRATION, 'subscriber-internal-field-introspect-sweep.test.ts'),
  'redemption-cross-scope-sweep':            path.join(INTEGRATION, 'redemption-cross-scope-sweep.test.ts'),
  'redemption-input-sweep':                  path.join(INTEGRATION, 'redemption-input-sweep.test.ts'),
  'redemption-leak-scan-sweep':              path.join(INTEGRATION, 'redemption-leak-scan-sweep.test.ts'),
  'bc-redemption-swpfix-aro-class-sweep':    path.join(UNIT,        'bc-redemption-swpfix-aro-class-sweep.test.ts'),
  'section5-qrauth-fixes':                   path.join(UNIT,        'section5.qrAuthFixes.test.ts'),
  'system-webhook-signature-sweep':          path.join(INTEGRATION, 'system-webhook-signature-sweep.test.ts'),
  'system-input-500-sweep':                  path.join(INTEGRATION, 'system-input-500-sweep.test.ts'),
  'system-health-leak-sweep':                path.join(INTEGRATION, 'system-health-leak-sweep.test.ts'),
  'system-integ-leak-sweep':                 path.join(INTEGRATION, 'system-integ-leak-sweep.test.ts'),
  'system-email-idempotency':                path.join(INTEGRATION, 'system-email-idempotency.test.ts'),
  'public-data-exposure-sweep':              path.join(INTEGRATION, 'public-data-exposure-sweep.test.ts'),
  'public-input-500-sweep':                  path.join(INTEGRATION, 'public-input-500-sweep.test.ts'),
  // Not a route sweep — it walks the `docs/` corpus and fails when dual-currency
  // requirement text appears without a dated BC-QA-031 supersession marker. It is
  // registered here for the same reason the route sweeps are: an unregistered
  // sweep is one nothing runs, which is exactly how the retired CUR sweeps stayed
  // listed while their live replacements stayed invisible. Its assertions are
  // deterministic and file-based — it issues no query of its own — but it is not
  // database-free: tests/setup.ts runs `prisma migrate deploy` in global setup for
  // every suite, this one included.
  'spec-corpus-dual-currency-sweep':         path.join(INTEGRATION, 'spec-corpus-dual-currency-sweep.test.ts'),
};

// app-route-ownership is a manifest check, not a jest test
const APP_ROUTE_OWNERSHIP_MANIFEST = path.join(TESTS_DIR, 'app-route-ownership-manifest.json');

// ---------------------------------------------------------------------------
// Manifest check for app-route-ownership
// ---------------------------------------------------------------------------

function checkAppRouteOwnership() {
  if (!fs.existsSync(APP_ROUTE_OWNERSHIP_MANIFEST)) {
    console.log('[SKIP] app-route-ownership  (manifest not found)');
    return null;
  }

  try {
    const raw = fs.readFileSync(APP_ROUTE_OWNERSHIP_MANIFEST, 'utf-8');
    const manifest = JSON.parse(raw);
    const routeList = Array.isArray(manifest)
      ? manifest
      : Array.isArray(manifest.routes)
      ? manifest.routes
      : [];

    const total = routeList.length;
    const unownedCount = routeList.filter(
      (r) => !r || !r.scope || r.scope === 'unowned'
    ).length;

    const pass = total > 0 && unownedCount === 0;
    const status = pass ? 'pass' : 'fail';
    const label = pass
      ? `[PASS] app-route-ownership  (${total} routes, 0 unowned)`
      : `[FAIL] app-route-ownership  (${total} routes, ${unownedCount} unowned)`;
    console.log(label);
    return { status, tests: total, failures: unownedCount };
  } catch (e) {
    console.log(`[FAIL] app-route-ownership  (manifest parse error: ${e.message})`);
    return { status: 'fail', tests: 0, failures: 1 };
  }
}

// ---------------------------------------------------------------------------
// Build jest testPathPattern from existing sweep files
// ---------------------------------------------------------------------------

function buildPatternAndActiveSweeps() {
  const activeSweepNames = [];
  const parts = [];

  for (const [name, filePath] of Object.entries(JEST_SWEEP_MAP)) {
    if (!fs.existsSync(filePath)) {
      console.log(`[SKIP] ${name}  (file not found: ${filePath})`);
      continue;
    }
    activeSweepNames.push(name);
    // Escape the path for use in a regex — use forward slashes, escape dots
    const escaped = filePath.replace(/\\/g, '/').replace(/\./g, '\\.').replace(/\+/g, '\\+');
    parts.push(escaped);
  }

  if (parts.length === 0) {
    return { pattern: null, activeSweepNames };
  }

  // Use a pattern that matches any of the active sweep file paths
  const pattern = `(${parts.join('|')})`;
  return { pattern, activeSweepNames };
}

// ---------------------------------------------------------------------------
// Map jest JSON testResults back to sweep names
// ---------------------------------------------------------------------------

function buildFileToSweepIndex() {
  const index = {};
  for (const [name, filePath] of Object.entries(JEST_SWEEP_MAP)) {
    // Normalise to POSIX for comparison
    index[filePath.replace(/\\/g, '/')] = name;
    // Also without .ts extension fallback (shouldn't be needed, but safe)
  }
  return index;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== BoomCard sweep result reporter ===');

  // 1. Load and validate .env.test
  if (!fs.existsSync(ENV_TEST_FILE)) {
    console.error(`[ERROR] .env.test not found at ${ENV_TEST_FILE}`);
    process.exit(1);
  }
  const envTest = parseEnvFile(ENV_TEST_FILE);
  const dbUrl = envTest['DATABASE_URL'];
  validateDatabaseUrl(dbUrl);
  console.log('[OK] DATABASE_URL validated (local/test DB)');

  // 2. Get git SHA
  const gitSha = getGitSha();
  console.log(`[INFO] git HEAD: ${gitSha}`);

  const ranAt = new Date().toISOString();
  const results = {};

  // 3. Check app-route-ownership manifest (not jest)
  const ownershipResult = checkAppRouteOwnership();
  if (ownershipResult !== null) {
    results['app-route-ownership'] = ownershipResult;
  }

  // 4. Build jest test pattern from existing sweep files
  const { pattern, activeSweepNames } = buildPatternAndActiveSweeps();

  if (activeSweepNames.length === 0) {
    console.log('[INFO] No sweep test files found on disk — skipping jest run.');
  } else {
    console.log(`[INFO] Running ${activeSweepNames.length} sweep(s) via jest...`);

    const jestArgs = [
      'jest',
      '--testPathPattern', pattern,
      '--json',
      '--outputFile', TMP_JSON,
      '--forceExit',
      '--no-coverage',
    ];

    const spawnResult = spawnSync('npx', jestArgs, {
      cwd: BACKEND_API_DIR,
      env: {
        ...process.env,
        ...envTest,
        NODE_ENV: 'test',
      },
      encoding: 'utf-8',
      // 10-minute timeout — suites can be slow
      timeout: 600_000,
      maxBuffer: 50 * 1024 * 1024,
    });

    if (spawnResult.error) {
      console.error('[ERROR] Failed to spawn jest:', spawnResult.error.message);
      process.exit(1);
    }

    // Jest exits with 1 when tests fail — that is expected; we'll derive status from JSON.
    // Emit stdout/stderr for visibility.
    if (spawnResult.stdout) process.stdout.write(spawnResult.stdout);
    if (spawnResult.stderr) process.stderr.write(spawnResult.stderr);

    // 5. Parse jest JSON output
    if (!fs.existsSync(TMP_JSON)) {
      console.error('[ERROR] Jest did not write JSON output file. Aborting.');
      process.exit(1);
    }

    let jestOutput;
    try {
      jestOutput = JSON.parse(fs.readFileSync(TMP_JSON, 'utf-8'));
    } catch (e) {
      console.error(`[ERROR] Failed to parse jest JSON output: ${e.message}`);
      process.exit(1);
    }

    // Persist a copy of the raw jest JSON for post-run inspection, then clean temp.
    try { fs.writeFileSync(path.join(TESTS_DIR, 'sweep-jest-raw.json'), JSON.stringify(jestOutput, null, 2)); } catch (_) { /* ignore */ }
    try { fs.unlinkSync(TMP_JSON); } catch (_) { /* ignore */ }

    // 6. Map jest testResults back to sweep names
    const fileToSweep = buildFileToSweepIndex();

    for (const testResult of (jestOutput.testResults || [])) {
      // testResult.testFilePath is an absolute path. Guard against entries that
      // lack it (e.g. a suite that failed to load) — skip with a warning so
      // step 7 marks the missing sweep as fail rather than crashing the reporter.
      const rawPath = testResult.testFilePath || testResult.name;
      if (!rawPath) {
        console.warn(`[WARN] jest result entry has no testFilePath — status=${testResult.status}, message=${(testResult.message || testResult.failureMessage || '').slice(0, 300)}`);
        continue;
      }
      const filePath = rawPath.replace(/\\/g, '/');
      const sweepName = fileToSweep[filePath];
      if (!sweepName) {
        // Try partial match — the path in the jest output should match one of our entries
        const matchedName = Object.entries(fileToSweep).find(([fp]) => {
          const suffix = fp.split('/tests/')[1];
          return suffix ? filePath.endsWith(suffix) : false;
        })?.[1];
        if (!matchedName) {
          console.warn(`[WARN] Unrecognised test file in jest output: ${filePath}`);
          continue;
        }
        const status = testResult.status === 'passed' ? 'pass' : 'fail';
        results[matchedName] = {
          status,
          tests: testResult.numPassingTests + testResult.numFailingTests,
          failures: testResult.numFailingTests,
        };
        const tag = status === 'pass' ? '[PASS]' : '[FAIL]';
        console.log(`${tag} ${matchedName}  (${testResult.numPassingTests} passed, ${testResult.numFailingTests} failed)`);
        continue;
      }

      const status = testResult.status === 'passed' ? 'pass' : 'fail';
      results[sweepName] = {
        status,
        tests: testResult.numPassingTests + testResult.numFailingTests,
        failures: testResult.numFailingTests,
      };
      const tag = status === 'pass' ? '[PASS]' : '[FAIL]';
      console.log(`${tag} ${sweepName}  (${testResult.numPassingTests} passed, ${testResult.numFailingTests} failed)`);
    }

    // 7. Warn about any active sweeps not found in jest output
    for (const name of activeSweepNames) {
      if (!(name in results)) {
        console.warn(`[WARN] ${name} was expected in jest output but not found — marking as fail`);
        results[name] = { status: 'fail', tests: 0, failures: 0 };
      }
    }
  }

  // 8. Write sweep-results.json
  const output = { gitSha, ranAt, results };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`\n[INFO] Results written to ${OUTPUT_FILE}`);

  // 9. Summary + exit code
  const allNames = Object.keys(results);
  const failed = allNames.filter((n) => results[n].status === 'fail');
  const passed = allNames.filter((n) => results[n].status === 'pass');
  console.log(`\n=== Summary: ${passed.length} passed, ${failed.length} failed ===`);
  if (failed.length > 0) {
    console.log('Failed sweeps:', failed.join(', '));
    process.exit(1);
  }
}

main();
