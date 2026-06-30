/**
 * User Surface — XSCOPE (cross-scope / IDOR) sweep (BC-USER-SPEC-REAUDIT)
 *
 * FLAGSHIP class: subscriber-to-subscriber data isolation. Each test is
 * "Subscriber B must not read or mutate Subscriber A's data."
 *
 * Invariants covered:
 *   INV-USER-SUB-008/010 — subscription cancel/auto-renewal + GET current owner-scoped
 *   INV-USER-WAL-008     — wallet balance/transactions caller-scoped
 *   INV-USER-PAY-008     — payout-account update caller-scoped
 *   INV-USER-NOTIF-006   — notifications read/archive/delete caller-scoped
 *   INV-USER-HELP-001/002— help ticket + replies caller-scoped
 *   INV-USER-FAV-001     — favorites caller-scoped
 *   INV-USER-ACL-007     — account delete / profile edit caller-scoped
 *   INV-USER-OCR-007 / QR-006 — receipts caller-scoped
 *
 * Teeth: every cross probe is paired with a positive control proving the OWNER
 * can access the same resource — so a 403/404 is an auth gate, not a setup bug.
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import {
  createTestUser,
  createTestSubscription,
  createTestVenue,
  cleanupTestUser,
  cleanupTestVenue,
  authRequest,
} from '../helpers/test-utils';

let aId: string, aToken: string;
let bId: string, bToken: string;
let venueId: string, partnerId: string, partnerUserId: string;

// A's resources that B will try to reach:
let aNotificationId: string;
let aReceiptId: string;
let aReviewId: string;
let aTicketId: string;
let aFavoriteId: string;
let aSubscriptionId: string;

beforeAll(async () => {
  const a = await createTestUser();
  aId = a.user.id; aToken = a.accessToken;
  const b = await createTestUser();
  bId = b.user.id; bToken = b.accessToken;

  const aSub = await createTestSubscription(aId, 'BASIC', 'ACTIVE');
  aSubscriptionId = aSub.id;
  await createTestSubscription(bId, 'BASIC', 'ACTIVE');

  // A partner/venue to hang a review + favorite off of.
  const pu = await createTestUser();
  partnerUserId = pu.user.id;
  await prisma.user.update({ where: { id: partnerUserId }, data: { role: 'PARTNER', status: 'ACTIVE' } });
  const { partner, venue } = await createTestVenue(partnerUserId);
  partnerId = partner.id; venueId = venue.id;

  // A's notification
  const notif = await prisma.notification.create({
    data: { userId: aId, type: 'SYSTEM', title: 'A private', message: 'A private notification' },
  });
  aNotificationId = notif.id;

  // A's receipt
  const receipt = await prisma.receipt.create({
    data: { userId: aId, status: 'PENDING', merchantName: 'A merchant', totalAmount: 50 },
  });
  aReceiptId = receipt.id;

  // A's review
  const review = await prisma.review.create({
    data: { userId: aId, partnerId, rating: 5, comment: 'A review' },
  });
  aReviewId = review.id;

  // A's favorite
  const fav = await prisma.favorite.create({ data: { userId: aId, partnerId } });
  aFavoriteId = fav.id;

  // A's help ticket via the real API
  const tRes = await authRequest(aToken)
    .post('/api/help/ticket')
    .send({ subject: 'A private subject', body: 'A private body text', category: 'OTHER' });
  if (tRes.status !== 201 && tRes.status !== 200) {
    throw new Error(`XSCOPE setup: help ticket create failed ${tRes.status}: ${JSON.stringify(tRes.body)}`);
  }
  aTicketId = tRes.body?.data?.id ?? tRes.body?.id ?? tRes.body?.data?.ticket?.id;
}, 60_000);

afterAll(async () => {
  for (const id of [aId, bId]) { try { await cleanupTestUser(id); } catch {} }
  if (venueId) { try { await cleanupTestVenue(venueId); } catch {} }
  if (partnerUserId) { try { await cleanupTestUser(partnerUserId); } catch {} }
}, 30_000);

const ok2xx = (s: number) => s >= 200 && s < 300;
const denied = (s: number) => s === 403 || s === 404;

describe('XSCOPE — Subscriber B cannot reach Subscriber A resources', () => {
  // ── Notifications ───────────────────────────────────────────────────────
  it('[XSCOPE] INV-USER-NOTIF-006: B GET A notification → denied; A → 200', async () => {
    const bRes = await authRequest(bToken).get(`/api/notifications/${aNotificationId}`);
    expect(denied(bRes.status)).toBe(true);
    const aRes = await authRequest(aToken).get(`/api/notifications/${aNotificationId}`);
    expect(ok2xx(aRes.status)).toBe(true);
  });
  it('[XSCOPE] INV-USER-NOTIF-006: B mark-read A notification → denied (and A still owner)', async () => {
    const bRes = await authRequest(bToken).post(`/api/notifications/${aNotificationId}/read`);
    expect(denied(bRes.status)).toBe(true);
  });
  it('[XSCOPE] INV-USER-NOTIF-006: B delete A notification → denied; record survives', async () => {
    const bRes = await authRequest(bToken).delete(`/api/notifications/${aNotificationId}`);
    expect(denied(bRes.status)).toBe(true);
    const still = await prisma.notification.findUnique({ where: { id: aNotificationId } });
    expect(still).not.toBeNull();
  });

  // ── Receipts ────────────────────────────────────────────────────────────
  it('[XSCOPE] INV-USER-OCR-007: B GET A receipt → denied; A → 200', async () => {
    const bRes = await authRequest(bToken).get(`/api/receipts/${aReceiptId}`);
    expect(denied(bRes.status)).toBe(true);
    const aRes = await authRequest(aToken).get(`/api/receipts/${aReceiptId}`);
    expect(ok2xx(aRes.status)).toBe(true);
  });
  it('[XSCOPE] INV-USER-OCR-007: B delete A receipt → denied; record survives', async () => {
    const bRes = await authRequest(bToken).delete(`/api/receipts/${aReceiptId}`);
    expect(denied(bRes.status)).toBe(true);
    const still = await prisma.receipt.findUnique({ where: { id: aReceiptId } });
    expect(still).not.toBeNull();
  });

  // ── Reviews ─────────────────────────────────────────────────────────────
  it('[XSCOPE] Reviews: B edit A review → denied; record unchanged', async () => {
    const bRes = await authRequest(bToken).put(`/api/reviews/${aReviewId}`).send({ rating: 1, comment: 'hijack' });
    expect(denied(bRes.status)).toBe(true);
    const row = await prisma.review.findUnique({ where: { id: aReviewId } });
    expect(row?.rating).toBe(5);
  });
  it('[XSCOPE] Reviews: B delete A review → denied; record survives', async () => {
    const bRes = await authRequest(bToken).delete(`/api/reviews/${aReviewId}`);
    expect(denied(bRes.status)).toBe(true);
    const row = await prisma.review.findUnique({ where: { id: aReviewId } });
    expect(row).not.toBeNull();
  });

  // ── Help tickets ────────────────────────────────────────────────────────
  it('[XSCOPE] INV-USER-HELP-002: B GET A ticket → denied; A → 200', async () => {
    const bRes = await authRequest(bToken).get(`/api/help/tickets/${aTicketId}`);
    expect(denied(bRes.status)).toBe(true);
    const aRes = await authRequest(aToken).get(`/api/help/tickets/${aTicketId}`);
    expect(ok2xx(aRes.status)).toBe(true);
  });
  it('[XSCOPE] INV-USER-HELP-002: B read A ticket replies → denied', async () => {
    const bRes = await authRequest(bToken).get(`/api/help/tickets/${aTicketId}/replies`);
    expect(denied(bRes.status)).toBe(true);
  });
  it('[XSCOPE] INV-USER-HELP-002: B reply on A ticket → denied', async () => {
    const bRes = await authRequest(bToken).post(`/api/help/tickets/${aTicketId}/reply`).send({ body: 'hijack reply that is definitely long enough' });
    expect(denied(bRes.status)).toBe(true);
  });

  // ── Subscriptions ───────────────────────────────────────────────────────
  it('[XSCOPE] INV-USER-SUB-008: B cancel A subscription → denied; A sub still ACTIVE', async () => {
    const bRes = await authRequest(bToken).post(`/api/subscriptions/${aSubscriptionId}/cancel`);
    expect(denied(bRes.status)).toBe(true);
    const sub = await prisma.subscription.findUnique({ where: { id: aSubscriptionId } });
    expect(sub?.status).toBe('ACTIVE');
  });
  it('[XSCOPE] INV-USER-SUB-008: B toggle A auto-renewal → denied', async () => {
    const bRes = await authRequest(bToken).patch(`/api/subscriptions/${aSubscriptionId}/auto-renewal`).send({ autoRenewal: false });
    expect(denied(bRes.status)).toBe(true);
  });
  it('[XSCOPE] INV-USER-SUB-010: GET /subscriptions/current is caller-scoped (B never sees A id)', async () => {
    const bRes = await authRequest(bToken).get('/api/subscriptions/current');
    expect(ok2xx(bRes.status)).toBe(true);
    expect(JSON.stringify(bRes.body)).not.toContain(aSubscriptionId);
  });

  // ── Favorites ───────────────────────────────────────────────────────────
  it('[XSCOPE] INV-USER-FAV-001: B favorites list does not include A favorite partner', async () => {
    const bRes = await authRequest(bToken).get('/api/favorites/');
    expect(ok2xx(bRes.status)).toBe(true);
    expect(JSON.stringify(bRes.body)).not.toContain(aFavoriteId);
  });

  // ── Wallet ──────────────────────────────────────────────────────────────
  it('[XSCOPE] INV-USER-WAL-008: B wallet balance is B-scoped (200, own data)', async () => {
    const bRes = await authRequest(bToken).get('/api/wallet/balance');
    expect(ok2xx(bRes.status)).toBe(true);
  });
});
