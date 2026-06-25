/**
 * Shared Subscription Status Gate (Spec §1.2, §1.3, §8.1)
 *
 * Single source of truth for determining whether a subscription status
 * allows earning activity (scanning + cashback generation).
 *
 * Per spec §8.1 rule 1: "New cashback records are never generated while
 * scanning is blocked." This module ensures the cashback gate and the
 * scanning gate enforce identical subscription status rules.
 *
 * Both gates use an ALLOW-LIST approach:
 *  - ALLOW:  ACTIVE, TRIALING, CANCELLED (within paid period)
 *  - BLOCK:  EXPIRED, FAILED_PAYMENT, CANCELLED (post-period), PAST_DUE,
 *            UNPAID, INCOMPLETE, INCOMPLETE_EXPIRED, PAUSED, and unknown
 *            future statuses
 */
import { SubscriptionStatus } from '@prisma/client';

/**
 * Determine if a subscription status allows earning activities (scanning + cashback).
 *
 * @param status The subscription status from SubscriptionStatus enum
 * @param currentPeriodEnd The subscription's currentPeriodEnd date (required for CANCELLED)
 * @param now The current time (defaults to new Date())
 * @returns true if earning is allowed, false otherwise
 *
 * Rules (per spec §1.2, §1.3, §8.1):
 *  - ACTIVE: always allow
 *  - TRIALING: allow (mapped to "Active" for users)
 *  - CANCELLED: allow only if currentPeriodEnd > now
 *  - EXPIRED, FAILED_PAYMENT, PAST_DUE, UNPAID, INCOMPLETE, INCOMPLETE_EXPIRED, PAUSED:
 *    block earning
 *  - Unknown future statuses: conservatively block earning
 */
export function subscriptionAllowsEarning(
  status: SubscriptionStatus | string,
  currentPeriodEnd: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  // ALLOW-LIST: only permit known good states
  if (status === SubscriptionStatus.ACTIVE) {
    return true;
  }

  // TRIALING is mapped to "Active" for users (spec §1.2 decision point)
  if ((status as string) === 'TRIALING') {
    return true;
  }

  // CANCELLED: allow only during the paid period (currentPeriodEnd in future)
  if (status === SubscriptionStatus.CANCELLED) {
    if (currentPeriodEnd != null && currentPeriodEnd > now) {
      return true;
    }
    // Post-period cancellation: block earning
    return false;
  }

  // Block all other known statuses (explicit to catch enum evolution)
  // PAST_DUE, UNPAID, INCOMPLETE, INCOMPLETE_EXPIRED, PAUSED, EXPIRED,
  // FAILED_PAYMENT all fall through to false
  if (
    status === SubscriptionStatus.PAST_DUE ||
    status === SubscriptionStatus.UNPAID ||
    status === SubscriptionStatus.INCOMPLETE ||
    status === SubscriptionStatus.INCOMPLETE_EXPIRED ||
    status === SubscriptionStatus.PAUSED ||
    status === SubscriptionStatus.EXPIRED ||
    status === SubscriptionStatus.FAILED_PAYMENT
  ) {
    return false;
  }

  // Unknown future statuses: conservatively block earning to fail safe
  // (new enum values added in the future should be explicitly allowed,
  // not accidentally permitted by a catch-all)
  return false;
}

/**
 * Helper to determine block reason for user-facing error messages.
 * Used by callers that need to show which specific rule blocked earning.
 *
 * @returns A specific error code string, or null if earning is allowed
 */
export function subscriptionBlockReason(
  status: SubscriptionStatus | string,
  currentPeriodEnd: Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (subscriptionAllowsEarning(status, currentPeriodEnd, now)) {
    return null;
  }

  // Return specific block reasons to help callers show targeted CTAs
  if (status === SubscriptionStatus.EXPIRED) {
    return 'SUBSCRIPTION_EXPIRED';
  }
  if (status === SubscriptionStatus.FAILED_PAYMENT) {
    return 'SUBSCRIPTION_FAILED_PAYMENT';
  }
  if (status === SubscriptionStatus.CANCELLED) {
    return 'SUBSCRIPTION_CANCELLED_EXPIRED';
  }
  if (
    status === SubscriptionStatus.PAST_DUE ||
    status === SubscriptionStatus.UNPAID ||
    status === SubscriptionStatus.INCOMPLETE ||
    status === SubscriptionStatus.INCOMPLETE_EXPIRED ||
    status === SubscriptionStatus.PAUSED
  ) {
    return 'SUBSCRIPTION_INACTIVE';
  }

  // Unknown statuses
  return 'SUBSCRIPTION_INACTIVE';
}
