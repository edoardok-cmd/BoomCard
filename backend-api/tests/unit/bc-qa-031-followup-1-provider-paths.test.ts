/**
 * BC-QA-031-FOLLOWUP-1 — the provider-driven and Stripe-side write paths.
 *
 * Two write paths reach `Transaction.currency` without going through
 * `POST /api/payments/create`:
 *
 *   1. `POST /api/payments/intents` — caller-supplied, but INDIRECT: it writes
 *      no row itself; the currency it puts on the Stripe PaymentIntent is what
 *      `stripe.service.handlePaymentSucceeded` later persists. Rejecting only
 *      at the webhook would mean taking a user through a full Stripe checkout
 *      before refusing the result, so the domain is enforced at the request.
 *
 *   2. The Stripe webhook handlers — NOT caller input. Returning an error to
 *      Stripe would make it retry for days and eventually disable the endpoint,
 *      taking every other event down with it, and a retry cannot change the
 *      currency. So the handler acknowledges the event, writes NOTHING, logs at
 *      error level and raises an admin-ops alert. That is the "log + alert +
 *      refuse to write a mislabelled row" behaviour the task asked for.
 */

const transactionUpsertMock = jest.fn();
const transactionFindUniqueMock = jest.fn();
const transactionFindFirstMock = jest.fn();
const walletTransactionUpdateManyMock = jest.fn();
const prismaTransactionMock = jest.fn();
const notifyAdminOpsMock = jest.fn();
const notifyPaymentFailedMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    transaction: {
      upsert: transactionUpsertMock,
      findUnique: transactionFindUniqueMock,
      findFirst: transactionFindFirstMock,
    },
    walletTransaction: { updateMany: walletTransactionUpdateManyMock, findFirst: jest.fn() },
    subscription: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: prismaTransactionMock,
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyAdminOps: notifyAdminOpsMock,
    notifyPaymentFailed: notifyPaymentFailedMock,
    notifyAdminChargeback: jest.fn(),
  },
}));

jest.mock('../../src/services/wallet.service', () => ({
  walletService: { credit: jest.fn(), debit: jest.fn() },
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendPaymentConfirmation: jest.fn(), sendWalletUpdate: jest.fn() },
}));

import type Stripe from 'stripe';
import { stripeService } from '../../src/services/stripe.service';

const LEGACY_CURRENCIES = ['usd', 'gbp', 'pln', 'czk', 'ron'];

function paymentIntentEvent(currency: string, type: string): Stripe.Event {
  return {
    id: `evt_${currency}`,
    type,
    data: {
      object: {
        id: `pi_${currency}`,
        amount: 10000,
        currency,
        metadata: { userId: 'user-1', type: 'TOP_UP' },
      },
    },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  jest.clearAllMocks();
  notifyAdminOpsMock.mockResolvedValue(undefined);
  notifyPaymentFailedMock.mockResolvedValue(undefined);
  transactionUpsertMock.mockResolvedValue({ id: 'tx-1' });
  prismaTransactionMock.mockResolvedValue(undefined);
});

describe('Stripe webhooks — refuse to write a row that cannot be labelled truthfully', () => {
  describe.each(LEGACY_CURRENCIES)('payment_intent.succeeded in %s', (currency) => {
    it('writes no Transaction row and raises an admin-ops alert', async () => {
      await stripeService.handleWebhookEvent(paymentIntentEvent(currency, 'payment_intent.succeeded'));

      // The load-bearing assertion: no row. Before the fix this upserted a row
      // whose currency the read paths then relabelled EUR.
      expect(transactionUpsertMock).not.toHaveBeenCalled();
      // The wallet credit sits AFTER the upsert in the handler; refusing must
      // abort before it, or the balance would move with no transaction row.
      expect(prismaTransactionMock).not.toHaveBeenCalled();

      expect(notifyAdminOpsMock).toHaveBeenCalledTimes(1);
      const alert = notifyAdminOpsMock.mock.calls[0][0];
      expect(alert.opsType).toBe('stripe_unsupported_currency');
      expect(alert.severity).toBe('critical');
      expect(JSON.stringify(alert)).toContain(currency.toUpperCase());
    });
  });

  it('payment_intent.payment_failed in USD writes no row and alerts', async () => {
    await stripeService.handleWebhookEvent(paymentIntentEvent('usd', 'payment_intent.payment_failed'));

    expect(transactionUpsertMock).not.toHaveBeenCalled();
    expect(notifyPaymentFailedMock).not.toHaveBeenCalled();
    expect(notifyAdminOpsMock).toHaveBeenCalledTimes(1);
  });

  it('charge.refunded in USD writes no refund row and alerts', async () => {
    const event = {
      id: 'evt_refund',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_usd',
          currency: 'usd',
          amount_refunded: 10000,
          payment_intent: 'pi_usd',
          refunds: { data: [{ id: 're_usd', amount: 10000 }] },
        },
      },
    } as unknown as Stripe.Event;

    await stripeService.handleWebhookEvent(event);

    expect(transactionUpsertMock).not.toHaveBeenCalled();
    // Refused before the original-transaction lookup, so nothing is read either.
    expect(transactionFindFirstMock).not.toHaveBeenCalled();
    expect(notifyAdminOpsMock).toHaveBeenCalledTimes(1);
  });

  it('invoice.payment_succeeded in USD writes no row and alerts', async () => {
    const event = {
      id: 'evt_invoice',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_usd',
          currency: 'usd',
          amount_paid: 10000,
          subscription: 'sub_stripe_1',
          payment_intent: 'pi_invoice_usd',
          billing_reason: 'subscription_cycle',
        },
      },
    } as unknown as Stripe.Event;

    await stripeService.handleWebhookEvent(event);

    expect(prismaTransactionMock).not.toHaveBeenCalled();
    expect(transactionUpsertMock).not.toHaveBeenCalled();
    expect(notifyAdminOpsMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw out of the webhook dispatcher — Stripe must still get an ack', async () => {
    // If this rejected, the webhook route would 500 and Stripe would retry the
    // same unfixable event for days, eventually disabling the endpoint.
    await expect(
      stripeService.handleWebhookEvent(paymentIntentEvent('usd', 'payment_intent.succeeded')),
    ).resolves.toBeUndefined();
  });

  it('an in-domain BGN payment still writes its row normally', async () => {
    await stripeService.handleWebhookEvent(paymentIntentEvent('bgn', 'payment_intent.succeeded'));

    expect(notifyAdminOpsMock).not.toHaveBeenCalled();
    expect(transactionUpsertMock).toHaveBeenCalledTimes(1);
    expect(transactionUpsertMock.mock.calls[0][0].create.currency).toBe('BGN');
  });

  it('an in-domain EUR payment still writes its row normally', async () => {
    await stripeService.handleWebhookEvent(paymentIntentEvent('eur', 'payment_intent.succeeded'));

    expect(notifyAdminOpsMock).not.toHaveBeenCalled();
    expect(transactionUpsertMock).toHaveBeenCalledTimes(1);
    expect(transactionUpsertMock.mock.calls[0][0].create.currency).toBe('EUR');
  });
});

describe('stripeService.createPaymentIntent — the service-level gate', () => {
  it('throws a 400-carrying error for an out-of-domain currency, before calling Stripe', async () => {
    await expect(
      stripeService.createPaymentIntent({
        amount: 100,
        currency: 'USD',
        userId: 'user-1',
        email: 'u@example.com',
      }),
    ).rejects.toMatchObject({ statusCode: 400, currency: 'USD' });
  });
});
