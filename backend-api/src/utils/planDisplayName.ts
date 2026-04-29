import type { SubscriptionPlan } from '@prisma/client';

// The enum values LIGHT/BASIC/PREMIUM are internal codes.
// LIGHT is the Premium Weekly plan — the name is counter-intuitive,
// so always use this mapping when sending plan data to clients.
export const PLAN_DISPLAY_NAMES: Record<SubscriptionPlan, string> = {
  LIGHT: 'Premium Weekly',
  BASIC: 'Basic',
  PREMIUM: 'Premium Monthly',
};

export function planDisplayName(plan: SubscriptionPlan | string): string {
  return PLAN_DISPLAY_NAMES[plan as SubscriptionPlan] ?? plan;
}
