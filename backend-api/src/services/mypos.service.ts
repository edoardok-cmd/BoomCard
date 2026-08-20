/**
 * MyPOS Checkout (Online Payments v1.4) service — BC-MYPOS-003
 *
 * Implements the provider-agnostic `PaymentProvider` contract from
 * `./payment-provider.ts` (BC-MYPOS-002) against myPOS's Checkout API:
 *
 *   - `createCheckout`          → `IPCPurchase`      (hosted payment page)
 *   - `verifyAndParseWebhook`   → `IPCPurchaseNotify` (server-to-server callback)
 *   - `refund`                  → `IPCRefund`         (full or partial)
 *   - `reverse`                 → `IPCReversal`       (void of an unsettled auth)
 *   - `getPaymentStatus`        → `IPCGetTxnStatus`   (out-of-band status query)
 *   - `createPayout`            → NOT SUPPORTED by myPOS (throws; see §3 below)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCOPE (BC-MYPOS-003 is the ADAPTER ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * This module is deliberately NOT registered in the `PROVIDERS` map in
 * payment-provider.ts, and no route/job/service calls it yet. Wiring it into
 * live checkout/callback paths (including the POST-form redirect described
 * under `createCheckout` below and the caller-side replay guard described
 * under `verifyAndParseWebhook`) is BC-MYPOS-005. Setting
 * `PAYMENT_PROVIDER=mypos` today would resolve to the Paysera fallback, which
 * is the intended safe behaviour until BC-MYPOS-005 lands.
 *
 * The compile-time assertion at the bottom of this file checks that the class
 * is ASSIGNABLE to `PaymentProvider` without touching payment-provider.ts. Read
 * that narrowly — it guarantees that every interface method EXISTS with a
 * compatible return type, and it does NOT guarantee that an interface-typed
 * caller can actually call them:
 *
 *   TypeScript method parameters are BIVARIANT, so a method that NARROWS its
 *   parameter type still satisfies the assertion. `refund` does exactly that:
 *   the interface declares `RefundParams` (`{ transactionId; amount?; reason? }`)
 *   while `MyPOSService.refund` requires `MyPOSRefundParams` — `amount` is
 *   mandatory, and `currency` and `orderId` are additional mandatory fields the
 *   interface never declares. A caller holding a `PaymentProvider` and writing
 *   `p.refund({ transactionId, amount })` therefore COMPILES CLEANLY and THROWS
 *   AT RUNTIME. No other method narrows. Only the runtime half of that is
 *   pinned by a test (the narrowing case in the "PaymentProvider contract"
 *   block); the compile half is pinned by NOTHING, because tsconfig.json
 *   excludes every `.test.ts` file from the project typecheck and jest runs
 *   ts-jest with `diagnostics.warnOnly`, so a type error in a test file fails
 *   nothing at all. Consequence for whoever
 *   widens `RefundParams`: that test will keep passing rather than failing to
 *   compile, so it must be revisited by hand — nothing will flag it.
 *
 * The genuine fix is widening `RefundParams` in payment-provider.ts, which is
 * outside this task's target files and is filed as a follow-up; until it lands,
 * callers must construct refunds against `MyPOSRefundParams` (the concrete
 * type), not against the interface. `refund` fails loudly and moves no money in
 * this state, which is why it ships this way rather than blocking.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DESIGN INPUTS
 * ─────────────────────────────────────────────────────────────────────────────
 * - `docs/specs/mypos-migration-design.md` (BC-MYPOS-001 spike): §2 per-flow
 *   mapping, §3 payout NO-GO, §4 `MYPOS_*` env var names, §7 open gaps.
 * - BC-MYPOS-013 gap follow-up (Agent X `output/BoomCard/`):
 *     * Checkout stays on the classic `IPCPurchaseNotify` POST scheme —
 *       `webhook-api.mypos.com` is a different product surface (Transactions/
 *       Devices/Banking) and Checkout notifications never migrate onto it, so
 *       no contingency for a webhook-system migration is built here.
 *     * `IPCRefund` supports repeated partial refunds, cumulative up to 100%
 *       of the original amount. This adapter therefore does NOT treat a refund
 *       as single-shot; the running-total-vs-100%-cap check is the CALLER's
 *       invariant (BC-MYPOS-007) since this class is stateless.
 *     * `IPCIAStoreCard` requires PCI SAQ-D and is deliberately NOT
 *       implemented here. Tokenisation goes through the hosted-redirect
 *       `IPCPurchase` + `CardTokenRequest=2` path only, so no raw PAN ever
 *       reaches BoomCard's stack.
 *     * myPOS retries the notify on a non-200/non-"OK" response, so delivery
 *       is at-least-once and callers MUST dedupe (see below).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIGNING SCHEME (and where it is ASSUMED rather than confirmed)
 * ─────────────────────────────────────────────────────────────────────────────
 * myPOS signs/verifies IPC messages as:
 *
 *   base    = base64( value_1 + "-" + value_2 + ... + "-" + value_n )
 *   Signature = base64( RSA-SHA256-sign( base, merchant_private_key ) )
 *
 * i.e. the parameter VALUES (not names) are joined with "-", the joined string
 * is base64-encoded, and THAT base64 text is what gets signed. `Signature` is
 * excluded from the concatenation and is always transmitted last. Inbound
 * `IPCPurchaseNotify` messages are verified the same way against myPOS's
 * public certificate (`MYPOS_PUBLIC_CERT`).
 *
 * ASSUMPTIONS (documented, not confirmed — see the "Assumptions" list in the
 * BC-MYPOS-003 report and the caveats filed with it):
 *   A1. The base64-before-signing step above matches myPOS's reference SDK
 *       behaviour. It has NOT been validated against a live/sandbox myPOS
 *       endpoint by this task (no sandbox credentials exist yet).
 *   A2. The exact `IPCPurchase` parameter SET and ORDER used by
 *       `buildPurchaseFields()` is this adapter's best reconstruction of the
 *       v1.4 docs. A wrong order or a missing/extra field produces a
 *       signature myPOS rejects, so this MUST be validated against the
 *       sandbox host before BC-MYPOS-005 sends real traffic.
 *   A3. For INBOUND notifies the concatenation order is the order the fields
 *       arrive in on the wire (this mirrors myPOS's own SDK, which pops
 *       `Signature` off the received map and joins whatever remains). The
 *       caller must therefore hand `verifyAndParseWebhook` the parsed body
 *       UNMODIFIED — no key re-sorting, no injected fields, no removed
 *       fields — or verification will fail.
 *   A4. The OUTBOUND API request field sets and orders — `IPCRefund`
 *       (`refund()`), `IPCReversal` (`reverse()`) and `IPCGetTxnStatus`
 *       (`getPaymentStatus()`) — carry the SAME status as A2: reconstructed,
 *       not confirmed, and every field enters the signed concatenation.
 *       Two specific divergences a sandbox run must check FIRST:
 *         (a) NAME OF THE ORIGINAL-TRANSACTION REFERENCE. The BC-MYPOS-001
 *             spike (`docs/specs/mypos-migration-design.md` §2 row 4) lists
 *             `IPCRefund` as `SID`, `KeyIndex`, `Amount`, `Currency`,
 *             `Trnref`, `OrderID`, `Signature` — i.e. `Trnref`. This adapter
 *             sends `IPC_Trnref` (the name myPOS uses on the inbound notify)
 *             on the refund and reversal calls; `IPCGetTxnStatus` carries no
 *             transaction reference at all and queries by `OrderID` instead.
 *             One of the two names is wrong; if myPOS rejects a refund or
 *             reversal request, try `Trnref` before anything else — that
 *             remedy does not apply to the status query.
 *         (b) EXTRA FIELDS. Beyond the spike's list this adapter also sends
 *             `IPCmethod`, `IPCVersion`, `IPCLanguage`, `WalletNumber` and
 *             `OutputFormat`. They are included because the IPC envelope
 *             appears to require them, not because the spike lists them; each
 *             is an extra value in the signed concatenation, so an unwanted
 *             one breaks the signature exactly as a missing one does.
 *       `IPCReversal` and `IPCGetTxnStatus` have NO design-input basis at all
 *       (the spike does not cover them) — their method names, field sets and
 *       the `TxnStatus`-over-`Status` preference in `getPaymentStatus` are all
 *       reconstruction.
 *   A5. `postIpcRequest()` posts all three outbound calls to the SAME host as
 *       the hosted checkout (`https://www.mypos.com/vmp/checkout[-test]`),
 *       i.e. it assumes the hosted-checkout URL doubles as the IPC API
 *       endpoint and that the sandbox/production split is the same one path.
 *       Unconfirmed. If myPOS serves the IPC API on a distinct host/path, only
 *       `getEndpoint()`/`postIpcRequest()` need to change — the signing and
 *       parsing layers are independent of it.
 *
 * Every one of A1-A5 fails LOUDLY rather than silently: a wrong field name,
 * order, extra field or endpoint produces a signature/route myPOS rejects, and
 * `refund`/`reverse`/`getPaymentStatus` all throw on a non-success status. No
 * money moves on a wrong guess. What they cost is a sandbox round-trip to pin,
 * which is a prerequisite for BC-MYPOS-005 going live.
 *
 * The ORDERED field lists these assumptions describe are asserted against
 * literal expected arrays in tests/unit/mypos.service.test.ts ("signed field
 * set and order" blocks), so changing a set or an order fails the build and
 * forces a deliberate re-derivation instead of silently changing what BoomCard
 * puts on the wire. Those assertions pin the CURRENT RECONSTRUCTION; they are
 * not evidence that the reconstruction matches myPOS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REPLAY / IDEMPOTENCY — WHAT THE CALLER MUST DO
 * ─────────────────────────────────────────────────────────────────────────────
 * This adapter is STATELESS and deliberately keeps no dedupe cache: an
 * in-memory cache would be silently wrong under multiple processes/dynos and
 * would give callers false confidence. myPOS delivers `IPCPurchaseNotify`
 * AT LEAST ONCE (it retries until it receives HTTP 200 with the literal body
 * `OK`, and the retry/redelivery contract is not publicly documented — spike
 * §7, BC-MYPOS-013 item 3), so the same payment can legitimately arrive more
 * than once, including after a prior successful ack.
 *
 * The caller (BC-MYPOS-005's callback route) MUST therefore:
 *   1. Dedupe on the tuple (`storeId`, `orderId`, `ipcTrnref`) — all three are
 *      returned on `MyPOSVerifiedWebhookResult`. `orderId` is our own
 *      `providerOrderId` (schema: `Subscription.paymentProvider='MYPOS'` +
 *      `providerOrderId`, BC-MYPOS-004) and `ipcTrnref` is myPOS's own
 *      transaction reference, unique per transaction. `ipcTrnref` alone is the
 *      narrowest key; the pair guards against an OrderID being re-presented
 *      with a different transaction.
 *   2. Do that dedupe against DURABLE state (a unique constraint or a
 *      row-level "already credited" check inside the same transaction that
 *      credits), exactly as the existing Paysera callback route does — not in
 *      process memory.
 *   3. Return `getWebhookAckResponse()` (`'OK'`) with HTTP 200 for BOTH the
 *      first delivery and every replay, otherwise myPOS keeps retrying.
 *   4. Mount this on the notify URL ONLY, and never authorize off any other
 *      myPOS message. Every IPC message is signed with the same key under the
 *      same scheme, so a signature identifies the SENDER, not the MESSAGE.
 *      `verifyAndParseWebhook` therefore enforces `IPCmethod ===
 *      'IPCPurchaseNotify'` itself and throws on anything else — including
 *      `IPCPurchaseOK`, the browser-redirect twin myPOS hands the CUSTOMER at
 *      `URL_OK`, which a customer can replay to the public notify URL with a
 *      genuine signature (spike §2 row 2: myPOS "explicitly warns not to
 *      authorize off" it). Do not weaken or bypass that check, and do not build
 *      a second entry point that parses a myPOS payload without it: the
 *      `URL_OK` landing page must confirm state from OUR OWN record written by
 *      the notify, never from the redirect payload the browser carries.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SECRET / PAN HYGIENE
 * ─────────────────────────────────────────────────────────────────────────────
 * Key material (`MYPOS_PRIVATE_KEY`, `MYPOS_PUBLIC_CERT`), computed
 * signatures, and card tokens are NEVER passed to the logger — only field
 * NAMES, order ids, amounts, and status codes are logged. No full PAN is ever
 * accepted or stored by this module (hosted-redirect flow only); the only card
 * datum surfaced is a last-4 extracted from myPOS's already-masked field via
 * `MyPOSService.extractLast4()`.
 */

