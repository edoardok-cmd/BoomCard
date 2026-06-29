/**
 * Data-exposure sweep — PUBLIC (unauthenticated) responses.
 *
 * Invariant (INV-PUB-LEAK-001..007): an unauthenticated response must never
 * carry an internal/PII/non-allowlisted field. Plans expose a curated display
 * allowlist; mobile config exposes ONLY the PUBLIC_MOBILE_KEYS-derived shape;
 * contact/errors echo nothing internal. This guard walks every public GET
 * response (route-introspected, public-filtered) and fails if any denylisted
 * internal field NAME appears anywhere in the body.
 *
 * Why a denylist of NAMES (not values): the plan detail endpoints fetch the
 * full Prisma row (`findFirst` with no `select`) and hand-map the response, so a
 * future maintainer who switches to spreading the row, or adds a field to the
 * map, would leak `createdAt`/`updatedAt`/`isActive`/internal columns. This
 * sweep catches that regression at build time.
 *
 * This file does NOT edit any src/** code. It is a test-only behavioural probe.
 *
 * EXPECTED STATE on first run: GREEN (allowlists currently hold). It exists to
 * lock the floor — a new public field that matches the denylist fails the build.
 */

import request from 'supertest';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';

const RUN_TAG = `publeak-${Date.now()}`;
const PLAN_CODE = `PUBLEAK${Math.floor(Date.now() % 100000)}`;

// Field NAMES that must never appear in any public response body. Matched
// case-insensitively against object keys at any depth.
const DENY_KEY = /(passwordhash|password|secret|apikey|api_key|accesstoken|refreshtoken|^token$|iban|createdat|updatedat|displayorder|deletedat|internalnote|isactive)/i;

interface Hit {
  route: string;
  jsonPath: string;
  key: string;
}

function walkForDenied(node: any, route: string, path: string, hits: Hit[]): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((el, i) => walkForDenied(el, route, `${path}[${i}]`, hits));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    if (DENY_KEY.test(key)) {
      hits.push({ route, jsonPath: childPath, key });
    }
    walkForDenied(value, route, childPath, hits);
  }
}

describe('public-data-exposure-sweep: no internal/PII field name in any public GET', () => {
  let app: any;
  let planId: string;

  // Public GET routes with concrete, materializable URLs.
  const targets: { label: string; url: () => string }[] = [
    { label: 'GET /api/plans/', url: () => '/api/plans/' },
    { label: 'GET /api/plans/:id', url: () => `/api/plans/${planId}` },
    { label: 'GET /api/plans/code/:planCode', url: () => `/api/plans/code/${PLAN_CODE}` },
    { label: 'GET /api/config/mobile/', url: () => '/api/config/mobile/' },
    { label: 'GET /api/sidebar/stats', url: () => '/api/sidebar/stats' },
  ];

  beforeAll(async () => {
    app = await createTestApp();
    const plan = await prisma.plan.create({
      data: {
        planCode: PLAN_CODE,
        displayName: `${RUN_TAG} Plan`,
        priceYearlyEur: 19900,
        cashbackRate: 0.2,
        isActive: true,
      },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    try {
      await prisma.plan.deleteMany({ where: { planCode: PLAN_CODE } });
    } catch {
      /* best-effort */
    }
    await app?.close?.();
  });

  it('emits no denylisted internal/PII field name on any public GET', async () => {
    const hits: Hit[] = [];
    for (const t of targets) {
      const res = await request(app).get(t.url());
      if (res.status < 200 || res.status >= 300) continue;
      if (!res.body || typeof res.body !== 'object') continue;
      walkForDenied(res.body, t.label, '', hits);
    }
    if (hits.length) {
      // eslint-disable-next-line no-console
      console.log('[public-data-exposure-sweep] LEAKS:');
      for (const h of hits) console.log(`  - ${h.route}  ${h.jsonPath} (key="${h.key}")`);
    }
    expect({ count: hits.length, hits }).toEqual({ count: 0, hits: [] });
  });

  it('GET /api/config/mobile/ emits only the allowlisted shape', async () => {
    const res = await request(app).get('/api/config/mobile/');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Top-level data keys must be exactly the documented public shape.
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['errorLogUrl', 'features', 'pushEnabled', 'status', 'versions'].sort(),
    );
  });

  it('GET /api/sidebar/stats returns 401 without auth token (INV-PUB-INP-006 / INV-PUB-LEAK-005)', async () => {
    // sidebar/stats is auth-gated (authenticate middleware added in BC-PUBLIC-SPEC-REAUDIT-SIDEBAR-MOCK).
    // Anonymous callers must get 401, not 200 with mock data and not 500.
    const res = await request(app).get('/api/sidebar/stats');
    expect(res.status).toBe(401);
  });
});
