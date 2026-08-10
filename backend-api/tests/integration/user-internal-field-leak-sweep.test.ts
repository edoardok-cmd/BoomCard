/**
 * User Surface — internal-field / admin-identity leak sweep (BC-USER-SPEC-REAUDIT)
 *
 * Covers INV-USER-ACL-003 (spec §13.3):
 *   - voidedByUserId (responsible admin identity) must NEVER appear in GET
 *     /api/wallet/transactions.
 *   - voidedReason must be limited to a canonical VOID_REASON_CATEGORIES token
 *     (e.g. "FRAUD", "DUPLICATE") — never the full internal note.
 *
 * Covers INV-USER-PAY-007 / INV-USER-NOTIF-005:
 *   - WITHDRAWAL rows must not expose the internal escalation description text
 *     or metadata keys (escalatedSecondFailure/escalatedAt/internalNote), and
 *     an escalated row's raw RISK_HOLD status must be masked to PROCESSING.
 *
 * Covers INV-USER-QR-007 (spec §4.3/§11.3):
 *   - Card endpoints and the `syncCardTypeWithSubscription` early-return paths
 *     must never serialize the raw QR token (`qrCode`).
 *
 * Covers INV-USER-SUB-011:
 *   - Subscription mutation endpoints must not expose internal fields
 *     (payment-provider ids, metadata, retry/reminder bookkeeping, etc.).
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 *
 * NOTE — history: this sweep was extracted 2026-08-10 (BC-QA-031) from the
 * former `user-currency-leak-sweep.test.ts`, which also carried the
 * INV-USER-CUR-* dual-currency-display invariants (BGN→EUR transition window).
 * That currency machinery has been fully removed now that the transition
 * window has closed — only the internal-field / admin-identity invariants
 * (unrelated to currency) survive, in this renamed file.
 */

import { prisma } from '../../src/lib/prisma';
import { VOID_REASON_CATEGORIES } from '../../src/services/cashbackLifecycle.service';
import { cardService } from '../../src/services/card.service';
import {
  createTestUser,
  createTestSubscription,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';

let userId: string;
let token: string;

beforeAll(async () => {
  const u = await createTestUser();
  userId = u.user.id;
  token = u.accessToken;
  await createTestSubscription(userId, 'BASIC', 'ACTIVE');

  // Seed a wallet + a VOIDED transaction carrying admin identity — ACL-003
  // assertions rely on this.
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    create: { userId, balance: 1234, availableBalance: 1234, currency: 'BGN' },
    update: {},
  });
  await prisma.walletTransaction.createMany({
    data: [
      {
        walletId: wallet.id,
        type: 'CASHBACK_CREDIT' as any,
        amount: 1234,
        balanceBefore: 0,
        balanceAfter: 1234,
        currency: 'BGN',
        status: 'COMPLETED' as any,
        cashbackStatus: 'CLEARED' as any,
        description: 'seed-cleared',
      },
      // VOIDED row with admin identity — ACL-003 assertions rely on this.
      {
        walletId: wallet.id,
        type: 'CASHBACK_CREDIT' as any,
        amount: 10,
        balanceBefore: 1234,
        balanceAfter: 1234,
        currency: 'BGN',
        cashbackStatus: 'VOIDED' as any,
        voidedAt: new Date(),
        voidedReason: 'FRAUD: receipt was duplicated by the admin',
        voidedByUserId: userId, // FK-valid; only absence from API response matters for ACL test
        description: 'seed-voided',
      },
    ],
    skipDuplicates: true,
  });
}, 60_000);

afterAll(async () => {
  if (userId) { try { await cleanupTestUser(userId); } catch {} }
}, 30_000);