import crypto from 'crypto';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { logger } from '../utils/logger';
import type {
  PaymentProvider,
  CreateCheckoutParams,
  CheckoutSession,
  WebhookPayload,
  PaymentStatus,
  RefundParams,
  RefundResult,
  VerifiedWebhookResult,
  CreatePayoutParams,
  PayoutResult,
} from './payment-provider';

// ============================================
// Constants
// ============================================

/** Hosted-checkout endpoints (spike §2 row 1). Sandbox differs only by path. */
export const MYPOS_CHECKOUT_URL_PRODUCTION = 'https://www.mypos.com/vmp/checkout';
export const MYPOS_CHECKOUT_URL_SANDBOX = 'https://www.mypos.com/vmp/checkout-test';

/** IPC protocol version this adapter speaks (Online Payments v1.4). */
export const MYPOS_IPC_VERSION = '1.4';

/**
 * `PaymentParametersRequired=1` selects the hosted myPOS payment page (card
 * data entered on myPOS's page, never on ours). ASSUMPTION A2 applies to this
 * value as it does to the rest of the purchase parameter set.
 */
const PAYMENT_PARAMETERS_HOSTED_PAGE = '1';

/** Body myPOS requires in response to a notify, or it retries. */
const MYPOS_ACK_BODY = 'OK';

/**
 * The ONLY `IPCmethod` value `verifyAndParseWebhook` accepts. Every myPOS IPC
 * message is signed with the same key under the same scheme, so a valid
 * signature identifies the SENDER, not the MESSAGE — the message type has to be
 * checked separately. In particular `IPCPurchaseOK` (the browser-redirect twin
 * myPOS hands the customer at `URL_OK`) must never be treated as a notify; see
 * the message-type check in `verifyAndParseWebhook` for the full rationale.
 */
export const MYPOS_NOTIFY_METHOD = 'IPCPurchaseNotify';

/** Outbound API calls (refund/reversal/status) — same ceiling as Paysera's. */
const MYPOS_HTTP_TIMEOUT_MS = 15000;

/**
 * The ONLY myPOS status code confirmed from myPOS's own SDK convention
 * (`if (status != 0) { treat as error }`).
 */
