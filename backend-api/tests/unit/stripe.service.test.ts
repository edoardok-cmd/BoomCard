/**
 * stripe.service unit tests
 *
 * Pins the two highest-value behaviours:
 *
 * 1. handleWebhookEvent routing — each Stripe event type is dispatched to the
 *    correct private handler; unknown types resolve without throwing.
 *
 * 2. handlePaymentSucceeded / handlePaymentFailed core invariants:
 *    - missing userId → early return, no DB calls
 *    - metadata type 'TOP_UP' maps to WALLET_TOPUP enum value
 *    - amount in cents is divided by 100 in the upsert
 *    - failed payment marks transaction FAILED and fires notification
 *
 * Private handlers are accessed via (stripeService as any) so we can unit-test
 * each pathway without going through the full webhook event construction.
 */

// ─── Stripe mock (constructor only — no API calls in the handlers under test) ─

jest.mock('stripe', () => {
  function MockStripe() {
    return MockStripe.prototype._instance;
  }
  MockStripe.prototype._instance = {
    customers: { create: jest.fn(), retrieve: jest.fn() },
    paymentIntents: { create: jest.fn(), confirm: jest.fn(), cancel: jest.fn(), retrieve: jest.fn() },
    paymentMethods: { attach: jest.fn(), detach: jest.fn() },
    subscriptions: { create: jest.fn(), cancel: jest.fn() },
    refunds: { create: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
  };
  return MockStripe;
});

// ─── Service dependency mocks ─────────────────────────────────────────────────

const mockWalletCredit = jest.fn(async () => ({}));
jest.mock('../../src/services/wallet.service', () => ({
  walletService: { credit: mockWalletCredit },
}));

const mockNotifyPaymentFailed   = jest.fn(async () => {});
const mockNotifyAdminChargeback = jest.fn(async () => {});
const mockNotifyAdminOps        = jest.fn(async () => {});
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPaymentFailed:   mockNotifyPaymentFailed,
    notifyAdminChargeback: mockNotifyAdminChargeback,
    notifyAdminOps:        mockNotifyAdminOps,
    notifyReviewReceived:  jest.fn(async () => {}),
  },
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail:                  jest.fn(async () => {}),
    sendPaymentFailedEmail:     jest.fn(async () => {}),
    sendSubscriptionCanceledEmail: jest.fn(async () => {}),
  },
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockTx: any = {
  walletTransaction: {
    findFirst:   jest.fn(async () => null),
    updateMany:  jest.fn(async () => ({ count: 0 })),
  },
  subscription: {
    findFirst: jest.fn(async () => null),
    update:    jest.fn(async () => ({})),
  },
};

