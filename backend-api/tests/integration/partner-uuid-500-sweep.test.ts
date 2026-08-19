/**
 * EXHAUSTIVE input-boundary 500 sweep — PARTNER :param routes.
 *
 * Invariant (matrix INV-INPUT-001/002, INV-ACT-006): NO partner-surface endpoint
 * may return HTTP 500 on a malformed or absent id path param. A malformed UUID or
 * a well-formed-but-nonexistent id must produce a clean 400/401/403/404/422 —
 * never an unhandled 500 (a raw Prisma/cast error escaping to the error handler).
 *
 * Why this file exists: prior partner audits hard-coded a few endpoints and
 * missed the rest. This sweep ENUMERATES every registered route under the partner
 * surface (/api/partners, /api/partner/help, /api/stickers/venue) that contains a
 * `:` path param from Express's live router stack, so ANY newly-added param route
 * automatically enters coverage and fails if it 500s on bad input.
 *
 * Probes as a real ACTIVE PARTNER (admin-only routes will 403 — that is fine, not
 * a 500). This file does NOT edit any src/** code; it is a behavioural probe.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';
import { genTestPhone } from '../helpers/test-utils';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutEvent: (_opts: any) => Promise.resolve(),
    notifyPartnerStatusChange: (_opts: any) => Promise.resolve(),
  },
}));

const RUN_TAG = `partner-uuid500-${Date.now()}`;

function generateTestToken(userId: string, role: string): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET env var is not set — tests cannot generate valid tokens');
  return jwt.sign({ id: userId, email: `${RUN_TAG}-${userId}@test.local`, role }, jwtSecret, {
    expiresIn: '15m',
  });
}

// ─── Route introspection (identical strategy to the admin sweeps) ────────────
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

// Partner surface = endpoints a PARTNER role can reach (and the admin partner
// routes, which simply 403 for a partner — still must not 500).
function isPartnerRoute(p: string): boolean {
  return (
    p.startsWith('/api/partners') ||
    p.startsWith('/api/partner/help') ||
    p.startsWith('/api/stickers/venue')
  );
}

const MALFORMED = 'not-a-uuid';
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

interface Hit500 {
  method: string;
  route: string;
  paramValue: string;
  url: string;
  bodySnippet: string;
}

describe('partner-uuid-500-sweep: no partner :param route returns 500 on malformed/absent id', () => {
  let app: any;
  let partnerToken: string;
  let paramRoutes: EnumeratedRoute[] = [];
  const SKIPPED: { route: string; reason: string }[] = [];

  beforeAll(async () => {
    app = await createTestApp();

    const user = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-partner@test.local`,
        firstName: 'Sweep',
        lastName: 'Partner',
        phone: genTestPhone(),
        status: 'ACTIVE',
        role: 'PARTNER',
        emailVerified: true,
        passwordHash: 'unused',
      },
    });
    await prisma.partner.create({
      data: {
        userId: user.id,
        businessName: `${RUN_TAG} Partner`,
        category: 'RESTAURANT',
        status: 'ACTIVE',
        verifiedAt: new Date(),
      },
    });
    partnerToken = generateTestToken(user.id, 'PARTNER');

    const all = enumerateRoutes(app);
    paramRoutes = all.filter((r) => isPartnerRoute(r.path) && r.path.includes('/:'));
    // eslint-disable-next-line no-console
    console.log(
      `[partner-uuid-500-sweep] enumerated ${all.length} total routes; ` +
        `${paramRoutes.length} partner routes with a :param segment.`,
    );
  });

  afterAll(async () => {
    try {
      await prisma.partner.deleteMany({ where: { user: { email: { startsWith: RUN_TAG } } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: RUN_TAG } } });
    } catch {
      /* best-effort */
    }
    await app?.close?.();
  });

  function buildUrl(routePath: string, value: string): string {
    return routePath
      .split('/')
      .map((seg) => (seg.startsWith(':') ? value : seg))
      .join('/');
  }

  async function probe(route: EnumeratedRoute, value: string, hits: Hit500[]): Promise<void> {
    const url = buildUrl(route.path, value);
    const method = route.method.toLowerCase();
    const supported = ['get', 'post', 'put', 'patch', 'delete'];
    if (!supported.includes(method)) {
      SKIPPED.push({ route: `${route.method} ${route.path}`, reason: 'unsupported verb' });
      return;
    }
    let res: request.Response;
    try {
      let req = (request(app) as any)[method](url).set('Authorization', `Bearer ${partnerToken}`);
      if (method !== 'get' && method !== 'delete') req = req.send({});
      res = await req;
    } catch (err) {
      SKIPPED.push({ route: `${route.method} ${route.path}`, reason: `request threw: ${String(err)}` });
      return;
    }
    if (res.status === 500) {
      hits.push({
        method: route.method,
        route: route.path,
        paramValue: value,
        url,
        bodySnippet: JSON.stringify(res.body).slice(0, 240),
      });
    }
  }

  it('enumerates a non-trivial number of partner :param routes from the live router stack', () => {
    expect(paramRoutes.length).toBeGreaterThan(5);
  });

  it('returns NO 500 on a malformed or nonexistent id for any partner :param route', async () => {
    const hits: Hit500[] = [];
    for (const route of paramRoutes) {
      await probe(route, MALFORMED, hits);
      await probe(route, NONEXISTENT_UUID, hits);
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n[partner-uuid-500-sweep] probed ${paramRoutes.length} routes x 2 values; ` +
        `${SKIPPED.length} SKIPPED; ${hits.length} route/value pair(s) returned 500.`,
    );
    if (hits.length) {
      for (const h of hits) {
        // eslint-disable-next-line no-console
        console.log(`  - ${h.method} ${h.route}  param=${h.paramValue}  body=${h.bodySnippet}`);
      }
    }
    const message =
      hits.length === 0
        ? ''
        : 'Partner endpoint(s) returned HTTP 500 on malformed/nonexistent id (expected 400/401/403/404/422):\n' +
          hits.map((h) => `  ${h.method} ${h.route}  param=${h.paramValue}  ->500  body=${h.bodySnippet}`).join('\n');
    expect({ count: hits.length, message }).toEqual({ count: 0, message: '' });
  });
});
