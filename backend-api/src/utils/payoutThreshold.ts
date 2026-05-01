import { SubscriptionPlan } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  EUR_TO_BGN_RATE,
  PAYOUT_THRESHOLD_BASIC_EUR,
  PAYOUT_THRESHOLD_PREMIUM_WEEKLY_EUR,
  PAYOUT_THRESHOLD_PREMIUM_MONTHLY_EUR,
} from '../constants/receipt.constants';

const FALLBACK_BGN: Record<SubscriptionPlan, number> = {
  BASIC:   PAYOUT_THRESHOLD_BASIC_EUR * EUR_TO_BGN_RATE,
  LIGHT:   PAYOUT_THRESHOLD_PREMIUM_WEEKLY_EUR * EUR_TO_BGN_RATE,
  PREMIUM: PAYOUT_THRESHOLD_PREMIUM_MONTHLY_EUR * EUR_TO_BGN_RATE,
};

// 5-minute in-process cache — avoids a DB hit per subscriber during nightly sweeps.
let _cache: { data: Record<SubscriptionPlan, number>; expiresAt: number } | null = null;

async function loadFromDb(): Promise<Record<SubscriptionPlan, number>> {
  const rows = await prisma.payoutThreshold.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  const resolved = { ...FALLBACK_BGN };
  for (const plan of ['BASIC', 'LIGHT', 'PREMIUM'] as SubscriptionPlan[]) {
    const row = rows.find((r) => r.plan === plan);
    if (row) resolved[plan] = row.minAmount;
  }
  return resolved;
}

/**
 * Returns the effective minimum payout threshold in BGN for the given plan.
 * Reads from `payout_thresholds` DB table (admin-configurable) with a 5-minute
 * in-process cache. Falls back to the compile-time constants if the table is
 * empty or unreachable.
 */
export async function getPayoutThresholdBGN(plan: SubscriptionPlan): Promise<number> {
  const now = Date.now();
  if (!_cache || _cache.expiresAt < now) {
    try {
      _cache = { data: await loadFromDb(), expiresAt: now + 5 * 60 * 1000 };
    } catch {
      _cache = { data: { ...FALLBACK_BGN }, expiresAt: now + 60 * 1000 };
    }
  }
  return _cache.data[plan];
}

/** Synchronous fallback — use only where async is not possible. */
export function getPayoutThresholdBGNSync(plan: SubscriptionPlan): number {
  return _cache?.data[plan] ?? FALLBACK_BGN[plan];
}

/** Invalidate the in-process cache (call after saving new thresholds). */
export function invalidatePayoutThresholdCache(): void {
  _cache = null;
}
