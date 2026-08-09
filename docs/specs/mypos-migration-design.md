# MyPOS Migration Design Spike (BC-MYPOS-001)

Status: research spike, no code changes. Evaluates migrating BoomCard's payment
processor from Paysera to MyPOS (developers.mypos.com).

## 1. Current Paysera integration (baseline)

Source files read for this spike:

- `backend-api/src/services/paysera.service.ts` — Checkout API (hosted
  payment page, MD5 query-string signing) + a separate Transfer/Banking API
  (MAC/HMAC-SHA256 auth) used only for B2C payouts.
- `backend-api/src/services/subscription.service.ts` (`requestTrialRefund`,
  ~L566-650) — 24h trial refund: Stripe subs get an automatic
  `stripe.refunds.create`; Paysera subs fall into a manual branch that only
  emails the user + admin ("requires manual Paysera refund") and voids
  cashback. No Paysera refund API call exists in the codebase today.
- `backend-api/src/services/wallet.service.ts` (`executePayoutTransfer`,
  ~L1004-1278) — B2C cashback payouts. Builds a Paysera Transfer API
  `POST /transfers` with an arbitrary `beneficiaryIban` (any bank, not just
  Paysera accounts), an `idempotencyKey` (`walletId-withdrawalTxId`) header,
  then `PUT /transfers/:id/reserve` with `auto_process_to_done: true`. A
  callback (`/api/payments/transfer-callback`) confirms final status.
