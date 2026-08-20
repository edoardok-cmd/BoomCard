#!/usr/bin/env node
/**
 * BC-QA-055 -- committed-artefact PII gate.
 *
 * This repository is PUBLIC. Anything committed to it is world-readable, and
 * on 2026-05-03 a Playwright snapshot of the admin Subscribers table
 * (subscribers-all-snapshot.md) reached the default branch carrying 9 real
 * consumer mailboxes, 12 phone numbers, names and subscription payment state.
 * It stayed publicly fetchable for three and a half months because nothing in
 * this repository gates what gets committed.
 *
 * A credential scanner would not have caught it: the file contained no API key,
 * no token, no password. The leaking shape is a DEBUGGING OR SNAPSHOT ARTEFACT
 * CARRYING A CLUSTER OF PRODUCTION IDENTITIES. That is what this gate detects.
 *
 * Two independent rules, either of which fails the run:
 *   1. content  -- a file carries >= EMAIL_THRESHOLD distinct consumer-mailbox
 *                  addresses, or >= PHONE_THRESHOLD distinct phone numbers.
 *   2. path     -- a new tracked file matches a snapshot/dump/export shape.
 *
 * Usage:
 *   node scripts/pii-scan.js --staged          # pre-commit: staged files
 *   node scripts/pii-scan.js --range A..B      # CI: files changed in a range
 *   node scripts/pii-scan.js --all             # whole working tree
 *   node scripts/pii-scan.js --selftest        # pin the classifier
 *   node scripts/pii-scan.js <path> [...]      # explicit paths
 *
 * Exit 0 = clean, 1 = PII gate failure, 2 = usage/internal error.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EMAIL_THRESHOLD = 3;
const PHONE_THRESHOLD = 5;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Bulgarian mobile/landline first, then generic international.
const PHONE_RES = [
  /\+359[\s-]?\(?\d[\s-)]?[\d\s-]{6,12}\d/g,
  /(?<![\d.])0(?:8[7-9]|9\d)[\s-]?\d[\d\s-]{5,11}\d(?![\d.])/g,
  /\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3}[\s-]?\d{3,4}(?!\d)/g,
];

/**
 * Domains that are definitionally not real consumer mailboxes.
 *
 * Matching here is EXACT, never substring. An earlier draft of this gate used
 * substring matching with "mail.com" on the safe list, which silently matched
 * inside "gmail.com" and discarded every real address in the very file this
 * gate exists to catch. --selftest pins that case.
 */
const SYNTHETIC_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'example.co',
  'test.com', 'test.local', 'test.dev', 'test.bg', 'test.invalid',
  'boomcard-test.dev', 'mailnull.com', 'localhost', 'localhost.com',
  'sentry.io', 'schema.org', 'w3.org', 'github.com', 'npmjs.com',
  'sample.com', 'domain.com', 'yourdomain.com', 'placeholder.com',
  'acme.com', 'acme.bg', 'company.com', 'foo.com', 'bar.com', 'baz.com',
  'a.com', 'b.com', 'c.com', 'x.com', 'y.com', 'z.com', 'e.com', 'p.bg',
  'x.bg', 'exp.com', 'old.com', 'new.com', 'biz.com', 'attacker.com',
  'external.com', 'mailserver.net', 'stranger.com', 'valid.com',
  // single-syllable stubs used across the unit suites (a@rt.com, u@rt.com)
  'rt.com',
]);

// The company's own domain. Staff and seeded venue mailboxes, not consumers.
const OWN_DOMAINS = new Set(['boomcard.bg', 'boomcard.com', 'boomcard.eu', 'mail.boomcard.bg']);

/**
 * Role addresses only. Generic placeholder locals ("user@", "name@") are NOT
 * listed: at a real mailbox domain they are indistinguishable from a person,
 * and this gate must err toward reporting. A placeholder local at a
 * placeholder domain is already covered by SYNTHETIC_DOMAINS.
 */
const ROLE_LOCALS = ['noreply', 'no-reply', 'donotreply', 'postmaster', 'webmaster'];

const ARTEFACT_PATH_RE =
  /(^|\/)([^/]*(snapshot|dump|export|backup|subscribers|customers|users-all)[^/]*)\.(md|json|csv|txt|sql|html|xlsx)$/i;

const SKIP_PATH_RE =
  /(^|\/)(node_modules|dist|build|\.next|coverage|vendor|playwright-report|test-results)\/|\.(png|jpe?g|gif|svg|ico|woff2?|ttf|eot|pdf|zip|gz|mp4|webp|lock)$/i;

// This gate's own source and docs quote the shapes it detects.
const SELF_EXEMPT_RE = /(^|\/)(scripts\/pii-scan\.js|scripts\/pii-scan\.test\.js|docs\/pii-gate\.md)$/;

const ALLOW_FILE = '.pii-scan-allow.json';