export const MYPOS_STATUS_SUCCESS = '0';

/**
 * myPOS IPC status code → internal `PaymentStatus`. Explicit table:
 *
 *   | myPOS `Status` | internal    | basis                                    |
 *   |----------------|-------------|------------------------------------------|
 *   | `'0'`          | `'success'` | CONFIRMED — myPOS treats 0 as success     |
 *   | anything else  | `'unknown'` | see note below                            |
 *
 * The public myPOS documentation consulted by the BC-MYPOS-001 spike does not
 * publish a complete code→meaning table, and this task had no sandbox access
 * to observe one. Rather than invent code meanings, every non-zero/unparsed
 * code maps to `'unknown'`. That is deliberately conservative and is the
 * money-safe direction: an unrecognised code can NEVER be mistaken for
 * `'success'`, so nothing is ever credited on a code we do not understand.
 *
 * CONSEQUENCE the caller must handle (and a known limitation of this task):
 * `mapStatus` currently never returns `'failed'` or `'cancelled'` — a genuine
 * decline is indistinguishable from an unrecognised code, and both surface as
 * `'unknown'`. Callers must treat `'unknown'` as "do not credit, do not mark
 * failed, log/alert with `rawStatus` + `statusMsg`". Pinning the real failure
 * codes requires sandbox observation and is a prerequisite for BC-MYPOS-005
 * going live.
 */
const MYPOS_STATUS_MAP: Readonly<Record<string, PaymentStatus>> = Object.freeze({
  [MYPOS_STATUS_SUCCESS]: 'success' as PaymentStatus,
});

/**
 * Paysera's `CreatePaymentParams.lang` is ISO 639-2/B (`BUL`, `ENG`, …) while
 * myPOS's `IPCLanguage` is ISO 639-1 (`bg`, `en`). Unmapped values fall back to
 * `en` rather than passing an invalid code through.
 */
const IPC_LANGUAGE_BY_ISO639_2: Readonly<Record<string, string>> = Object.freeze({
  BUL: 'bg',
  ENG: 'en',
  DEU: 'de',
  GER: 'de',
  FRA: 'fr',
  FRE: 'fr',
  SPA: 'es',
  ITA: 'it',
  RON: 'ro',
  RUM: 'ro',
  ELL: 'el',
  GRE: 'el',
  RUS: 'ru',
});
const DEFAULT_IPC_LANGUAGE = 'en';

// ============================================
// Types
// ============================================

export interface MyPOSConfig {
  /** `MYPOS_STORE_ID` — merchant Store ID (SID). */
  storeId: string;
  /** `MYPOS_WALLET_NUMBER` — myPOS wallet/account number tied to the store. */
  walletNumber: string;
  /** `MYPOS_KEY_INDEX` — index of the active signing keypair. */
  keyIndex: string;
  /** `MYPOS_PRIVATE_KEY` — RSA private key PEM. NEVER logged. */
  privateKeyPem: string;
  /** `MYPOS_PUBLIC_CERT` — myPOS public certificate/key PEM. NEVER logged. */
  publicCertPem: string;
  /** `MYPOS_TEST_MODE === 'true'` — selects the sandbox host. */
  testMode: boolean;
}

/**
 * myPOS's hosted checkout is entered by POSTing a signed form, not by a GET
 * redirect, so the session carries the form contract alongside the fields the
 * provider-agnostic `CheckoutSession` already defines.
 *
 * IMPORTANT for BC-MYPOS-005: `paymentUrl` is the FORM ACTION. Unlike Paysera,
 * navigating the browser to `paymentUrl` alone is NOT a working checkout — the
 * caller must render/auto-submit a POST form carrying `formFields` (or POST
 * them server-side and relay the response). `formFields` includes `Signature`
 * and must not be logged.
 */
export interface MyPOSCheckoutSession extends CheckoutSession {
  formMethod: 'POST';
  formAction: string;
  formFields: Record<string, string>;
  /** Amount as it goes on the wire (major units, 2dp) — for caller assertions. */
  wireAmount: string;
  isTest: boolean;
}

export interface MyPOSCreateCheckoutParams extends CreateCheckoutParams {
  /**
   * `CardTokenRequest`: `0` = no token (default), `1` = token only,
   * `2` = pay + store token (the renewal flow recommended by spike §2 row 3).
   */
  cardTokenRequest?: 0 | 1 | 2;
  /** Free-text note passed through to myPOS (`Note`). */
  note?: string;
}

export interface MyPOSVerifiedWebhookResult extends VerifiedWebhookResult {
  /** myPOS's own transaction reference — narrowest dedupe key. */
  ipcTrnref: string;
  /** e.g. `IPCPurchaseNotify`. */
  ipcMethod: string;
  /** SID echoed by myPOS; already checked against `MYPOS_STORE_ID`. */
  storeId: string;
  /** Present only for `CardTokenRequest` flows. SECRET — never log. */
  cardToken?: string;
  /** Human-readable status text from myPOS, safe to log. */
  statusMsg?: string;
  /** Last 4 digits only, when myPOS sent a masked card number. */
  cardLast4?: string;
}

export interface MyPOSRefundParams extends RefundParams {
  /** Original transaction's `IPC_Trnref`. */
  transactionId: string;
  /**
   * Refund amount in MINOR units (cents). REQUIRED — myPOS's `IPCRefund` has
   * no "refund everything" mode, so a full refund is expressed as the original
   * captured amount. Partial refunds may be repeated up to 100% cumulative
   * (BC-MYPOS-013 item 4); tracking that running total is the caller's job.
   */
  amount: number;
  /** ISO currency of the ORIGINAL transaction. REQUIRED by `IPCRefund`. */
  currency: string;
  /**
   * Caller-supplied unique id for THIS refund request (myPOS `OrderID`).
   * REQUIRED and must be STABLE across retries of the same logical refund —
   * generating one here would turn a retry into a second real refund.
   */
  orderId: string;
}

export interface MyPOSRefundResult extends RefundResult {
  rawStatus: string;
  statusMsg?: string;
  /** The original transaction reference the refund was applied to. */
  originalTransactionId: string;
  /** Refund amount echoed back in minor units, when myPOS returns one. */
  amount?: number;
}

export interface MyPOSReversalParams {
  /** Original transaction's `IPC_Trnref`. */
  transactionId: string;
}

export interface MyPOSReversalResult {
  transactionId: string;
  status: PaymentStatus;
  rawStatus: string;
  statusMsg?: string;
}

export interface MyPOSPaymentStatusResult {
  orderId: string;
  status: PaymentStatus;
  rawStatus: string;
  statusMsg?: string;
  ipcTrnref?: string;
  /** Minor units, when myPOS returns an amount. */
  amount?: number;
  currency?: string;
}

// ============================================
// Service
// ============================================

export class MyPOSService {
  private config: MyPOSConfig;

  constructor() {
    this.config = MyPOSService.loadConfigFromEnv();

    const missing = MyPOSService.missingConfigKeys(this.config);
    if (missing.length > 0) {
      // Names only — never the values.
      logger.warn(
        `MyPOS credentials not configured (missing: ${missing.join(', ')}). ` +
          'MyPOS calls will fail closed until these are set.'
      );
    }

    logger.info(`MyPOS Service initialized (${this.config.testMode ? 'TEST' : 'LIVE'} mode)`);
  }

  // ------------------------------------------
  // Config — the ONE choke point for MYPOS_* env reads
  // ------------------------------------------

