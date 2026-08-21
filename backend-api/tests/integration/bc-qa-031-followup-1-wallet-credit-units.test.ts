/**
 * BC-QA-031-FOLLOWUP-1 impl-r1 F1 — a top-up must credit the wallet in the
 * wallet's own unit.
 *
 * THE DEFECT
 * ----------
 * `Wallet.balance`, `Wallet.availableBalance` and `WalletTransaction.amount`
 * are BGN-denominated (`Wallet.currency @default("BGN")`), and every read of
 * them applies `bgnToEur` (`wallet.service.ts:201`). But
 * `createPaymentSchema` DEFAULTS the payment currency to EUR
 * (`payments.paysera.routes.ts:109`), so the ordinary top-up produces a
 * EUR-priced `Transaction` — and the success callback used to hand
 * `transaction.amount` straight to `walletService.credit()`, which does
 * `balance: { increment: amount }`.
 *
 * Measured end-to-end by the round-1 reviewer: a 100.00 EUR top-up moved the
 * balance by 100 stored BGN, and the wallet screen then reported EUR 51.13 —
 * the user lost ~49% of what they paid. The Stripe TOP_UP and REFUND paths had
 * the identical mismatch.
 *
 * WHAT THIS FILE PINS
 * -------------------
 * Not "a row was written" — the WALLET DELTA and the USER-VISIBLE BALANCE:
 *
 *   - a 100.00 EUR top-up increments the stored BGN balance by
 *     `eurToBgn(100) = 195.58`, and `GET /api/wallet/balance` reports EUR 100.00 back;
 *   - a 100.00 BGN top-up still increments by exactly 100 (no double
 *     conversion), and reports EUR 51.13 — the honest EUR value of 100 BGN;
 *   - the `WalletTransaction` audit row records the same converted figure, so
 *     a later reversal (which reads that stored amount) stays symmetric.
 *
 * The reviewer's point about reachability holds: this task's own
 * `bc-qa-031-followup-1-write-rejection.test.ts:106` proves a EUR row is
 * created through the live route, and `currency` is optional on the request so
 * the EUR default is the DEFAULT path, not an edge case.
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser, authRequest } from '../helpers/test-utils';
import { createSignedCallback } from '../helpers/payseraTestHelper';
import { bgnToEur, eurToBgn } from '../../src/utils/currency';

/** Drive a full create → signed-success-callback top-up and return the deltas. */
async function topUp(params: {
  authToken: string;
  userId: string;
  amount: number;
  currency?: string;
}) {
  const walletBefore = await prisma.wallet.findUnique({ where: { userId: params.userId } });
  const balanceBefore = walletBefore?.balance ?? 0;

  const created = await authRequest(params.authToken)
    .post('/api/payments/create')
    .send({
      amount: params.amount,
      ...(params.currency ? { currency: params.currency } : {}),
      description: 'BC-QA-031-FOLLOWUP-1 wallet-unit probe',
    });
  expect(created.status).toBe(201);

  const orderId: string = created.body.data.orderId;
  const signed = createSignedCallback({
    orderId,
    amount: String(Math.round(params.amount * 100)),
    currency: params.currency ?? 'EUR',
    status: '1', // success
  });

  const callback = await request(app)
    .post('/api/payments/callback')
    .send({ data: signed.data, ss1: signed.ss1 });
  expect(callback.status).toBe(200);

  const walletAfter = await prisma.wallet.findUnique({ where: { userId: params.userId } });
  const transaction = await prisma.transaction.findFirst({
    where: { userId: params.userId, metadata: { contains: orderId } },
  });
  const walletTx = await prisma.walletTransaction.findFirst({
    where: { transactionId: transaction!.id, type: 'TOP_UP' },
  });

  return {
    orderId,
    storedCurrency: transaction!.currency,
    walletCurrency: walletAfter!.currency,
    balanceBefore,
    balanceAfter: walletAfter!.balance,
    delta: walletAfter!.balance - balanceBefore,
    walletTxAmount: walletTx?.amount ?? null,
  };
}

