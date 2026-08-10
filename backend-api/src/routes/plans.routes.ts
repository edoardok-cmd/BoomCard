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
import { safeParseJsonArray } from '../utils/json';

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
    features: safeParseJsonArray(plan.features),
    featuresBg: safeParseJsonArray(plan.featuresBg),
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
  if (planCode.includes('\x00')) {
    return res.status(400).json({ success: false, message: 'Invalid plan code' });
  }

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

  const weeklyEur = plan.priceWeeklyEur ? plan.priceWeeklyEur / 100 : null;
  const monthlyEur = plan.priceMonthlyEur ? plan.priceMonthlyEur / 100 : null;
  const yearlyEur = plan.priceYearlyEur / 100;

  res.json({
    success: true,
    data: {
      id: plan.id,
      planCode: plan.planCode,
      displayName: plan.displayName,
      displayNameBg: plan.displayNameBg,
      pricing: {
        weekly: weeklyEur,
        monthly: monthlyEur,
        yearly: yearlyEur,
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
      features: safeParseJsonArray(plan.features),
      featuresBg: safeParseJsonArray(plan.featuresBg),
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
  if (id.includes('\x00')) {
    return res.status(400).json({ success: false, message: 'Invalid plan id' });
  }

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

  const weeklyEur = plan.priceWeeklyEur ? plan.priceWeeklyEur / 100 : null;
  const monthlyEur = plan.priceMonthlyEur ? plan.priceMonthlyEur / 100 : null;
  const yearlyEur = plan.priceYearlyEur / 100;

  res.json({
    success: true,
    data: {
      id: plan.id,
      planCode: plan.planCode,
      displayName: plan.displayName,
      displayNameBg: plan.displayNameBg,
      pricing: {
        weekly: weeklyEur,
        monthly: monthlyEur,
        yearly: yearlyEur,
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
      features: safeParseJsonArray(plan.features),
      featuresBg: safeParseJsonArray(plan.featuresBg),
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
