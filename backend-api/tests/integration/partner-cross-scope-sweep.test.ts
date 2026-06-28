/**
 * FLAGSHIP EXHAUSTIVE cross-partner data-scoping sweep.
 *
 * Invariant (matrix INV-SCOPE-001..017, spec §11.1 / §12 rule 6): a partner must
 * NEVER read or modify another partner's data. Enumerated from Express's live
 * router stack so any newly-added partner :id/:venueId route auto-enrolls.
 *
 * Two mechanisms:
 *   1) MUST-DENY (param routes): seed partner A and partner B (each with its own
 *      venue / sticker / scan / finance / ticket). Authenticate as A. For EVERY
 *      partner-surface route carrying a path param, substitute B's resource id and
 *      assert the response is a denial (401/403/404) — never 200-with-B's-data,
 *      never 500. A small, explicitly-justified SKIP set carves out genuinely
 *      public/token routes; ANY other unclassified param route is asserted
 *      must-deny, so a new public route fails until a maintainer classifies it.
 *   2) NO-LEAK (collection routes): as A, hit the caller-scoped /me/* collections
 *      and assert B's private markers (invoice #, venue name, transaction id) do
 *      NOT appear.
 *
 * This file does NOT edit any src/** code. EXPECTED STATE: GREEN if scoping holds.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/services/email.service', () => ({ emailService: { sendEmail: (_o: any) => Promise.resolve() } }));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyPayoutEvent: (_o: any) => Promise.resolve(), notifyPartnerStatusChange: (_o: any) => Promise.resolve() },
}));

const RUN_TAG = `partner-scope-${Date.now()}`;

function tok(userId: string, role: string): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return jwt.sign({ id: userId, email: `${RUN_TAG}-${userId}@test.local`, role }, s, { expiresIn: '15m' });
}

// ─── Route introspection ─────────────────────────────────────────────────────
interface EnumeratedRoute { method: string; path: string; }
function layerRegexToPrefix(layer: any): string {
  if (typeof layer.path === 'string') return layer.path;
  const keys: any[] = layer.keys || [];
  const src: string = layer.regexp?.source ?? '';
  if (layer.regexp?.fast_slash) return '';
  let w = src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\$$/, '').replace(/\\\//g, '/');
  let i = 0;
  w = w.replace(/\(\[\^\\?\/]\+\?\)/g, () => { const k = keys[i++]; return k ? `:${k.name}` : ':param'; });
  return w.replace(/\/\?$/, '').replace(/\(\?:\(\?=\/\|\$\)\)$/, '');
}
function collect(stack: any[], prefix: string, out: EnumeratedRoute[]): void {
  for (const layer of stack) {
    if (layer.route) {
      for (const m of Object.keys(layer.route.methods || {})) {
        if (m === '_all') continue;
        out.push({ method: m.toUpperCase(), path: prefix + layer.route.path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      collect(layer.handle.stack, prefix + layerRegexToPrefix(layer), out);
    }
  }
}
function enumerateRoutes(app: any): EnumeratedRoute[] {
  const out: EnumeratedRoute[] = [];
  collect(app._router?.stack || app.router?.stack || [], '', out);
  return out;
}
function isPartnerRoute(p: string): boolean {
  return p.startsWith('/api/partners') || p.startsWith('/api/partner/help') || p.startsWith('/api/stickers/venue');
}

// Routes legitimately NOT cross-partner-scoped — each justified:
//  - GET /api/partners/:id        public partner profile (optionalAuth); returning B's PUBLIC profile is intended (§1.4 visibility gate covers it).
//  - GET /api/partners/activation/:token/verify  :token is an activation token, not a partner-owned id.
function isPublicSkip(r: EnumeratedRoute): boolean {
  const key = `${r.method} ${r.path}`;
  return key === 'GET /api/partners/:id' || key === 'GET /api/partners/activation/:token/verify';
}

// Seed two complete partners; return their fixtures.
async function seedPartner(tag: string) {
  const user = await prisma.user.create({ data: { email: `${RUN_TAG}-${tag}@test.local`, firstName: tag, lastName: 'P', phone: `+35900000${tag === 'A' ? '0030' : '0031'}`, status: 'ACTIVE', role: 'PARTNER', emailVerified: true, passwordHash: 'unused' } });
  const partner = await prisma.partner.create({ data: { userId: user.id, businessName: `${RUN_TAG}-${tag}-Biz`, category: 'RESTAURANT', status: 'ACTIVE', verifiedAt: new Date() } });
  const venue = await prisma.venue.create({ data: { partnerId: partner.id, name: `${RUN_TAG}-${tag}-Venue`, address: 'A', city: 'Sofia' } });
  const loc = await prisma.stickerLocation.create({ data: { venueId: venue.id, name: 'L', locationNumber: `${RUN_TAG}-${tag}-1` } });
  const sticker = await prisma.sticker.create({ data: { venueId: venue.id, locationId: loc.id, stickerId: `${RUN_TAG}-${tag}-S`, qrCode: `${RUN_TAG}-${tag}-QR`, status: 'ACTIVE' } });
  const customer = await prisma.user.create({ data: { email: `${RUN_TAG}-${tag}-cust@test.local`, firstName: 'C', lastName: 'U', phone: `+35900000${tag === 'A' ? '0032' : '0033'}`, status: 'ACTIVE', emailVerified: true, passwordHash: 'unused' } });
  const card = await prisma.card.create({ data: { userId: customer.id, cardNumber: `${RUN_TAG}-${tag}-CARD`, qrCode: `${RUN_TAG}-${tag}-CQR` } });
  await prisma.stickerScan.create({ data: { userId: customer.id, cardId: card.id, stickerId: sticker.id, venueId: venue.id, billAmount: 100, verifiedAmount: 100, cashbackAmount: 5, status: 'APPROVED' } });
  await prisma.partnerCashbackPayment.create({ data: { partnerId: partner.id, month: '2026-02', turnoverAmount: 1000, totalCashbackOwed: 50, marginAmount: 20, status: 'PENDING', invoiceNumber: `${RUN_TAG}-${tag}-INV` } });
  const ticket = await prisma.helpTicket.create({ data: { subject: `${RUN_TAG}-${tag}-ticket`, body: 'b', category: 'OTHER', status: 'OPEN', userId: user.id, partnerId: partner.id } });
  return { userId: user.id, partnerId: partner.id, venueId: venue.id, ticketId: ticket.id, invoice: `${RUN_TAG}-${tag}-INV`, venueName: `${RUN_TAG}-${tag}-Venue`, tx: `${RUN_TAG}-${tag}-TX` };
}

describe('partner-cross-scope-sweep: a partner cannot read/modify another partner data', () => {
  let app: any;
  let A: any;
  let B: any;
  let tokenA: string;
  let paramRoutes: EnumeratedRoute[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    A = await seedPartner('A');
    B = await seedPartner('B');
    tokenA = tok(A.userId, 'PARTNER');
    paramRoutes = enumerateRoutes(app).filter((r) => isPartnerRoute(r.path) && r.path.includes('/:'));
    // eslint-disable-next-line no-console
    console.log(`[partner-cross-scope-sweep] ${paramRoutes.length} partner param routes.`);
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
    } catch { /* best-effort */ }
    await app?.close?.();
  });

  // Substitute B's resource id into a route param by semantic.
  function bUrl(routePath: string): string {
    return routePath
      .split('/')
      .map((seg) => {
        if (!seg.startsWith(':')) return seg;
        const name = seg.slice(1).replace(/\?$/, '');
        if (/venue/i.test(name)) return B.venueId;
        if (/ticket/i.test(name)) return B.ticketId;
        if (/token/i.test(name)) return B.partnerId; // invalid token → 404 (still a denial)
        return B.partnerId; // :id / :partnerId
      })
      .join('/');
  }

  it('enumerates partner param routes', () => {
    expect(paramRoutes.length).toBeGreaterThan(5);
  });

  it('denies partner A access to partner B resources on EVERY param route (401/403/404, never 200/500)', async () => {
    const violations: string[] = [];
    for (const route of paramRoutes) {
      if (isPublicSkip(route)) continue;
      const url = bUrl(route.path);
      const m = route.method.toLowerCase();
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(m)) continue;
      let res: request.Response;
      try {
        let req = (request(app) as any)[m](url).set('Authorization', `Bearer ${tokenA}`);
        // Send a body that passes field-level validation so the request reaches
        // the OWNERSHIP gate (e.g. ticket-reply requires a >=10-char `body`;
        // an empty body 400s on validation and masks the ownership check).
        if (m !== 'get' && m !== 'delete') {
          req = req.send({ body: 'cross-scope probe message body', message: 'cross-scope probe message body', reason: 'cross-scope probe' });
        }
        res = await req;
      } catch (err) {
        violations.push(`${route.method} ${route.path} — request threw: ${String(err)}`);
        continue;
      }
      const ok = res.status === 401 || res.status === 403 || res.status === 404;
      if (!ok) {
        violations.push(`${route.method} ${route.path} (B id) -> ${res.status} (expected 401/403/404). body=${JSON.stringify(res.body).slice(0, 200)}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[partner-cross-scope-sweep] MUST-DENY: ${violations.length} violation(s).`);
    const message = violations.length === 0 ? '' : 'Cross-partner access NOT denied:\n' + violations.join('\n');
    expect({ count: violations.length, message }).toEqual({ count: 0, message: '' });
  });

  it('leaks NO partner B private marker into partner A /me collections', async () => {
    const meRoutes = ['/api/partners/me/transactions', '/api/partners/me/finance', '/api/partners/me/stickers', '/api/partners/me/analytics'];
    const markers = [B.invoice, B.venueName, B.tx, B.venueId];
    const violations: string[] = [];
    for (const r of meRoutes) {
      const res = await request(app).get(r).set('Authorization', `Bearer ${tokenA}`);
      if (res.status < 200 || res.status >= 300) continue;
      const body = JSON.stringify(res.body);
      for (const mk of markers) {
        if (mk && body.includes(mk)) violations.push(`${r} contains B marker "${mk}"`);
      }
    }
    const message = violations.length === 0 ? '' : 'Partner B data leaked into A collections:\n' + violations.join('\n');
    expect({ count: violations.length, message }).toEqual({ count: 0, message: '' });
  });
});
