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
import { isCurrencyTransitionWindowOpen } from '../utils/currencyDisplay';
import { EUR_TO_BGN_RATE } from '../constants/receipt.constants';

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function eurToBgn(eurAmount: number | null, windowOpen: boolean): number | null {
  if (!windowOpen || eurAmount === null) return null;
  return r2(eurAmount * EUR_TO_BGN_RATE);
}

const router = Router();

/**
 * GET /api/plans
 * Get all active plans with pricing (PUBLIC - no auth required)
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const [plans, windowOpen] = await Promise.all([
    prisma.plan.findMany({
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
    }),
    isCurrencyTransitionWindowOpen(),
  ]);

  const weeklyEur = (plan: { priceWeeklyEur: number | null }) =>
    plan.priceWeeklyEur ? plan.priceWeeklyEur / 100 : null;
  const monthlyEur = (plan: { priceMonthlyEur: number | null }) =>
    plan.priceMonthlyEur ? plan.priceMonthlyEur / 100 : null;

  const formattedPlans = plans.map(plan => ({
    id: plan.id,
    planCode: plan.planCode,
    displayName: plan.displayName,
    displayNameBg: plan.displayNameBg,
    pricing: {
      weekly: weeklyEur(plan),
      weeklyBgn: eurToBgn(weeklyEur(plan), windowOpen),
      monthly: monthlyEur(plan),
      monthlyBgn: eurToBgn(monthlyEur(plan), windowOpen),
      yearly: plan.priceYearlyEur / 100,
      yearlyBgn: eurToBgn(plan.priceYearlyEur / 100, windowOpen),
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
  if (planCode.includes('\x00')) {
    return res.status(400).json({ success: false, message: 'Invalid plan code' });
  }

  const [plan, windowOpen] = await Promise.all([
    prisma.plan.findFirst({
      where: {
        planCode: planCode.toUpperCase(),
        isActive: true,
      },
    }),
    isCurrencyTransitionWindowOpen(),
  ]);

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
        weeklyBgn: eurToBgn(weeklyEur, windowOpen),
        monthly: monthlyEur,
        monthlyBgn: eurToBgn(monthlyEur, windowOpen),
        yearly: yearlyEur,
        yearlyBgn: eurToBgn(yearlyEur, windowOpen),
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
  if (id.includes('\x00')) {
    return res.status(400).json({ success: false, message: 'Invalid plan id' });
  }

  const [plan, windowOpen] = await Promise.all([
    prisma.plan.findFirst({
      where: {
        id: id,
        isActive: true,
      },
    }),
    isCurrencyTransitionWindowOpen(),
  ]);

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
        weeklyBgn: eurToBgn(weeklyEur, windowOpen),
        monthly: monthlyEur,
        monthlyBgn: eurToBgn(monthlyEur, windowOpen),
        yearly: yearlyEur,
        yearlyBgn: eurToBgn(yearlyEur, windowOpen),
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