describe('INV-USER-ACL-003 — GET /api/wallet/transactions must not leak admin identity or internal void notes', () => {
  it('[ACL-003] voidedByUserId is absent from every transaction in the response', async () => {
    const res = await authRequest(token).get('/api/wallet/transactions');
    expect(res.status).toBe(200);
    const txns: any[] = res.body?.transactions ?? [];
    const leaks = txns
      .filter((tx: any) => 'voidedByUserId' in tx)
      .map((_: any, i: number) => `transactions[${i}].voidedByUserId present`);
    expect(leaks).toEqual([]);
  });

  it('[ACL-003] voidedReason on VOIDED rows is limited to a canonical category token', async () => {
    const res = await authRequest(token).get('/api/wallet/transactions');
    expect(res.status).toBe(200);
    const txns: any[] = res.body?.transactions ?? [];
    const voided = txns.filter((tx: any) => tx.cashbackStatus === 'VOIDED' && tx.voidedReason != null);
    expect(voided.length).toBeGreaterThan(0); // ensure the seeded VOIDED row is present
    const invalid = voided
      .filter((tx: any) => !(VOID_REASON_CATEGORIES as readonly string[]).includes(tx.voidedReason))
      .map((tx: any, i: number) => `voided[${i}].voidedReason = "${tx.voidedReason}" (not canonical)`);
    expect(invalid).toEqual([]);
  });
});

describe('INV-USER-PAY-007 / INV-USER-ACL-003 / INV-USER-NOTIF-005 — WITHDRAWAL escalation fields must not reach user', () => {
  /**
   * Seeds a WITHDRAWAL in RISK_HOLD status with the exact description and metadata
   * that executePayoutTransfer writes on a second-failure escalation (spec §3.7).
   * The row is cleaned up after the block — wallet/user cleanup in afterAll handles
   * any residual rows if the explicit delete fails.
   */
  let escalatedTxId: string | null = null;

  beforeAll(async () => {
    const wallet = await prisma.wallet.upsert({
      where: { userId },
      create: { userId, balance: 5000, availableBalance: 5000, currency: 'BGN' },
      update: {},
    });
    const tx = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'WITHDRAWAL' as any,
        status: 'RISK_HOLD' as any,
        amount: 5000,
        balanceBefore: 10000,
        balanceAfter: 5000,
        currency: 'BGN',
        description: 'Ескалирано за ръчен преглед след повторен неуспех: test-gateway-error',
        metadata: JSON.stringify({
          escalatedSecondFailure: true,
          escalatedAt: new Date().toISOString(),
          internalNote: 'admin note should not be visible',
        }),
      },
    });
    escalatedTxId = tx.id;
  }, 30_000);

  afterAll(async () => {
    if (escalatedTxId) {
      await prisma.walletTransaction.delete({ where: { id: escalatedTxId } }).catch(() => {});
      escalatedTxId = null;
    }
  }, 30_000);

  it('[PAY-007] WITHDRAWAL rows must not expose description containing escalation text, and escalated row status must be masked to PROCESSING', async () => {
    const res = await authRequest(token).get('/api/wallet/transactions');
    expect(res.status).toBe(200);
    const txns: any[] = res.body?.transactions ?? [];
    const withdrawals = txns.filter((tx: any) => tx.type === 'WITHDRAWAL');
    // The seeded escalated row must appear (sanity — confirms the seed landed)
    expect(withdrawals.length).toBeGreaterThan(0);
    const leaking = withdrawals.filter(
      (tx: any) =>
        tx.description != null &&
        typeof tx.description === 'string' &&
        tx.description.includes('Ескалирано'),
    );
    expect(
      leaking.length === 0
        ? 'no leaks'
        : `${leaking.length} WITHDRAWAL row(s) expose escalation description: ` +
            leaking.map((tx: any) => JSON.stringify(tx.description)).join(', '),
    ).toBe('no leaks');
    // Verify that maskUserFacingPayoutStatus correctly masks the RISK_HOLD
    // status of the seeded escalated row to PROCESSING (spec §3.7).
    // A regression in maskUserFacingPayoutStatus would leave the raw RISK_HOLD
    // status visible to the user, which this assertion catches.
    const escalatedTx = withdrawals.find((tx: any) => tx.id === escalatedTxId);
    expect(escalatedTx).toBeDefined();
    expect(escalatedTx?.status).toBe('PROCESSING');
  });

  it('[ACL-003/NOTIF-005] WITHDRAWAL rows must not expose metadata with escalation keys', async () => {
    const res = await authRequest(token).get('/api/wallet/transactions');
    expect(res.status).toBe(200);
    const txns: any[] = res.body?.transactions ?? [];
    const withdrawals = txns.filter((tx: any) => tx.type === 'WITHDRAWAL');
    expect(withdrawals.length).toBeGreaterThan(0);
    const leaking = withdrawals.filter((tx: any) => {
      if (tx.metadata == null) return false;
      let parsed: any;
      try {
        parsed = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata;
      } catch {
        // raw string metadata that isn't JSON also leaks if present
        return true;
      }
      return (
        parsed.escalatedSecondFailure !== undefined ||
        parsed.escalatedAt !== undefined ||
        parsed.internalNote !== undefined
      );
    });
    expect(
      leaking.length === 0
        ? 'no leaks'
        : `${leaking.length} WITHDRAWAL row(s) expose escalation metadata keys: ` +
            leaking.map((tx: any) => JSON.stringify(tx.metadata)).join(', '),
    ).toBe('no leaks');
  });
});