  /**
   * The ONLY place in this module (and the only place in the codebase) that
   * reads `MYPOS_*` environment variables. Everything else reads
   * `this.config`. Keeping this single-sourced is what makes the fail-closed
   * guarantees below auditable.
   */
  private static loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MyPOSConfig {
    return {
      storeId: (env.MYPOS_STORE_ID || '').trim(),
      walletNumber: (env.MYPOS_WALLET_NUMBER || '').trim(),
      keyIndex: (env.MYPOS_KEY_INDEX || '').trim(),
      privateKeyPem: MyPOSService.normalizePem(env.MYPOS_PRIVATE_KEY),
      publicCertPem: MyPOSService.normalizePem(env.MYPOS_PUBLIC_CERT),
      testMode: env.MYPOS_TEST_MODE === 'true',
    };
  }

  private static missingConfigKeys(config: MyPOSConfig): string[] {
    const missing: string[] = [];
    if (!config.storeId) missing.push('MYPOS_STORE_ID');
    if (!config.walletNumber) missing.push('MYPOS_WALLET_NUMBER');
    if (!config.keyIndex) missing.push('MYPOS_KEY_INDEX');
    if (!config.privateKeyPem) missing.push('MYPOS_PRIVATE_KEY');
    if (!config.publicCertPem) missing.push('MYPOS_PUBLIC_CERT');
    return missing;
  }

  /**
   * Accepts a PEM directly, a PEM with literal `\n` escapes (the usual shape
   * when a key is squeezed into a single-line env var), or a base64-wrapped
   * PEM (spike §4 suggests storing it that way). Returns `''` when the value
   * is absent or unusable — callers then FAIL CLOSED rather than falling back
   * to an empty key. Never logs the material.
   */
  static normalizePem(raw?: string): string {
    if (!raw) return '';
    let value = String(raw).trim();
    if (!value) return '';

    if (value.includes('\\n')) {
      value = value.replace(/\\n/g, '\n');
    }

    if (!value.includes('-----BEGIN')) {
      try {
        const decoded = Buffer.from(value, 'base64').toString('utf8');
        if (decoded.includes('-----BEGIN')) {
          value = decoded.trim();
        }
      } catch {
        // Not base64 — fall through and let the caller fail closed.
      }
    }

    return value.includes('-----BEGIN') ? value.trim() : '';
  }

  /** Current mode (sandbox vs production). */
  isTestMode(): boolean {
    return this.config.testMode;
  }

  /** Hosted-checkout / IPC endpoint for the current mode. */
  getEndpoint(): string {
    return this.config.testMode ? MYPOS_CHECKOUT_URL_SANDBOX : MYPOS_CHECKOUT_URL_PRODUCTION;
  }

  /** Config presence WITHOUT exposing any value — for health checks/tests. */
  isConfigured(): boolean {
    return MyPOSService.missingConfigKeys(this.config).length === 0;
  }

  private requireConfig(keys: Array<keyof MyPOSConfig>, operation: string): void {
    const envName: Record<string, string> = {
      storeId: 'MYPOS_STORE_ID',
      walletNumber: 'MYPOS_WALLET_NUMBER',
      keyIndex: 'MYPOS_KEY_INDEX',
      privateKeyPem: 'MYPOS_PRIVATE_KEY',
      publicCertPem: 'MYPOS_PUBLIC_CERT',
    };
    const missing = keys.filter((key) => !this.config[key]).map((key) => envName[key as string]);
    if (missing.length > 0) {
      throw new Error(`MyPOS ${operation} requires ${missing.join(', ')} to be configured`);
    }
  }

  // ------------------------------------------
  // Signing primitives
  // ------------------------------------------

  /**
   * Build the signing base: base64 of the parameter VALUES joined by "-", in
   * the given order, with `Signature` already excluded by the caller.
   */
  static buildSignatureBase(orderedValues: string[]): string {
    return Buffer.from(orderedValues.join('-'), 'utf8').toString('base64');
  }

  /** RSA-SHA256 sign the base with the merchant private key → base64. */
  private signFields(fields: Record<string, string>): string {
    this.requireConfig(['privateKeyPem'], 'request signing');
    const base = MyPOSService.buildSignatureBase(Object.values(fields));
    return crypto.createSign('RSA-SHA256').update(base, 'utf8').sign(this.config.privateKeyPem, 'base64');
  }

  /**
   * Resolve `MYPOS_PUBLIC_CERT` into a verification key.
   *
   * FAIL-CLOSED ENFORCEMENT POINT: `verifyAndParseWebhook`'s
   * `requireConfig(['storeId', 'publicCertPem'])` call, which runs before any
   * attacker-controlled input is touched. THAT is what guarantees there is no
   * empty-key fallback and no "skip verification when unconfigured" path (the
   * defect open against paysera.service.ts as BC-QA-031-FOLLOWUP-7); change it
   * and the guarantee goes with it. Note `normalizePem` collapses unusable
   * material to `''`, so "garbage PEM" reaches `requireConfig` as "missing".
   *
   * The `if (!pem)` branch below is a REDUNDANT SECOND GUARD, not the
   * enforcement point: with the single current caller it is unreachable, and it
   * exists so that a future second caller that forgets `requireConfig` still
   * fails closed. Deleting it does not change any observable behaviour today.
   */
  private resolveVerificationKey(): crypto.KeyObject {
    const pem = this.config.publicCertPem;
    if (!pem) {
      throw new Error(
        'MyPOS webhook verification requires MYPOS_PUBLIC_CERT to be configured — refusing to accept an unverified payload'
      );
    }
    try {
      if (pem.includes('BEGIN CERTIFICATE')) {
        return new crypto.X509Certificate(pem).publicKey;
      }
      return crypto.createPublicKey(pem);
    } catch (error: any) {
      // Message only — never the PEM body.
      throw new Error(`MyPOS webhook verification key is unusable: ${error?.message || 'unparseable PEM'}`);
    }
  }

  /** Verify a base64 RSA-SHA256 signature over `base`. Never throws. */
  private verifySignatureBase(base: string, signatureB64: string, key: crypto.KeyObject): boolean {
    try {
      return crypto
        .createVerify('RSA-SHA256')
        .update(base, 'utf8')
        .verify(key, Buffer.from(signatureB64, 'base64'));
    } catch {
      return false;
    }
  }

  // ------------------------------------------
  // Amount handling (the classic money defect — see report)
  // ------------------------------------------

  /**
   * Internal amounts are MINOR units (cents) — `CreateCheckoutParams.amount`
   * documents this, and `VerifiedWebhookResult.amount` is the same unit. myPOS
   * expects MAJOR-unit decimal strings ("50.00"). Conversion is done with
   * integer arithmetic only, never `amount / 100` on a float, so no value can
   * drift (e.g. 1e-2 rounding on 1050 → "10.50", not "10.5000000001").
   *
   * ASSUMPTION: every currency BoomCard sends (BGN/EUR/USD/GBP…) is a
   * 2-decimal currency. Zero-decimal currencies (JPY) would need a per-currency
   * exponent table — none are in use today.
   */
  static minorUnitsToMajorString(minorUnits: number): string {
    if (typeof minorUnits !== 'number' || !Number.isFinite(minorUnits) || !Number.isInteger(minorUnits)) {
      throw new Error(`MyPOS amount must be an integer number of minor units (cents), got: ${minorUnits}`);
    }
    if (minorUnits < 0) {
      throw new Error(`MyPOS amount must not be negative, got: ${minorUnits}`);
    }
    const whole = Math.floor(minorUnits / 100);
    const fraction = minorUnits % 100;
    return `${whole}.${String(fraction).padStart(2, '0')}`;
  }

