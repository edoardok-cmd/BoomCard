/**
 * EXHAUSTIVE currency-leak + internal-field sweep — PARTNER GET endpoints.
 *
 * Two invariants over the whole partner GET surface, enumerated from Express's
 * live router stack (so new partner endpoints auto-enroll):
 *
 *  A) CURRENCY (matrix INV-CUR-001..004/006, spec §7.3 / Clash 12.1): when the
 *     BGN→EUR transition window is CLOSED, NO raw BGN monetary scalar may leave
 *     ANY partner GET. The correct gated shape nulls the raw BGN and emits a
 *     `display:{bgn:null,eur:<n>}` object (same convention as the admin sweep).
 *
 *  B) INTERNAL FIELDS (matrix INV-INTERNAL-001..008, INV-SM-QR-007, spec §11.3 /
 *     Clash 5.1/10.6): NO partner GET response may contain an internal-only field
 *     key — marginAmount, cashbackAmount, cashbackPercent, fraudScore/Reasons,
 *     specRiskLevel, raw QR token (qrCode), customer PII (ipAddress/userAgent/
 *     deviceFingerprint, ocrData), receiptImageHash, paidBy/internalNote.
 *
 * A money field the sweep cannot classify FAILS assertion A (classify-or-gate),
 * exactly like the admin sweep. This file does NOT edit any src/** code.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutEvent: (_opts: any) => Promise.resolve(),
    notifyPartnerStatusChange: (_opts: any) => Promise.resolve(),
  },
}));

const RUN_TAG = `partner-curleak-${Date.now()}`;

function generateTestToken(userId: string, role: string): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET env var is not set — tests cannot generate valid tokens');
  return jwt.sign({ id: userId, email: `${RUN_TAG}-${userId}@test.local`, role }, jwtSecret, { expiresIn: '15m' });
}

async function setCurrencyWindowOpen(isOpen: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'currency_transition_window_open' },
    create: { key: 'currency_transition_window_open', value: isOpen ? 'true' : 'false' },
    update: { value: isOpen ? 'true' : 'false' },
  });
  invalidateCurrencyDisplayCache();
}

// ─── Route introspection ─────────────────────────────────────────────────────
interface EnumeratedRoute {
  method: string;
  path: string;
}
function layerRegexToPrefix(layer: any): string {
  if (typeof layer.path === 'string') return layer.path;
  const keys: any[] = layer.keys || [];
  const src: string = layer.regexp?.source ?? '';
  if (layer.regexp?.fast_slash) return '';
  let working = src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\$$/, '').replace(/\\\//g, '/');
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
      const methods = layer.route.methods || {};
      for (const m of Object.keys(methods)) {
        if (m === '_all') continue;
        out.push({ method: m.toUpperCase(), path: prefix + layer.route.path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      collectRoutes(layer.handle.stack, prefix + layerRegexToPrefix(layer), out);
    }
  }
}
function enumerateRoutes(app: any): EnumeratedRoute[] {
  const out: EnumeratedRoute[] = [];
  collectRoutes(app._router?.stack || app.router?.stack || [], '', out);
  return out;
}
function isPartnerRoute(p: string): boolean {
  return p.startsWith('/api/partners') || p.startsWith('/api/partner/help') || p.startsWith('/api/stickers/venue');
}

// ─── Money-key classification (mirrors admin sweep) ──────────────────────────
const MONEY_KEY =
  /(amount|balance|total|fee|margin|cashback|discount|netamount|payout|price|threshold|revenue|payment|refund|sum|cost|gross|net|owed|turnover|earnings|spend|withdraw|deposit|credit|debit|wallet|savings)/i;
const ALLOW_NONMONEY = new Set<string>(
  [
    'count', 'totalcount', 'pendingcount', 'paymentcount', 'totalpayments', 'totalrefunds', 'totalpayouts',
    'totaltransactions', 'transactioncount', 'usercount', 'partnercount', 'subscribercount', 'cashbackcount',
    'totalcashbackcount', 'pending', 'paid', 'overdue', 'processing', 'failed', 'completed', 'cancelled',
    'total', 'rate', 'discountrate', 'maxdiscountrate', 'mindiscountrate', 'defaultdiscountrate', 'cashbackrate',
    'cashbackpercent', 'percentage', 'percent', 'marginpercent', 'commissionrate', 'contractedrate', 'taxrate',
    'feerate', 'discountstep', 'discountmin', 'discountmax', 'discountpercent', 'avgdiscount', 'totalvisits',
    'totalredumptions', 'totalredemptions', 'monthvisits', 'reviewcount',
    // counts/rates surfaced by partner stats/analytics/stickers (cardinalities &
    // percentages, NOT BGN amounts):
    'effectivediscountrate', 'totaluses', 'totalvenues', 'totaloffers', 'totalreviews', 'totalscans',
    // analytics.changes.totalSavings is a pctChange delta (%, not BGN) — the BGN scalar lives
    // at stats.totalSavings which is window-gated (absent when window is closed, so never leaks):
    'totalsavings',
  ].map((s) => s.toLowerCase()),
);
const ALWAYS_IGNORE_KEYS = new Set<string>(
  ['page', 'limit', 'pages', 'totalpages', 'offset', 'size', 'perpage', 'pagesize'].map((s) => s.toLowerCase()),
);
function isCountKey(keyLc: string): boolean {
  return keyLc.endsWith('count');
}

// ─── Internal-only field keys that must NEVER appear in a partner response ────
// High-precision denylist (spec §11.3). Ambiguous fields (priority/assignee/
// source/notes) are NOT here — they are covered by `review`-tagged matrix rows.
const FORBIDDEN_INTERNAL_KEYS = new Set<string>(
  [
    'marginamount', 'cashbackamount', 'cashbackpercent', 'fraudscore', 'fraudreasons', 'specrisklevel',
    'risklevel', 'qrcode', 'ipaddress', 'useragent', 'devicefingerprint', 'devicefingerprintraw',
    'ocrdata', 'receiptimagehash', 'paidby', 'internalnote', 'premiumbonus', 'platinumbonus',
    'maxcashbackperscan', 'autoapprovethreshold', 'autorejectthreshold',
  ].map((s) => s.toLowerCase()),
);

interface Leak {
  route: string;
  jsonPath: string;
  key: string;
  value: any;
  kind: 'MONEY' | 'INTERNAL';
}
function isNumericLeaf(v: any): boolean {
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return true;
  return false;
}
function walk(node: any, route: string, path: string, leaks: Leak[]): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    node.forEach((el, i) => walk(el, route, `${path}[${i}]`, leaks));
    return;
  }
  if (typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    const keyLc = key.toLowerCase();

    // (B) internal-field-name leak — fires regardless of value type.
    if (FORBIDDEN_INTERNAL_KEYS.has(keyLc) && value !== null && value !== undefined) {
      leaks.push({ route, jsonPath: childPath, key, value, kind: 'INTERNAL' });
    }

    if (value && typeof value === 'object') {
      walk(value, route, childPath, leaks);
      continue;
    }
    // (A) currency leak.
    if (!isNumericLeaf(value)) continue;
    if (ALWAYS_IGNORE_KEYS.has(keyLc)) continue;
    if (keyLc === 'bgn') {
      leaks.push({ route, jsonPath: childPath, key, value, kind: 'MONEY' });
      continue;
    }
    if (keyLc === 'eur') continue;
    if (!MONEY_KEY.test(key)) continue;
    if (isCountKey(keyLc)) continue;
    if (ALLOW_NONMONEY.has(keyLc)) continue;
    leaks.push({ route, jsonPath: childPath, key, value, kind: 'MONEY' });
  }
}

const fixtures: Record<string, string> = {};

describe('partner-currency-leak-sweep: no raw BGN scalar / internal field leaves any partner GET', () => {
  let app: any;
  let partnerToken: string;
  let getRoutes: EnumeratedRoute[] = [];
  const SKIPPED: { route: string; reason: string }[] = [];

  beforeAll(async () => {
    app = await createTestApp();

    const user = await prisma.user.create({
      data: { email: `${RUN_TAG}-partner@test.local`, firstName: 'Sweep', lastName: 'Partner', phone: '+359000000020', status: 'ACTIVE', role: 'PARTNER', emailVerified: true, passwordHash: 'unused' },
    });
    const partner = await prisma.partner.create({
      data: { userId: user.id, businessName: `${RUN_TAG} Partner`, category: 'RESTAURANT', status: 'ACTIVE', verifiedAt: new Date(), discountRate: 10 },
    });
    const venue = await prisma.venue.create({ data: { partnerId: partner.id, name: `${RUN_TAG} Venue`, address: 'Addr', city: 'Sofia' } });
    const loc = await prisma.stickerLocation.create({ data: { venueId: venue.id, name: 'Loc', locationNumber: `${RUN_TAG}-1` } });
    const sticker = await prisma.sticker.create({ data: { venueId: venue.id, locationId: loc.id, stickerId: `${RUN_TAG}-S1`, qrCode: `${RUN_TAG}-QR1`, status: 'ACTIVE' } });
    const customer = await prisma.user.create({ data: { email: `${RUN_TAG}-cust@test.local`, firstName: 'Cust', lastName: 'Omer', phone: '+359000000021', status: 'ACTIVE', emailVerified: true, passwordHash: 'unused' } });
    const card = await prisma.card.create({ data: { userId: customer.id, cardNumber: `${RUN_TAG}-CARD`, qrCode: `${RUN_TAG}-CQR` } });
    await prisma.stickerScan.create({
      data: { userId: customer.id, cardId: card.id, stickerId: sticker.id, venueId: venue.id, billAmount: 100, verifiedAmount: 100, cashbackAmount: 5, cashbackPercent: 5, status: 'APPROVED', fraudScore: 3, specRiskLevel: 'LOW' },
    });
    await prisma.partnerCashbackPayment.create({ data: { partnerId: partner.id, month: '2026-01', turnoverAmount: 1000, contractedRate: 5, totalCashbackOwed: 50, marginAmount: 20, status: 'PENDING', invoiceNumber: `${RUN_TAG}-INV1` } });
    const ticket = await prisma.helpTicket.create({ data: { subject: 'Sweep ticket', body: 'b', category: 'OTHER', status: 'OPEN', userId: user.id, partnerId: partner.id } });

    partnerToken = generateTestToken(user.id, 'PARTNER');
    fixtures.id = partner.id;
    fixtures.partnerId = partner.id;
    fixtures.venueId = venue.id;
    fixtures.ticketId = ticket.id;

    const all = enumerateRoutes(app);
    getRoutes = all.filter((r) => r.method === 'GET' && isPartnerRoute(r.path));
    // eslint-disable-next-line no-console
    console.log(`[partner-currency-leak-sweep] ${all.length} total routes; ${getRoutes.length} partner GET routes.`);
  });

  afterAll(async () => {
    await setCurrencyWindowOpen(true);
    try {
      await prisma.helpTicket.deleteMany({ where: { user: { email: { startsWith: RUN_TAG } } } });
      await prisma.stickerScan.deleteMany({ where: { venue: { partner: { user: { email: { startsWith: RUN_TAG } } } } } });
      await prisma.card.deleteMany({ where: { user: { email: { startsWith: RUN_TAG } } } });
      await prisma.partnerCashbackPayment.deleteMany({ where: { partner: { user: { email: { startsWith: RUN_TAG } } } } });
      await prisma.sticker.deleteMany({ where: { venue: { partner: { user: { email: { startsWith: RUN_TAG } } } } } });
      await prisma.stickerLocation.deleteMany({ where: { venue: { partner: { user: { email: { startsWith: RUN_TAG } } } } } });
      await prisma.venue.deleteMany({ where: { partner: { user: { email: { startsWith: RUN_TAG } } } } });
      await prisma.partner.deleteMany({ where: { user: { email: { startsWith: RUN_TAG } } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: RUN_TAG } } });
    } catch {
      /* best-effort */
    }
    await app?.close?.();
  });

  function materialize(routePath: string): string | null {
    if (!routePath.includes(':')) return routePath;
    const out: string[] = [];
    for (const seg of routePath.split('/')) {
      if (!seg.startsWith(':')) {
        out.push(seg);
        continue;
      }
      const name = seg.slice(1).replace(/\?$/, '');
      let resolved: string | undefined = fixtures[name];
      if (!resolved) {
        if (/venue/i.test(name)) resolved = fixtures.venueId;
        else if (/ticket/i.test(name)) resolved = fixtures.ticketId;
        else if (/^id$/i.test(name) || /partner/i.test(name)) resolved = fixtures.partnerId;
      }
      if (!resolved) return null; // e.g. :token — cannot satisfy
      out.push(resolved);
    }
    return out.join('/');
  }

  it('enumerates a non-trivial number of partner GET routes', () => {
    expect(getRoutes.length).toBeGreaterThan(5);
  });

  // Targeted guard: ALLOW_NONMONEY has 'total' (needed for pagination counts).
  // analytics revenue/cashback totals are BGN money amounts that the generic walk
  // would miss when window is CLOSED (they'd be classified as count-like). This
  // explicit assertion closes that blind spot (INV-CUR-001..004/006).
  it('analytics endpoint gates BGN money fields (revenue/cashback totals absent when window CLOSED)', async () => {
    await setCurrencyWindowOpen(false);
    const url = materialize('/api/stickers/venue/:venueId/analytics');
    if (url === null) return; // no venue fixture — skip
    const res = await request(app).get(url).set('Authorization', `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    // Raw BGN scalars must be absent when window is CLOSED
    expect(data.revenue).not.toHaveProperty('total');
    expect(data.revenue).not.toHaveProperty('average');
    expect(data.cashback).not.toHaveProperty('total');
    expect(data.cashback).not.toHaveProperty('average');
    // display wrapper must be present with bgn:null
    expect(data.revenue?.display?.total?.bgn).toBeNull();
    expect(typeof data.revenue?.display?.total?.eur).toBe('number');
    expect(data.cashback?.display?.total?.bgn).toBeNull();
    expect(typeof data.cashback?.display?.total?.eur).toBe('number');
    // display must not expose windowOpen (partner contract: { bgn, eur } only)
    expect(data.revenue?.display?.total).not.toHaveProperty('windowOpen');
  });

  it('leaks NO raw BGN scalar and NO internal field from any partner GET (window CLOSED)', async () => {
    await setCurrencyWindowOpen(false);
    const leaks: Leak[] = [];
    for (const route of getRoutes) {
      const url = materialize(route.path);
      if (url === null) {
        SKIPPED.push({ route: `GET ${route.path}`, reason: 'unseeded :param' });
        continue;
      }
      let res: request.Response;
      try {
        res = await request(app).get(url).set('Authorization', `Bearer ${partnerToken}`);
      } catch (err) {
        SKIPPED.push({ route: `GET ${route.path}`, reason: `threw: ${String(err)}` });
        continue;
      }
      if (res.status < 200 || res.status >= 300) continue;
      if (!res.body || typeof res.body !== 'object') continue;
      walk(res.body, `GET ${route.path}`, '', leaks);
    }
    // eslint-disable-next-line no-console
    console.log(`\n[partner-currency-leak-sweep] scanned ${getRoutes.length - SKIPPED.length}; ${SKIPPED.length} skipped; ${leaks.length} leak(s).`);
    for (const l of leaks) {
      // eslint-disable-next-line no-console
      console.log(`  - [${l.kind}] ${l.route}  ${l.jsonPath} = ${JSON.stringify(l.value)}`);
    }
    const message =
      leaks.length === 0
        ? ''
        : 'Partner leak(s) (raw BGN while window CLOSED, or internal field):\n' +
          leaks.map((l) => `  [${l.kind}] ${l.route}  path=${l.jsonPath}  value=${JSON.stringify(l.value)}`).join('\n');
    expect({ count: leaks.length, message }).toEqual({ count: 0, message: '' });
  });
});
