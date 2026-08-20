/**
 * PaymentProvider abstraction (BC-MYPOS-002)
 *
 * Route handlers, wallet.service.ts, and jobs used to import `payseraService`
 * directly and encode Paysera-specific shapes inline (callback data/ss1/ss2
 * base64+md5, status codes 0-5, BOOM-* order-id prefix branching, Transfer
 * API MAC auth). This module extracts a provider-agnostic `PaymentProvider`
 * interface so a second gateway (BC-MYPOS-003) can be added later without
 * touching call sites again — Paysera remains the ONLY implementation here
 * and behavior is byte-identical to the pre-refactor code; every method below
 * is a thin pass-through to the existing (unmodified) PayseraService.
 *
 * Provider selection is driven by the `PAYMENT_PROVIDER` env var (see
 * `resolvePaymentProvider` / `paymentProvider` below). Unset or unrecognized
 * values fall back to Paysera.
 *
 * Implementation note — why the Paysera adapter lives HERE and not inside
 * paysera.service.ts: several existing unit test suites
 * (tests/unit/walletPayoutFlow.test.ts, walletVoidTrialPendingVocab.test.ts,
 * section14.auditTests.test.ts, section15to19.auditTests.test.ts) call
 * `jest.mock('../../src/services/paysera.service', () => ({ payseraService: {
 * isTransferConfigured, createTransfer, reserveTransfer } }))`, replacing
 * paysera.service.ts's ENTIRE export surface with that partial mock for the
 * duration of the test file. Those tests must keep passing unmodified. If the
 * Paysera `PaymentProvider` adapter were defined as a named export of
 * paysera.service.ts itself, it would come back `undefined` under that mock
 * (the mock factory doesn't return it), breaking every caller that goes
 * through the abstraction. Defining the adapter here instead — importing only
 * the *named* `payseraService` binding — means it always resolves calls
 * through whatever `payseraService` currently is (real or mocked), exactly
 * matching how the pre-refactor code was exercised by those tests.
 */

import { logger } from '../utils/logger';
import {
  payseraService,
  type CreatePaymentParams,
  type PayseraPayment,
  type PayseraCallback,
  type CreateTransferParams,
  type PayseraTransfer,
} from './paysera.service';

// ============================================
// Provider-agnostic types
// ============================================

// Checkout (Paysera Checkout API "createPayment") — aliased 1:1 to the
// existing Paysera types so field shapes cannot drift from what
// PayseraService.createPayment already accepts/returns.
export type CreateCheckoutParams = CreatePaymentParams;
export type CheckoutSession = PayseraPayment;

// Raw webhook payload as received off the wire. Paysera's shape is
// `{ data, ss1, ss2 }` (base64 payload + MD5 signature + optional RSA
// signature — see PayseraCallback); kept as an untyped bag here so a future
// provider's differently-shaped payload doesn't require an interface change.
export type WebhookPayload = Record<string, unknown>;

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'unknown';

export interface VerifiedWebhookResult {
  orderId: string;
  status: PaymentStatus;
  rawStatus: string;
  amount: number;
  currency: string;
  transactionId: string;
  paymentMethod: string;
  isTest: boolean;
  payerEmail?: string;
  payAmount?: string;
  payCurrency?: string;
}

export interface RefundParams {
  /** The provider's transaction/order id to refund. */
  transactionId: string;
  /**
   * Refund amount in minor units (cents). REQUIRED — widened from optional
   * (BC-MYPOS-003-FOLLOWUP-1, item 1) because myPOS's `IPCRefund` has no
   * "refund everything" mode: a full refund must pass the original captured
   * amount explicitly, so `MyPOSService.refund` cannot accept an omitted
   * amount. Paysera's adapter (`payseraPaymentProvider.refund` below) never
   * reads any field off `params` — it unconditionally throws, since Paysera
   * exposes no programmatic refund endpoint — so requiring this field here
   * does not narrow what Paysera's implementation can accept; it costs
   * nothing at the only other call site and buys a contract every current
   * and future provider can actually satisfy.
   */
  amount: number;
  /**
   * ISO currency of the ORIGINAL transaction. REQUIRED for the same reason
   * as `amount`: `MyPOSService.refund` needs it to build `IPCRefund`'s
   * signed request, and Paysera's adapter ignores it either way.
   */
  currency: string;
  /**
   * Caller-supplied unique id for THIS refund request. REQUIRED and MUST BE
   * STABLE across retries of the same logical refund — generating a fresh
   * id per retry would turn a retry into a second, distinct refund against
   * the provider. `MyPOSService.refund` maps this onto myPOS's `OrderID`
   * and enforces the retry-stability requirement by throwing when it is
   * missing; Paysera's adapter does not use it (it has no refund endpoint
   * to address one against).
   */
  orderId: string;
  reason?: string;
}