  /**
   * Inverse of the above for values coming off the wire ("50.00" → 5000).
   * Parsed digit-wise (no `parseFloat(x) * 100`) so no float drift; a third
   * decimal, if myPOS ever sends one, rounds half-up.
   */
  static majorStringToMinorUnits(value: string | number): number {
    const raw = String(value ?? '').trim();
    const match = /^(-)?(\d+)(?:[.,](\d+))?$/.exec(raw);
    if (!match) {
      throw new Error(`MyPOS amount is malformed: "${raw}"`);
    }
    const negative = match[1] === '-';
    const whole = Number(match[2]);
    const fractionDigits = match[3] || '';
    const firstTwo = `${fractionDigits}00`.slice(0, 2);
    let minor = whole * 100 + Number(firstTwo);
    if (fractionDigits.length > 2 && Number(fractionDigits[2]) >= 5) {
      minor += 1;
    }
    return negative ? -minor : minor;
  }

  /**
   * Make an attacker-influenced scalar safe to put in a log line or an error
   * message: control characters (log-injection newlines) stripped, length
   * capped. Used for values we must echo back for diagnosis, never for
   * credentials — those are not logged at all.
   */
  static sanitiseForLog(value: string, maxLength = 64): string {
    const cleaned = String(value ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim();
    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
  }

  /** Last 4 digits of an already-masked card number; `undefined` otherwise. */
  static extractLast4(maskedCardNumber?: string): string | undefined {
    if (!maskedCardNumber) return undefined;
    const digits = String(maskedCardNumber).replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : undefined;
  }

  // ------------------------------------------
  // PaymentProvider: createCheckout (IPCPurchase)
  // ------------------------------------------

  /**
   * Build a signed `IPCPurchase` hosted-checkout request.
   *
   * `params.amount` is in MINOR units (cents) — the same unit Paysera's
   * `CreatePaymentParams` documents — and is converted to myPOS's major-unit
   * decimal string exactly once, here.
   */
  async createCheckout(params: MyPOSCreateCheckoutParams): Promise<MyPOSCheckoutSession> {
    this.requireConfig(['storeId', 'walletNumber', 'keyIndex', 'privateKeyPem'], 'checkout creation');

    if (!params || !params.orderId || !String(params.orderId).trim()) {
      throw new Error('MyPOS checkout requires a non-empty orderId');
    }
    if (!params.currency || !String(params.currency).trim()) {
      throw new Error('MyPOS checkout requires a currency');
    }
    const wireAmount = MyPOSService.minorUnitsToMajorString(params.amount);
    if (params.amount <= 0) {
      throw new Error(`MyPOS checkout amount must be greater than zero, got: ${params.amount}`);
    }
    if (!params.callbackUrl || !params.acceptUrl || !params.cancelUrl) {
      throw new Error('MyPOS checkout requires acceptUrl, cancelUrl and callbackUrl');
    }

    const fields = this.buildPurchaseFields(params, wireAmount);
    fields.Signature = this.signFields(fields);

    const endpoint = this.getEndpoint();

    // Field NAMES only — the values include the signature.
    logger.info(
      `MyPOS checkout created: order=${params.orderId} amount=${wireAmount} ${params.currency} ` +
        `mode=${this.config.testMode ? 'TEST' : 'LIVE'} fields=[${Object.keys(fields).join(',')}]`
    );

    return {
      orderId: params.orderId,
      // `CheckoutSession.projectId` is the provider's merchant identifier; for
      // myPOS that is the Store ID (SID), mirroring Paysera's project id.
      projectId: this.config.storeId,
      amount: params.amount, // unchanged: minor units, as the internal model expects
      currency: params.currency,
      status: 'pending',
      paymentUrl: endpoint,
      createdAt: new Date(),
      formMethod: 'POST',
      formAction: endpoint,
      formFields: fields,
      wireAmount,
      isTest: this.config.testMode,
    };
  }

  /**
   * The `IPCPurchase` parameter set and its ORDER. The order IS the signature
   * (values are concatenated in insertion order), so this object's key order is
   * load-bearing — see ASSUMPTION A2 in the file header before changing it.
   */
  private buildPurchaseFields(params: MyPOSCreateCheckoutParams, wireAmount: string): Record<string, string> {
    const fields: Record<string, string> = {
      IPCmethod: 'IPCPurchase',
      IPCVersion: MYPOS_IPC_VERSION,
      IPCLanguage: MyPOSService.toIpcLanguage(params.lang),
      SID: this.config.storeId,
      WalletNumber: this.config.walletNumber,
      KeyIndex: this.config.keyIndex,
      Amount: wireAmount,
      Currency: params.currency,
      OrderID: params.orderId,
      URL_OK: params.acceptUrl,
      URL_Cancel: params.cancelUrl,
      URL_Notify: params.callbackUrl,
      CardTokenRequest: String(params.cardTokenRequest ?? 0),
      PaymentParametersRequired: PAYMENT_PARAMETERS_HOSTED_PAGE,
    };

    if (params.customerEmail) fields.CustomerEmail = params.customerEmail;
    if (params.customerName) {
      const nameParts = String(params.customerName).trim().split(/\s+/);
      fields.CustomerFirstNames = nameParts[0] || '';
      if (nameParts.length > 1) {
        fields.CustomerFamilyName = nameParts.slice(1).join(' ');
      }
    }
    if (params.customerPhone) fields.CustomerPhone = params.customerPhone;
    if (params.country) fields.CustomerCountry = params.country;
    if (params.note) fields.Note = params.note;

    // Single cart line describing the purchase. myPOS requires the cart total
    // to equal `Amount`, so Price_1/Amount_1 reuse the same converted string.
    fields.CartItems = '1';
    fields.Article_1 = params.description || params.orderId;
    fields.Quantity_1 = '1';
    fields.Price_1 = wireAmount;
    fields.Amount_1 = wireAmount;

    return fields;
  }

  static toIpcLanguage(lang?: string): string {
    if (!lang) return DEFAULT_IPC_LANGUAGE;
    const key = String(lang).trim().toUpperCase();
    if (IPC_LANGUAGE_BY_ISO639_2[key]) return IPC_LANGUAGE_BY_ISO639_2[key];
    // Already an ISO 639-1 code?
    if (/^[A-Z]{2}$/.test(key)) return key.toLowerCase();
    return DEFAULT_IPC_LANGUAGE;
  }

  // ------------------------------------------
  // PaymentProvider: verifyAndParseWebhook (IPCPurchaseNotify)
  // ------------------------------------------

  /**
   * Verify and parse an inbound `IPCPurchaseNotify`.
   *
   * Rejects (throws — never returns a partially-trusted result) when:
   *   - the payload is missing/not a flat object of scalars (malformed);
   *   - `Signature` is absent or empty;
   *   - `MYPOS_PUBLIC_CERT`/`MYPOS_STORE_ID` are not configured (FAIL CLOSED);
   *   - the RSA-SHA256 signature does not verify (wrong key, wrong signature,
   *     or any tampered field — every field except `Signature` is covered by
   *     the concatenation);
   *   - `IPCmethod` is anything other than `IPCPurchaseNotify` (case-insensitive)
   *     — a valid signature proves the SENDER, not the MESSAGE, so the
   *     browser-redirect twin `IPCPurchaseOK` and every other IPC message are
   *     refused here even though they carry a genuine myPOS signature;
   *   - the `SID` is missing or does not match `MYPOS_STORE_ID`;
   *   - `OrderID`/`IPC_Trnref` are missing (the caller's dedupe keys);
   *   - `Amount` is present but unparseable, or parses to a NEGATIVE value.
   *
   * Returns (does NOT throw) with a `logger.warn` when `Amount` or `Status` is
   * absent — `amount: 0` then means "field absent", not "observed zero", and an
   * absent `Status` maps to `'unknown'`.
   *
   * This list is maintained as EXHAUSTIVE. If you add a rejection path, add it
   * here — the omission of message type from an earlier version of this list is
   * how the `IPCPurchaseOK` gap above survived a review round.
   *
   * The caller MUST pass the parsed body unmodified and in wire order
   * (ASSUMPTION A3), and MUST apply its own durable replay guard on the
   * returned (`storeId`, `orderId`, `ipcTrnref`) — see the file header.
   */
  async verifyAndParseWebhook(payload: WebhookPayload): Promise<MyPOSVerifiedWebhookResult> {
    // Fail closed on config BEFORE looking at attacker-controlled input.
    this.requireConfig(['storeId', 'publicCertPem'], 'webhook verification');

    const fields = MyPOSService.toWireFields(payload);

    const signatureKey = Object.keys(fields).find((key) => key.toLowerCase() === 'signature');
    const signature = signatureKey ? fields[signatureKey] : '';
    if (!signatureKey || !signature.trim()) {
      logger.warn('MyPOS webhook rejected: missing Signature');
      throw new Error('MyPOS webhook rejected: missing Signature');
    }

    const signedValues: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key === signatureKey) continue;
      signedValues.push(value);
    }
    const base = MyPOSService.buildSignatureBase(signedValues);

