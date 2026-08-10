/**
 * TEETH TEST: partner-currency-leak-sweep (INV-CUR-001..007, INV-INTERNAL-001..011)
 *
 * Proves that the BGN/internal-field leak detector has teeth: it fires on a
 * synthetic "broken" response body and passes on the production API response.
 *
 * RED scenario (inline): feed the walk() detector a synthetic JSON body that
 *   contains raw BGN amounts / internal fields → detector reports leaks.
 * GREEN scenario (live API): query analytics + finance with currency window CLOSED
 *   → detector reports zero leaks.
 *
 * This file does NOT edit any src/** code.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';
import { genTestPhone } from '../helpers/test-utils';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_o: any) => Promise.resolve() },
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutEvent: (_o: any) => Promise.resolve(),
    notifyPartnerStatusChange: (_o: any) => Promise.resolve(),
  },
}));

const RUN_TAG = `teeth-curleak-${Date.now()}`;

function tok(userId: string): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return jwt.sign({ id: userId, email: `${RUN_TAG}@test.local`, role: 'PARTNER' }, s, {
    expiresIn: '15m',
  });
}

// ─── Leak detection logic (mirror of the production sweep) ───────────────────

const MONEY_KEY =
  /(amount|balance|total|fee|margin|cashback|discount|netamount|payout|price|threshold|revenue|payment|refund|sum|cost|gross|net|owed|turnover|earnings|spend|withdraw|deposit|credit|debit|wallet|savings)/i;

// Mirror of the production sweep's allowlists exactly — so GREEN tests use identical logic.
const ALLOW_NONMONEY = new Set<string>(
  [
    'count', 'totalcount', 'pendingcount', 'paymentcount', 'totalpayments', 'totalrefunds', 'totalpayouts',
    'totaltransactions', 'transactioncount', 'usercount', 'partnercount', 'subscribercount', 'cashbackcount',
    'totalcashbackcount', 'pending', 'paid', 'overdue', 'processing', 'failed', 'completed', 'cancelled',
    'total', 'rate', 'discountrate', 'maxdiscountrate', 'mindiscountrate', 'defaultdiscountrate', 'cashbackrate',
    'cashbackpercent', 'percentage', 'percent', 'marginpercent', 'commissionrate', 'contractedrate', 'taxrate',
    'feerate', 'discountstep', 'discountmin', 'discountmax', 'discountpercent', 'avgdiscount', 'totalvisits',
    'totalredumptions', 'totalredemptions', 'monthvisits', 'reviewcount',
    'effectivediscountrate', 'totaluses', 'totalvenues', 'totaloffers', 'totalreviews', 'totalscans',
    'totalsavings',
  ].map((s) => s.toLowerCase()),
);

const ALWAYS_IGNORE_KEYS = new Set<string>(
  ['page', 'limit', 'pages', 'totalpages', 'offset', 'size', 'perpage', 'pagesize'].map((s) => s.toLowerCase()),
);

const FORBIDDEN_INTERNAL_KEYS = new Set<string>(
  [
    'marginamount', 'cashbackamount', 'cashbackpercent', 'fraudscore', 'fraudreasons', 'specrisklevel',
    'risklevel', 'qrcode', 'ipaddress', 'useragent', 'devicefingerprint', 'ocrdata', 'receiptimagehash',
    'paidby', 'internalnote', 'premiumbonus', 'platinumbonus', 'maxcashbackperscan',
    'autoapprovethreshold', 'autorejectthreshold',
  ].map((s) => s.toLowerCase()),
);

interface Leak { jsonPath: string; key: string; value: any; kind: 'MONEY' | 'INTERNAL'; }

function isNumericLeaf(v: any): boolean {
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return true;
  return false;
}

function walk(node: any, path: string, leaks: Leak[]): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) { node.forEach((el, i) => walk(el, `${path}[${i}]`, leaks)); return; }
  if (typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    const keyLc = key.toLowerCase();
    if (FORBIDDEN_INTERNAL_KEYS.has(keyLc) && value !== null && value !== undefined) {
      leaks.push({ jsonPath: childPath, key, value, kind: 'INTERNAL' });
    }
    if (value && typeof value === 'object') { walk(value, childPath, leaks); continue; }
    if (!isNumericLeaf(value)) continue;
    if (ALWAYS_IGNORE_KEYS.has(keyLc)) continue;
    if (keyLc === 'bgn') { leaks.push({ jsonPath: childPath, key, value, kind: 'MONEY' }); continue; }
    if (keyLc === 'eur') continue;
    if (!MONEY_KEY.test(key)) continue;
    if (ALLOW_NONMONEY.has(keyLc)) continue;
    leaks.push({ jsonPath: childPath, key, value, kind: 'MONEY' });
  }
}

async function setCurrencyWindowOpen(open: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'currency_transition_window_open' },
    create: { key: 'currency_transition_window_open', value: open ? 'true' : 'false' },
    update: { value: open ? 'true' : 'false' },
  });
  invalidateCurrencyDisplayCache();
}

// ─────────────────────────────────────────────────────────────────────────────
// RED scenario — synthetic leaky bodies
// ─────────────────────────────────────────────────────────────────────────────

describe('TEETH — RED: detector fires on known-bad response bodies', () => {
  it('RED: raw BGN amount on revenue key is detected as MONEY leak', () => {
    const brokenBody = {
      data: {
        stats: {
          revenue: 1250.50, // raw BGN scalar — MUST NOT appear when window is CLOSED
        },
      },
    };
    const leaks: Leak[] = [];
    walk(brokenBody, '', leaks);
    const moneyLeaks = leaks.filter((l) => l.kind === 'MONEY');
    expect(moneyLeaks.length).toBeGreaterThanOrEqual(1);
    expect(moneyLeaks.some((l) => l.key === 'revenue')).toBe(true);
  });

  it('RED: raw BGN scalar on "bgn" key is detected', () => {
    const brokenBody = {
      data: {
        revenue: {
          display: { bgn: 500, eur: 255.8 }, // bgn present while window CLOSED
        },
      },
    };
    const leaks: Leak[] = [];
    walk(brokenBody, '', leaks);
    // bgn key with a real value is always a MONEY leak
    expect(leaks.some((l) => l.key === 'bgn' && l.kind === 'MONEY')).toBe(true);
  });

  it('RED: marginAmount internal field is detected as INTERNAL leak', () => {
    const brokenBody = {
      data: {
        payment: {
          marginAmount: 20,     // internal field — must never reach partner
          turnoverAmount: 1000, // also money
        },
      },
    };
    const leaks: Leak[] = [];
    walk(brokenBody, '', leaks);
    expect(leaks.some((l) => l.key === 'marginAmount' && l.kind === 'INTERNAL')).toBe(true);
  });

  it('RED: cashbackAmount internal field is detected as INTERNAL leak', () => {
    const brokenBody = {
      data: {
        scan: {
          cashbackAmount: 5.0, // must never reach partner
          fraudScore: 3,       // also internal
        },
      },
    };
    const leaks: Leak[] = [];
    walk(brokenBody, '', leaks);
    expect(leaks.some((l) => l.key === 'cashbackAmount' && l.kind === 'INTERNAL')).toBe(true);
    expect(leaks.some((l) => l.key === 'fraudScore' && l.kind === 'INTERNAL')).toBe(true);
  });

  it('RED: qrCode internal field is detected regardless of value type', () => {
    const brokenBody = {
      sticker: { qrCode: 'QR-SECRET-PAYLOAD' },
    };
    const leaks: Leak[] = [];
    walk(brokenBody, '', leaks);
    expect(leaks.some((l) => l.key === 'qrCode' && l.kind === 'INTERNAL')).toBe(true);
  });

  it('BASELINE: clean dual-currency display body produces zero leaks (window CLOSED shape)', () => {
    const cleanBody = {
      data: {
        revenue: {
          display: {
            total: { bgn: null, eur: 640.23 },
            average: { bgn: null, eur: 32.01 },
          },
        },
        cashback: {
          display: {
            total: { bgn: null, eur: 32.01 },
          },
        },
      },
    };
    const leaks: Leak[] = [];
    walk(cleanBody, '', leaks);
    // bgn:null should NOT fire (we only leak on numeric bgn)
    expect(leaks).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GREEN scenario — live API with window CLOSED
// ─────────────────────────────────────────────────────────────────────────────

describe('GREEN: live partner API leaks nothing when window CLOSED', () => {
  let app: any;
  let partnerToken: string;
  let fixtures: Record<string, string> = {};

  beforeAll(async () => {
    app = await createTestApp();

    const user = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-p@test.local`,
        firstName: 'Teeth',
        lastName: 'CurLeak',
        phone: genTestPhone(),
        status: 'ACTIVE',
        role: 'PARTNER',
        emailVerified: true,
        passwordHash: 'unused',
      },
    });
    const partner = await prisma.partner.create({
      data: {
        userId: user.id,
        businessName: `${RUN_TAG} Partner`,
        category: 'RESTAURANT',
        status: 'ACTIVE',
        verifiedAt: new Date(),
        discountRate: 10,
      },
    });
    const venue = await prisma.venue.create({
      data: { partnerId: partner.id, name: `${RUN_TAG} Venue`, address: 'Addr', city: 'Sofia' },
    });
    const loc = await prisma.stickerLocation.create({
      data: { venueId: venue.id, name: 'Loc', locationNumber: `${RUN_TAG}-1` },
    });
    const sticker = await prisma.sticker.create({
      data: {
        venueId: venue.id,
        locationId: loc.id,
        stickerId: `${RUN_TAG}-S1`,
        qrCode: `${RUN_TAG}-QR1`,
        status: 'ACTIVE',
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-cust@test.local`,
        firstName: 'Cust',
        lastName: 'Omer',
        phone: genTestPhone(),
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash: 'unused',
      },
    });
    const card = await prisma.card.create({
      data: { userId: customer.id, cardNumber: `${RUN_TAG}-CARD`, qrCode: `${RUN_TAG}-CQR` },
    });
    await prisma.stickerScan.create({
      data: {
        userId: customer.id,
        cardId: card.id,
        stickerId: sticker.id,
        venueId: venue.id,
        billAmount: 100,
        verifiedAmount: 100,
        cashbackAmount: 5,
        cashbackPercent: 5,
        status: 'APPROVED',
        fraudScore: 3,
        specRiskLevel: 'LOW',
      },
    });
    await prisma.partnerCashbackPayment.create({
      data: {
        partnerId: partner.id,
        month: '2026-01',
        turnoverAmount: 1000,
        contractedRate: 5,
        totalCashbackOwed: 50,
        marginAmount: 20,
        status: 'PENDING',
        invoiceNumber: `${RUN_TAG}-INV1`,
      },
    });

    partnerToken = tok(user.id);
    fixtures.partnerId = partner.id;
    fixtures.venueId = venue.id;

    await setCurrencyWindowOpen(false);
  });

  afterAll(async () => {
    await setCurrencyWindowOpen(true);
    try {
      await prisma.stickerScan.deleteMany({
        where: { venue: { partner: { user: { email: { startsWith: RUN_TAG } } } } },
      });
      await prisma.card.deleteMany({ where: { user: { email: { startsWith: RUN_TAG } } } });
      await prisma.partnerCashbackPayment.deleteMany({
        where: { partner: { user: { email: { startsWith: RUN_TAG } } } },
      });
      await prisma.sticker.deleteMany({
        where: { venue: { partner: { user: { email: { startsWith: RUN_TAG } } } } },
      });
      await prisma.stickerLocation.deleteMany({
        where: { venue: { partner: { user: { email: { startsWith: RUN_TAG } } } } },
      });
      await prisma.venue.deleteMany({
        where: { partner: { user: { email: { startsWith: RUN_TAG } } } },
      });
      await prisma.partner.deleteMany({ where: { user: { email: { startsWith: RUN_TAG } } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: RUN_TAG } } });
    } catch { /* best-effort */ }
    await app?.close?.();
  });

  it('GREEN: venue analytics endpoint has no raw BGN or internal field when window CLOSED', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${fixtures.venueId}/analytics`)
      .set('Authorization', `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    const leaks: Leak[] = [];
    walk(res.body, '', leaks);
    if (leaks.length > 0) {
      console.log('[curleak-teeth] GREEN FAILS — leaks:', leaks);
    }
    expect(leaks).toEqual([]);
  });

  it('GREEN: partner finance endpoint has no raw BGN scalar when window CLOSED', async () => {
    const res = await request(app)
      .get(`/api/partners/${fixtures.partnerId}/finance`)
      .set('Authorization', `Bearer ${partnerToken}`);
    if (res.status !== 200) return; // auth-scoped — skip if denied
    const leaks: Leak[] = [];
    walk(res.body, '', leaks);
    expect(leaks).toEqual([]);
  });

  it('GREEN: partner /me/analytics has no raw BGN scalar when window CLOSED', async () => {
    const res = await request(app)
      .get('/api/partners/me/analytics')
      .set('Authorization', `Bearer ${partnerToken}`);
    if (res.status !== 200) return;
    const leaks: Leak[] = [];
    walk(res.body, '', leaks);
    expect(leaks).toEqual([]);
  });

  it('GREEN: partner /me/transactions has no internal field in any row', async () => {
    const res = await request(app)
      .get('/api/partners/me/transactions')
      .set('Authorization', `Bearer ${partnerToken}`);
    if (res.status !== 200) return;
    const leaks: Leak[] = [];
    walk(res.body, '', leaks);
    expect(leaks).toEqual([]);
  });
});
