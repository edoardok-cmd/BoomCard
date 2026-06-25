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
// "спрян" appears in BOTH §4.1 (account status) and §4.2 (subscription status);
// both columns use it deliberately — column headers distinguish which entity is
// suspended. CANCELLED stays "Отказан" (admin-initiated cancel).

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
  | 'PAUSED'
  // Spec §4.2 v1.1 — no-grace failed-payment state written by Paysera renewal job.
  | 'FAILED_PAYMENT';

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
  PAUSED:             { en: 'Suspended',           bg: 'Спрян' },
  FAILED_PAYMENT:     { en: 'Failed payment',     bg: 'Неуспешно плащане' },
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

// Spec §5.1 (Clash) frames risk levels as Low / Medium / High. Thresholds
// match backend riskScore buckets (adminSubscribers.routes.ts:117-119):
// 0-20 Low, 21-50 Medium, 51+ High.
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Map a numeric riskScore to its corresponding risk level.
 * Canonical thresholds per Spec §5.1 (Clash):
 * - 0-20: Low
 * - 21-50: Medium
 * - 51+: High
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score <= 20) return 'low';
  if (score <= 50) return 'medium';
  return 'high';
}

// Legacy type/function for Auto/Review/High framing (kept for backward compatibility).
export type RiskBucket = 'auto' | 'review' | 'high';

export function riskBucket(score: number): RiskBucket {
  if (score <= 20) return 'auto';
  if (score <= 50) return 'review';
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
