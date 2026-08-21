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
import { writeAudit } from '../middleware/audit.middleware';
import { notificationService } from './notification.service';
import { detach } from '../utils/detach';
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

// ============================================
// Signature-rejection observability (BC-QA-031-FOLLOWUP-8 item 4)
// ============================================

/**
 * Thrown by `verifyAndParseWebhook`/`verifyAndParseRedirect` specifically when
 * `payseraService.handleCallback` rejected the callback's ss1/ss2/ss3
 * signature (as opposed to some other failure — a missing order, a DB error,
 * a malformed `data` payload). Callers use `instanceof` to distinguish "this
 * callback was not genuinely from Paysera (or Paysera rotated its signing
 * key)" from ordinary processing errors, so they can make the rejection
 * OBSERVABLE via `recordPayseraSignatureRejection` below instead of it
 * disappearing into the generic catch-all log line every callback route
 * already has (which acks the webhook regardless, to stop Paysera retries —
 * see each route's own comment on that).
 */
export class PayseraSignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayseraSignatureVerificationError';
  }
}

/**
 * The exact string `PayseraService.handleCallback` throws on a rejected
 * signature. Exported so a caller that bypasses this adapter and calls
 * `payseraService.handleCallback` directly (pending-checkout.routes.ts) can
 * still detect a signature rejection without duplicating the literal.
 */
export const SIGNATURE_REJECTION_MESSAGE = 'Invalid callback signature';

/** AuditLog `action` value written by `recordPayseraSignatureRejection` — also
 *  read by `scheduler.ts#checkPaymentFailureSpike` to detect an RSA-verification
 *  outage even when it drives the COMPLETED sample to zero (task-r1 F1). Shared
 *  as a constant so the writer and the reader cannot drift apart. */
export const PAYSERA_SIGNATURE_REJECTED_AUDIT_ACTION = 'PAYSERA_SIGNATURE_REJECTED';

/**
 * Record an RSA (ss2/ss3) callback-signature rejection somewhere other than a
 * log line. Called by every callback route's catch block right where it is
 * already about to ack-and-drop the callback. Two independent, durable
 * signals come out of this:
 *   1. An AuditLog row (`action: PAYSERA_SIGNATURE_REJECTED`) — a total
 *      verification outage (key rotation, misconfigured
 *      PAYSERA_PUBLIC_KEY) leaves a queryable trail even though it also
 *      starves scheduler.ts's hourly payment-failure-spike-scan of its usual
 *      FAILED/COMPLETED sample.
 *   2. A best-effort near-real-time admin-ops notification (1h cooldown per
 *      opsType), so operators are not limited to the next hourly scan.
 * Both are fire-and-forget (`detach`) — a notification/audit failure must
 * never affect the webhook ack Paysera receives.
 */
export function recordPayseraSignatureRejection(params: { route: string; dataPrefix: string }): void {
  detach(
    writeAudit({
      actorUserId: null,
      action: PAYSERA_SIGNATURE_REJECTED_AUDIT_ACTION,
      objectType: 'PayseraCallback',
      objectId: null,
      after: { route: params.route, dataPrefix: params.dataPrefix },
    }),
    (err) => logger.error('[paysera] Failed to record signature-rejection audit entry:', err)
  );
  detach(
    notificationService.notifyAdminOps({
      opsType: 'paysera_rsa_signature_rejected',
      title: 'Paysera callback rejected — invalid RSA signature (ss2/ss3)',
      message:
        `A callback to ${params.route} failed ss2/ss3 RSA verification and was acknowledged-but-dropped ` +
        `(prevents Paysera retries; the underlying order is left un-settled for manual reconciliation). ` +
        `This can mean a forged callback, or that Paysera has rotated its published signing key — see ` +
        `src/services/paysera-public-key.ts's ROTATION section if this keeps happening.`,
      severity: 'critical',
      cooldownHours: 1,
      fields: [
        { label: 'Route', value: params.route },
        { label: 'Data prefix', value: params.dataPrefix },
      ],
    }),
    (err) => logger.error('[paysera] Failed to send signature-rejection admin-ops alert:', err)
  );
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
  /**
   * Like `verifyAndParseWebhook`, but for a caller that verifies data the
   * PROVIDER'S REDIRECT (not its webhook) carries — e.g. Paysera's
   * accept/cancel-URL querystring, which only ever carries `data`+`ss1` and
   * can never carry an ss2/ss3 RSA signature. Exempts the RSA requirement for
   * that specific call without weakening it for genuine webhook callers, and
   * without weakening the underlying ss1 (shared-secret MAC) check, which
   * every mode enforces unconditionally either way.
   * (BC-QA-031-FOLLOWUP-8 item 1 — see payments.paysera.routes.ts's
   * `/verify-redirect`, the only current caller.)
   *
   * OPTIONAL: only Paysera has a redirect-vs-webhook distinction worth
   * exempting (myPOS's `MyPOSService` — BC-MYPOS-002/003 — does not implement
   * this). A caller resolving an arbitrary `PaymentProvider` must fall back
   * to `verifyAndParseWebhook` when this is undefined; see
   * payments.paysera.routes.ts's `/verify-redirect` handler for that
   * fallback in practice. Kept optional specifically so adding it did not
   * require touching mypos.service.ts (outside this change's scope) to add a
   * same-shaped method that provider has no real use for.
   */
  verifyAndParseRedirect?(payload: WebhookPayload): Promise<VerifiedWebhookResult>;
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
    // ss3 (RSA/SHA-256) is forwarded alongside ss2 (RSA/SHA-1) — the vendor
    // library's own last-field-wins precedence (ss3 beats ss2 when both are
    // present) lives in PayseraService.verifyCallback / RSA_SIGN_FIELDS;
    // dropping ss3 here silently downgraded a ss3-signing project to ss1-only
    // (BC-QA-031-FOLLOWUP-7 impl-r1 F2, closed by BC-QA-031-FOLLOWUP-8).
    const { data, ss1, ss2, ss3 } = payload as { data?: string; ss1?: string; ss2?: string; ss3?: string };
    if (!data || !ss1) {
      throw new Error('Invalid callback data');
    }
    const callback: PayseraCallback = { data, ss1, ss2, ss3 };
    try {
      return await payseraService.handleCallback(callback);
    } catch (err: any) {
      if (err?.message === SIGNATURE_REJECTION_MESSAGE) {
        throw new PayseraSignatureVerificationError(err.message);
      }
      throw err;
    }
  },

  async verifyAndParseRedirect(payload: WebhookPayload): Promise<VerifiedWebhookResult> {
    // Paysera's redirect querystring (what /verify-redirect receives) only
    // ever carries `data`+`ss1` — never ss2/ss3, since that RSA signature is
    // only ever part of the asynchronous webhook callback. Forcing the
    // 'enforce' mode override (rather than passing none, which would fall
    // back to `this.ss2Mode` and reject 100% of this route's traffic under a
    // global PAYSERA_SS2_MODE=require) exempts this call from the RSA
    // requirement without weakening ss1, which stays an unconditional hard
    // gate in every mode (see verifyCallback rule 1).
    const { data, ss1 } = payload as { data?: string; ss1?: string };
    if (!data || !ss1) {
      throw new Error('Invalid callback data');
    }
    const callback: PayseraCallback = { data, ss1 };
    try {
      return await payseraService.handleCallback(callback, 'enforce');
    } catch (err: any) {
      if (err?.message === SIGNATURE_REJECTION_MESSAGE) {
        throw new PayseraSignatureVerificationError(err.message);
      }
      throw err;
    }
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
