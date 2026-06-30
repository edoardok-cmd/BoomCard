/**
 * EXHAUSTIVE input-boundary sweep — PUBLIC (unauthenticated) routes.
 *
 * Invariant (INV-PUB-INP-001..006): no public endpoint may return a 5xx for
 * malformed CLIENT input. A bad id / planCode / request body is a client
 * mistake → it must surface as a 4xx (400/404/422), never a 500/502. A 5xx on
 * client input is an information-disclosure + abuse vector on an unauthenticated
 * surface (in dev it even leaks an absolute-path stack trace).
 *
 * Why this file exists: prior to BC-PUBLIC-SPEC-REAUDIT, null-byte / invalid-
 * UTF-8 input on `/api/plans/:id`, `/api/plans/code/:planCode` and
 * `/api/mobile/errors` reached Prisma and threw an UNMAPPED
 * `DriverAdapterError: invalid byte sequence for encoding "UTF8": 0x00`, which
 * fell through error.middleware to a 500 (contact returned a 502). This sweep
 * ENUMERATES the public surface from Express's live router stack (filtered to
 * the public scope) so any newly-added public route automatically enters
 * coverage, and fires a battery of malformed inputs at each.
 *
 * This file does NOT edit any src/** code. It is a test-only behavioural probe.
 *
 * EXPECTED STATE on first run: RED (surfaces the current null-byte 5xx's).
 * Do NOT weaken the assertion to make it green — it goes green only once the
 * gating is fixed in src/** (map the encoding/byte-sequence driver error class
 * to 400, or reject control bytes at the route boundary).
 */

import request from 'supertest';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';

// ─── Route introspection (same mechanism as admin-currency-leak-sweep) ───────
interface EnumeratedRoute {
  method: string;
  path: string;
}

function layerRegexToPrefix(layer: any): string {
  if (typeof layer.path === 'string') return layer.path;
  const keys: any[] = layer.keys || [];
  const src: string = layer.regexp?.source ?? '';
  if (layer.regexp?.fast_slash) return '';
  let working = src
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/');
  let keyIdx = 0;
  working = working.replace(/\(\[\^\\?\/]\+\?\)/g, () => {
    const k = keys[keyIdx++];
    return k ? `:${k.name}` : ':param';
  });
  working = working.replace(/\/\?$/, '').replace(/\(\?:\(\?=\/\|\$\)\)$/, '');
  return working;
}

function collectRoutes(stack: any[], prefix: string, out: EnumeratedRoute[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const routePath: string = layer.route.path;
      const methods = layer.route.methods || {};
      for (const m of Object.keys(methods)) {
        if (m === '_all') continue;
        out.push({ method: m.toUpperCase(), path: prefix + routePath });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const sub = layerRegexToPrefix(layer);
      collectRoutes(layer.handle.stack, prefix + sub, out);
    }
  }
}

function enumerateRoutes(app: any): EnumeratedRoute[] {
  const stack = app._router?.stack || app.router?.stack || [];
  const out: EnumeratedRoute[] = [];
  collectRoutes(stack, '', out);
  return out;
}

// The 7 public (unauthenticated) routes per app-route-ownership-manifest.json.
// Anchored prefixes — used to FILTER the enumerated stack, so the sweep still
// auto-enrolls any new route mounted under these public prefixes.
const PUBLIC_PREFIXES = [
  '/api/plans',
  '/api/config/mobile',
  '/api/mobile/errors',
  '/api/contact',
  '/api/sidebar',
];

function isPublic(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + ':'));
}

// Malformed path-param payloads (URL-encoded into :param slots).
const BAD_PARAMS: { label: string; raw: string }[] = [
  { label: 'null-byte', raw: '%00' },
  { label: 'embedded-null', raw: 'abc%00def' },
  { label: 'invalid-utf8', raw: '%ff' },
  { label: 'control-chars', raw: '%01%02%03' },
  { label: 'oversized', raw: 'x'.repeat(5000) },
];

