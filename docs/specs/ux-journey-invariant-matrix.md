# UX Journey Invariant Matrix (BC-UX-E2E-REAUDIT)

End-to-end **browser** journey invariants for the boomcard.bg web flows served by
`partner-dashboard` (subscriber onboarding + partner application), plus cross-cutting
UX classes applied per page. Each row states EXPECTED behavior derived from the route
inventory in `partner-dashboard/src/App.tsx`, the page components, and the backend
routes — it does NOT record current pass/fail (that lives in the audit ledger,
`.claude/reviews/BC-UX-E2E-REAUDIT-coverage-ledger.md` in the harness workspace).

IDs are stable — never renumber; append new rows at the end of each section.

Verification column references the class sweeps in `partner-dashboard/tests/e2e/`:
- `blank-sweep` = `ux-blank-page-sweep.spec.ts`
- `auto-sweep` = `ux-autocomplete-sweep.spec.ts`
- `parity-sweep` = `ux-locale-parity-sweep.spec.ts`
- `render-sweep` = `ux-locale-render-sweep.spec.ts`
- `manual` = manual browser step (described inline)

Run: `npm run test:ux-sweeps` in `partner-dashboard/` (env `BASE_URL`, default `http://localhost:5273`).

---

## A. Subscriber onboarding journey

### A1. Plan selection

| ID | Journey step | Invariant | How to verify |
|---|---|---|---|
| UXJ-001 | Plan selection | Homepage `/#subscription-plans` renders the seeded plans (BASIC, PREMIUM) with localized name (`displayName`/`displayNameBg`) and a real price per billing period. | manual: load `/`, scroll to plans section in BG and EN |
| UXJ-002 | Plan selection | Each plan card CTA navigates to `/checkout` carrying a plan identifier (`planId` or `planCode`) and `billing` period in the query string. | manual: click each plan CTA, inspect resulting URL |
| UXJ-003 | Plan selection | `/pricing` and `/subscriptions` present the same plan data with a working path into checkout (no dead-end pricing page). | manual + blank-sweep (renders content) |
| UXJ-004 | Plan selection | A billing period a plan does not offer (e.g. `hasWeekly:false`) is never purchasable: no `€0.00`/`0,00` price and no enabled Pay button anywhere. | manual: `/checkout?planCode=BASIC&billing=weekly` |
| UXJ-005 | Plan selection | `/checkout` with no plan parameter renders an explicit localized "no plan selected" error state with a back-to-plans link — never a blank body. | blank-sweep (route `/checkout`) + manual |
| UXJ-006 | Plan selection | `/checkout?planCode=BASIC&billing=monthly` resolves the plan via `GET /api/plans/code/:code` and renders an order summary whose plan name and price match the API payload. | manual |
| UXJ-007 | Plan selection | `/checkout` with an unknown `planCode`/`planId` renders an explicit localized error state + back link (no spinner-forever, no blank). | manual: `/checkout?planCode=NOPE` |

### A2. Guest checkout form

| ID | Journey step | Invariant | How to verify |
|---|---|---|---|
| UXJ-008 | Guest checkout | Unauthenticated checkout shows the guest form: First name*, Last name*, Email*, Phone (optional), each with a visible localized label tied to its input. | auto-sweep (checkout page) + manual |
| UXJ-009 | Guest checkout | Guest inputs carry correct `autocomplete` attributes: `given-name`, `family-name`, `email`, `tel`. | auto-sweep |
| UXJ-010 | Guest checkout | Submitting the empty guest form shows per-field validation messages in the selected language (BG: "Задължително поле" / EN: "Required"). | manual, both languages |
| UXJ-011 | Guest checkout | Invalid email format shows a localized inline error; submission is blocked. | manual |
| UXJ-012 | Guest checkout | On failed validation, the first invalid field is scrolled into view and/or focused. | manual (error-visibility class, see UXJ-064) |
| UXJ-013 | Guest checkout | "Already have an account? Log in" preserves the in-progress checkout (pathname + plan/billing search params) via router state and returns the user to the same checkout after login. | manual |

### A3. Payment initiation