describe('BC-QA-031-FOLLOWUP-1 F1 — Paysera top-up credits the wallet in the wallet unit', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const { accessToken, user } = await createTestUser();
    authToken = accessToken;
    userId = user.id;
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  it('REGRESSION: a 100.00 EUR top-up increments the BGN balance by 195.58, not by 100', async () => {
    const r = await topUp({ authToken, userId, amount: 100, currency: 'EUR' });

    // Premise checks — if these drift the assertion below would be vacuous.
    expect(r.storedCurrency).toBe('EUR');
    expect(r.walletCurrency).toBe('BGN');

    // The defect: delta === 100 (the EUR magnitude poured into a BGN column).
    expect(r.delta).toBeCloseTo(eurToBgn(100), 2);
    expect(r.delta).toBeCloseTo(195.58, 2);
    expect(r.delta).not.toBeCloseTo(100, 2);

    // The audit row must record the same converted figure, so that the
    // TOP_UP reversal path (which debits `existingTopUp.amount`) stays symmetric.
    expect(r.walletTxAmount).toBeCloseTo(eurToBgn(100), 2);
  });

  it('REGRESSION: the user-visible balance after a 100.00 EUR top-up is EUR 100.00, not EUR 51.13', async () => {
    const before = await authRequest(authToken).get('/api/wallet/balance');
    expect(before.status).toBe(200);
    const balanceEurBefore: number = (before.body.data ?? before.body).balance;

    await topUp({ authToken, userId, amount: 100, currency: 'EUR' });

    const after = await authRequest(authToken).get('/api/wallet/balance');
    expect(after.status).toBe(200);
    const body = after.body.data ?? after.body;

    // The wallet endpoint is EUR-only post-BC-QA-031.
    expect(body.currency).toBe('EUR');
    // What the user actually sees must equal what the user actually paid.
    expect(body.balance - balanceEurBefore).toBeCloseTo(100, 1);
    // The pre-fix figure for this exact input.
    expect(body.balance - balanceEurBefore).not.toBeCloseTo(bgnToEur(100), 1);
  });

  it('a 100.00 BGN top-up still increments by exactly 100 — no double conversion', async () => {
    const r = await topUp({ authToken, userId, amount: 100, currency: 'BGN' });

    expect(r.storedCurrency).toBe('BGN');
    expect(r.delta).toBeCloseTo(100, 2);
    // Guard against "convert everything": a BGN amount must NOT be multiplied
    // by the peg on the way in.
    expect(r.delta).not.toBeCloseTo(eurToBgn(100), 2);
    expect(r.walletTxAmount).toBeCloseTo(100, 2);
  });

  it('a top-up that omits currency takes the EUR default and is converted like one', async () => {
    // `currency` is optional on the request body and defaults to EUR, so this
    // is the DEFAULT client path — the reviewer's reachability argument.
    const r = await topUp({ authToken, userId, amount: 50 });

    expect(r.storedCurrency).toBe('EUR');
    expect(r.delta).toBeCloseTo(eurToBgn(50), 2);
    expect(r.delta).not.toBeCloseTo(50, 2);
  });
});

describe('BC-QA-031-FOLLOWUP-1 F1 — the Stripe credit paths use the same conversion', () => {
  let userId: string;

  beforeAll(async () => {
    const { user } = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  it('a 100.00 EUR PaymentIntent top-up credits eurToBgn(100) into the BGN ledger', async () => {
    const { stripeService } = await import('../../src/services/stripe.service');

    const walletBefore = await prisma.wallet.findUnique({ where: { userId } });
    const balanceBefore = walletBefore?.balance ?? 0;

    await stripeService.handleWebhookEvent({
      id: 'evt_bcqa031f1_eur',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: `pi_bcqa031f1_eur_${Date.now()}`,
          amount: 10000, // 100.00
          currency: 'eur',
          metadata: { userId, type: 'TOP_UP' },
        },
      },
    } as any);

    const walletAfter = await prisma.wallet.findUnique({ where: { userId } });
    const delta = (walletAfter?.balance ?? 0) - balanceBefore;

    expect(delta).toBeCloseTo(eurToBgn(100), 2);
    expect(delta).not.toBeCloseTo(100, 2);
  });

  it('a 100.00 BGN PaymentIntent top-up credits exactly 100 — no double conversion', async () => {
    const { stripeService } = await import('../../src/services/stripe.service');

    const walletBefore = await prisma.wallet.findUnique({ where: { userId } });
    const balanceBefore = walletBefore?.balance ?? 0;

    await stripeService.handleWebhookEvent({
      id: 'evt_bcqa031f1_bgn',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: `pi_bcqa031f1_bgn_${Date.now()}`,
          amount: 10000,
          currency: 'bgn',
          metadata: { userId, type: 'TOP_UP' },
        },
      },
    } as any);

    const walletAfter = await prisma.wallet.findUnique({ where: { userId } });
    const delta = (walletAfter?.balance ?? 0) - balanceBefore;

    expect(delta).toBeCloseTo(100, 2);
    expect(delta).not.toBeCloseTo(eurToBgn(100), 2);
  });
});

