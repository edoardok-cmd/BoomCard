import { LoyaltyTier } from '@prisma/client';

// ============================================================
// Loyalty tier → cashback rate on transactions.
// BRONZE is the default (no loyalty account needed).
// ============================================================
export const LOYALTY_TIER_CASHBACK: Record<LoyaltyTier, number> = {
  BRONZE:   0.02,
  SILVER:   0.03,
  GOLD:     0.05,
  PLATINUM: 0.07,
  DIAMOND:  0.10,
};

// NOTE: Partner tier max discounts and plan→redeemable tiers
// are now stored in the database (PartnerType and PlanTypeAccess tables)
// and managed via /api/admin/partner-types.
// Use partnerTypeService.getMaxDiscountForType() and
// partnerTypeService.getRedeemableTypeIdsForPlan() instead.