| ID | Journey step | Invariant | How to verify |
|---|---|---|---|
| UXJ-014 | Payment initiation | Valid guest submit calls `POST /api/.../subscriptions/anonymous` (createAnonymousSubscriptionPayment) and redirects the browser to the returned provider `paymentUrl`. | manual (stop at redirect; Paysera is dummy-test mode) |
| UXJ-015 | Payment initiation | Each 409 conflict code (`EMAIL_ALREADY_HAS_ACTIVE_PLAN`, `EMAIL_REGISTERED_NO_ACTIVE_PLAN`, `CHECKOUT_ALREADY_IN_PROGRESS`) renders a distinct, localized, actionable message (sign-in link where applicable). | manual with seeded conflict user |
| UXJ-016 | Payment initiation | Non-409 API failure shows a localized error and re-enables the Pay button (no permanently stuck "Redirecting…" spinner). | manual (backend stopped or forced 500) |
| UXJ-017 | Payment initiation | While a payment request is in flight the Pay button is disabled and shows a localized redirecting state (double-submit protection). | manual |

### A4. Post-payment confirmation

| ID | Journey step | Invariant | How to verify |
|---|---|---|---|
| UXJ-018 | Confirmation | `/subscription/success` renders explicit localized confirmation content (incl. what-happens-next: activation email) even when query params are missing/garbage — never blank. | blank-sweep + manual |
| UXJ-019 | Confirmation | `/subscription/cancel` renders an explicit localized cancelled state with a retry/back-to-plans next step. | blank-sweep + manual |
| UXJ-020 | Confirmation | `/payments/success` and `/payments/cancel` render explicit localized content with a working next-step link. | blank-sweep + manual |

### A5. Complete profile / set password

| ID | Journey step | Invariant | How to verify |
|---|---|---|---|
| UXJ-021 | Complete profile | `/complete-profile` without `token` renders an explicit localized "invalid link" state with a Go-to-Login action — not the form, not blank. | blank-sweep + manual |
| UXJ-022 | Complete profile | `/complete-profile?token=…` renders the set-password form: Password + Confirm Password, both labelled, both `autocomplete="new-password"`. | auto-sweep + manual |
| UXJ-023 | Complete profile | Client-side password policy matches backend (min 8, upper, lower, digit, special; confirm must match) with localized error messages. | manual, both languages |
| UXJ-024 | Complete profile | Marketing consents (email, phone) are two separate checkboxes, unchecked by default, clearly optional. | manual (consent class, see UXJ-078) |
| UXJ-025 | Complete profile | A visitor with an existing session token is redirected to `/dashboard` WITHOUT consuming the activation token or clobbering stored tokens. | manual: set token in localStorage, visit link |
| UXJ-026 | Complete profile | Backend 409 (account exists) renders a localized account-exists message with a working `/login` link. | manual |

### A6. Activation success / first login

| ID | Journey step | Invariant | How to verify |
|---|---|---|---|
| UXJ-027 | Activation success | After successful activation the success screen ("Account Created") gives a working next step appropriate to the subscriber device class (CTA to the mobile app / mobile.boomcard.bg) — no dead end, no redirect loop into the partner dashboard. | manual |
| UXJ-028 | First login | `/login` renders labelled Email (`autocomplete="email"`) and Password (`autocomplete="current-password"`) inputs, fully localized. | auto-sweep + render-sweep |
| UXJ-029 | First login | Logging in with a USER-role subscriber account never lands in a blank page or a `PartnerStatusRoute` redirect loop; the user gets an explicit destination or message. | manual with qa-sweep-*@example.test user |

### A7. Subscription management

| ID | Journey step | Invariant | How to verify |
|---|---|---|---|
| UXJ-030 | Subscription mgmt | `/subscription` as guest redirects to `/login` (never renders a blank or half-rendered page) and returns to `/subscription` after successful login. | manual |
| UXJ-031 | Subscription mgmt | `/subscription` for an authenticated USER shows current plan, status, renewal date and management actions (cancel/reactivate/retry) fully localized; admin accounts are kept out (requiredRole="user"). | manual |

---

## B. Partner application journey

