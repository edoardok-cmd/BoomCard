import type { SubscriptionPlan } from '@prisma/client';

export const PLAN_DISPLAY_NAMES: Record<SubscriptionPlan | string, string> = {
  PREMIUM_WEEKLY: 'Premium Weekly',
  BASIC: 'Basic',
  PREMIUM: 'Premium Monthly',
  PREMIUM_MONTHLY: 'Premium Monthly',
};

export function planDisplayName(plan: SubscriptionPlan | string): string {
  return PLAN_DISPLAY_NAMES[plan as SubscriptionPlan] ?? plan;
}