// Malformed JSON bodies for POST routes. `null` rawJson means "send a real
// null byte inside a string field" (constructed below to avoid a literal NUL in
// source). Each must produce a 4xx, never a 5xx.
const NUL = String.fromCharCode(0);
const BAD_BODIES: { label: string; body: any }[] = [
  { label: 'empty-object', body: {} },
  { label: 'array-body', body: [1, 2, 3] },
  { label: 'string-body', body: 'hello' },
  { label: 'number-body', body: 42 },
  { label: 'wrong-types', body: { name: 123, email: true, message: {}, platform: 7, errorType: [] } },
  { label: 'null-byte-fields', body: { name: 'a' + NUL + 'b', email: 'x@y.com', message: 'hi' + NUL + 'there', platform: 'ios', errorType: 'crash' } },
  { label: 'oversized-fields', body: { name: 'n'.repeat(20000), email: 'e'.repeat(20000) + '@y.com', message: 'm'.repeat(200000), platform: 'ios', errorType: 'crash' } },
];

interface Fail {
  route: string;
  case: string;
  status: number;
}

describe('public-input-500-sweep: no public route 5xx on malformed client input', () => {
  let app: any;
  let getRoutes: EnumeratedRoute[] = [];
  let postRoutes: EnumeratedRoute[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    const all = enumerateRoutes(app).filter((r) => isPublic(r.path));
    getRoutes = all.filter((r) => r.method === 'GET');
    postRoutes = all.filter((r) => r.method === 'POST');
    // eslint-disable-next-line no-console
    console.log(
      `[public-input-500-sweep] enumerated ${all.length} public routes ` +
        `(${getRoutes.length} GET, ${postRoutes.length} POST).`,
    );
  });

  afterAll(async () => {
    await app?.close?.();
  });

  it('enumerates the public surface from the live router stack', () => {
    expect(getRoutes.length + postRoutes.length).toBeGreaterThanOrEqual(7);
  });

  it('GET routes with a :param never 5xx on malformed param values', async () => {
    const fails: Fail[] = [];
    const paramGets = getRoutes.filter((r) => r.path.includes(':'));
    for (const route of paramGets) {
      for (const bad of BAD_PARAMS) {
        const url = route.path.replace(/:[^/]+/g, bad.raw);
        let res: request.Response;
        try {
          res = await request(app).get(url);
        } catch {
          continue; // a thrown request isn't a server 5xx response
        }
        if (res.status >= 500) {
          fails.push({ route: `GET ${route.path}`, case: bad.label, status: res.status });
        }
      }
    }
    if (fails.length) {
      // eslint-disable-next-line no-console
      console.log('[public-input-500-sweep] GET 5xx FAILURES:');
      for (const f of fails) console.log(`  - ${f.route}  [${f.case}] -> ${f.status}`);
    }
    expect({ count: fails.length, fails }).toEqual({ count: 0, fails: [] });
  });

  it('POST routes return 413 (not 5xx, no stack leak) when body exceeds the 10mb express.json limit (INV-PUB-INP-008)', async () => {
    // An oversized JSON body trips body-parser's PayloadTooLargeError BEFORE any
    // route code runs. Pre-fix it fell through error.middleware to a 500 and (in
    // dev) leaked an absolute-path stack. It must now be a clean 413 with no stack.
    // Deterministic body: a single string field just over the 10mb cap.
    const oversized = JSON.stringify({ x: 'a'.repeat(11 * 1024 * 1024) });
    const targets = ['/api/contact', '/api/mobile/errors'];
    const fails: { route: string; status: number; hasStack: boolean }[] = [];
    for (const path of targets) {
      let res: request.Response;
      try {
        res = await request(app)
          .post(path)
          .set('Content-Type', 'application/json')
          .send(oversized);
      } catch {
        continue; // a thrown request isn't a server 5xx response
      }
      const hasStack = res.body != null && Object.prototype.hasOwnProperty.call(res.body, 'stack');
      if (res.status !== 413 || hasStack) {
        fails.push({ route: `POST ${path}`, status: res.status, hasStack });
      }
    }
    if (fails.length) {
      // eslint-disable-next-line no-console
      console.log('[public-input-500-sweep] oversized-body FAILURES:');
      for (const f of fails) console.log(`  - ${f.route} -> ${f.status} (stack=${f.hasStack})`);
    }
    expect({ count: fails.length, fails }).toEqual({ count: 0, fails: [] });
  });

  // INV-PUB-RL-003: every stored field on an unauthenticated public write is
  // size-capped. The siblings on /api/mobile/errors are already bounded
  // (message → 2000, stack → 10_000); appVersion must likewise be capped (64
  // chars — generous for any real version string like "1.2.3-rc.4+build.567").
  // Teeth test: send an oversized appVersion, assert the request succeeds (201)
  // AND the persisted row's appVersion is <= 64 chars. Removing the
  // `.slice(0, 64)` in mobileConfig.routes.ts makes this go RED.
  it('POST /api/mobile/errors caps stored appVersion at 64 chars (INV-PUB-RL-003)', async () => {
    const marker = `cap-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const oversizedVersion = 'v'.repeat(5000);

    const res = await request(app)
      .post('/api/mobile/errors')
      .set('Content-Type', 'application/json')
      .send({ platform: 'ios', message: marker, appVersion: oversizedVersion });

    expect(res.status).toBe(201);

    // Read the persisted row back and assert the cap was applied at write time.
    const row = await prisma.mobileErrorLog.findFirst({
      where: { message: marker },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row!.appVersion).not.toBeNull();
    expect((row!.appVersion as string).length).toBeLessThanOrEqual(64);

    // Cleanup the probe row so the test is idempotent across runs.
    await prisma.mobileErrorLog.deleteMany({ where: { message: marker } });
  });

  // INV-PUB-INP-009: the optional `appVersion`/`stack` fields on
  // /api/mobile/errors are stringified at write time (`.trim().slice(...)`).
  // The platform/message/errorType fields are already type-guarded, but a
  // PRESENT non-string appVersion/stack (e.g. the number 12345) used to slip
  // past the guards and throw `TypeError: ...trim is not a function`, which
  // fell through error.middleware to a 500 + (in dev) a leaked stack trace.
  // The route must type-guard these BEFORE the string ops → 400, never 5xx,
  // never a stack-leak. Body uses a VALID platform+message so the request
  // actually reaches the appVersion/stack lines (the wrong-types case in
  // BAD_BODIES has an invalid platform and is rejected earlier — it never
  // exercises these lines). Removing the two guards makes this go RED (500).
  it('POST /api/mobile/errors rejects non-string appVersion/stack with 400, no stack leak (INV-PUB-INP-009)', async () => {
    const fails: { case: string; status: number; hasStack: boolean }[] = [];

    const cases: { label: string; body: any }[] = [
      { label: 'non-string-appVersion', body: { platform: 'ios', message: 'x', appVersion: 12345 } },
      { label: 'non-string-stack', body: { platform: 'ios', message: 'x', stack: 999 } },
    ];

    for (const c of cases) {
      const res = await request(app)
        .post('/api/mobile/errors')
        .set('Content-Type', 'application/json')
        .send(c.body);
      const hasStack = res.body != null && Object.prototype.hasOwnProperty.call(res.body, 'stack');
      // Must be a clean 400 (client error) — never a 5xx, never a stack leak.
      if (res.status !== 400 || hasStack) {
        fails.push({ case: c.label, status: res.status, hasStack });
      }
    }

    if (fails.length) {
      // eslint-disable-next-line no-console
      console.log('[public-input-500-sweep] non-string-field FAILURES:');
      for (const f of fails) console.log(`  - ${f.case} -> ${f.status} (stack=${f.hasStack})`);
    }
    expect({ count: fails.length, fails }).toEqual({ count: 0, fails: [] });
  });

  it('POST routes never 5xx on malformed bodies', async () => {
    const fails: Fail[] = [];
    for (const route of postRoutes) {
      for (const bad of BAD_BODIES) {
        let res: request.Response;
        try {
          res = await request(app)
            .post(route.path)
            .set('Content-Type', 'application/json')
            .send(bad.body as any);
        } catch {
          continue;
        }
        if (res.status >= 500) {
          fails.push({ route: `POST ${route.path}`, case: bad.label, status: res.status });
        }
      }
    }
    if (fails.length) {
      // eslint-disable-next-line no-console
      console.log('[public-input-500-sweep] POST 5xx FAILURES:');
      for (const f of fails) console.log(`  - ${f.route}  [${f.case}] -> ${f.status}`);
    }
    expect({ count: fails.length, fails }).toEqual({ count: 0, fails: [] });
  });
});
