/**
 * BC-QA-045 — GET /api/admin/subscribers/:userId/cashback must honour `?status=`.
 *
 * WHY THIS FILE EXISTS. `getSubscriberCashbackEntries` is reached by TWO routes
 * that are documented as mirrors of each other:
 *
 *   • GET /api/admin/cashback/subscriber/:userId      (cashback domain)
 *   • GET /api/admin/subscribers/:userId/cashback     (subscribers domain — the
 *     path the spec §4 "Абонати" navigation actually reaches)
 *
 * Neither read `?status=` before BC-QA-045: both returned the subscriber's full
 * unfiltered entry list while every row still carried its own derived `status`,
 * so a filtered admin view silently displayed every other state as well.
 *
 * Round 1 fixed both, but `bc-admin-spec-reaudit3-trialpending-label.test.ts`
 * only ever calls the CASHBACK-domain route, so the subscribers-domain half was
 * pinned by nothing: reverting it left every suite byte-identical and `tsc`
 * still exited 0 (the orphaned local and import do not trip it). This file
 * closes that gap.
 *
 * WHAT THE MIRROR-AGREEMENT CASE ACTUALLY ASSERTS. Silent divergence between the
 * two routes is the defect this task's scope extension existed to remove, so the
 * agreement is asserted directly. It compares, per state, the set of
 * `{ id, amount, status }` triples keyed by id, plus `total`. It does NOT compare
 * whole response bodies — `receipt.totalAmount` in particular is BGN on BOTH
 * routes and is deliberately out of scope here (tracked under the currency
 * programme as BC-QA-031-FOLLOWUP-3), so a full deep-equal would either fail or
 * have to be weakened misleadingly.
 *
 * This description is deliberately specific because the first version of this
 * file claimed the routes "AGREE" while comparing `map(e => e.id)` alone, and so
 * reported agreement across a live factor-of-EUR_TO_BGN_RATE divergence in
 * `amount` (BC-QA-045 task-r1 F1/S1). Row identity is not agreement.
 */

jest.mock('../../src/services/stripe.service', () => ({
  __esModule: true,
  stripeService: {
    stripe: { subscriptions: { cancel: jest.fn().mockResolvedValue({}) } },
  },
}));

jest.mock('../../src/services/notification.service', () => ({
  __esModule: true,
  notificationService: {
    notifySubscriptionCancelledInApp: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/lib/automationDispatcher', () => ({
  __esModule: true,
  fireAutomation: jest.fn().mockResolvedValue(undefined),
}));

import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { walletService } from '../../src/services/wallet.service';
import { bgnToEur } from '../../src/utils/currency';
import { genTestPhone } from '../helpers/test-utils';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'TestPass999!';

const userIds: string[] = [];
const transactionIds: string[] = [];

/** Admin + subscriber + wallet holding one TrialPending and one Pending entry. */
async function seedSubscriberWithTwoStates() {
  const suffix = uid();
  const hash = await bcrypt.hash(PASSWORD, 10);

  const admin = await prisma.user.create({
    data: {
      email: `bcqa045-mirror-admin-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Mirror',
      lastName: 'Admin',
      phone: genTestPhone(),
      // SUPER_ADMIN so the subscribers.read permission gate is satisfied without
      // seeding an explicit grant, matching how the sibling cashback-domain
      // suite authenticates.
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
  const subscriber = await prisma.user.create({
    data: {
      email: `bcqa045-mirror-sub-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Mirror',
      lastName: 'Subscriber',
      phone: genTestPhone(),
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
  userIds.push(admin.id, subscriber.id);

  const wallet = await walletService.getOrCreateWallet(subscriber.id);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const trialEntry = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'CASHBACK_CREDIT',
      amount: 5000,
      status: 'COMPLETED',
      balanceBefore: 10000,
      balanceAfter: 15000,
      cashbackStatus: 'TRIAL_PENDING',
      cashbackExpiresAt: tomorrow,
    },
  });
  const pendingEntry = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'CASHBACK_CREDIT',
      amount: 2000,
      status: 'COMPLETED',
      balanceBefore: 15000,
      balanceAfter: 17000,
      cashbackStatus: 'PENDING',
      cashbackExpiresAt: tomorrow,
    },
  });
  transactionIds.push(trialEntry.id, pendingEntry.id);

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: PASSWORD, clientType: 'web' });
  if (login.status !== 200) {
    throw new Error(`Login failed: ${login.status} - ${JSON.stringify(login.body)}`);
  }

  return { token: login.body.data.accessToken, subscriber, trialEntry, pendingEntry };
}

const MIRROR = (userId: string) => `/api/admin/subscribers/${userId}/cashback`;
const CASHBACK_DOMAIN = (userId: string) => `/api/admin/cashback/subscriber/${userId}`;

