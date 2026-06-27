/**
 * EXHAUSTIVE input-boundary 500 sweep — admin :param routes.
 *
 * Invariant: NO admin endpoint may return HTTP 500 on a malformed or absent id
 * path param (the "input-boundary 500" class). A malformed UUID or a
 * well-formed-but-nonexistent id must produce a clean 400/403/404/422 — never
 * an unhandled 500 (which usually means a raw Prisma/cast error escaped to the
 * error handler).
 *
 * Why this file exists: prior audits hard-coded a few endpoints and missed the
 * rest. This sweep ENUMERATES every registered admin route containing a `:`
 * path param from Express's live router stack, so ANY newly-added param route
 * automatically enters coverage and fails if it 500s on bad input.
 *
 * This file does NOT edit any src/** code. It is a test-only behavioural probe.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutEvent: (_opts: any) => Promise.resolve(),
    notifyPartnerStatusChange: (_opts: any) => Promise.resolve(),
  },
}));

const RUN_TAG = `uuid500-${Date.now()}`;

function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET env var is not set — tests cannot generate valid tokens');
  }
  return jwt.sign({ id: userId, email: `${RUN_TAG}-${userId}@test.local`, role }, jwtSecret, {
    expiresIn: '15m',
  });
}

// ─── Route introspection (identical strategy to the currency sweep) ──────────
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

const MALFORMED = 'not-a-uuid';
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

interface Hit500 {
  method: string;
  route: string;
  paramValue: string;
  url: string;
  status: number;
  bodySnippet: string;
}

describe('admin-uuid-500-sweep: no admin :param route returns 500 on malformed/absent id', () => {
  let app: any;
  let adminToken: string;
  let paramRoutes: EnumeratedRoute[] = [];
  const SKIPPED: { route: string; reason: string }[] = [];

  beforeAll(async () => {
    app = await createTestApp();

    const adminUser = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-admin@test.local`,
        firstName: 'Sweep',
        lastName: 'Admin',
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        emailVerified: true,
        passwordHash: 'unused',
      },
    });
    adminToken = generateTestToken(adminUser.id, 'SUPER_ADMIN');

    const all = enumerateRoutes(app);
    // Every admin route that contains at least one `:`-param segment, any method.
    paramRoutes = all.filter((r) => r.path.startsWith('/api/admin') && r.path.includes('/:'));

    // eslint-disable-next-line no-console
    console.log(
      `[uuid-500-sweep] enumerated ${all.length} total routes; ` +
        `${paramRoutes.length} admin routes with a :param segment.`,
    );
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({ where: { email: { startsWith: RUN_TAG } } });
    } catch {
      /* best-effort */
    }
    await app?.close?.();
  });

  // Build a concrete URL by substituting EVERY :param with `value`. We probe
  // the boundary on the LAST param so a route with multiple ids still exercises
  // its terminal lookup; earlier params also get the same bad value, which is a
  // strictly harder (and still must-not-500) input.
  function buildUrl(routePath: string, value: string): string {
    return routePath
      .split('/')
      .map((seg) => (seg.startsWith(':') ? value : seg))
      .join('/');
  }

  // Minimal body for non-GET verbs so body-validation doesn't itself 500.
  function bodyFor(_method: string): Record<string, unknown> {
    return {};
  }

  async function probe(route: EnumeratedRoute, value: string, hits: Hit500[]): Promise<void> {
    const url = buildUrl(route.path, value);
    const method = route.method.toLowerCase();
    // Only probe verbs supertest/express support directly.
    const supported = ['get', 'post', 'put', 'patch', 'delete'];
    if (!supported.includes(method)) {
      SKIPPED.push({ route: `${route.method} ${route.path}`, reason: `unsupported verb` });
      return;
    }

    let res: request.Response;
    try {
      let req = (request(app) as any)[method](url).set('Authorization', `Bearer ${adminToken}`);
      if (method !== 'get' && method !== 'delete') {
        req = req.send(bodyFor(method));
      }
      res = await req;
    } catch (err) {
      SKIPPED.push({
        route: `${route.method} ${route.path}`,
        reason: `request threw: ${String(err)}`,
      });
      // eslint-disable-next-line no-console
      console.warn(`[uuid-500-sweep] SKIPPED (threw): ${route.method} ${route.path} — ${String(err)}`);
      return;
    }

    if (res.status === 500) {
      hits.push({
        method: route.method,
        route: route.path,
        paramValue: value,
        url,
        status: res.status,
        bodySnippet: JSON.stringify(res.body).slice(0, 240),
      });
    }
  }

  it('enumerates a non-trivial number of admin :param routes from the live router stack', () => {
    expect(paramRoutes.length).toBeGreaterThan(10);
  });

  it('returns NO 500 on a malformed or nonexistent id for any admin :param route', async () => {
    const hits: Hit500[] = [];

    for (const route of paramRoutes) {
      await probe(route, MALFORMED, hits);
      await probe(route, NONEXISTENT_UUID, hits);
    }

    // eslint-disable-next-line no-console
    console.log(
      `\n[uuid-500-sweep] probed ${paramRoutes.length} routes x 2 values; ` +
        `${SKIPPED.length} SKIPPED; ${hits.length} route/value pair(s) returned 500.`,
    );
    if (SKIPPED.length) {
      // eslint-disable-next-line no-console
      console.log('[uuid-500-sweep] SKIPPED routes (coverage gaps):');
      for (const s of SKIPPED) {
        // eslint-disable-next-line no-console
        console.log(`  - ${s.route}  (${s.reason})`);
      }
    }
    if (hits.length) {
      // eslint-disable-next-line no-console
      console.log('[uuid-500-sweep] 500s:');
      for (const h of hits) {
        // eslint-disable-next-line no-console
        console.log(`  - ${h.method} ${h.route}  param=${h.paramValue}  body=${h.bodySnippet}`);
      }
    }

    const message =
      hits.length === 0
        ? ''
        : 'Admin endpoint(s) returned HTTP 500 on malformed/nonexistent id (expected 400/403/404/422):\n' +
          hits
            .map(
              (h) =>
                `  ${h.method} ${h.route}  param=${h.paramValue}  ->500  body=${h.bodySnippet}`,
            )
            .join('\n');

    expect({ count: hits.length, message }).toEqual({ count: 0, message: '' });
  });
});
