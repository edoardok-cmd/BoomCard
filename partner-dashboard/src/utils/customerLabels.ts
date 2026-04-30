// Customer-tone labels for end-user surfaces (SubscriptionPage, BillingDashboard if
// re-introduced, public receipts). Intentionally diverges from utils/planLabels.ts:
//   - planLabels.ts is admin/audit framing ("Failed payment", "Отказан") used in
//     AdminSubscribers* and AdminTransactions screens.
//   - This module is customer-facing framing ("Past due", "Отменен") — softer copy,
//     no enum-leak fallthroughs.
// Both modules MUST stay in sync with the backend Prisma enums (SubscriptionStatus,
// SubscriptionPlan, TransactionStatus). Compile-time guards below force a build
// error if the service-layer types ever drift.

import type {
  Subscription,
  SubscriptionHistoryItem,
} from '../services/billing.service';

export type Lang = 'en' | 'bg';

// Mirrors backend prisma SubscriptionStatus (9 values). Service-layer
// Subscription.status is the source of truth — see compile guard below.
export type CustomerSubStatus =
  | 'ACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'UNPAID'
  | 'PAUSED'
  | 'EXPIRED';

export type CustomerPlan = 'LIGHT' | 'BASIC' | 'PREMIUM';

// Mirrors backend prisma TransactionStatus (lowercased by the /subscriptions/history
// route). The legacy 'paid'/'void' values are kept for invoice surfaces that still
// emit them; styling falls back to the danger track for any unrecognised string.
export type CustomerPaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'paid'
  | 'void';

const SUB_STATUS: Record<CustomerSubStatus, Record<Lang, string>> = {
  ACTIVE:             { en: 'Active',              bg: 'Активен' },
  TRIALING:           { en: 'Trialing',            bg: 'Пробен' },
  PAST_DUE:           { en: 'Past due',            bg: 'Просрочен' },
  CANCELLED:          { en: 'Cancelled',           bg: 'Отменен' },
  INCOMPLETE:         { en: 'Incomplete',          bg: 'Незавършен' },
  INCOMPLETE_EXPIRED: { en: 'Incomplete (expired)', bg: 'Незавършен (изтекъл)' },
  UNPAID:             { en: 'Unpaid',              bg: 'Неплатен' },
  PAUSED:             { en: 'Paused',              bg: 'На пауза' },
  EXPIRED:            { en: 'Expired',             bg: 'Изтекъл' },
};

const PLAN: Record<CustomerPlan, Record<Lang, string>> = {
  LIGHT:   { en: 'Premium Weekly',  bg: 'Premium седмичен' },
  BASIC:   { en: 'Basic',           bg: 'Basic' },
  PREMIUM: { en: 'Premium Monthly', bg: 'Premium месечен' },
};

const PAYMENT_STATUS: Record<CustomerPaymentStatus, Record<Lang, string>> = {
  pending:    { en: 'Pending',    bg: 'Изчаква' },
  processing: { en: 'Processing', bg: 'Обработва се' },
  completed:  { en: 'Paid',       bg: 'Платено' },
  paid:       { en: 'Paid',       bg: 'Платено' },
  failed:     { en: 'Failed',     bg: 'Неуспешно' },
  cancelled:  { en: 'Cancelled',  bg: 'Отменено' },
  refunded:   { en: 'Refunded',   bg: 'Възстановено' },
  void:       { en: 'Void',       bg: 'Анулирано' },
};

// Tri-state colour key for HistoryStatus / PaymentStatusBadge styling. Maps
// lifecycle to UX intent: success (settled), warn (in-flight), danger (failed),
// neutral (terminal-but-not-error).
export type PaymentTone = 'success' | 'warn' | 'danger' | 'neutral';

const PAYMENT_TONE: Record<CustomerPaymentStatus, PaymentTone> = {
  completed: 'success',
  paid:      'success',
  pending:   'warn',
  processing: 'warn',
  failed:    'danger',
  cancelled: 'neutral',
  void:      'neutral',
  refunded:  'neutral',
};

export function customerSubStatusLabel(
  status: CustomerSubStatus | string,
  lang: Lang,
): string {
  return SUB_STATUS[status as CustomerSubStatus]?.[lang] ?? String(status).replace(/_/g, ' ');
}

export function customerPlanLabel(
  plan: CustomerPlan | string,
  lang: Lang,
): string {
  return PLAN[plan as CustomerPlan]?.[lang] ?? String(plan);
}

export function customerPaymentStatusLabel(
  status: CustomerPaymentStatus | string,
  lang: Lang,
): string {
  return PAYMENT_STATUS[status as CustomerPaymentStatus]?.[lang] ?? String(status);
}

export function paymentStatusTone(status: CustomerPaymentStatus | string): PaymentTone {
  // Default to 'neutral' (not 'danger') for unknown values: the compile-time
  // guard below catches drift at build time, so this fallback only fires for
  // payloads that genuinely disagree with the type. Showing red for an
  // unrecognised-but-otherwise-valid payment row is more alarming than honest.
  return PAYMENT_TONE[status as CustomerPaymentStatus] ?? 'neutral';
}

// Compile-time guards: if the service-layer types drift, one of these
// assignments errors and the missing key forces a label entry above. Without
// this, an unknown enum would silently hit the String(status) fallback at
// runtime and render 'INCOMPLETE_EXPIRED' verbatim to a customer.
//
// _AssertExact is bidirectional — it fires both when the service grows past
// the labels (added enum value) AND when it shrinks below them (a label entry
// is now dead). The asymmetric `[A] extends [B]` form would only catch growth,
// leaving stale label entries behind. This file mirrors planLabels.ts's guard.
type _AssertExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _subStatusMatch: _AssertExact<Subscription['status'], CustomerSubStatus> = true;
const _planMatch: _AssertExact<Subscription['plan'], CustomerPlan> = true;
const _paymentMatch: _AssertExact<SubscriptionHistoryItem['status'], CustomerPaymentStatus> = true;
void _subStatusMatch; void _planMatch; void _paymentMatch;