const mockPrisma: any = {
  transaction: {
    upsert:     jest.fn(async () => ({})),
    findUnique: jest.fn(async () => null),
    update:     jest.fn(async () => ({})),
  },
  walletTransaction: {
    findFirst:   jest.fn(async () => null),
    updateMany:  jest.fn(async () => ({ count: 0 })),
    findUnique:  jest.fn(async () => null),
  },
  subscription: {
    findFirst: jest.fn(async () => null),
    findMany:  jest.fn(async () => []),
    update:    jest.fn(async () => ({})),
  },
  user: {
    findUnique: jest.fn(async () => null),
    update:     jest.fn(async () => ({})),
  },
  $transaction: jest.fn(async (fn) => fn(mockTx)),
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

import { stripeService } from '../../src/services/stripe.service';

beforeEach(() => jest.clearAllMocks());

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePaymentIntent(
  id: string,
  amountCents: number,
  metadata: Record<string, string> = {},
): any {
  return {
    id,
    amount: amountCents,
    currency: 'bgn',
    metadata,
    last_payment_error: null,
  };
}

function makeEvent(type: string, object: any): any {
  return { type, data: { object } };
}

// ─── handleWebhookEvent — routing ─────────────────────────────────────────────

describe('stripeService.handleWebhookEvent — event routing', () => {
  it('unknown event type resolves without throwing', async () => {
    await expect(
      stripeService.handleWebhookEvent(makeEvent('some.unknown.type', {})),
    ).resolves.toBeUndefined();
  });

  it('payment_intent.succeeded — upserts transaction as COMPLETED', async () => {
    const pi = makePaymentIntent('pi-1', 5000, { userId: 'u-1', type: 'PURCHASE' });
    await stripeService.handleWebhookEvent(makeEvent('payment_intent.succeeded', pi));
    expect(mockPrisma.transaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripePaymentId: 'pi-1' },
        create: expect.objectContaining({ status: 'COMPLETED' }),
        update: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('payment_intent.payment_failed — upserts transaction as FAILED', async () => {
    const pi = makePaymentIntent('pi-2', 2000, { userId: 'u-2', type: 'PURCHASE' });
    await stripeService.handleWebhookEvent(makeEvent('payment_intent.payment_failed', pi));
    expect(mockPrisma.transaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'FAILED' }),
        update: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('payment_intent.canceled — looks up existing transaction', async () => {
    const pi = makePaymentIntent('pi-3', 1000, { userId: 'u-3' });
    await stripeService.handleWebhookEvent(makeEvent('payment_intent.canceled', pi));
    expect(mockPrisma.transaction.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripePaymentId: 'pi-3' } }),
    );
  });

  it('charge.dispute.created — fires notifyAdminChargeback', async () => {
    const dispute = { id: 'dp-1', charge: 'ch-1', amount: 3000, currency: 'bgn', reason: 'fraud', status: 'needs_response' };
    await stripeService.handleWebhookEvent(makeEvent('charge.dispute.created', dispute));
    expect(mockNotifyAdminChargeback).toHaveBeenCalled();
  });

  it('charge.dispute.updated — fires notifyAdminOps (not notifyAdminChargeback)', async () => {
    const dispute = { id: 'dp-2', charge: 'ch-2', amount: 3000, currency: 'bgn', reason: 'fraud', status: 'under_review' };
    await stripeService.handleWebhookEvent(makeEvent('charge.dispute.updated', dispute));
    expect(mockNotifyAdminOps).toHaveBeenCalled();
    expect(mockNotifyAdminChargeback).not.toHaveBeenCalled();
  });

  it('charge.dispute.closed — fires notifyAdminOps', async () => {
    const dispute = { id: 'dp-3', charge: 'ch-3', amount: 3000, currency: 'bgn', reason: 'fraud', status: 'won' };
    await stripeService.handleWebhookEvent(makeEvent('charge.dispute.closed', dispute));
    expect(mockNotifyAdminOps).toHaveBeenCalled();
  });
});

// ─── handlePaymentSucceeded — business logic ──────────────────────────────────

describe('stripeService — handlePaymentSucceeded', () => {
  const call = (pi: any) =>
    (stripeService as any).handlePaymentSucceeded(pi);

  it('returns early without DB calls when userId is missing', async () => {
    await call(makePaymentIntent('pi-no-user', 1000, {}));
    expect(mockPrisma.transaction.upsert).not.toHaveBeenCalled();
  });

  it('maps metadata type TOP_UP to WALLET_TOPUP in the upsert', async () => {
    const pi = makePaymentIntent('pi-topup', 2500, { userId: 'u-1', type: 'TOP_UP' });
    await call(pi);
    const upsertArgs = mockPrisma.transaction.upsert.mock.calls[0][0];
    expect(upsertArgs.create.type).toBe('WALLET_TOPUP');
  });

  it('uses PURCHASE as default type when metadata.type is absent', async () => {
    const pi = makePaymentIntent('pi-purchase', 1000, { userId: 'u-1' });
    await call(pi);
    const upsertArgs = mockPrisma.transaction.upsert.mock.calls[0][0];
    expect(upsertArgs.create.type).toBe('PURCHASE');
  });

  it('preserves arbitrary metadata.type values (e.g. SUBSCRIPTION)', async () => {
    const pi = makePaymentIntent('pi-sub', 1500, { userId: 'u-1', type: 'SUBSCRIPTION' });
    await call(pi);
    const upsertArgs = mockPrisma.transaction.upsert.mock.calls[0][0];
    expect(upsertArgs.create.type).toBe('SUBSCRIPTION');
  });

  it('converts amount from cents to currency units (÷100)', async () => {
    const pi = makePaymentIntent('pi-cents', 4999, { userId: 'u-1', type: 'PURCHASE' });
    await call(pi);
    const upsertArgs = mockPrisma.transaction.upsert.mock.calls[0][0];
    expect(upsertArgs.create.amount).toBeCloseTo(49.99, 5);
  });

  it('upcases currency in the upsert (bgn → BGN)', async () => {
    const pi = makePaymentIntent('pi-currency', 1000, { userId: 'u-1' });
    await call(pi);
    const upsertArgs = mockPrisma.transaction.upsert.mock.calls[0][0];
    expect(upsertArgs.create.currency).toBe('BGN');
  });

  it('TOP_UP: credits wallet via walletService.credit', async () => {
    const pi = makePaymentIntent('pi-topup2', 5000, { userId: 'u-1', type: 'TOP_UP' });
    await call(pi);
    expect(mockWalletCredit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        amount: 50,
        type: 'TOP_UP',
        stripePaymentIntentId: 'pi-topup2',
      }),
    );
  });

  it('TOP_UP: skips wallet credit when already credited (idempotent)', async () => {
    const pi = makePaymentIntent('pi-topup-dup', 5000, { userId: 'u-1', type: 'TOP_UP' });
    // Simulate: walletTransaction already exists for this payment intent
    mockTx.walletTransaction.findFirst.mockResolvedValueOnce({ id: 'wt-existing' });
    await call(pi);
    expect(mockWalletCredit).not.toHaveBeenCalled();
  });

  it('non-TOP_UP: does NOT call walletService.credit', async () => {
    const pi = makePaymentIntent('pi-nontopup', 1000, { userId: 'u-1', type: 'PURCHASE' });
    await call(pi);
    expect(mockWalletCredit).not.toHaveBeenCalled();
  });
});