afterAll(async () => {
  if (transactionIds.length) {
    await prisma.walletTransaction.deleteMany({ where: { id: { in: transactionIds } } });
  }
  if (userIds.length) {
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

describe('BC-QA-045 — subscribers-domain cashback route honours ?status=', () => {
  it('status=TrialPending returns the TrialPending entry and NOT the Pending one', async () => {
    const { token, subscriber, trialEntry, pendingEntry } = await seedSubscriberWithTwoStates();

    const res = await request(app)
      .get(`${MIRROR(subscriber.id)}?status=TrialPending`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const entries = res.body.data || [];
    const returnedTrial = entries.find((e: any) => e.id === trialEntry.id);
    const returnedPending = entries.find((e: any) => e.id === pendingEntry.id);

    expect(returnedTrial).toBeDefined();
    expect(returnedTrial.status).toBe('TrialPending');
    // The whole point: without the filter this endpoint returned BOTH rows.
    expect(returnedPending).toBeUndefined();
  });

  it('status=Pending returns the Pending entry and NOT the TrialPending one', async () => {
    const { token, subscriber, trialEntry, pendingEntry } = await seedSubscriberWithTwoStates();

    const res = await request(app)
      .get(`${MIRROR(subscriber.id)}?status=Pending`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const entries = res.body.data || [];
    const returnedTrial = entries.find((e: any) => e.id === trialEntry.id);
    const returnedPending = entries.find((e: any) => e.id === pendingEntry.id);

    expect(returnedPending).toBeDefined();
    expect(returnedPending.status).toBe('Pending');
    expect(returnedTrial).toBeUndefined();
  });

  it('omitting ?status= still returns every state (filter is opt-in)', async () => {
    const { token, subscriber, trialEntry, pendingEntry } = await seedSubscriberWithTwoStates();

    const res = await request(app)
      .get(MIRROR(subscriber.id))
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((e: any) => e.id);
    expect(ids).toEqual(expect.arrayContaining([trialEntry.id, pendingEntry.id]));
  });

  it('an unrecognised ?status= value falls back to no filter rather than erroring', async () => {
    const { token, subscriber, trialEntry, pendingEntry } = await seedSubscriberWithTwoStates();

    const res = await request(app)
      .get(`${MIRROR(subscriber.id)}?status=NotARealState`)
      .set('Authorization', `Bearer ${token}`);

    // Matches the documented behaviour of the sibling route and of
    // GET /entries and /entries/export: unknown values are ignored, not 400'd.
    expect(res.status).toBe(200);
    const ids = (res.body.data || []).map((e: any) => e.id);
    expect(ids).toEqual(expect.arrayContaining([trialEntry.id, pendingEntry.id]));
  });

  it('agrees with its mirror GET /api/admin/cashback/subscriber/:userId on rows AND money', async () => {
    // Silent divergence between the two mirrored routes is the actual defect
    // BC-QA-045 repaired, so assert the agreement directly rather than only
    // asserting each route's filter in isolation.
    //
    // BC-QA-045 task-r1: this case originally compared `map(e => e.id).sort()`
    // and nothing else, and so reported "agreement" across a live factor-of-
    // EUR_TO_BGN_RATE divergence — the cashback-domain route converted `amount`
    // to EUR while the mirror shipped the raw stored BGN. Row identity alone is
    // not agreement; the money field is the one an admin actually reads. Compare
    // the money-bearing fields explicitly so that divergence cannot come back.
    const { token, subscriber } = await seedSubscriberWithTwoStates();

    for (const status of ['TrialPending', 'Pending']) {
      const [mirrorRes, cashbackRes] = await Promise.all([
        request(app).get(`${MIRROR(subscriber.id)}?status=${status}`).set('Authorization', `Bearer ${token}`),
        request(app).get(`${CASHBACK_DOMAIN(subscriber.id)}?status=${status}`).set('Authorization', `Bearer ${token}`),
      ]);

      expect(mirrorRes.status).toBe(200);
      expect(cashbackRes.status).toBe(200);

      // Compare id + the money field + the derived label, keyed by id so the
      // comparison is order-independent and a mismatch names the field.
      const moneyView = (body: any) =>
        (body.data || [])
          .map((e: any) => ({ id: e.id, amount: e.amount, status: e.status }))
          .sort((a: any, b: any) => a.id.localeCompare(b.id));

      const mirrorView = moneyView(mirrorRes.body);
      const cashbackView = moneyView(cashbackRes.body);

      expect(mirrorView).toEqual(cashbackView);
      // `total` is part of the same contract — a filtered count that disagrees
      // between mirrors is the same class of defect.
      expect(mirrorRes.body.total).toBe(cashbackRes.body.total);
      // Guard against the assertion passing because both returned nothing.
      expect(mirrorView.length).toBeGreaterThan(0);
    }
  });

  it('returns EUR, not raw BGN, for entry.amount (matching its mirror and INV-CURGAP-005)', async () => {
    // Pins the currency itself rather than only mirror-to-mirror equality, so
    // that converting BOTH routes back to raw BGN would still be caught here.
    // The seeded TrialPending row is stored at 5000 BGN.
    const { token, subscriber, trialEntry } = await seedSubscriberWithTwoStates();

    const res = await request(app)
      .get(`${MIRROR(subscriber.id)}?status=TrialPending`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = (res.body.data || []).find((e: any) => e.id === trialEntry.id);
    expect(row).toBeDefined();
    expect(row.amount).toBeCloseTo(bgnToEur(5000), 2);
    // And explicitly NOT the stored BGN magnitude.
    expect(row.amount).not.toBe(5000);
  });
});
