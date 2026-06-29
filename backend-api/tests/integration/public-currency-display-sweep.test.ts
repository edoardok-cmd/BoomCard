/**
 * Currency dual-display sweep — PUBLIC plan pricing.
 *
 * Invariant (INV-PUB-CUR-001..002, Spec §8.1 rule 4 / Clash 12.1): customer-
 * facing monetary amounts must be displayed in BOTH BGN and EUR during the
 * BGN→EUR transition window, and EUR-only after it closes. Public plan pricing
 * (`/api/plans`, `/api/plans/:id`, `/api/plans/code/:planCode`) is the most
 * visible customer-facing money on the whole product, yet currently emits
 * `currency: 'EUR'` with EUR-only scalars unconditionally — so during the OPEN
 * window it violates the dual-display rule.
 *
 * The canonical pattern elsewhere (currencyDisplay.ts, admin/partner routes) is
 * a `{ bgn, eur }` pair gated on the transition-window flag. This sweep asserts
 * the public plan pricing carries a BGN value alongside EUR when the window is
 * OPEN, at the fixed currency-board rate (EUR_TO_BGN_RATE = 1.95583).
 *
 * This file does NOT edit any src/** code. It is a test-only behavioural probe.
 *
 * EXPECTED STATE on first run: RED (pricing is EUR-only). It goes green once the
 * plans routes emit a window-gated BGN value next to each EUR price.
 */

import request from 'supertest';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';
import { EUR_TO_BGN_RATE } from '../../src/constants/receipt.constants';

const RUN_TAG = `pubcur-${Date.now()}`;
const PLAN_CODE = `PUBCUR${Math.floor(Date.now() % 100000)}`;

async function setCurrencyWindowOpen(isOpen: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'currency_transition_window_open' },
    create: { key: 'currency_transition_window_open', value: isOpen ? 'true' : 'false' },
    update: { value: isOpen ? 'true' : 'false' },
  });
  invalidateCurrencyDisplayCache();
}

/**
 * Recursively collect every leaf whose key looks like an EUR price scalar and,
 * for each, check whether a sibling/companion BGN value is present somewhere in
 * the same pricing object. We assert at the `pricing` object granularity: a
 * pricing object that names a currency 'EUR' and carries numeric prices must
 * also expose BGN values when the window is OPEN.
 */
function pricingObjectsMissingBgn(node: any, path: string, out: string[]): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((el, i) => pricingObjectsMissingBgn(el, `${path}[${i}]`, out));
    return;
  }
  // A pricing object is one that carries a `currency` marker or weekly/monthly/
  // yearly numeric price fields.
  const keys = Object.keys(node);
  const looksLikePricing =
    keys.includes('currency') ||
    keys.some((k) => /^(weekly|monthly|yearly)$/i.test(k));
  if (looksLikePricing) {
    const hasEurScalar =
      node.currency === 'EUR' ||
      ['weekly', 'monthly', 'yearly'].some((k) => typeof node[k] === 'number');
    // BGN evidence: a `bgn` field, a `*Bgn`/`priceBgn` field, or a nested
    // { bgn, eur } shape on any price.
    const json = JSON.stringify(node).toLowerCase();
    const hasBgn = /"bgn"|bgn"\s*:/.test(json) || /[a-z]bgn"/.test(json);
    if (hasEurScalar && !hasBgn) {
      out.push(path);
    }
  }
  for (const [k, v] of Object.entries(node)) {
    pricingObjectsMissingBgn(v, path ? `${path}.${k}` : k, out);
  }
}

describe('public-currency-display-sweep: plan pricing dual-display when window OPEN', () => {
  let app: any;
  let planId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const plan = await prisma.plan.create({
      data: {
        planCode: PLAN_CODE,
        displayName: `${RUN_TAG} Plan`,
        priceWeeklyEur: 699,
        priceMonthlyEur: 1999,
        priceYearlyEur: 19900,
        cashbackRate: 0.2,
        isActive: true,
      },
    });
    planId = plan.id;
    await setCurrencyWindowOpen(true);
  });

  afterAll(async () => {
    try {
      await prisma.plan.deleteMany({ where: { planCode: PLAN_CODE } });
    } catch {
      /* best-effort */
    }
    await app?.close?.();
  });

  it('the fixed currency-board rate is the documented value', () => {
    expect(EUR_TO_BGN_RATE).toBeCloseTo(1.95583, 5);
  });

  it('GET /api/plans/ carries a BGN value alongside EUR when window OPEN', async () => {
    const res = await request(app).get('/api/plans/');
    expect(res.status).toBe(200);
    const missing: string[] = [];
    pricingObjectsMissingBgn(res.body, '', missing);
    if (missing.length) {
      // eslint-disable-next-line no-console
      console.log('[public-currency-display-sweep] EUR-only pricing (no BGN) at:', missing);
    }
    expect(missing).toEqual([]);
  });

  it('GET /api/plans/:id carries a BGN value alongside EUR when window OPEN', async () => {
    const res = await request(app).get(`/api/plans/${planId}`);
    expect(res.status).toBe(200);
    const missing: string[] = [];
    pricingObjectsMissingBgn(res.body, '', missing);
    expect(missing).toEqual([]);
  });

  it('GET /api/plans/code/:planCode carries a BGN value alongside EUR when window OPEN', async () => {
    const res = await request(app).get(`/api/plans/code/${PLAN_CODE}`);
    expect(res.status).toBe(200);
    const missing: string[] = [];
    pricingObjectsMissingBgn(res.body, '', missing);
    expect(missing).toEqual([]);
  });
});
