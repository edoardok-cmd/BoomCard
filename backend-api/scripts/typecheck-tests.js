#!/usr/bin/env node
/**
 * typecheck-tests.js
 *
 * BC-QA-060 M2 -- the real gating mechanism for `npm run typecheck:tests`
 * (wired as the `pretest` hook in package.json).
 *
 * Why this wrapper exists instead of relying on tsconfig.test.json's
 * `exclude` array alone: TypeScript's `exclude` only keeps a path out of
 * the *initial root-file set* built from `include`. It does NOT stop that
 * file from being type-checked and reported if some OTHER, still-included
 * file reaches it via `import`/`require` -- and several of the currently
 * known-broken files (e.g. `tests/helpers/test-utils.ts`, imported by
 * dozens of otherwise-clean test files) are reached exactly that way.
 * Verified empirically: listing them in `exclude` alone still left their
 * diagnostics in `tsc`'s output.
 *
 * So the staged rollout for BC-QA-060 works in two layers:
 *   1. tsconfig.test.json's `exclude` array is the single source of truth
 *      for "currently known-broken, not yet fixed" -- it also genuinely
 *      drops from the root set whichever of those files aren't pulled back
 *      in via the import graph.
 *   2. This script runs the real typecheck, then suppresses any diagnostic
 *      whose file is one of those same excluded files, so `npm test` keeps
 *      working today. Any NEW type error -- in any file NOT on that list --
 *      still fails the build exactly as before.
 *
 * The known-broken list lives ONLY in tsconfig.test.json's `exclude` array
 * (see the comment there referencing BC-QA-060-FOLLOWUP-1/-2). This script
 * reads that same array rather than duplicating it, so removing a file from
 * tsconfig.test.json's `exclude` list once its owning follow-up fixes it is
 * the only edit needed -- this script needs no changes when that happens.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.join(__dirname, '..');
const TSCONFIG_PATH = path.join(BACKEND_ROOT, 'tsconfig.test.json');
// Prefer a local install, but fall back to Node's own module resolution
// (which correctly walks up to a hoisted install, e.g. an npm/pnpm
// workspace root) so this doesn't silently no-op with "0 diagnostics" (or
// hard-fail with a confusing "no recognized diagnostics" error) in a
// monorepo layout where `typescript` isn't vendored directly under this
// package's own node_modules/.bin.
function resolveTscBin() {
  const localBin = path.join(BACKEND_ROOT, 'node_modules', '.bin', 'tsc');
  if (fs.existsSync(localBin)) return localBin;
  return require.resolve('typescript/bin/tsc', { paths: [BACKEND_ROOT] });
}
const TSC_BIN = resolveTscBin();

function loadKnownBrokenFiles() {
  const raw = fs.readFileSync(TSCONFIG_PATH, 'utf8');
  // tsconfig.test.json is JSONC (tsc itself accepts `//` line comments and
  // trailing commas). This is a narrow, controlled strip -- not a general
  // JSONC parser -- good enough because this file never puts `//` inside a
  // string value.
  const stripped = raw
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n')
    .replace(/,(\s*[}\]])/g, '$1');
  const parsed = JSON.parse(stripped);
  const exclude = Array.isArray(parsed.exclude) ? parsed.exclude : [];
  return new Set(exclude.filter((entry) => entry !== 'node_modules' && entry !== 'dist'));
}

// Matches the first line of a tsc diagnostic, e.g.:
//   src/routes/adminAdmins.routes.ts(971,9): error TS2339: Property 'skipAudit' ...
const DIAGNOSTIC_START_RE = /^(\S.*?)\(\d+,\d+\): error TS\d+:/;

function splitIntoDiagnosticBlocks(output) {
  const lines = output.split('\n');
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(DIAGNOSTIC_START_RE);
    if (match) {
      if (current) blocks.push(current);
      current = { file: match[1].replace(/\\/g, '/'), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function main() {
  const knownBroken = loadKnownBrokenFiles();

  const result = spawnSync(TSC_BIN, ['--noEmit', '-p', TSCONFIG_PATH], {
    cwd: BACKEND_ROOT,
    encoding: 'utf8',
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const blocks = splitIntoDiagnosticBlocks(output);

  const suppressed = blocks.filter((b) => knownBroken.has(b.file));
  const surfaced = blocks.filter((b) => !knownBroken.has(b.file));

  if (surfaced.length > 0) {
    for (const b of surfaced) {
      process.stdout.write(b.lines.join('\n') + '\n');
    }
    process.stderr.write(
      `\ntypecheck:tests: FAILED -- ${surfaced.length} diagnostic(s) in file(s) not on the ` +
        `known-broken exclude list in tsconfig.test.json (${suppressed.length} pre-existing ` +
        `diagnostic(s) in ${knownBroken.size} known-broken file(s) suppressed per ` +
        `BC-QA-060-FOLLOWUP-1/-2).\n`,
    );
    process.exit(1);
  }

  if (result.status !== 0 && blocks.length === 0) {
    // tsc failed for a reason that isn't a parsed per-file diagnostic (e.g. a
    // config error) -- never swallow that silently.
    process.stdout.write(output);
    process.stderr.write('\ntypecheck:tests: tsc exited non-zero with no recognized diagnostics -- treating as a failure.\n');
    process.exit(result.status || 1);
  }

  process.stdout.write(
    `typecheck:tests: clean (${suppressed.length} pre-existing diagnostic(s) in ` +
      `${knownBroken.size} known-broken file(s) suppressed per BC-QA-060-FOLLOWUP-1/-2 -- ` +
      `see tsconfig.test.json).\n`,
  );
  process.exit(0);
}

main();