export interface RefundResult {
  refundId: string;
  status: string;
}

export interface CreatePayoutParams extends CreateTransferParams {
  /**
   * Invoked once the provider has created (but not yet committed) the
   * payout, with the provider-assigned payout id. Callers use this to
   * persist the id before the commit step — this mirrors the pre-existing
   * Paysera create -> stamp -> reserve sequencing in
   * wallet.service.ts#executePayoutTransfer, where the transfer id is
   * written to the WITHDRAWAL row's metadata BEFORE reserveTransfer() is
   * called, so a reserve failure still leaves a traceable transfer id.
   */
  onCreated?: (payoutId: string) => Promise<void> | void;
}

export type PayoutResult = PayseraTransfer;

export interface PaymentProvider {
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession>;
  verifyAndParseWebhook(payload: WebhookPayload): Promise<VerifiedWebhookResult>;
  refund(params: RefundParams): Promise<RefundResult>;
  createPayout(params: CreatePayoutParams): Promise<PayoutResult>;
  mapStatus(rawStatus: string): PaymentStatus;
  /** True when the provider's payout (B2C transfer) credentials are configured. */
  isPayoutConfigured(): boolean;
  /** Body the provider expects in response to an inbound webhook, to stop retries. */
  getWebhookAckResponse(): string;
}

// ============================================
// Paysera adapter — thin pass-through, no behavior change
// ============================================

const payseraPaymentProvider: PaymentProvider = {
  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession> {
    return payseraService.createPayment(params);
  },

  async verifyAndParseWebhook(payload: WebhookPayload): Promise<VerifiedWebhookResult> {
    const { data, ss1, ss2 } = payload as { data?: string; ss1?: string; ss2?: string };
    if (!data || !ss1) {
      throw new Error('Invalid callback data');
    }
    const callback: PayseraCallback = { data, ss1, ss2 };
    return payseraService.handleCallback(callback);
  },

  async refund(_params: RefundParams): Promise<RefundResult> {
    // Paysera's Checkout/Transfer APIs expose no programmatic refund endpoint —
    // refunds are processed manually via the Paysera merchant back office.
    // Nothing in this codebase calls PaymentProvider.refund today: a
    // Paysera-side refund surfaces as an inbound webhook with status=5,
    // which is handled entirely by verifyAndParseWebhook / mapStatus. This
    // intentionally throws rather than silently no-op-ing so a future caller
    // fails loudly instead of believing a refund was issued.
    throw new Error(
      'Paysera does not support programmatic refunds via this API; process refunds via the Paysera back office.'
    );
  },

  async createPayout(params: CreatePayoutParams): Promise<PayoutResult> {
    const { onCreated, ...transferParams } = params;
    const transferParamsForPaysera: CreateTransferParams = transferParams;
    const transfer = await payseraService.createTransfer(transferParamsForPaysera);
    if (onCreated) {
      await onCreated(transfer.id);
    }
    // Reserve (commit) the transfer. Its own return value is intentionally
    // discarded — pre-refactor code never used it either, only `transfer.id`
    // (from create) and `transfer.status` are surfaced to callers.
    await payseraService.reserveTransfer(transfer.id);
    return transfer;
  },

  mapStatus(rawStatus: string): PaymentStatus {
    return payseraService.getPaymentStatus(rawStatus);
  },

  isPayoutConfigured(): boolean {
    return payseraService.isTransferConfigured();
  },

  getWebhookAckResponse(): string {
    return payseraService.generateCallbackResponse();
  },
};

// ============================================
// Provider selection — real, driven by PAYMENT_PROVIDER
// ============================================

const PROVIDERS: Record<string, PaymentProvider> = {
  paysera: payseraPaymentProvider,
};

/**
 * Resolve a PaymentProvider by name (defaults to `process.env.PAYMENT_PROVIDER`,
 * then 'paysera'). Exported separately from the `paymentProvider` singleton so
 * callers/tests can resolve a specific provider without depending on process.env.
 */
export function resolvePaymentProvider(providerName?: string): PaymentProvider {
  const key = (providerName ?? process.env.PAYMENT_PROVIDER ?? 'paysera').trim().toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) {
    logger.warn(`Unknown PAYMENT_PROVIDER "${key}" — falling back to paysera`);
    return PROVIDERS.paysera;
  }
  return provider;
}

// Selected once at module load, per the current PAYMENT_PROVIDER env var —
// the same pattern PayseraService itself uses for its own env-driven config.
export const paymentProvider: PaymentProvider = resolvePaymentProvider();

export default paymentProvider;