// ─── handlePaymentFailed — business logic ─────────────────────────────────────

describe('stripeService — handlePaymentFailed', () => {
  const call = (pi: any) =>
    (stripeService as any).handlePaymentFailed(pi);

  it('returns early without DB calls when userId is missing', async () => {
    await call(makePaymentIntent('pi-no-user', 1000, {}));
    expect(mockPrisma.transaction.upsert).not.toHaveBeenCalled();
    expect(mockNotifyPaymentFailed).not.toHaveBeenCalled();
  });

  it('upserts transaction as FAILED', async () => {
    const pi = makePaymentIntent('pi-fail', 2000, { userId: 'u-1', type: 'PURCHASE' });
    await call(pi);
    expect(mockPrisma.transaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripePaymentId: 'pi-fail' },
        create: expect.objectContaining({ status: 'FAILED' }),
        update: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('fires notifyPaymentFailed for the affected user', async () => {
    const pi = makePaymentIntent('pi-fail2', 3000, { userId: 'u-99', type: 'PURCHASE' });
    await call(pi);
    expect(mockNotifyPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-99', paymentIntentId: 'pi-fail2' }),
    );
  });

  it('TOP_UP failure: marks pending wallet transactions FAILED', async () => {
    const pi = makePaymentIntent('pi-topup-fail', 1000, { userId: 'u-1', type: 'TOP_UP' });
    await call(pi);
    expect(mockPrisma.walletTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ stripePaymentIntentId: 'pi-topup-fail', status: 'PENDING' }),
        data: { status: 'FAILED' },
      }),
    );
  });

  it('non-TOP_UP failure: does NOT touch walletTransaction', async () => {
    const pi = makePaymentIntent('pi-nontopup-fail', 1000, { userId: 'u-1', type: 'PURCHASE' });
    await call(pi);
    expect(mockPrisma.walletTransaction.updateMany).not.toHaveBeenCalled();
  });
});

// ─── handlePaymentCanceled — business logic ───────────────────────────────────

describe('stripeService — handlePaymentCanceled', () => {
  const call = (pi: any) =>
    (stripeService as any).handlePaymentCanceled(pi);

  it('does not call transaction.update when no existing transaction found', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValueOnce(null);
    await call(makePaymentIntent('pi-cancel-new', 1000, {}));
    expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
  });

  it('marks existing transaction as CANCELLED', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValueOnce({ id: 'tx-1' });
    await call(makePaymentIntent('pi-cancel-existing', 1000, {}));
    expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripePaymentId: 'pi-cancel-existing' },
        data: { status: 'CANCELLED' },
      }),
    );
  });

  it('TOP_UP cancel: marks pending wallet transactions FAILED', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValueOnce(null);
    await call(makePaymentIntent('pi-topup-cancel', 1000, { type: 'TOP_UP' }));
    expect(mockPrisma.walletTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
        data: { status: 'FAILED' },
      }),
    );
  });
});