/**
 * BC-QA-031-FOLLOWUP-1 impl-r2 F6 — the THIRD credit boundary.
 *
 * `handleRefund` credits a refunded WALLET_TOPUP back to the wallet
 * (`stripe.service.ts`, `amount: toBgn(refundAmount, acceptedCurrency)`). Round
 * 2 showed that reverting that one line left the entire 260-suite corpus green:
 * the only test touching the handler mocks `walletService.credit` away, so it
 * can never observe the amount. A EUR refund credited verbatim would return
 * ~51% of its value with nothing noticing — the same defect as F1, on the same
 * money path.
 *
 * These cases run against the live database and assert the WALLET DELTA, which
 * is the only thing that can distinguish `toBgn(100,'EUR') = 195.58` from a raw
 * 100. They deliberately do NOT mock `walletService.credit`.
 */
describe('BC-QA-031-FOLLOWUP-1 F6 — the Stripe charge.refunded credit uses the same conversion', () => {
  let userId: string;

  beforeAll(async () => {
    const { user } = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  /**
   * Seed the original top-up `Transaction` the refund handler looks up by
   * `stripePaymentId`, then drive a `charge.refunded` event against it and
   * return the wallet delta the credit produced.
   *
   * `type: 'WALLET_TOPUP'` is what makes the handler credit the wallet at all;
   * without it the refund row is written but no balance moves, and the case
   * would pass vacuously whatever the conversion did.
   */
  async function refund(params: { amount: number; currency: 'eur' | 'bgn' }) {
    const { stripeService } = await import('../../src/services/stripe.service');

    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const paymentIntentId = `pi_bcqa031f1_refund_${stamp}`;
    const refundId = `re_bcqa031f1_${stamp}`;

    await prisma.transaction.create({
      data: {
        userId,
        type: 'WALLET_TOPUP',
        paymentMethod: 'CARD',
        status: 'COMPLETED',
        amount: params.amount,
        currency: params.currency.toUpperCase(),
        stripePaymentId: paymentIntentId,
        description: 'BC-QA-031-FOLLOWUP-1 F6 original top-up',
      },
    });

    const walletBefore = await prisma.wallet.findUnique({ where: { userId } });
    const balanceBefore = walletBefore?.balance ?? 0;

    await stripeService.handleWebhookEvent({
      id: `evt_bcqa031f1_refund_${stamp}`,
      type: 'charge.refunded',
      data: {
        object: {
          id: `ch_bcqa031f1_${stamp}`,
          currency: params.currency,
          amount_refunded: Math.round(params.amount * 100),
          payment_intent: paymentIntentId,
          refunds: { data: [{ id: refundId, amount: Math.round(params.amount * 100) }] },
        },
      },
    } as any);

    const walletAfter = await prisma.wallet.findUnique({ where: { userId } });
    const walletTx = await prisma.walletTransaction.findFirst({
      where: { wallet: { userId }, type: 'REFUND', description: { contains: refundId } },
    });

    return {
      refundId,
      delta: (walletAfter?.balance ?? 0) - balanceBefore,
      walletTxAmount: walletTx?.amount ?? null,
      walletCurrency: walletAfter?.currency ?? null,
    };
  }

  it('REGRESSION: a 100.00 EUR refund credits 195.58 stored BGN, not 100', async () => {
    const r = await refund({ amount: 100, currency: 'eur' });

    // Premise check — if no credit happened at all the delta assertion below
    // would pass for the wrong reason when it expects 0.
    expect(r.walletTxAmount).not.toBeNull();
    expect(r.walletCurrency).toBe('BGN');

    expect(r.delta).toBeCloseTo(eurToBgn(100), 2);
    expect(r.delta).toBeCloseTo(195.58, 2);
    // The defect: the raw EUR magnitude poured into the BGN ledger, returning
    // bgnToEur(100) = 51.13 EUR of value for a 100.00 EUR refund.
    expect(r.delta).not.toBeCloseTo(100, 2);
    expect(r.walletTxAmount).toBeCloseTo(eurToBgn(100), 2);
  });

  it('the refunded value the user gets back equals the value they were charged', async () => {
    // Stated in the unit the user actually sees: bgnToEur of the credited BGN
    // must be the 100.00 EUR that was refunded.
    const r = await refund({ amount: 100, currency: 'eur' });
    expect(bgnToEur(r.delta)).toBeCloseTo(100, 1);
    expect(bgnToEur(r.delta)).not.toBeCloseTo(51.13, 1);
  });

  it('a 100.00 BGN refund credits exactly 100 — no double conversion', async () => {
    const r = await refund({ amount: 100, currency: 'bgn' });

    expect(r.delta).toBeCloseTo(100, 2);
    expect(r.delta).not.toBeCloseTo(eurToBgn(100), 2);
    expect(r.walletTxAmount).toBeCloseTo(100, 2);
  });
});
