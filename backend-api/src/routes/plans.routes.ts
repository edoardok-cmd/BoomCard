/**
 * Plans Routes
 * Public API for fetching subscription plan details and pricing
 *
 * SECURITY: This is the single source of truth for plan pricing.
 * Frontend should NEVER send prices - only planId.
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * GET /api/plans
 * Get all active plans with pricing (PUBLIC - no auth required)
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: {
      id: true,
      planCode: true,
      displayName: true,
      displayNameBg: true,
      priceWeeklyEur: true,
      priceMonthlyEur: true,
      priceYearlyEur: true,
      cashbackRate: true,
      stickerBonus: true,
      features: true,
      featuresBg: true,
      cardType: true,
      isFeatured: true,
      badgeText: true,
      badgeTextBg: true,
      hasWeeklyOption: true,
      hasMonthlyOption: true,
      hasYearlyOption: true,
      yearlyDiscountPct: true,
    },
  });

  // Convert cents to currency units for API response
  const formattedPlans = plans.map(plan => ({
    id: plan.id,
    planCode: plan.planCode,
    displayName: plan.displayName,
    displayNameBg: plan.displayNameBg,
    pricing: {
      weekly: plan.priceWeeklyEur ? plan.priceWeeklyEur / 100 : null,
      monthly: plan.priceMonthlyEur ? plan.priceMonthlyEur / 100 : null,
      yearly: plan.priceYearlyEur / 100,
      currency: 'EUR',
      yearlyDiscountPct: plan.yearlyDiscountPct,
    },
    billingOptions: {
      hasWeekly: plan.hasWeeklyOption,
      hasMonthly: plan.hasMonthlyOption,
      hasYearly: plan.hasYearlyOption,
    },
    cashbackRate: plan.cashbackRate,
    stickerBonus: plan.stickerBonus,
    features: plan.features ? JSON.parse(plan.features) : [],
    featuresBg: plan.featuresBg ? JSON.parse(plan.featuresBg) : [],
    cardType: plan.cardType,
    isFeatured: plan.isFeatured,
    badge: plan.badgeText ? {
      text: plan.badgeText,
      textBg: plan.badgeTextBg,
    } : null,
  }));

  res.json({
    success: true,
    data: formattedPlans,
  });
}));

/**
 * GET /api/plans/:planCode
 * Get single plan by code (PUBLIC - no auth required)
 */
router.get('/code/:planCode', asyncHandler(async (req: Request, res: Response) => {
  const { planCode } = req.params;

  const plan = await prisma.plan.findFirst({
    where: {
      planCode: planCode.toUpperCase(),
      isActive: true,
    },
  });

  if (!plan) {
    return res.status(404).json({
      success: false,
      message: 'Plan not found',
    });
  }

  res.json({
    success: true,
    data: {
      id: plan.id,
      planCode: plan.planCode,
      displayName: plan.displayName,
      displayNameBg: plan.displayNameBg,
      pricing: {
        weekly: plan.priceWeeklyEur ? plan.priceWeeklyEur / 100 : null,
        monthly: plan.priceMonthlyEur ? plan.priceMonthlyEur / 100 : null,
        yearly: plan.priceYearlyEur / 100,
        currency: 'EUR',
        yearlyDiscountPct: plan.yearlyDiscountPct,
      },
      billingOptions: {
        hasWeekly: plan.hasWeeklyOption,
        hasMonthly: plan.hasMonthlyOption,
        hasYearly: plan.hasYearlyOption,
      },
      cashbackRate: plan.cashbackRate,
      stickerBonus: plan.stickerBonus,
      features: plan.features ? JSON.parse(plan.features) : [],
      featuresBg: plan.featuresBg ? JSON.parse(plan.featuresBg) : [],
      cardType: plan.cardType,
      isFeatured: plan.isFeatured,
      badge: plan.badgeText ? {
        text: plan.badgeText,
        textBg: plan.badgeTextBg,
      } : null,
    },
  });
}));

/**
 * GET /api/plans/:id
 * Get single plan by ID (PUBLIC - no auth required)
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const plan = await prisma.plan.findFirst({
    where: {
      id: id,
      isActive: true,
    },
  });

  if (!plan) {
    return res.status(404).json({
      success: false,
      message: 'Plan not found',
    });
  }

  res.json({
    success: true,
    data: {
      id: plan.id,
      planCode: plan.planCode,
      displayName: plan.displayName,
      displayNameBg: plan.displayNameBg,
      pricing: {
        weekly: plan.priceWeeklyEur ? plan.priceWeeklyEur / 100 : null,
        monthly: plan.priceMonthlyEur ? plan.priceMonthlyEur / 100 : null,
        yearly: plan.priceYearlyEur / 100,
        currency: 'EUR',
        yearlyDiscountPct: plan.yearlyDiscountPct,
      },
      billingOptions: {
        hasWeekly: plan.hasWeeklyOption,
        hasMonthly: plan.hasMonthlyOption,
        hasYearly: plan.hasYearlyOption,
      },
      cashbackRate: plan.cashbackRate,
      stickerBonus: plan.stickerBonus,
      features: plan.features ? JSON.parse(plan.features) : [],
      featuresBg: plan.featuresBg ? JSON.parse(plan.featuresBg) : [],
      cardType: plan.cardType,
      isFeatured: plan.isFeatured,
      badge: plan.badgeText ? {
        text: plan.badgeText,
        textBg: plan.badgeTextBg,
      } : null,
    },
  });
}));

export default router;