| ID | Journey step | Invariant | How to verify |
|---|---|---|---|
| UXJ-032 | Partner form | `/register/partner` renders the full application form with every field's label programmatically associated (`htmlFor`/`id`), in the selected language. | auto-sweep + render-sweep + manual |
| UXJ-033 | Partner form | Personal fields carry correct autocomplete: `given-name`, `family-name`, `email`, `tel`; business fields carry appropriate tokens (`organization` for company name) or explicit opt-out where none fits. | auto-sweep |
| UXJ-034 | Partner validation | Required-field and format validation fires on blur/submit with localized messages; submit is blocked while invalid. | manual, both languages |
| UXJ-035 | Partner validation | Terms and Privacy Policy are TWO separate required consents (spec §2.3); submit is blocked until both are checked, each with its own localized error. | manual |
| UXJ-036 | Partner submit | Backend duplicate email/phone errors scroll the offending field (`#email` / `#phone`) into view with a localized message. | manual |
| UXJ-037 | Partner confirmation | Successful submit renders an explicit confirmation state telling the applicant what happens next (review + activation email) — no dead end. | manual |
| UXJ-038 | Partner activation | `/partner/activate` without/with an invalid token renders an explicit localized invalid-link state (never blank, never a silent redirect). | blank-sweep + manual |
| UXJ-039 | Partner activation | `/partner/activate` with a valid token completes activation (password set where applicable) and hands the partner to `/login` or `/dashboard` with a working session. | manual with seeded partner token |
| UXJ-040 | Partner form | The third §2.3 consent item (marketing) is optional and unchecked by default. | manual |

---

## C. Cross-cutting class: (a) Localization

Class-wide sweeps plus per-page rows for the journey pages.

| ID | Page / scope | Invariant | How to verify |
|---|---|---|---|
| UXJ-041 | all locale files | `en.ts` and `bg.ts` key sets are identical in both directions (every EN key has a BG key and vice versa, recursively). | parity-sweep |
| UXJ-042 | all locale files | `translations-phase2-4.ts` and `translations-phase5.ts` EN/BG exports have identical key sets in both directions. | parity-sweep |
| UXJ-043 | every public route | With `boomcard_language=bg`, page body renders Cyrillic text and `<html lang>` is `bg`. | render-sweep |
| UXJ-044 | every public route | With BG selected, no `en.ts` dictionary value that HAS a differing BG translation appears verbatim in the rendered body (no untranslated leak-through). | render-sweep |
| UXJ-045 | every public route | With EN selected, no BG-only dictionary value appears in the rendered body (inverse spot-check) and `<html lang>` is `en`. | render-sweep |
| UXJ-046 | every public route | No `Translation key not found:` runtime warnings are emitted while rendering in either language (every referenced key exists). | render-sweep (console capture) |
| UXJ-047 | /checkout | All checkout strings (labels, buttons, order summary, error/conflict messages) render in the selected language. | render-sweep + manual |
| UXJ-048 | /register/partner | All partner-form strings incl. validation messages render in the selected language. | render-sweep + manual |
| UXJ-049 | /complete-profile | All set-password strings incl. policy errors render in the selected language. | render-sweep + manual |
| UXJ-050 | /login, /forgot-password | All auth-page strings incl. API-error toasts render in the selected language. | render-sweep + manual |
| UXJ-051 | success/cancel pages | `/subscription/success|cancel`, `/payments/success|cancel` render fully in the selected language. | render-sweep |
| UXJ-052 | language persistence | Language choice persists to `localStorage['boomcard_language']`, survives reload and in-app navigation, and sets `document.documentElement.lang`. | render-sweep (mechanism) + manual |
| UXJ-053 | language via URL | `?lang=en|bg` overrides and persists the language, then is stripped from the URL. | manual |
| UXJ-054 | API error surfaces | API error messages surfaced to the user (toasts, inline alerts) are localized — raw backend English strings are not shown verbatim to BG users where a dictionary entry exists. | manual on checkout/register error paths |

---

## D. Cross-cutting class: (b) Form semantics

| ID | Page / scope | Invariant | How to verify |
|---|---|---|---|
| UXJ-055 | every public route | Every VISIBLE `input[type=text|email|tel|password]` has a non-empty `autocomplete` attribute. | auto-sweep |
| UXJ-056 | every public route | Every such input has an accessible label: `<label htmlFor>`/wrapping label, `aria-label`, or `aria-labelledby` (placeholder alone is not a label). | auto-sweep (label check) |
| UXJ-057 | every public form | Semantic types are correct: email fields `type=email`, phone `type=tel`, passwords `type=password`. | auto-sweep pages + manual |
| UXJ-058 | /checkout guest form | Guest fields specifically: `given-name`, `family-name`, `email`, `tel`. | auto-sweep |
| UXJ-059 | /complete-profile | Both password fields `autocomplete="new-password"`. | auto-sweep |
| UXJ-060 | /login | `email` + `current-password`; 2FA code field `one-time-code`. | auto-sweep + manual (2FA step) |