/**
 * Baseline of paths reviewed and judged not to contain consumer PII, each with
 * a stated reason. This exists so the gate can run over the whole tree without
 * drowning in pre-existing seed fixtures; PR mode only ever looks at changed
 * files, so it ratchets regardless.
 *
 * Adding a path here is a REVIEWED decision, not a silencer. It is deliberately
 * a path list and not a pattern list: a new file under an already-allowed
 * directory is still scanned.
 */
function loadAllowlist(root) {
  try {
    const raw = fs.readFileSync(path.join(root, ALLOW_FILE), 'utf8');
    const parsed = JSON.parse(raw);
    return new Set(Object.keys(parsed.allow || {}));
  } catch {
    return new Set();
  }
}

// RFC 2606 / RFC 6761 reserve these for documentation and testing. Nothing
// under them can be a deliverable mailbox, whatever the second-level label is.
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost']);

function classify(addr) {
  const low = String(addr).toLowerCase().replace(/\.+$/, '');
  const at = low.lastIndexOf('@');
  if (at < 0) return 'synthetic';
  const local = low.slice(0, at);
  const domain = low.slice(at + 1);
  if (RESERVED_TLDS.has(domain.slice(domain.lastIndexOf('.') + 1))) return 'synthetic';
  if (SYNTHETIC_DOMAINS.has(domain)) return 'synthetic';
  // SQL LIKE / wildcard patterns are queries, not addresses.
  if (local.includes('%') || local.includes('_%')) return 'synthetic';
  if (ROLE_LOCALS.some((r) => local.startsWith(r))) return 'synthetic';
  if (OWN_DOMAINS.has(domain)) return 'own';
  return 'consumer';
}

/**
 * A connection string -- postgres://user:pass@host/db, redis://..., smtp://...
 * -- contains a "local@host" span that matches EMAIL_RE exactly. Those are
 * infrastructure hostnames, not mailboxes, and counting them produced false
 * positives on every .env template and migration guide in the repo. Detect the
 * scheme prefix rather than blacklisting individual cloud host suffixes, so new
 * providers do not silently reintroduce the noise.
 */
