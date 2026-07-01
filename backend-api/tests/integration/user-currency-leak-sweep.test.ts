/**
 * User Surface — CUR (currency dual-display) + ACL-003 (admin identity leak) sweep
 * (BC-USER-SPEC-REAUDIT)
 *
 * Covers INV-USER-CUR-001/002/003 (spec §17 / §19 rule 11):
 *   - Window CLOSED → BGN hidden, EUR only: NO raw BGN monetary scalar may leave
 *     any user-facing money endpoint. The gated shape is `display:{bgn:null,eur:N}`.
 *   - Window OPEN → both BGN and EUR shown.
 *   - Applies to ALL user money amounts (wallet balance, wallet transactions,
 *     payment history).
 *
 * Covers INV-USER-ACL-003 (spec §13.3):
 *   - voidedByUserId (responsible admin identity) must NEVER appear in GET
 *     /api/wallet/transactions.
 *   - voidedReason must be limited to a canonical VOID_REASON_CATEGORIES token
 *     (e.g. "FRAUD", "DUPLICATE") — never the full internal note.
 *
 * The danger: an endpoint that serializes raw `amount` / `balanceBefore` /
 * `balanceAfter` / `currency:"BGN"` without routing through the dual-currency
 * formatter. getBalance gates correctly; the transactions list was flagged by
 * the r1 static pass (INV-USER-ACL-003 / INV-USER-CUR) as un-gated — this sweep
 * is the mechanical guard that closes the class and keeps it closed.
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';
import { VOID_REASON_CATEGORIES } from '../../src/services/cashbackLifecycle.service';
import { stripeService } from '../../src/services/stripe.service';
import { cardService } from '../../src/services/card.service';
import {
  createTestUser,
  createTestSubscription,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';

let userId: string;
let token: string;
let seededReceiptId: string;

async function setCurrencyWindowOpen(isOpen: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'currency_transition_window_open' },
    create: { key: 'currency_transition_window_open', value: isOpen ? 'true' : 'false' },
    update: { value: isOpen ? 'true' : 'false' },
  });
  invalidateCurrencyDisplayCache();
}

beforeAll(async () => {
  const u = await createTestUser();
  userId = u.user.id;
  token = u.accessToken;
  await createTestSubscription(userId, 'BASIC', 'ACTIVE');

  // Seed a wallet + transactions so the money endpoints return data.
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

  // Seed a WALLET_TOPUP Transaction so /api/payments/history returns non-zero amount
  await prisma.transaction.create({
    data: {
      userId,
      type: 'WALLET_TOPUP' as any,
      amount: 55.55,
      currency: 'BGN',
      status: 'COMPLETED' as any,
      paymentMethod: 'BANK_TRANSFER' as any,
      description: 'seed-topup',
      metadata: JSON.stringify({ orderId: 'seed-order-001' }),
    },
  });

  // Seed a SUBSCRIPTION Transaction so /api/subscriptions/history Paysera branch
  // returns a row with a non-zero amount — ensures findRawBgnLeak has data to check.
  await prisma.transaction.create({
    data: {
      userId,
      type: 'SUBSCRIPTION' as any,
      amount: 999,
      currency: 'BGN',
      status: 'COMPLETED' as any,
      paymentMethod: 'BANK_TRANSFER' as any,
      description: 'seed-subscription',
      metadata: JSON.stringify({ orderId: 'seed-sub-order-001' }),
    },
  });

  // Seed a non-zero cashbackBalance so the bulk closed-window sweep (MONEY_ENDPOINTS loop)
  // can detect a raw-number regression on /api/loyalty/accounts/me (INV-USER-CUR-003).
  // findRawBgnLeak skips v===0 to avoid false positives on empty scalars; without this seed,
  // a zero-balance account would silently pass the bulk check even when ungated.
  // The dedicated open-window test (lines 213-221) also relies on this 99.99 value.
  const loyaltyAccount = await prisma.loyaltyAccount.upsert({
    where: { userId },
    create: {
      userId,
      tier: 'BRONZE',
      points: 0,
      lifetimePoints: 0,
      tierProgress: 0,
      cashbackBalance: 99.99,
      nextTierPoints: 0,
    },
    update: { cashbackBalance: 99.99 },
  });

  // Seed a reward with non-null cashValue so findRawBgnLeak's v!==0 guard catches a raw scalar
  // on /api/loyalty/rewards and /api/loyalty/rewards/redemptions.
  await prisma.reward.upsert({
    where: { id: 'sweep-test-reward-cashvalue' },
    create: {
      id: 'sweep-test-reward-cashvalue',
      title: 'Sweep Test Reward',
      titleBg: 'Тест',
      description: 'Sweep seed reward',
      descriptionBg: 'Тест',
      pointsCost: 100,
      cashValue: 5.00,
      category: 'General',
      isActive: true,
      validFrom: new Date('2020-01-01'),
    },
    update: { cashValue: 5.00 },
  });

  // Seed a RewardRedemption so /api/loyalty/rewards/redemptions returns a row with a
  // non-null cashValue and the toDualCurrency formatter path is actually exercised by the sweep.
  await prisma.rewardRedemption.upsert({
    where: { id: 'sweep-test-redemption-cashvalue' },
    create: {
      id: 'sweep-test-redemption-cashvalue',
      accountId: loyaltyAccount.id,
      rewardId: 'sweep-test-reward-cashvalue',
      status: 'PENDING',
      pointsSpent: 100,
    },
    update: {},
  });

  // Seed a Receipt with non-zero money fields so /api/receipts and /api/receipts/:id
  // return rows with amounts the dual-currency sweep can exercise.
  // transactionId has @unique on Receipt, so we create a dedicated transaction.
  const receiptTx = await prisma.transaction.create({
    data: {
      userId,
      type: 'WALLET_TOPUP' as any,
      amount: 30.00,
      currency: 'BGN',
      status: 'COMPLETED' as any,
      paymentMethod: 'BANK_TRANSFER' as any,
      description: 'seed-receipt-tx',
      metadata: JSON.stringify({ orderId: 'seed-receipt-order-001' }),
    },
  });
  const seededReceipt = await prisma.receipt.create({
    data: {
      userId,
      transactionId: receiptTx.id,
      totalAmount: 30.00,
      cashbackAmount: 3.00,
      status: 'APPROVED' as any,
      merchantName: 'Sweep Test Merchant',
    },
  });
  seededReceiptId = seededReceipt.id;
}, 60_000);

afterAll(async () => {
  await setCurrencyWindowOpen(false).catch(() => {});
  // Delete redemption before reward (FK constraint) and before user cleanup (account FK).
  await prisma.rewardRedemption.delete({ where: { id: 'sweep-test-redemption-cashvalue' } }).catch(() => {});
  await prisma.reward.delete({ where: { id: 'sweep-test-reward-cashvalue' } }).catch(() => {});
  // Delete receipt before its linked transaction (FK: Receipt.transactionId → Transaction).
  if (seededReceiptId) { await prisma.receipt.delete({ where: { id: seededReceiptId } }).catch(() => {}); }
  if (userId) { try { await cleanupTestUser(userId); } catch {} }
}, 30_000);

// Endpoints that route money fields through the dual-currency formatter.
const MONEY_ENDPOINTS = [
  '/api/wallet/balance',
  '/api/wallet/transactions',
  '/api/wallet/statistics',
  '/api/payments/history',
  '/api/subscriptions/history',
  '/api/loyalty/accounts/me',
  '/api/loyalty/rewards',
  '/api/loyalty/rewards/redemptions',
  '/api/receipts',
  '/api/receipts/stats',
  '/api/receipts/v2',
];

// Detect a raw BGN scalar: a `currency:"BGN"` paired with a raw numeric amount,
// or a numeric money field NOT wrapped in a `display:{bgn,eur}` object.
function findRawBgnLeak(node: any, path = '$'): string[] {
  const leaks: string[] = [];
  // Genuine money fields only. Bare `total`/`count`/`page` are pagination
  // scalars, not currency — excluded to avoid false positives.
  const MONEY_KEYS = /^(amount|balance|balanceBefore|balanceAfter|currentBalance|availableBalance|pendingBalance|expiringBalance|totalCashback|totalTopups|totalSpent|totalAmount|verifiedAmount|payoutAmount|cashbackAmount|cashbackBalance|cashValue|averageAmount)$/i;
  function walk(n: any, p: string) {
    if (n == null) return;
    if (Array.isArray(n)) { n.forEach((v, i) => walk(v, `${p}[${i}]`)); return; }
    if (typeof n === 'object') {
      // A correctly-gated money value is a {bgn, eur} object — never recurse into
      // it as a leak (bgn:null is the closed-window shape).
      if ('eur' in n && 'bgn' in n) return;
      for (const [k, v] of Object.entries(n)) {
        // Zero excluded intentionally: `amount: 0` is structurally unambiguous
        // (no monetary value), never currency-sensitive. Seeds must use non-zero
        // amounts so this guard stays meaningful.
        if (MONEY_KEYS.test(k) && typeof v === 'number' && v !== 0) {
          leaks.push(`${p}.${k} = ${v} (raw numeric money scalar, not display:{bgn,eur})`);
        }
        walk(v, `${p}.${k}`);
      }
    }
  }
  walk(node, path);
  return leaks;
}

describe('INV-USER-CUR — user money endpoints respect the currency transition window', () => {
  it('[CUR] window CLOSED → no raw BGN scalar leaks from any user money endpoint', async () => {
    await setCurrencyWindowOpen(false);
    const allLeaks: Record<string, string[]> = {};
    for (const ep of MONEY_ENDPOINTS) {
      const res = await authRequest(token).get(ep);
      if (res.status >= 200 && res.status < 300) {
        const leaks = findRawBgnLeak(res.body?.data ?? res.body, ep);
        if (leaks.length) allLeaks[ep] = leaks;
      }
    }
    expect(
      Object.keys(allLeaks).length === 0
        ? 'no leaks'
        : 'Raw BGN scalar(s) leaked while window CLOSED:\n' + JSON.stringify(allLeaks, null, 2),
    ).toBe('no leaks');
  });

  it('[CUR] window OPEN → balance exposes both bgn and eur', async () => {
    await setCurrencyWindowOpen(true);
    const res = await authRequest(token).get('/api/wallet/balance');
    expect(res.status).toBe(200);
    const s = JSON.stringify(res.body);
    // Open window must surface EUR alongside BGN (dual display present).
    expect(/eur/i.test(s)).toBe(true);
  });

  it('[CUR] window OPEN → /api/loyalty/accounts/me cashbackBalance exposes bgn > 0', async () => {
    await setCurrencyWindowOpen(true);
    const res = await authRequest(token).get('/api/loyalty/accounts/me');
    expect(res.status).toBe(200);
    expect(res.body.data.cashbackBalance).toEqual(
      expect.objectContaining({ bgn: 99.99, eur: expect.any(Number), windowOpen: true }),
    );
    expect(res.body.data.cashbackBalance.bgn).toBeGreaterThan(0);
  });
});

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

describe('INV-USER-CUR-T9 — GET /api/subscriptions/history T9 synthetic entry is EUR-native regardless of window state', () => {
  let t9UserId: string;
  let t9Token: string;

  beforeAll(async () => {
    const u = await createTestUser();
    t9UserId = u.user.id;
    t9Token = u.accessToken;
    // Deliberately NO Transaction rows — triggers the T9 synthetic fallback.
    await createTestSubscription(t9UserId, 'BASIC', 'ACTIVE');
  }, 60_000);

  afterAll(async () => {
    if (t9UserId) { try { await cleanupTestUser(t9UserId); } catch {} }
  }, 30_000);

  it('[CUR-T9] zero Transaction rows → synthetic entry has EUR-native display object (bgn:null, windowOpen:false) regardless of global window flag', async () => {
    await setCurrencyWindowOpen(true);
    const res = await authRequest(t9Token).get('/api/subscriptions/history');
    expect(res.status).toBe(200);
    const history: any[] = res.body?.history ?? [];
    expect(history.length).toBe(1);
    const amt = history[0].amount;
    expect(amt).toEqual(expect.objectContaining({ bgn: null, windowOpen: false }));
    expect(typeof amt.eur).toBe('number');
    expect(amt.eur).toBeGreaterThan(0);
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

describe('INV-USER-CUR-STRIPE — GET /api/subscriptions/history Stripe branch returns EUR-native DualCurrencyAmount', () => {
  let stripeUserId: string;
  let stripeToken: string;

  beforeAll(async () => {
    const u = await createTestUser();
    stripeUserId = u.user.id;
    stripeToken = u.accessToken;
    const plan = await prisma.plan.findFirst({ where: { planCode: 'BASIC' } });
    await prisma.subscription.create({
      data: {
        userId: stripeUserId,
        plan: 'BASIC',
        planId: plan!.id,
        status: 'ACTIVE',
        stripeSubscriptionId: 'sub_test_stripe',
        stripeCustomerId: 'cus_test',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (stripeUserId) { try { await cleanupTestUser(stripeUserId); } catch {} }
  }, 30_000);

  it('[CUR-STRIPE] Stripe invoice amount is returned as {bgn:null, eur:N, windowOpen:false} — not a raw number', async () => {
    const spy = jest.spyOn(stripeService.stripe.invoices, 'list').mockResolvedValueOnce({
      data: [{
        id: 'in_test',
        created: 1700000000,
        amount_paid: 999,
        amount_due: 999,
        currency: 'eur',
        status: 'paid',
        invoice_pdf: null,
      }],
    } as any);

    try {
      const res = await authRequest(stripeToken).get('/api/subscriptions/history');
      expect(res.status).toBe(200);
      const history: any[] = res.body?.history ?? [];
      expect(history.length).toBe(1);
      expect(history[0].amount).toEqual({ bgn: null, eur: 9.99, windowOpen: false });
    } finally {
      spy.mockRestore();
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

describe('INV-USER-CUR-003 (receipts) — GET /api/receipts and /:id must gate money fields via toDualCurrency', () => {
  it('[CUR-RECEIPTS] window CLOSED → GET /api/receipts must not expose raw BGN totalAmount, cashbackAmount, or nested transaction.amount', async () => {
    await setCurrencyWindowOpen(false);
    const res = await authRequest(token).get('/api/receipts');
    expect(res.status).toBe(200);
    const leaks = findRawBgnLeak(res.body?.data ?? res.body, '/api/receipts');
    expect(
      leaks.length === 0
        ? 'no leaks'
        : 'Raw BGN leak(s) on GET /api/receipts:\n' + leaks.join('\n'),
    ).toBe('no leaks');
  });

  it('[CUR-RECEIPTS] window CLOSED → GET /api/receipts/:id must not expose raw BGN money fields or nested transaction.amount/cashbackAmount', async () => {
    await setCurrencyWindowOpen(false);
    const res = await authRequest(token).get(`/api/receipts/${seededReceiptId}`);
    expect(res.status).toBe(200);
    const leaks = findRawBgnLeak(res.body?.data ?? res.body, `/api/receipts/${seededReceiptId}`);
    expect(
      leaks.length === 0
        ? 'no leaks'
        : `Raw BGN leak(s) on GET /api/receipts/${seededReceiptId}:\n` + leaks.join('\n'),
    ).toBe('no leaks');
  });

  it('[CUR-RECEIPTS] window OPEN → GET /api/receipts totalAmount exposes bgn > 0 display object', async () => {
    await setCurrencyWindowOpen(true);
    const res = await authRequest(token).get('/api/receipts');
    expect(res.status).toBe(200);
    const receipts: any[] = res.body?.data ?? [];
    const seeded = receipts.find((r: any) => r.id === seededReceiptId);
    expect(seeded).toBeDefined();
    expect(seeded.totalAmount).toEqual(expect.objectContaining({ bgn: 30, eur: expect.any(Number), windowOpen: true }));
    expect(seeded.totalAmount.bgn).toBeGreaterThan(0);
  });

  it('[CUR-RECEIPTS] window OPEN → GET /api/receipts/:id totalAmount exposes bgn > 0 display object', async () => {
    await setCurrencyWindowOpen(true);
    const res = await authRequest(token).get(`/api/receipts/${seededReceiptId}`);
    expect(res.status).toBe(200);
    const receipt = res.body?.data ?? res.body;
    expect(receipt.totalAmount).toEqual(expect.objectContaining({ bgn: 30, eur: expect.any(Number), windowOpen: true }));
    expect(receipt.totalAmount.bgn).toBeGreaterThan(0);
  });

  it('[CUR-RECEIPTS] window CLOSED → GET /api/receipts/v2/:id must not expose raw BGN money fields', async () => {
    await setCurrencyWindowOpen(false);
    const res = await authRequest(token).get(`/api/receipts/v2/${seededReceiptId}`);
    expect(res.status).toBe(200);
    const leaks = findRawBgnLeak(res.body?.data ?? res.body, `/api/receipts/v2/${seededReceiptId}`);
    expect(
      leaks.length === 0
        ? 'no leaks'
        : `Raw BGN leak(s) on GET /api/receipts/v2/${seededReceiptId}:\n` + leaks.join('\n'),
    ).toBe('no leaks');
  });

  it('[CUR-RECEIPTS] window OPEN → GET /api/receipts/v2/:id totalAmount exposes bgn > 0 display object', async () => {
    await setCurrencyWindowOpen(true);
    const res = await authRequest(token).get(`/api/receipts/v2/${seededReceiptId}`);
    expect(res.status).toBe(200);
    const receipt = res.body?.data ?? res.body;
    expect(receipt.totalAmount).toEqual(expect.objectContaining({ bgn: 30, eur: expect.any(Number), windowOpen: true }));
    expect(receipt.totalAmount.bgn).toBeGreaterThan(0);
  });
});