---

## E. Cross-cutting class: (c) No-blank-page

| ID | Page / scope | Invariant | How to verify |
|---|---|---|---|
| UXJ-061 | every public route | Every public/guest route renders non-trivial visible body text (>40 chars) — content or an explicit localized error/empty state, never an empty body or eternal spinner. | blank-sweep |
| UXJ-062 | every public route | Loading a public route as guest produces no uncaught page errors and no console messages of severity `error`. | blank-sweep (console capture) |
| UXJ-063 | unknown routes | Any unknown path renders `NotFoundPage` with visible localized content and a link home. | blank-sweep (probe route) |

---

## F. Cross-cutting class: (d) Error visibility

| ID | Page / scope | Invariant | How to verify |
|---|---|---|---|
| UXJ-064 | /checkout guest form | Failed submit scrolls/focuses the FIRST invalid field; error text is visually adjacent to the field. | manual |
| UXJ-065 | /register/partner | Same first-invalid-field scroll/focus behavior on client validation AND on backend field errors. | manual |
| UXJ-066 | /complete-profile | Same behavior for password policy / mismatch errors. | manual |
| UXJ-067 | all forms | Field errors are rendered as visible text (not color-only) so they are perceivable and screen-reader reachable. | manual |

---

## G. Cross-cutting class: (e) Navigation continuity

| ID | Page / scope | Invariant | How to verify |
|---|---|---|---|
| UXJ-068 | terminal pages | Every terminal page (checkout error states, payment success/cancel, subscription success/cancel, activation success, partner confirmation, invalid-link states) has at least one working next-step CTA — zero dead ends. | manual walk of each terminal state |
| UXJ-069 | checkout back links | "Back to plans" links from checkout error/unavailable states navigate to `/#subscription-plans` and the plans section exists there. | manual |
| UXJ-070 | device-class redirects | Subscriber terminal CTAs point to the mobile app surface (mobile.boomcard.bg); partner terminal CTAs point into the partner dashboard — never crossed. | manual |
| UXJ-071 | legacy redirects | Legacy `/admin/*` redirect routes land on rendering pages (or login), never blank. | manual spot-check |
| UXJ-072 | header/footer nav | Every header/footer link on public pages resolves to a route that renders content (covered transitively: every linked route is in blank-sweep). | blank-sweep + manual link inventory |

---

## H. Cross-cutting class: (f) Session continuity

| ID | Page / scope | Invariant | How to verify |
|---|---|---|---|
| UXJ-073 | checkout → login → checkout | Auth state and the in-progress checkout URL survive the login round trip (router `state.from`). | manual |
| UXJ-074 | payment redirect round trip | Language and (where applicable) session survive the outbound→return payment redirect; the return lands on a page that knows the checkout context. | manual (test-mode return URL) |
| UXJ-075 | guarded route as guest | Visiting a guarded route as guest redirects to `/login` and returns to the original route after login. | manual |
| UXJ-076 | /complete-profile guard | An existing session is never clobbered by the activation exchange (redirects away first — see UXJ-025). | manual |

---

## I. Cross-cutting class: (g) Consent capture

| ID | Page / scope | Invariant | How to verify |
|---|---|---|---|
| UXJ-077 | all consent UI | No consent checkbox anywhere is pre-checked; consent is always an explicit user action. | manual across checkout / register / complete-profile |
| UXJ-078 | /complete-profile | Email + phone marketing consents are captured as separate explicit opt-ins and sent to `POST /auth/complete-profile` exactly as chosen. | manual + backend read-only DB check |
| UXJ-079 | /register/partner | Terms + Privacy required consents and optional marketing consent are transmitted exactly as chosen (spec §2.3). | manual + backend read-only DB check |
| UXJ-080 | guest checkout | Starting a paid subscription as guest captures an explicit terms/legal acknowledgment before payment initiation (a legal basis must be an explicit action, not implied). | manual |
| UXJ-081 | cookie banner | First visit shows the cookie banner with explicit Accept / Reject-non-essential choices; the choice persists (`boomcard_cookie_consent`) and the banner does not re-appear within its validity window. | manual |
| UXJ-082 | cookie banner | Banner and preferences modal are fully localized in BG and EN. | manual + render-sweep (first-visit variant) |

---

Row count: 82 (UXJ-001 … UXJ-082).