describe('INV-USER-QR-007 — card endpoints must not expose qrCode (raw QR token material)', () => {
  let qrUserId: string;
  let qrToken: string;
  let qrCardId: string;

  beforeAll(async () => {
    const u = await createTestUser();
    qrUserId = u.user.id;
    qrToken = u.accessToken;
    await createTestSubscription(qrUserId, 'BASIC', 'ACTIVE');
    // Seed a PREMIUM_WEEKLY card with explicit qrCode so every endpoint has data to
    // (not) serialize. PREMIUM_WEEKLY is the lowest tier and can be upgraded to BASIC
    // by the upgrade test without needing a higher subscription.
    const card = await prisma.card.create({
      data: {
        userId: qrUserId,
        cardNumber: `BOOM-SWPQ-${qrUserId.slice(0, 8).toUpperCase()}`,
        type: 'PREMIUM_WEEKLY',
        status: 'ACTIVE',
        qrCode: 'data:image/png;base64,INTERNAL_QR_TOKEN_MATERIAL',
      },
    });
    qrCardId = card.id;
  }, 60_000);

  afterAll(async () => {
    if (qrUserId) { try { await cleanupTestUser(qrUserId); } catch {} }
  }, 30_000);

  it('[QR-007] GET /api/cards/my-card response must not contain qrCode anywhere in the body', async () => {
    const res = await authRequest(qrToken).get('/api/cards/my-card');
    expect(res.status).toBe(200);
    // qrCode must be absent at the top level and in any nested object.
    expect(JSON.stringify(res.body)).not.toMatch(/qrCode/);
  });

  it('[QR-007] POST /api/cards/:id/deactivate response must not contain qrCode', async () => {
    const res = await authRequest(qrToken).post(`/api/cards/${qrCardId}/deactivate`).send({});
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/qrCode/);
  });

  it('[QR-007] POST /api/cards/:id/activate response must not contain qrCode', async () => {
    // Card was suspended by the deactivate test above; re-activate it.
    const res = await authRequest(qrToken).post(`/api/cards/${qrCardId}/activate`).send({});
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/qrCode/);
  });

  it('[QR-007] POST /api/cards/:id/upgrade response must not contain qrCode', async () => {
    // Upgrade PREMIUM_WEEKLY → BASIC. User has an active BASIC subscription which satisfies
    // the service-layer subscription gate for the BASIC tier.
    const res = await authRequest(qrToken).post(`/api/cards/${qrCardId}/upgrade`).send({ newTier: 'BASIC' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/qrCode/);
  });

  it('[QR-007] POST /api/cards (create) response must not contain qrCode', async () => {
    // Registration auto-creates a card; delete it first so POST /api/cards has a cardless user.
    const fresh = await createTestUser();
    try {
      await prisma.card.deleteMany({ where: { userId: fresh.user.id } });
      const res = await authRequest(fresh.accessToken).post('/api/cards').send({});
      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toMatch(/qrCode/);
    } finally {
      await cleanupTestUser(fresh.user.id).catch(() => {});
    }
  });
});