function isUrlCredential(text, index) {
  const before = text.slice(Math.max(0, index - 120), index);
  return /[a-z][a-z0-9+.-]*:\/\/[^\s'"`]*$/i.test(before);
}

function scanText(text) {
  const consumer = new Set();
  EMAIL_RE.lastIndex = 0;
  let m;
  while ((m = EMAIL_RE.exec(text)) !== null) {
    if (isUrlCredential(text, m.index)) continue;
    if (classify(m[0]) === 'consumer') consumer.add(m[0].toLowerCase());
  }
  const phones = new Set();
  for (const re of PHONE_RES) {
    for (const m of text.match(re) || []) phones.add(m.replace(/[\s\-()]/g, ''));
  }
  return { consumer, phones };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function repoRoot() {
  return git(['rev-parse', '--show-toplevel']).trim();
}

function filesFor(mode, arg) {
  if (mode === 'staged') {
    return git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n');
  }
  if (mode === 'range') {
    return git(['diff', '--name-only', '--diff-filter=ACMR', arg]).split('\n');
  }
  if (mode === 'all') return git(['ls-files']).split('\n');
  if (mode === 'paths') return arg;
  return [];
}

function readStaged(root, file) {
  try {
    return execFileSync('git', ['show', `:${file}`], {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function readWorktree(root, file) {
  const abs = path.join(root, file);
  try {
    if (!fs.existsSync(abs) || fs.statSync(abs).size > 8 * 1024 * 1024) return null;
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function mask(addr) {
  const [l, d] = String(addr).split('@');
  return `${l.slice(0, 2)}***@${d}`;
}

function run(mode, arg) {
  const root = repoRoot();
  const allow = loadAllowlist(root);
  const files = filesFor(mode, arg)
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !SKIP_PATH_RE.test(f) && !SELF_EXEMPT_RE.test(f) && !allow.has(f));

  const violations = [];
  for (const file of files) {
    if (ARTEFACT_PATH_RE.test(file)) {
      violations.push({
        file, rule: 'path',
        detail: 'filename matches a snapshot/dump/export artefact shape',
      });
    }
    const text = mode === 'staged' ? readStaged(root, file) : readWorktree(root, file);
    if (text === null || text.includes('\0')) continue;
    const { consumer, phones } = scanText(text);
    if (consumer.size >= EMAIL_THRESHOLD) {
      violations.push({
        file, rule: 'content',
        detail: `${consumer.size} distinct consumer mailbox addresses (threshold ${EMAIL_THRESHOLD})`,
        sample: [...consumer].slice(0, 4).map(mask),
      });
    }
    if (phones.size >= PHONE_THRESHOLD) {
      violations.push({
        file, rule: 'content',
        detail: `${phones.size} distinct phone numbers (threshold ${PHONE_THRESHOLD})`,
      });
    }
  }

  if (!violations.length) {
    console.log(`pii-scan: clean (${files.length} file(s) checked)`);
    return 0;
  }

  console.error('\npii-scan: POSSIBLE PRODUCTION PII IN COMMITTED CONTENT\n');
  console.error('This repository is PUBLIC. Anything committed here is world-readable.\n');
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    [${v.rule}] ${v.detail}`);
    if (v.sample) console.error(`    e.g. ${v.sample.join(', ')}`);
  }
  console.error(`
If this is real customer data: do NOT commit it. Deleting it in a later commit
does not help -- the blob stays publicly readable in history.

If these are synthetic fixtures, use a domain the gate knows is fake
(example.com, test.local) or add the domain to SYNTHETIC_DOMAINS in
scripts/pii-scan.js with a comment saying why it is not real.

Emergency bypass (leaves an audit trail, never use to ship real PII):
  PII_SCAN_BYPASS=1 git commit ...
`);
  return 1;
}

function selftest() {
  let ok = true;
  const eq = (label, got, want) => {
    if (got !== want) { ok = false; console.error(`FAIL ${label}: want ${want}, got ${got}`); }
    else console.log(`ok   ${label} -> ${got}`);
  };

  // The substring bug this gate was born from: "mail.com" must NOT match
  // inside "gmail.com". This is the exact miss that let the real leak through
  // an earlier draft of the scanner.
  eq('user@gmail.com', classify('user@gmail.com'), 'consumer');
  eq('a@abv.bg', classify('a@abv.bg'), 'consumer');
  eq('b@mail.bg', classify('b@mail.bg'), 'consumer');
  eq('c@yahoo.com', classify('c@yahoo.com'), 'consumer');
  eq('qa@test.com', classify('qa@test.com'), 'synthetic');
  eq('p@example.com', classify('p@example.com'), 'synthetic');
  eq('v@test.local', classify('v@test.local'), 'synthetic');
  eq('noreply@gmail.com', classify('noreply@gmail.com'), 'synthetic');
  eq('team@boomcard.bg', classify('team@boomcard.bg'), 'own');

  for (const p of ['+359 88 123 4567', '0888123456', '+359888123456']) {
    const hit = PHONE_RES.some((re) => { re.lastIndex = 0; return re.test(p); });
    eq(`phone ${p}`, hit, true);
  }

  // Containment: a structural replica of subscribers-all-snapshot.md -- the
  // real artefact's shape, with invented consumer-domain addresses -- must
  // trip the content rule. Shape detection is not enough on its own; this
  // asserts the gate fires on the thing that actually happened.
  const replica = `
- heading "Абонати" [level=1] [ref=e34]
- cell "Ivan Petrov" [ref=e61]
- cell "ivan.petrov@gmail.com" [ref=e62]
- cell "+359 88 555 0101" [ref=e63]
- cell "Мария Димитрова" [ref=e71]
- cell "maria.d@abv.bg" [ref=e72]
- cell "0888 555 022" [ref=e73]
- cell "Elena S." [ref=e81]
- cell "elena.s@yahoo.com" [ref=e82]
- cell "+359 87 555 0303" [ref=e83]
`;
  const r = scanText(replica);
  eq('replica consumer>=threshold', r.consumer.size >= EMAIL_THRESHOLD, true);
  eq('replica path rule', ARTEFACT_PATH_RE.test('subscribers-all-snapshot.md'), true);

  // Cyrillic content must not blind the scanner (BG specs survived earlier
  // English-only sweeps precisely because \w misses Cyrillic).
  const cyr = scanText('Потребител: иван@gmail.com, Мария: maria@abv.bg, Петър: petar@mail.bg');
  eq('cyrillic context', cyr.consumer.size >= 2, true);

  // A normal source file must stay clean, or the gate is unshippable.
  const benign = scanText(`
    import { render } from '@testing-library/react';
    const admin = 'admin@example.com';
    // contact support@boomcard.bg
    const version = '1.2.3';
  `);
  eq('benign file clean', benign.consumer.size < EMAIL_THRESHOLD, true);

  console.log(ok ? '\nSELFTEST PASS' : '\nSELFTEST FAIL');
  return ok ? 0 : 1;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(selftest());

  if (process.env.PII_SCAN_BYPASS === '1') {
    console.error('pii-scan: BYPASSED via PII_SCAN_BYPASS=1');
    process.exit(0);
  }

  try {
    if (argv.includes('--staged')) process.exit(run('staged'));
    if (argv.includes('--all')) process.exit(run('all'));
    const ri = argv.indexOf('--range');
    if (ri >= 0) {
      if (!argv[ri + 1]) { console.error('pii-scan: --range needs an argument'); process.exit(2); }
      process.exit(run('range', argv[ri + 1]));
    }
    const paths = argv.filter((a) => !a.startsWith('--'));
    if (paths.length) {
      const root = repoRoot();
      process.exit(run('paths', paths.map((f) => path.relative(root, path.resolve(f)))));
    }
    console.error('pii-scan: nothing to do; pass --staged, --range A..B, --all, <paths>, or --selftest');
    process.exit(2);
  } catch (err) {
    console.error('pii-scan: internal error:', err && err.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { classify, scanText, ARTEFACT_PATH_RE, EMAIL_THRESHOLD, PHONE_THRESHOLD };
