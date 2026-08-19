/**
 * EXHAUSTIVE internal-field-leak sweep — PARTNER GET endpoints.
 *
 * One invariant over the whole partner GET surface, enumerated from Express's
 * live router stack (so new partner endpoints auto-enroll):
 *
 *  INTERNAL FIELDS (matrix INV-INTERNAL-001..008, INV-SM-QR-007, spec §11.3 /
 *  Clash 5.1/10.6): NO partner GET response may contain an internal-only field
 *  key — marginAmount, cashbackAmount, cashbackPercent, fraudScore/Reasons,
 *  specRiskLevel, raw QR token (qrCode), customer PII (ipAddress/userAgent/
 *  deviceFingerprint, ocrData), receiptImageHash, paidBy/internalNote.
 *
 * This file does NOT edit any src/** code.
 *
 * NOTE — history: this sweep formerly also carried a dual-currency-display
 * invariant (BGN→EUR transition window, ex-`partner-currency-leak-sweep.test.ts`).
 * That invariant and its dual-currency machinery were fully removed 2026-08-10
 * (BC-QA-031) — the transition window closed and the feature was retired, so
 * partner-facing amounts are plain EUR (or the original pre-feature) scalars
 * with no `display:{bgn,eur}` wrapper to police. Only the internal-field-name
 * invariant (unrelated to currency) survives, in this renamed file.
 */

/**
 * NOTE — two-layer testing model:
 *
 *  Layer 1 (this file): ts-jest compiles TypeScript source on-the-fly.
 *  Changes to src/ are tested immediately without rebuilding dist/.
 *
 *  Layer 2 (task-level audit): curl checks against the live dev server
 *  (node dist/server.js). After any src/ change, `npm run build` MUST
 *  be run and the server restarted before live-curl verification is valid.
 *  Skipping this step causes a false-green: Jest passes the TS source
 *  while the live server still runs the stale compiled artifact.
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

const RUN_TAG = `partner-intleak-${Date.now()}`;

function generateTestToken(userId: string, role: string): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET env var is not set — tests cannot generate valid tokens');
  return jwt.sign({ id: userId, email: `${RUN_TAG}-${userId}@test.local`, role }, jwtSecret, { expiresIn: '15m' });
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

    // internal-field-name leak — fires regardless of value type.
    if (FORBIDDEN_INTERNAL_KEYS.has(keyLc) && value !== null && value !== undefined) {
      leaks.push({ route, jsonPath: childPath, key, value });
    }

    if (value && typeof value === 'object') {
      walk(value, route, childPath, leaks);
    }
  }
}

const fixtures: Record<string, string> = {};

describe('partner-internal-field-leak-sweep: no internal-only field leaves any partner GET', () => {
  let app: any;
  let partnerToken: string;
  let getRoutes: EnumeratedRoute[] = [];
  const SKIPPED: { route: string; reason: string }[] = [];

  beforeAll(async () => {
    app = await createTestApp();

    const user = await prisma.user.create({
      data: { email: `${RUN_TAG}-partner@test.local`, firstName: 'Sweep', lastName: 'Partner', phone: genTestPhone(), status: 'ACTIVE', role: 'PARTNER', emailVerified: true, passwordHash: 'unused' },
    });
    const partner = await prisma.partner.create({
      data: { userId: user.id, businessName: `${RUN_TAG} Partner`, category: 'RESTAURANT', status: 'ACTIVE', verifiedAt: new Date(), discountRate: 10 },
    });
    const venue = await prisma.venue.create({ data: { partnerId: partner.id, name: `${RUN_TAG} Venue`, address: 'Addr', city: 'Sofia' } });
    const loc = await prisma.stickerLocation.create({ data: { venueId: venue.id, name: 'Loc', locationNumber: `${RUN_TAG}-1` } });
    const sticker = await prisma.sticker.create({ data: { venueId: venue.id, locationId: loc.id, stickerId: `${RUN_TAG}-S1`, qrCode: `${RUN_TAG}-QR1`, status: 'ACTIVE' } });
    const customer = await prisma.user.create({ data: { email: `${RUN_TAG}-cust@test.local`, firstName: 'Cust', lastName: 'Omer', phone: genTestPhone(), status: 'ACTIVE', emailVerified: true, passwordHash: 'unused' } });
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
    console.log(`[partner-internal-field-leak-sweep] ${all.length} total routes; ${getRoutes.length} partner GET routes.`);
  });

  afterAll(async () => {
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

  it('leaks NO internal-only field from any partner GET', async () => {
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
    console.log(`\n[partner-internal-field-leak-sweep] scanned ${getRoutes.length - SKIPPED.length}; ${SKIPPED.length} skipped; ${leaks.length} leak(s).`);
    for (const l of leaks) {
      // eslint-disable-next-line no-console
      console.log(`  - ${l.route}  ${l.jsonPath} = ${JSON.stringify(l.value)}`);
    }
    const message =
      leaks.length === 0
        ? ''
        : 'Partner internal-field leak(s):\n' +
          leaks.map((l) => `  ${l.route}  path=${l.jsonPath}  value=${JSON.stringify(l.value)}`).join('\n');
    expect({ count: leaks.length, message }).toEqual({ count: 0, message: '' });
  });
});