describe('INV-USER-QR-007 (syncCardTypeWithSubscription) — early-return paths must not expose qrCode', () => {
  /**
   * syncCardTypeWithSubscription has two early-return paths that return the card fetched
   * by findFirst before reaching the prisma.card.update select-guarded path:
   *   1. tier-unchanged (no-op): targetIndex === currentIndex → return card
   *   2. downgrade-blocked: targetIndex < currentIndex && targetType !== PREMIUM_WEEKLY → return card
   *
   * Both paths must return the CARD_USER_FIELDS shape (no qrCode) because the findFirst
   * now carries select: CARD_USER_FIELDS. These tests pin that contract.
   */
  let syncUserId: string;
  let syncCardId: string;

  beforeAll(async () => {
    const u = await createTestUser();
    syncUserId = u.user.id;
    await createTestSubscription(syncUserId, 'BASIC', 'ACTIVE');
    // Seed a BASIC card (mid-tier) so we can trigger both early-return paths:
    //   - no-op: sync with plan=BASIC (tier unchanged)
    //   - downgrade-blocked: sync with plan=PREMIUM_WEEKLY while card is BASIC
    const card = await prisma.card.create({
      data: {
        userId: syncUserId,
        cardNumber: `BOOM-SYNC-${syncUserId.slice(0, 8).toUpperCase()}`,
        type: 'BASIC',
        status: 'ACTIVE',
        qrCode: 'data:image/png;base64,INTERNAL_QR_SECRET_FOR_SYNC_TEST',
      },
    });
    syncCardId = card.id;
  }, 60_000);

  afterAll(async () => {
    if (syncUserId) { try { await cleanupTestUser(syncUserId); } catch {} }
  }, 30_000);

  it('[QR-007/sync no-op] tier-unchanged early return must not contain qrCode', async () => {
    // plan=BASIC matches card.type=BASIC → no-op early return path
    const result = await cardService.syncCardTypeWithSubscription(syncUserId, 'BASIC');
    expect(result).not.toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/qrCode/);
    expect((result as any)?.qrCode).toBeUndefined();
  });

  it('[QR-007/sync downgrade-blocked] mid-tier downgrade-blocked early return must not contain qrCode', async () => {
    // plan=PREMIUM_WEEKLY < card.type=BASIC, but target is not PREMIUM_WEEKLY ... wait:
    // PREMIUM_WEEKLY IS allowed as downgrade target (subscription expired). Use BASIC card
    // and try to sync to PREMIUM_WEEKLY to hit that path — actually that proceeds to update.
    // To hit the blocked path: card=BASIC, plan=PREMIUM_WEEKLY triggers allowed downgrade (update).
    // The blocked path requires: targetIndex < currentIndex AND targetType !== PREMIUM_WEEKLY.
    // First upgrade the card to PREMIUM, then try syncing back to BASIC.
    await prisma.card.update({ where: { id: syncCardId }, data: { type: 'PREMIUM' } });
    // plan=BASIC < card.type=PREMIUM AND BASIC !== PREMIUM_WEEKLY → downgrade-blocked early return
    const result = await cardService.syncCardTypeWithSubscription(syncUserId, 'BASIC');
    expect(result).not.toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/qrCode/);
    expect((result as any)?.qrCode).toBeUndefined();
    // Restore card to BASIC for afterAll cleanup consistency
    await prisma.card.update({ where: { id: syncCardId }, data: { type: 'BASIC' } });
  });
});

