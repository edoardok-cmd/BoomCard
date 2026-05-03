// Shared display labels for subscription plans, statuses, user-account
// statuses, and risk buckets. Single source of truth for the three admin
// screens (AdminSubscriberDetailPage, AdminSubscribersAllPage,
// AdminSubscriptionsPage) and any other surface that renders these enums.
//
// Mirrors backend src/utils/planDisplayName.ts for the EN plan strings, but
// adds BG translations and the status / user-status / risk dimensions that
// the backend helper does not cover (backend ships canonical English only).
//
// Spec §4.2 frames LIGHT as "Premium Weekly" and PREMIUM as "Premium Monthly".
// "спрян" appears in BOTH §4.1 (account status) and §4.2 (subscription status).
// We reserve "Спрян" for the §4.1 account-suspension pill (USER_STATUS_LABELS.SUSPENDED)
// and use "На пауза" for the §4.2 subscription PAUSED state. Same row in the
// subscribers list shows both columns side by side, and the prior "Спрян · Спрян"
// duplication was visually awkward and screenshots that drop column headers
// became ambiguous. CANCELLED stays "Отказан" (admin-initiated cancel).
// `customerLabels.ts` and `AdminPartnersPage.tsx` already use "На пауза" — this
// brings the admin subscription status into convergence.

import type {
  SubscriptionPlan as ServiceSubscriptionPlan,
  SubscriptionStatus as ServiceSubscriptionStatus,
  UserAccountStatus as ServiceUserAccountStatus,
} from '../services/adminSubscribers.service';

export type Lang = 'en' | 'bg';

export type SubscriptionPlan = 'LIGHT' | 'BASIC' | 'PREMIUM';

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'UNPAID'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'PAUSED';

export type UserAccountStatusLabel = 'ACTIVE' | 'SUSPENDED' | 'DELETED' | 'PENDING_VERIFICATION' | 'PENDING_PAYMENT' | 'INACTIVE';

// Compile-time guard: if the admin service ever adds, removes, or renames a
// status/plan, one of these assignments errors and the missing key forces a
// label entry to be added below. Without this, an unknown enum would silently
// hit the `String(status).replace('_', ' ')` fallback at runtime.
type _AssertExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _planMatch: _AssertExact<SubscriptionPlan, ServiceSubscriptionPlan> = true;
const _statusMatch: _AssertExact<SubscriptionStatus, ServiceSubscriptionStatus> = true;
const _userMatch: _AssertExact<UserAccountStatusLabel, ServiceUserAccountStatus> = true;
void _planMatch; void _statusMatch; void _userMatch;

export const PLAN_LABELS: Record<SubscriptionPlan, Record<Lang, string>> = {
  LIGHT:   { en: 'Premium Weekly',  bg: 'Premium седмичен' },
  BASIC:   { en: 'Basic',           bg: 'Basic' },
  PREMIUM: { en: 'Premium Monthly', bg: 'Premium месечен' },
};

export function planLabel(plan: SubscriptionPlan | string, lang: Lang): string {
  return PLAN_LABELS[plan as SubscriptionPlan]?.[lang] ?? String(plan);
}

export const SUB_STATUS_LABELS: Record<SubscriptionStatus, Record<Lang, string>> = {
  ACTIVE:             { en: 'Active',             bg: 'Активен' },
  TRIALING:           { en: 'Trialing',           bg: 'Пробен' },
  PAST_DUE:           { en: 'Failed payment',     bg: 'Неуспешно плащане' },
  UNPAID:             { en: 'Unpaid',             bg: 'Неплатен' },
  CANCELLED:          { en: 'Cancelled',          bg: 'Отказан' },
  EXPIRED:            { en: 'Expired',            bg: 'Изтекъл' },
  INCOMPLETE:         { en: 'Incomplete',         bg: 'Незавършен' },
  INCOMPLETE_EXPIRED: { en: 'Incomplete expired', bg: 'Незавършен (изтекъл)' },
  PAUSED:             { en: 'Paused',             bg: 'На пауза' },
};

export function subStatusLabel(status: SubscriptionStatus | string, lang: Lang): string {
  return SUB_STATUS_LABELS[status as SubscriptionStatus]?.[lang] ?? String(status).replace(/_/g, ' ');
}

export const USER_STATUS_LABELS: Record<UserAccountStatusLabel, Record<Lang, string>> = {
  ACTIVE:               { en: 'Active',               bg: 'Активен' },
  SUSPENDED:            { en: 'Suspended',             bg: 'Спрян' },
  DELETED:              { en: 'Deleted',               bg: 'Изтрит' },
  PENDING_VERIFICATION: { en: 'Pending verification',  bg: 'Изчаква верификация' },
  PENDING_PAYMENT:      { en: 'Pending payment',       bg: 'Изчаква плащане' },
  INACTIVE:             { en: 'Inactive',              bg: 'Неактивен' },
};

export function userStatusLabel(status: UserAccountStatusLabel | string, lang: Lang): string {
  return USER_STATUS_LABELS[status as UserAccountStatusLabel]?.[lang] ?? String(status);
}

// Spec §7.1 frames risk buckets as Auto / Review / High (manual-review framing,
// not generic Low / Medium / High). Thresholds match backend riskScore buckets:
// 0-30 Auto, 31-60 Review, 61+ High.
export type RiskBucket = 'auto' | 'review' | 'high';

export function riskBucket(score: number): RiskBucket {
  if (score <= 30) return 'auto';
  if (score <= 60) return 'review';
  return 'high';
}

export const RISK_LABELS: Record<RiskBucket, Record<Lang, string>> = {
  auto:   { en: 'Auto',   bg: 'Авто' },
  review: { en: 'Review', bg: 'Преглед' },
  high:   { en: 'High',   bg: 'Висок' },
};

export function riskLabel(score: number, lang: Lang): string {
  return RISK_LABELS[riskBucket(score)][lang];
}