    const key = this.resolveVerificationKey();
    if (!this.verifySignatureBase(base, signature, key)) {
      // Field names only — no signature bytes, no values.
      logger.warn(
        `MyPOS webhook rejected: signature verification failed (fields=[${Object.keys(fields).join(',')}])`
      );
      throw new Error('MyPOS webhook rejected: invalid signature');
    }

    const pick = (name: string): string | undefined => {
      const found = Object.keys(fields).find((k) => k.toLowerCase() === name.toLowerCase());
      return found === undefined ? undefined : fields[found];
    };

    // MESSAGE TYPE. A valid signature proves the payload came from myPOS; it
    // does NOT prove WHICH IPC message it is, because every IPC message is
    // signed with the same key under the same scheme. Without this check any
    // myPOS-signed message reaching the notify URL would be parsed as a
    // purchase notify.
    //
    // The concrete attack this closes: `IPCPurchaseOK` is the browser-redirect
    // twin myPOS delivers to the CUSTOMER'S OWN BROWSER at `URL_OK`, signed the
    // same way — so a customer legitimately holds a genuinely myPOS-signed
    // payload for their own order and can POST it to the public, unauthenticated
    // notify URL. myPOS "explicitly warns not to authorize off" that message
    // (BC-MYPOS-001 spike, `docs/specs/mypos-migration-design.md` §2 row 2)
    // precisely because it can precede final capture. Accepting it would credit
    // or activate off a payment state myPOS itself says is not authoritative —
    // exactly what the "trust the server callback, not the redirect" rule
    // exists to prevent.
    //
    // Runs AFTER signature verification so an unsigned payload can never reach
    // it and so the rejection reason cannot be probed without a valid signature.
    const ipcMethod = (pick('IPCmethod') || '').trim();
    if (ipcMethod.toLowerCase() !== MYPOS_NOTIFY_METHOD.toLowerCase()) {
      // Value is attacker-influenced: sanitised and truncated before logging.
      logger.warn(
        `MyPOS webhook rejected: unexpected IPCmethod "${MyPOSService.sanitiseForLog(ipcMethod)}" ` +
          `(expected ${MYPOS_NOTIFY_METHOD})`
      );
      throw new Error(
        `MyPOS webhook rejected: expected ${MYPOS_NOTIFY_METHOD}, got "${MyPOSService.sanitiseForLog(ipcMethod)}"`
      );
    }

    const sid = pick('SID');
    if (!sid || sid !== this.config.storeId) {
      logger.warn('MyPOS webhook rejected: store id (SID) mismatch');
      throw new Error('MyPOS webhook rejected: unknown store id (SID)');
    }

    const orderId = pick('OrderID');
    const ipcTrnref = pick('IPC_Trnref');
    if (!orderId || !ipcTrnref) {
      throw new Error('MyPOS webhook rejected: malformed payload (missing OrderID or IPC_Trnref)');
    }

    const rawAmount = pick('Amount');
    let amount = 0;
    if (rawAmount !== undefined && rawAmount !== '') {
      // Throws on a malformed amount rather than silently crediting 0.
      amount = MyPOSService.majorStringToMinorUnits(rawAmount);
      if (amount < 0) {
        // DELIBERATE CHOICE: throw, not warn. Reasons, in order of weight:
        //   1. This field is what the caller credits from. A negative that
        //      merely warns still reaches the caller as a number and can be
        //      written to a ledger; a throw cannot.
        //   2. A negative charge is not a valid state for a PURCHASE notify.
        //      Money moving the other way (refund/chargeback) arrives as a
        //      DIFFERENT IPC message, which the message-type check above
        //      already rejects — so within `IPCPurchaseNotify` there is no
        //      legitimate negative amount to preserve.
        //   3. It makes the inbound family consistent: malformed throws,
        //      absent warns-and-reports-0, negative throws. Previously this was
        //      the only member that passed through mute.
        // Cost, accepted knowingly: a rejection means the caller does not ack,
        // so myPOS retries. That is the right pressure — a repeated visible
        // rejection beats a silently wrong ledger entry. If sandbox observation
        // ever shows myPOS legitimately sending a negative `Amount` on a
        // purchase notify, THIS is the line to revisit (and the parser
        // `majorStringToMinorUnits` is deliberately left sign-permissive for
        // the outbound refund/status echo paths, where negatives can be real).
        logger.warn(
          `MyPOS webhook rejected: negative Amount on a purchase notify (order=${orderId})`
        );
        throw new Error('MyPOS webhook rejected: negative Amount on a purchase notify');
      }
    } else {
      // `amount: 0` here means "myPOS sent no Amount", NOT "the amount was
      // zero" — symmetric with the missing-Status warning below, because this
      // is a money field a caller might otherwise trust. A caller must compare
      // the charge it expects against its own record, never against this 0.
      logger.warn(
        `MyPOS webhook carries no Amount field (order=${orderId}) — reporting amount=0 (field absent, not observed zero)`
      );
    }

    const rawStatus = pick('Status') ?? '';
    if (rawStatus === '') {
      logger.warn(
        `MyPOS webhook carries no Status field (order=${orderId}) — mapping to 'unknown'; caller must not credit`
      );
    }

    const result: MyPOSVerifiedWebhookResult = {
      orderId,
      status: this.mapStatus(rawStatus),
      rawStatus,
      amount,
      currency: pick('Currency') || '',
      transactionId: ipcTrnref,
      paymentMethod: pick('PaymentMethod') || pick('CardType') || '',
      // myPOS has no per-payload test flag — sandbox is a separate host+SID —
      // so this reflects our own MYPOS_TEST_MODE configuration (ASSUMPTION).
      isTest: this.config.testMode,
      payerEmail: pick('CustomerEmail'),
      ipcTrnref,
      ipcMethod: pick('IPCmethod') || '',
      storeId: sid,
      statusMsg: pick('StatusMsg'),
    };