describe('INV-USER-SUB-011 — subscription mutation endpoints must not expose internal fields', () => {
  const INTERNAL_SUB_FIELDS = [
    'stripeSubscriptionId', 'stripeCustomerId', 'stripePriceId',
    'payseraOrderId', 'metadata',
    'retryAttempt', 'trialRefundEligibleUntil', 'trialRefundUsed',
    'lastRenewalReminderSentAt', 'renewalRemindersSent',
    'failedPaymentAt', 'failedPaymentClearedAt',
    'userId', 'planId',
    'user', 'planDetails',
  ];

  function assertNoInternalFields(body: any, label: string): void {
    const bodyStr = JSON.stringify(body);
    const leaking = INTERNAL_SUB_FIELDS.filter(f => {
      // Check for key presence in the serialized response using a regex that
      // matches the JSON key (e.g. "userId":) to avoid matching on value strings.
      return new RegExp(`"${f}"\\s*:`).test(bodyStr);
    });
    expect(
      leaking.length === 0
        ? 'no leaks'
        : `${label}: internal field(s) present in response: ${leaking.join(', ')}`,
    ).toBe('no leaks');
  }

  let subUserId: string;
  let subToken: string;
  let subId: string;
  let refundSubId: string;

  beforeAll(async () => {
    const u = await createTestUser();
    subUserId = u.user.id;
    subToken = u.accessToken;

    // createTestUser auto-registers, which auto-creates a card — no manual card creation needed.

    // Create a Paysera-type PREMIUM_WEEKLY subscription (no stripeSubscriptionId)
    // so update-plan (PREMIUM_WEEKLY → BASIC) is the DB-only path with no wallet credit.
    const plan = await prisma.plan.findFirst({ where: { planCode: 'PREMIUM_WEEKLY' } });
    const sub = await prisma.subscription.create({
      data: {
        userId: subUserId,
        plan: 'PREMIUM_WEEKLY',
        planId: plan?.id,
        payseraOrderId: `TEST-SUB011-${subUserId.slice(0, 8)}`,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        autoRenewal: true,
      },
    });
    subId = sub.id;

    // Create a second subscription used exclusively by the trial-refund test.
    // Needs trialRefundEligibleUntil in the future and trialRefundUsed=false.
    const refundPlan = await prisma.plan.findFirst({ where: { planCode: 'PREMIUM_WEEKLY' } });
    const refundSub = await prisma.subscription.create({
      data: {
        userId: subUserId,
        plan: 'PREMIUM_WEEKLY',
        planId: refundPlan?.id,
        payseraOrderId: `TEST-REFUND-${subUserId.slice(0, 8)}`,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        autoRenewal: true,
        trialRefundEligibleUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        trialRefundUsed: false,
      },
    });
    refundSubId = refundSub.id;
  }, 30_000);

  afterAll(async () => {
    if (subUserId) { try { await cleanupTestUser(subUserId); } catch {} }
  }, 30_000);

  it('[SUB-011] PATCH /:id/auto-renewal must not expose internal fields', async () => {
    const res = await authRequest(subToken).patch(`/api/subscriptions/${subId}/auto-renewal`).send({ autoRenewal: false });
    expect(res.status).toBe(200);
    assertNoInternalFields(res.body, 'PATCH auto-renewal');
    // Restore auto-renewal state for subsequent tests
    await authRequest(subToken).patch(`/api/subscriptions/${subId}/auto-renewal`).send({ autoRenewal: true });
  });

  it('[SUB-011] POST /:id/trial-refund must not expose internal fields', async () => {
    const res = await authRequest(subToken).post(`/api/subscriptions/${refundSubId}/trial-refund`).send({});
    expect(res.status).toBe(200);
    assertNoInternalFields(res.body, 'POST trial-refund');
  });

  it('[SUB-011] POST /:id/cancel must not expose internal fields', async () => {
    const res = await authRequest(subToken).post(`/api/subscriptions/${subId}/cancel`).send({ cancelAtPeriodEnd: true });
    expect(res.status).toBe(200);
    assertNoInternalFields(res.body, 'POST cancel');
  });

  it('[SUB-011] POST /:id/reactivate must not expose internal fields', async () => {
    // Sub was scheduled for cancellation in prior test (cancelAtPeriodEnd=true, still ACTIVE);
    // reactivate removes the cancellation schedule.
    const res = await authRequest(subToken).post(`/api/subscriptions/${subId}/reactivate`).send({});
    expect(res.status).toBe(200);
    assertNoInternalFields(res.body, 'POST reactivate');
  });

  it('[SUB-011] POST /:id/update-plan must not expose internal fields', async () => {
    // PREMIUM_WEEKLY → BASIC: Paysera DB-only path.
    // applyUpgradeCredit returns early (no creditPct for PREMIUM_WEEKLY→BASIC),
    // so no wallet dependency.
    const res = await authRequest(subToken).post(`/api/subscriptions/${subId}/update-plan`).send({ plan: 'BASIC' });
    expect(res.status).toBe(200);
    assertNoInternalFields(res.body, 'POST update-plan');
  });

  // NOTE: POST /:id/retry-payment is Stripe-only (requires stripeSubscriptionId + PAST_DUE status
  // + open Stripe invoice). Covered by the toSubUserView projection in the route layer; a
  // Stripe-mock integration test for this path is out of scope for this suite.
});