- `backend-api/src/jobs/paysera-renewal.ts` — because "Paysera Checkout does
  not support automated recurring charges (unlike Stripe)" (file's own
  header comment), this job never charges anyone. It only manages the
  lifecycle around a renewal that must happen manually: pause an
  expired ACTIVE sub for a 7-day grace window (autoRenewal=false), or move an
  autoRenewal=true sub straight to `FAILED_PAYMENT` with **no retry** (spec
  §4.2 v1.1, since Paysera can't attempt the charge itself).
- `backend-api/src/services/subscriptionGate.ts` does not exist in this repo
  (checked; no Paysera/gating references found under that name) — not
  relevant to this spike.

Webhook/signature scheme actually in use today (`paysera.service.ts` +
`payments.paysera.routes.ts`):

- **Checkout callbacks** (`/api/payments/callback`,
  `/api/payments/subscription/callback`): Paysera POSTs/GETs
  `data` (URL-safe base64 of a URL-encoded query string) + `ss1` (MD5 of
  `data + signPassword`). `ss2` (an RSA signature) is present but explicitly
  **not verified** — the code relies on `ss1` alone. Idempotency is
  home-grown: the callback handler checks "already credited" state in the DB
  before crediting, and Paysera itself retries the callback until it gets
  back the literal string `"OK"`.
- **Transfer (payout) callbacks** (`/api/payments/transfer-callback`):
  authenticated via a MAC scheme (`ts`, `nonce`, HMAC-SHA256 over a
  normalized string, plus a body-hash `ext`) *and* a per-payout shared
  `secret` query param stored in `walletTransaction.metadata.callbackSecret`
  — defense in depth beyond the MAC alone.
- Env vars in use today (grepped `PAYSERA_` across `src/`):
  `PAYSERA_PROJECT_ID`, `PAYSERA_SIGN_PASSWORD`, `PAYSERA_TEST_MODE`,
  `PAYSERA_TRANSFER_CLIENT_ID`, `PAYSERA_TRANSFER_MAC_KEY`,
  `PAYSERA_ACCOUNT_NUMBER`. No `MYPOS_*` vars exist anywhere in the repo
  today (grepped, zero hits) — this is a clean-slate integration.
- Schema: `Subscription.payseraOrderId` (`String? @unique`, indexed) is the
  join key between our subscription rows and Paysera's order references
  (`prisma/schema.prisma` L653, L672; a second `payseraOrderId` unique field
  also exists on what appears to be a pending-checkout model at L1612).

## 2. Per-flow mapping: Paysera → MyPOS

| # | Paysera flow (today) | MyPOS equivalent | Status |
|---|---|---|---|
| 1 | Checkout API `createPayment` — hosted redirect page, MD5-signed query string (subscription checkout, anonymous checkout, wallet top-up) | **Checkout API**, `IPCPurchase` — hosted payment page (`https://www.mypos.com/vmp/checkout` in prod, `.../checkout-test` in sandbox); request is a set of POST fields ending in a `Signature` field (SHA-256, not MD5) | **Supported** — same shape (redirect-based hosted checkout), different signing primitive |
| 2 | Webhook: `data`+`ss1` MD5 callback, home-grown DB-state idempotency, must return `"OK"` | `IPCPurchaseNotify` — server-to-server POST with `IPCmethod`, `SID`, `Amount`, `Currency`, `OrderID`, `IPC_Trnref`, `RequestSTAN`, `RequestDateTime`, `Signature` (base64 SHA-256, documented as "always the last parameter"); merchant must return HTTP 200 with body `"OK"`. myPOS explicitly warns not to authorize off the browser-redirect twin (`IPCPurchaseOK`) — same "don't trust the redirect, trust the server callback" pattern Paysera already follows here. | **Supported**, structurally near-identical to what's already built — but see gap G1 below (retry/idempotency semantics not documented, must assume "at least once" and keep the existing DB-state dedupe pattern) |
| 3 | No card tokenization today — renewals are manual because Checkout can't auto-charge | **Card tokenization**: `IPCPurchase` with `CardTokenRequest=2` (pay + store) returns a `CardToken` on the Notify callback; later merchant-initiated charges use `IPCIAPurchase` with that `CardToken` — no customer redirect, no 3DS re-challenge. Separately, `IPCIAStoreCard` can register a card directly from a merchant app without payment, but the docs describe raw card details as "collected and submitted to myPOS Checkout API by the external app" — i.e. the merchant's app/backend touches the PAN directly, which is materially higher PCI-DSS scope (SAQ D-ish) than the hosted-redirect `IPCPurchase`+token path (SAQ A). | **Supported, and this is the actual fix for the manual-renewal problem** — recommend `IPCPurchase(CardTokenRequest=2)` at initial subscription checkout (keeps PCI scope at SAQ A, same as today's hosted-redirect flow) + `IPCIAPurchase` inside `paysera-renewal.ts`'s replacement job to actually attempt an automated charge instead of pausing/expiring. Do **not** use `IPCIAStoreCard` — it would pull raw PANs into BoomCard's own stack. |
| 4 | No refund API call in code — `requestTrialRefund` just emails the user/admin for manual processing on Paysera | `IPCRefund` — `SID`, `KeyIndex`, `Amount`, `Currency`, `Trnref` (original transaction ref), `OrderID` (new unique request id), `Signature`; returns an XML result | **Supported, and better than the current state** — MyPOS can close the trial-refund gap that Paysera never did (`requestTrialRefund`'s Paysera branch could call `IPCRefund` instead of emailing an admin) |
| 5 | Transfer API `POST /transfers` → arbitrary external `beneficiaryIban`, any bank, MAC-authenticated, `auto_process_to_done` | See dedicated section below | **UNSUPPORTED as documented — critical, see §3** |
| 6 | N/A | Sandbox test mode | **Supported** — publicly documented fixed sandbox credentials (Store ID/SID `000000000000010`, wallet number, key index, and a matching test RSA keypair/certificate bundle) at a dedicated `checkout-test` host; no live approval needed to start integration testing |

## 3. Critical open question: B2C cashback payouts to arbitrary external IBANs

This is the flow `wallet.service.ts:executePayoutTransfer` implements today
via Paysera's Transfer API, and it is the single biggest blocker to a full
migration.

**What the myPOS docs actually say:**

- The only outbound-money API surfaced anywhere in the developer portal is
  **`IPCSendMoney`** ("More APIs" / Online Payments v1.4). Its own
  description states it is for sending money *"internally to another myPOS
  account"* — the documented use case is merchant-to-merchant split
  payments within myPOS, and the feature is gated behind a manual approval
  email to `online@mypos.com` even for that internal use case. There is no
  documented parameter for an external IBAN/beneficiary bank account on this
  call.
- The **Banking API** (`developers.mypos.com/apis/banking`) is read-only:
  account details/IBAN/balance, transaction history, statement downloads.
  Its own page explicitly does not document any transfer/payout/payment-
  initiation endpoint.
- The **PSD2 API** (AISP/PISP) supports "cross border and SEPA payments"
  through a `PaymentId`-based flow where a PSU (the end customer, not the
  merchant) is redirected to authenticate and authorize a payment *from
  their own external bank account*. That is the shape of a "pay by bank"
  checkout alternative (customer pushes money **to** the merchant), not a
  mechanism for a merchant to push money **out** to an arbitrary third-party
  IBAN it doesn't control. Even if it technically supports outbound legs
  under the hood, there is no documented merchant-initiated payout use case
  or endpoint for it, and PISP flows require a live end-user consent
  redirect per payment, which does not fit a backend batch/automatic payout
  job at all.
- No `developers.mypos.com` page documents a merchant-initiated "pay this
  arbitrary external bank account" call comparable to Paysera's
  `POST /transfers` (which takes a free-form `beneficiary.bank_account.iban`
  and any beneficiary name).

**Go/No-Go recommendation: NO-GO on migrating the payout flow as-is.**
Based on everything publicly documented at developers.mypos.com, MyPOS does
not expose a general-purpose "send money to any external IBAN" API. The one
outbound-transfer primitive that exists (`IPCSendMoney`) is scoped to
myPOS-to-myPOS transfers and is not documented to accept an arbitrary
external beneficiary account. Recommend option **(a) hybrid approach**:
keep Paysera's Transfer/Banking API (MAC-authenticated `POST /transfers` +
`/reserve`) as the payout rail for `wallet.service.ts:executePayoutTransfer`
indefinitely, while migrating Checkout/subscription/refund/renewal flows to
MyPOS. This is not an unusual shape — nothing in `paysera.service.ts`
couples the Checkout API and the Transfer API together; they are already
separate credential sets (`PAYSERA_PROJECT_ID`/`PAYSERA_SIGN_PASSWORD` vs.
`PAYSERA_TRANSFER_CLIENT_ID`/`PAYSERA_TRANSFER_MAC_KEY`/
`PAYSERA_ACCOUNT_NUMBER`) and separate callback routes already, so a hybrid
split is a small incremental change, not an architectural fork.

If a full migration off Paysera (including payouts) is still wanted, option
**(b)** — what a redesign would need — is: (1) a confirmed answer from myPOS
sales/integration support on whether any product tier of theirs supports
merchant-initiated arbitrary-external-IBAN payouts (the public docs do not
rule this out for an enterprise/negotiated tier, they just don't document
it for a self-serve integration), or (2) bolting on a third-party SEPA
payout rail (e.g. a licensed EMI/PI provider with a proper batch payout
API) purely for the cashback-payout leg, keeping MyPOS for everything else.
Either sub-option is out of scope for this spike and needs a direct
conversation with myPOS (see Open questions below) before any commitment.

## 4. Sandbox / test-mode environment variables

Naming below follows the existing `PAYSERA_*` convention in this repo
(structural description only — no literal secret values, since none were
issued/exist for this spike):

| Env var | Purpose |
|---|---|
| `MYPOS_STORE_ID` | The merchant Store ID (SID) issued by myPOS; identifies the merchant account to the Checkout API, analogous to `PAYSERA_PROJECT_ID`. |
| `MYPOS_WALLET_NUMBER` | The myPOS wallet/account number tied to the store, used in some Checkout API request bodies. |
| `MYPOS_KEY_INDEX` | Index of the active signing keypair (myPOS supports key rotation via multiple indexed keys). |
| `MYPOS_PRIVATE_KEY` | RSA private key (PEM) used to sign outgoing `IPCPurchase`/`IPCRefund`/etc. requests — the SHA-256-signature counterpart to `PAYSERA_SIGN_PASSWORD`. Store as a secret (e.g. base64-encoded PEM in the secret manager), never inline. |
| `MYPOS_PUBLIC_CERT` | myPOS's public certificate used to verify inbound `IPCPurchaseNotify` signatures. |
| `MYPOS_TEST_MODE` | Boolean flag selecting the sandbox host (`checkout-test`) vs. production Checkout host — mirrors `PAYSERA_TEST_MODE`. |
| `MYPOS_TRANSFER_*` (conditional) | Only needed if the go/no-go above is later reversed for payouts (§3 option b) or if myPOS confirms a payout-capable API exists; placeholder naming, real shape unknown until confirmed. |
| `MYPOS_WEBHOOK_URL_NOTIFY` | Not a secret, but worth calling out: MyPOS's docs require the Notify URL to be HTTPS-only, same constraint as Paysera's `callbackUrl` today — no new infra needed, just a new route path (e.g. `/api/payments/mypos/callback`) alongside the existing Paysera one during the migration window. |

## 5. Migration / cutover plan for in-flight Paysera subscriptions

`Subscription.payseraOrderId` (`prisma/schema.prisma` L653/L672, plus a
second unique `payseraOrderId` field on a pending-checkout-adjacent model at
L1612) is the join key that ties a subscription row to its Paysera order.
Any migration must keep every existing row resolvable by that key for the
lifetime of the subscription (renewal reminders, refund lookups, admin
search all filter by it — see `subscriptions.routes.ts`,
`adminSubscriptions.routes.ts`, `pending-checkout.routes.ts`).

Recommended sequencing (dual-run, not a big-bang cutover):

1. **Build MyPOS Checkout support additively.** Add a `myposOrderId` column
   (nullable, unique, indexed — mirrors `payseraOrderId`) to `Subscription`
   rather than repurposing `payseraOrderId`. Add the MyPOS service/routes
   alongside `paysera.service.ts`/`payments.paysera.routes.ts`, not in place
   of them. A subscription row is Paysera-backed if `payseraOrderId` is set
   and MyPOS-backed if `myposOrderId` is set — never both.
2. **New checkouts only, behind a flag.** Route brand-new subscription/
   top-up/anonymous checkouts to MyPOS's `IPCPurchase` once sandbox
   integration is verified end-to-end (purchase → notify → activation, plus
   `IPCPurchase(CardTokenRequest=2)` for the renewal-token flow). Existing
   `payseraOrderId` rows are untouched and keep renewing/refunding through
   Paysera exactly as `paysera-renewal.ts` and `requestTrialRefund` do
   today.
3. **Replace the manual-renewal job for MyPOS-originated subs only.** Write
   the MyPOS equivalent of `paysera-renewal.ts` so that, for rows with
   `myposOrderId` set, it actually attempts `IPCIAPurchase` against the
   stored `CardToken` at `currentPeriodEnd` instead of pausing/expiring —
   this is the concrete fix for the "Paysera Checkout does not support
   automated recurring charges" limitation called out in that file's
   header comment. Paysera-originated rows keep the existing
   pause-then-expire behavior unchanged (no card token exists for them to
   auto-charge with).
4. **Do not migrate live Paysera subscriptions to MyPOS mid-cycle.** There
   is no way to retroactively obtain a MyPOS `CardToken` for a card that was
   only ever entered on Paysera's hosted page — the customer would have to
   re-enter card details once, which is a real behavior change. Instead let
   every existing Paysera subscription run out its natural lifecycle
   (renew manually as today, or lapse) on Paysera; only *new* subscriptions
   and *renewals of already-lapsed* subscriptions start fresh on MyPOS.
   This avoids needing a bulk "re-tokenize N thousand cards" migration
   step entirely.
5. **Keep the payout rail on Paysera indefinitely** (§3 recommendation) —
   `wallet.service.ts:executePayoutTransfer` continues calling
   `payseraService.createTransfer`/`reserveTransfer` regardless of which
   processor a given subscription's *checkout* went through, since payouts
   are keyed off the user/wallet, not the subscription's origin processor.
   This means `PAYSERA_TRANSFER_CLIENT_ID`/`PAYSERA_TRANSFER_MAC_KEY`/
   `PAYSERA_ACCOUNT_NUMBER` stay in production use even after Checkout
   traffic fully moves to MyPOS.
6. **Sunset Paysera Checkout only after the last `payseraOrderId` row has
   terminated** (CANCELLED/EXPIRED/refunded) — monitor via the same
   `adminSubscriptions.routes.ts` filters already built for `payseraOrderId`
   search. Given BoomCard's own renewal cadences (weekly/monthly/yearly),
   expect the long pole to be yearly Paysera subscribers, so plan for the
   Paysera Checkout credentials/route to stay live for up to ~12 months
   after cutover starts, even though most volume moves over much sooner.
7. **Trial-refund parity check before flipping the flag in step 2**: since
   MyPOS's `IPCRefund` can actually be called (unlike the current
   Paysera manual-email branch), implement and verify it for MyPOS-
   originated subscriptions as part of the same cutover, not as a later
   follow-up — otherwise the new processor ships with the same manual-
   refund gap it was supposed to close.

## 6. Sources

Fetched/consulted directly during this spike (developers.mypos.com and one
support subdomain):

- https://developers.mypos.com/apis — API catalog overview
- https://developers.mypos.com/apis/checkout-api/checkout-getting-started — Checkout API getting-started
- https://developers.mypos.com/en/doc/online_payments/v1_4/20-api-reference — Online Payments (Checkout) API v1.4 method reference / call list
- https://developers.mypos.com/en/doc/online_payments/v1_4/22-api-call--ipcpurchasenotify-/-ipcpurchaseok — IPCPurchaseNotify / IPCPurchaseOK signature & payload
- https://developers.mypos.com/en/doc/online_payments/v1_4/182-ipcpurchasenotify — IPCPurchaseNotify reference
- https://developers.mypos.com/en/doc/online_payments/v1_4/225-recurring-payments — Recurring payments / card tokenization (CardTokenRequest, IPCIAPurchase)
- https://developers.mypos.com/en/doc/online_payments/v1_4/226-test-data — Sandbox test credentials (SID, wallet number, key index, test keypair) and sandbox host
- https://developers.mypos.com/en/doc/online_payments/v1_4/26-api-call--ipcrefund — IPCRefund parameters
- https://developers.mypos.com/en/doc/online_payments/v1_4/80-api-call--ipcsendmoney — IPCSendMoney (myPOS-to-myPOS transfer, gated feature)
- https://developers.mypos.com/en/doc/online_payments/v1_4/41-api-call--ipciastorecard — IPCIAStoreCard (in-app card storage; raw PAN touches merchant app)
- https://developers.mypos.com/apis/psd2-api — PSD2 (Open Banking / AISP / PISP) overview
- https://developers.mypos.com/apis/banking — Banking API (read-only account/transaction/statement access)
- https://help.mypos.com/hc/en-gb/articles/9879353987869-How-to-make-a-bank-transfers — myPOS Support: manual bank-transfer instructions (consumer UI, not an API — cited only to confirm outbound transfer exists as a *product* feature, just not as a documented merchant API)

## 7. Open questions / gaps

Everything below could not be fully verified from the public
developers.mypos.com documentation (behind a merchant login, undocumented,
contradictory across pages, or requires a direct conversation with myPOS):

- **Payout API existence for non-enterprise accounts.** The public docs
  document `IPCSendMoney` as myPOS-to-myPOS only, but they explicitly note
  it requires manual approval by emailing `online@mypos.com` — it's
  possible a negotiated/enterprise account unlocks a broader external-IBAN
  transfer capability that isn't in the self-serve docs at all. This needs
  a direct question to myPOS integration support before the §3 NO-GO can be
  treated as fully final rather than "final based on public docs."
- **PSD2/PISP as a payout mechanism.** Could not determine from the docs
  whether the PISP payment-initiation flow can, in principle, be driven
  merchant-side with the *merchant's own* myPOS wallet as the debtor
  account and an arbitrary external IBAN as creditor (rather than the
  documented PSU-authorizes-from-their-own-account shape). If so it might
  technically move money out, but it would still require a live
  authentication redirect per payment, which is a poor fit for a backend
  payout batch job regardless.
- **IPCPurchaseNotify idempotency/retry contract.** The docs describe the
  notify payload and the required `"OK"` response, but never state whether
  myPOS retries on non-OK response, how many times, at what backoff, or
  whether a webhook is ever redelivered after a prior "OK" was already
  acknowledged (Paysera's callback route already has to guard against
  exactly this scenario with a DB "already credited" check — see
  `payments.paysera.routes.ts` L288-304). Must assume "at least once,
  design for it" until confirmed, same defensive posture already used for
  Paysera.
- **Full IPCRefund partial-refund and multi-refund semantics.** Confirmed
  the call exists and its request parameters, but did not verify from the
  docs whether multiple partial refunds against one `Trnref` are supported
  or whether it's single-shot full/partial-once, which matters for exact
  trial-refund parity with the current Stripe path.
- **"Managing Webhooks" page (`more_apis/v1_0/5-managing-webhooks`) 404'd**
  on direct fetch during this spike — only reachable via search-result
  snippet, which described a separate `webhook-api.mypos.com` REST-style
  webhook-registration system that appears to belong to the newer
  Banking/Identity APIs rather than the Checkout API's IPC callback scheme.
  Could not confirm whether Checkout notifications ever migrate to that
  newer system or stay on the classic `IPCPurchaseNotify` POST scheme
  indefinitely.
- **PCI-DSS scope delta for `IPCIAStoreCard`.** Flagged in §2 row 3 that
  this call has the merchant app collecting raw card data directly (unlike
  the hosted-redirect `IPCPurchase` token flow) — this spike did not pull
  myPOS's own PCI compliance/SAQ guidance, so the actual required SAQ level
  and any additional certification burden on BoomCard is unconfirmed.
  Recommend explicitly avoiding `IPCIAStoreCard` (use the hosted-redirect
  tokenization path instead) regardless, since it costs nothing to avoid
  raw-PAN handling and the downside if unconfirmed is potentially large.
- **`MYPOS_TRANSFER_*` env var shape** in §4 is a placeholder, not a real
  proposal — it depends entirely on the outcome of the first open question
  above (payout API existence for BoomCard's account tier) and should not
  be treated as a naming commitment.

This is a research spike with no code changes — the items above are gaps in
third-party (myPOS) documentation, not defects in BoomCard's own code, so
none of them are follow-up tasks against this repo. They are inputs for
whoever scopes the actual implementation task(s): the myPOS-support
questions (payout API existence, PISP-as-payout, notify retry contract,
refund semantics, webhook-system migration) need direct answers from myPOS
before implementation starts, and the one concrete design recommendation
this spike produces — do not build against `IPCIAStoreCard`, use the
hosted-redirect tokenization path instead — is stated as guidance in §2/§7
for that future implementation task, not as a fix to existing code (no
MyPOS integration code exists yet in this repo).
