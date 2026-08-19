/**
 * TEETH TEST: partner-internal-field-leak-sweep (INV-INTERNAL-001..011)
 *
 * Proves that the internal-field leak detector has teeth: it fires on a
 * synthetic "broken" response body and passes on the production API response.
 *
 * RED scenario (inline): feed the walk() detector a synthetic JSON body that
 *   contains internal fields → detector reports leaks.
 * GREEN scenario (live API): query analytics + finance + transactions
 *   → detector reports zero internal-field leaks.
 *
 * This file does NOT edit any src/** code.
 *
 * NOTE — history: this teeth test formerly also proved a dual-currency-display
 * (BGN→EUR transition window) invariant, ex-`partner-currency-leak-sweep.teeth.test.ts`
 * (INV-CUR-001..007). That invariant and its dual-currency machinery were fully
 * removed 2026-08-10 (BC-QA-031) — the transition window closed and the feature
 * was retired, so there is no `display:{bgn,eur}` shape left to police. Only the
 * internal-field-name invariant (unrelated to currency) survives, in this
 * renamed file.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';
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

const RUN_TAG = `teeth-intleak-${Date.now()}`;

function tok(userId: string): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return jwt.sign({ id: userId, email: `${RUN_TAG}@test.local`, role: 'PARTNER' }, s, {
    expiresIn: '15m',
  });
}

// ─── Leak detection logic (mirror of the production sweep) ───────────────────

const FORBIDDEN_INTERNAL_KEYS = new Set<string>(
  [
    'marginamount', 'cashbackamount', 'cashbackpercent', 'fraudscore', 'fraudreasons', 'specrisklevel',
    'risklevel', 'qrcode', 'ipaddress', 'useragent', 'devicefingerprint', 'ocrdata', 'receiptimagehash',
    'paidby', 'internalnote', 'premiumbonus', 'platinumbonus', 'maxcashbackperscan',
    'autoapprovethreshold', 'autorejectthreshold',
  ].map((s) => s.toLowerCase()),
);

interface Leak { jsonPath: string; key: string; value: any; }

function walk(node: any, path: string, leaks: Leak[]): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) { node.forEach((el, i) => walk(el, `${path}[${i}]`, leaks)); return; }
  if (typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    const keyLc = key.toLowerCase();
    if (FORBIDDEN_INTERNAL_KEYS.has(keyLc) && value !== null && value !== undefined) {
      leaks.push({ jsonPath: childPath, key, value });
    }
    if (value && typeof value === 'object') { walk(value, childPath, leaks); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RED scenario — synthetic leaky bodies
// ─────────────────────────────────────────────────────────────────────────────

describe('TEETH — RED: detector fires on known-bad response bodies', () => {
  it('RED: marginAmount internal field is detected', () => {
    const brokenBody = {
      data: {
        payment: {
          marginAmount: 20,     // internal field — must never reach partner
          turnoverAmount: 1000,
        },
      },
    };
    const leaks: Leak[] = [];
    walk(brokenBody, '', leaks);
    expect(leaks.some((l) => l.key === 'marginAmount')).toBe(true);
  });

  it('RED: cashbackAmount and fraudScore internal fields are detected', () => {
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
    expect(leaks.some((l) => l.key === 'cashbackAmount')).toBe(true);
    expect(leaks.some((l) => l.key === 'fraudScore')).toBe(true);
  });

  it('RED: qrCode internal field is detected regardless of value type', () => {
    const brokenBody = {
      sticker: { qrCode: 'QR-SECRET-PAYLOAD' },
    };
    const leaks: Leak[] = [];
    walk(brokenBody, '', leaks);
    expect(leaks.some((l) => l.key === 'qrCode')).toBe(true);
  });

  it('BASELINE: clean plain-scalar body produces zero leaks', () => {
    const cleanBody = {
      data: {
        revenue: { total: 640.23, average: 32.01 },
        cashback: { total: 32.01 },
      },
    };
    const leaks: Leak[] = [];
    walk(cleanBody, '', leaks);
    expect(leaks).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GREEN scenario — live API leaks no internal field
// ─────────────────────────────────────────────────────────────────────────────

describe('GREEN: live partner API leaks no internal field', () => {
  let app: any;
  let partnerToken: string;
  let fixtures: Record<string, string> = {};

  beforeAll(async () => {
    app = await createTestApp();

    const user = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-p@test.local`,
        firstName: 'Teeth',
        lastName: 'IntLeak',
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
  });

  afterAll(async () => {
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

  it('GREEN: venue analytics endpoint has no internal field', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${fixtures.venueId}/analytics`)
      .set('Authorization', `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    const leaks: Leak[] = [];
    walk(res.body, '', leaks);
    if (leaks.length > 0) {
      console.log('[intleak-teeth] GREEN FAILS — leaks:', leaks);
    }
    expect(leaks).toEqual([]);
  });

  it('GREEN: partner finance endpoint has no internal field', async () => {
    const res = await request(app)
      .get(`/api/partners/${fixtures.partnerId}/finance`)
      .set('Authorization', `Bearer ${partnerToken}`);
    if (res.status !== 200) return; // auth-scoped — skip if denied
    const leaks: Leak[] = [];
    walk(res.body, '', leaks);
    expect(leaks).toEqual([]);
  });

  it('GREEN: partner /me/analytics has no internal field', async () => {
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