    const cardToken = pick('CardToken');
    if (cardToken) {
      // Value deliberately never logged: a card token is a payment credential.
      result.cardToken = cardToken;
    }
    const last4 = MyPOSService.extractLast4(pick('CardMask') || pick('Last4'));
    if (last4) {
      result.cardLast4 = last4;
    }

    logger.info(
      `MyPOS webhook verified: order=${result.orderId} trnref=${result.ipcTrnref} ` +
        `status=${result.rawStatus || '(none)'} (${result.status}) amount=${result.amount} ${result.currency}`
    );

    return result;
  }

  /**
   * Normalise an inbound payload to a flat, ordered `string → string` map.
   * Arrays/objects (duplicated urlencoded keys, nested JSON) are rejected as
   * malformed rather than being coerced into something signable.
   */
  private static toWireFields(payload: WebhookPayload): Record<string, string> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('MyPOS webhook rejected: malformed payload');
    }
    const entries = Object.entries(payload as Record<string, unknown>);
    if (entries.length === 0) {
      throw new Error('MyPOS webhook rejected: empty payload');
    }
    const fields: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (value === null || value === undefined) {
        throw new Error(`MyPOS webhook rejected: malformed payload (empty value for ${key})`);
      }
      if (typeof value === 'object') {
        throw new Error(`MyPOS webhook rejected: malformed payload (non-scalar value for ${key})`);
      }
      fields[key] = String(value);
    }
    return fields;
  }

  // ------------------------------------------
  // PaymentProvider: mapStatus
  // ------------------------------------------

  /** See `MYPOS_STATUS_MAP` for the table and why it is deliberately narrow. */
  mapStatus(rawStatus: string): PaymentStatus {
    if (rawStatus === undefined || rawStatus === null) return 'unknown';
    const key = String(rawStatus).trim();
    return MYPOS_STATUS_MAP[key] ?? 'unknown';
  }

  // ------------------------------------------
  // PaymentProvider: getWebhookAckResponse
  // ------------------------------------------

  /** myPOS retries the notify until it gets HTTP 200 with exactly this body. */
  getWebhookAckResponse(): string {
    return MYPOS_ACK_BODY;
  }

  // ------------------------------------------
  // PaymentProvider: payouts — NOT SUPPORTED (spike §3 NO-GO)
  // ------------------------------------------

  /**
   * Always false: myPOS exposes no merchant-initiated arbitrary-external-IBAN
   * payout API (spike §3). B2C cashback payouts stay on Paysera's Transfer API
   * per the hybrid recommendation.
   */
  isPayoutConfigured(): boolean {
    return false;
  }

  /**
   * Throws — deliberately loud, mirroring the Paysera adapter's `refund`.
   * A silent no-op here would let `wallet.service.ts` believe a cashback payout
   * had been sent when no money moved.
   */
  async createPayout(_params: CreatePayoutParams): Promise<PayoutResult> {
    throw new Error(
      'MyPOS does not support merchant-initiated payouts to external IBANs ' +
        '(IPCSendMoney is myPOS-to-myPOS only; the Banking API is read-only) — ' +
        'B2C payouts remain on the Paysera Transfer API per BC-MYPOS-001 §3. ' +
        'Do not route payouts through the MyPOS provider.'
    );
  }

  // ------------------------------------------
  // PaymentProvider: refund (IPCRefund)
  // ------------------------------------------

  /**
   * Issue a full or partial refund via `IPCRefund`.
   *
   * `amount` is in MINOR units and is REQUIRED (myPOS has no "refund all"
   * mode); `currency` must be the original transaction's currency; `orderId`
   * is a caller-supplied, retry-stable unique id for this refund request.
   * Repeated partial refunds against one `transactionId` are supported by
   * myPOS up to 100% of the original — enforcing that cap is the caller's
   * invariant, since this adapter holds no state.
   *
   * Throws when myPOS reports a non-success status, so a declined refund can
   * never be recorded as a completed one.
   */
  async refund(params: MyPOSRefundParams): Promise<MyPOSRefundResult> {
    this.requireConfig(['storeId', 'walletNumber', 'keyIndex', 'privateKeyPem'], 'refund');

    if (!params || !params.transactionId || !String(params.transactionId).trim()) {
      throw new Error('MyPOS refund requires the original transactionId (IPC_Trnref)');
    }
    if (!params.orderId || !String(params.orderId).trim()) {
      throw new Error(
        'MyPOS refund requires a caller-supplied, retry-stable orderId — ' +
          'generating one per attempt would turn a retry into a second refund'
      );
    }
    if (!params.currency || !String(params.currency).trim()) {
      throw new Error("MyPOS refund requires the original transaction's currency");
    }
    if (params.amount === undefined || params.amount === null) {
      throw new Error(
        'MyPOS refund requires an explicit amount in minor units — IPCRefund has no full-refund mode, ' +
          'so a full refund must pass the original captured amount'
      );
    }
    const wireAmount = MyPOSService.minorUnitsToMajorString(params.amount);
    if (params.amount <= 0) {
      throw new Error(`MyPOS refund amount must be greater than zero, got: ${params.amount}`);
    }

    const fields: Record<string, string> = {
      IPCmethod: 'IPCRefund',
      IPCVersion: MYPOS_IPC_VERSION,
      IPCLanguage: DEFAULT_IPC_LANGUAGE,
      SID: this.config.storeId,
      WalletNumber: this.config.walletNumber,
      KeyIndex: this.config.keyIndex,
      Amount: wireAmount,
      Currency: params.currency,
      OrderID: params.orderId,
      IPC_Trnref: params.transactionId,
      OutputFormat: 'xml',
    };
    fields.Signature = this.signFields(fields);

    logger.info(
      `MyPOS refund requested: trnref=${params.transactionId} refundOrder=${params.orderId} ` +
        `amount=${wireAmount} ${params.currency}`
    );

    const response = await this.postIpcRequest(fields, 'refund');
    const rawStatus = MyPOSService.readXmlField(response, 'Status') ?? '';
    const statusMsg = MyPOSService.readXmlField(response, 'StatusMsg');

    if (rawStatus !== MYPOS_STATUS_SUCCESS) {
      throw new Error(
        `MyPOS refund failed for trnref=${params.transactionId} (status=${rawStatus || '(none)'}` +
          `${statusMsg ? `, ${statusMsg}` : ''})`
      );
    }

    const refundTrnref = MyPOSService.readXmlField(response, 'IPC_Trnref');
    const echoedAmount = MyPOSService.readXmlField(response, 'Amount');

    const result: MyPOSRefundResult = {
      // Prefer myPOS's own reference for the refund; fall back to our request id.
      refundId: refundTrnref || params.orderId,
      status: 'success',
      rawStatus,
      statusMsg,
      originalTransactionId: params.transactionId,
    };
    if (echoedAmount !== undefined && echoedAmount !== '') {
      try {
        result.amount = MyPOSService.majorStringToMinorUnits(echoedAmount);
      } catch {
        // A malformed echo does not invalidate an accepted refund; omit it.
        logger.warn(`MyPOS refund response carried a malformed Amount for trnref=${params.transactionId}`);
      }
    }

    logger.info(`MyPOS refund accepted: refundId=${result.refundId} amount=${wireAmount} ${params.currency}`);
    return result;
  }

  // ------------------------------------------
  // Beyond the interface — needed by BC-MYPOS-005/007
  // ------------------------------------------

  /**
   * `IPCReversal` — void an authorised-but-not-yet-settled transaction in full.
   * Distinct from `refund`: reversal has no amount (all-or-nothing) and is only
   * valid before settlement. Not part of the `PaymentProvider` interface; kept
   * on the class for BC-MYPOS-005/007.
   */
  async reverse(params: MyPOSReversalParams): Promise<MyPOSReversalResult> {
    this.requireConfig(['storeId', 'walletNumber', 'keyIndex', 'privateKeyPem'], 'reversal');

    if (!params || !params.transactionId || !String(params.transactionId).trim()) {
      throw new Error('MyPOS reversal requires the original transactionId (IPC_Trnref)');
    }

    const fields: Record<string, string> = {
      IPCmethod: 'IPCReversal',
      IPCVersion: MYPOS_IPC_VERSION,
      IPCLanguage: DEFAULT_IPC_LANGUAGE,
      SID: this.config.storeId,
      WalletNumber: this.config.walletNumber,
      KeyIndex: this.config.keyIndex,
      IPC_Trnref: params.transactionId,
      OutputFormat: 'xml',
    };
    fields.Signature = this.signFields(fields);

    logger.info(`MyPOS reversal requested: trnref=${params.transactionId}`);

    const response = await this.postIpcRequest(fields, 'reversal');
    const rawStatus = MyPOSService.readXmlField(response, 'Status') ?? '';
    const statusMsg = MyPOSService.readXmlField(response, 'StatusMsg');

    if (rawStatus !== MYPOS_STATUS_SUCCESS) {
      throw new Error(
        `MyPOS reversal failed for trnref=${params.transactionId} (status=${rawStatus || '(none)'}` +
          `${statusMsg ? `, ${statusMsg}` : ''})`
      );
    }

    return {
      transactionId: params.transactionId,
      status: this.mapStatus(rawStatus),
      rawStatus,
      statusMsg,
    };
  }

  /**
   * `IPCGetTxnStatus` — out-of-band status query for one of OUR order ids.
   *
   * NOTE the name collision with `PayseraService.getPaymentStatus(status)`,
   * which is a pure code MAPPER. This one performs a network call and takes an
   * ORDER ID; the mapper on this class is `mapStatus()`.
   *
   * ASSUMPTION: the transaction's own status is read from `TxnStatus` when the
   * response carries it, otherwise from `Status`. Unconfirmed against a live
   * response; both are mapped through the same conservative `mapStatus` table.
   */
  async getPaymentStatus(orderId: string): Promise<MyPOSPaymentStatusResult> {
    this.requireConfig(['storeId', 'walletNumber', 'keyIndex', 'privateKeyPem'], 'payment status query');

    if (!orderId || !String(orderId).trim()) {
      throw new Error('MyPOS payment status query requires an orderId');
    }

    const fields: Record<string, string> = {
      IPCmethod: 'IPCGetTxnStatus',
      IPCVersion: MYPOS_IPC_VERSION,
      IPCLanguage: DEFAULT_IPC_LANGUAGE,
      SID: this.config.storeId,
      WalletNumber: this.config.walletNumber,
      KeyIndex: this.config.keyIndex,
      OrderID: orderId,
      OutputFormat: 'xml',
    };
    fields.Signature = this.signFields(fields);

    const response = await this.postIpcRequest(fields, 'status query');
    const rawStatus =
      MyPOSService.readXmlField(response, 'TxnStatus') ?? MyPOSService.readXmlField(response, 'Status') ?? '';

    const result: MyPOSPaymentStatusResult = {
      orderId,
      status: this.mapStatus(rawStatus),
      rawStatus,
      statusMsg: MyPOSService.readXmlField(response, 'StatusMsg'),
      ipcTrnref: MyPOSService.readXmlField(response, 'IPC_Trnref'),
      currency: MyPOSService.readXmlField(response, 'Currency'),
    };

    const amount = MyPOSService.readXmlField(response, 'Amount');
    if (amount !== undefined && amount !== '') {
      try {
        result.amount = MyPOSService.majorStringToMinorUnits(amount);
      } catch {
        logger.warn(`MyPOS status response carried a malformed Amount for order=${orderId}`);
      }
    }

    return result;
  }

  // ------------------------------------------
  // HTTP + XML plumbing
  // ------------------------------------------

  /**
   * POST a signed IPC request as `application/x-www-form-urlencoded` and parse
   * the XML response into a flat field map.
   *
   * The RESPONSE signature is intentionally NOT verified: unlike the inbound
   * notify (which arrives unauthenticated from the public internet), this
   * response comes back on a TLS connection WE opened to the myPOS host, so it
   * is already origin-authenticated. Treating a signature-parse quirk as a
   * failed refund would be the more dangerous failure mode here. Documented as
   * a deliberate limitation in the BC-MYPOS-003 report.
   */
  private async postIpcRequest(fields: Record<string, string>, operation: string): Promise<Record<string, string>> {
    const endpoint = this.getEndpoint();
    const body = new URLSearchParams(fields).toString();

    try {
      const response = await axios.post(endpoint, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: MYPOS_HTTP_TIMEOUT_MS,
        responseType: 'text',
        // Non-2xx must surface as an error rather than being XML-parsed.
        validateStatus: (status: number) => status >= 200 && status < 300,
      });
      return MyPOSService.parseIpcXml(typeof response.data === 'string' ? response.data : String(response.data));
    } catch (error: any) {
      // Message/status only — the request body carries a signature.
      const detail = error?.response?.status ? `HTTP ${error.response.status}` : error?.message || 'request failed';
      logger.error(`MyPOS ${operation} request failed: ${detail}`);
      throw new Error(`MyPOS ${operation} request failed: ${detail}`);
    }
  }

  /**
   * Parse a myPOS IPC XML response into a flat map of leaf fields. The document
   * root element name varies by method (`<IPCRefund>`, `<IPCReversal>`, …), so
   * the first non-declaration element is unwrapped generically.
   */
  static parseIpcXml(xml: string): Record<string, string> {
    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
    let parsed: any;
    try {
      parsed = parser.parse(xml);
    } catch (error: any) {
      throw new Error(`MyPOS response is not valid XML: ${error?.message || 'parse error'}`);
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('MyPOS response is not valid XML');
    }

    const rootKey = Object.keys(parsed).find((key) => key !== '?xml');
    const root = rootKey ? parsed[rootKey] : undefined;
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
      throw new Error('MyPOS response XML has no recognisable body');
    }

    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') continue; // nested nodes are not IPC scalars
      fields[key] = String(value);
    }
    return fields;
  }

  /** Case-insensitive read of a parsed XML field. */
  static readXmlField(fields: Record<string, string>, name: string): string | undefined {
    const key = Object.keys(fields).find((k) => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : fields[key];
  }
}

// Export singleton instance (same idiom as payseraService).
export const myposService = new MyPOSService();

/**
 * Compile-time contract pin (BC-MYPOS-003 scope note): asserts that
 * `MyPOSService` structurally satisfies `PaymentProvider` WITHOUT registering
 * it in payment-provider.ts's `PROVIDERS` map — registration/wiring is
 * BC-MYPOS-005. If the interface changes, this line fails `tsc` here.
 */
const _paymentProviderContract: PaymentProvider = myposService;
void _paymentProviderContract;

export default myposService;
