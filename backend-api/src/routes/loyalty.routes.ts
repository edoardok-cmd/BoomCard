import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize, AuthRequest, requireActiveSubscription } from '../middleware/auth.middleware';
import { apiRateLimiter } from '../middleware/security.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middleware/error.middleware';
import prisma from '../lib/prisma';
import { LOYALTY_TIER_CASHBACK } from '../constants/tiers';

const router = Router();
router.use(authenticate);
router.use(authorize('USER'));

const writeLimiter = apiRateLimiter;

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/loyalty/accounts/me
 * Returns the authenticated user's loyalty account. Auto-creates a BRONZE
 * account with 0 points if one does not exist yet (upsert — no race condition).
 */
router.get('/accounts/me', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const account = await prisma.loyaltyAccount.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      tier: 'BRONZE',
      points: 0,
      lifetimePoints: 0,
      tierProgress: 0,
      cashbackBalance: 0,
      nextTierPoints: 0,
    },
    select: {
      id: true,
      userId: true,
      tier: true,
      points: true,
      lifetimePoints: true,
      tierProgress: true,
      cashbackBalance: true,
      nextTierPoints: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json({
    success: true,
    data: {
      ...account,
      cashbackRate: LOYALTY_TIER_CASHBACK[account.tier],
    },
  });
}));

/**
 * GET /api/loyalty/transactions
 * Paginated list of the authenticated user's loyalty transactions, most recent first.
 * Query params: page (default 1), limit (default 20, max 100).
 */
router.get('/transactions', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { page, limit } = paginationSchema.parse(req.query);

  const account = await prisma.loyaltyAccount.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!account) {
    return res.json({ success: true, data: [], total: 0, page, limit });
  }

  const [data, total] = await prisma.$transaction([
    prisma.loyaltyTransaction.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.loyaltyTransaction.count({ where: { accountId: account.id } }),
  ]);

  res.json({ success: true, data, total, page, limit });
}));

/**
 * GET /api/loyalty/rewards
 * List active rewards available to redeem.
 * Query param: category (optional filter).
 * Only returns rewards that are active, not expired, and in stock.
 */
router.get('/rewards', asyncHandler(async (req: AuthRequest, res: Response) => {
  const categorySchema = z.object({ category: z.string().optional() });
  const { category } = categorySchema.parse(req.query);

  const now = new Date();

  const rewards = await prisma.reward.findMany({
    where: {
      isActive: true,
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      AND: [
        {
          OR: [{ stockQuantity: null }, { stockQuantity: { gt: 0 } }],
        },
      ],
      ...(category ? { category } : {}),
    },
    orderBy: { pointsCost: 'asc' },
  });

  res.json({ success: true, data: rewards });
}));

/**
 * GET /api/loyalty/rewards/redemptions
 * Paginated list of the authenticated user's reward redemptions, most recent first.
 * Includes reward title and description.
 */
router.get('/rewards/redemptions', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { page, limit } = paginationSchema.parse(req.query);

  const account = await prisma.loyaltyAccount.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!account) {
    return res.json({ success: true, data: [], total: 0, page, limit });
  }

  const [data, total] = await prisma.$transaction([
    prisma.rewardRedemption.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        reward: {
          select: {
            id: true,
            title: true,
            titleBg: true,
            description: true,
            descriptionBg: true,
            pointsCost: true,
            cashValue: true,
            category: true,
            image: true,
          },
        },
      },
    }),
    prisma.rewardRedemption.count({ where: { accountId: account.id } }),
  ]);

  res.json({ success: true, data, total, page, limit });
}));

/**
 * POST /api/loyalty/rewards/:rewardId/redeem
 * Redeem a reward using loyalty points. All validation and writes happen inside
 * an interactive transaction to eliminate TOCTOU races on both points and stock.
 */
router.post(
  '/rewards/:rewardId/redeem',
  writeLimiter,
  requireActiveSubscription,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { rewardId } = z.object({ rewardId: z.string().min(1) }).parse(req.params);
    const now = new Date();

    const redemption = await prisma.$transaction(async (tx) => {
      // Re-fetch reward inside transaction to avoid TOCTOU on isActive/validUntil/stock
      const reward = await tx.reward.findUnique({ where: { id: rewardId } });
      if (!reward) throw new AppError('Reward not found', 404);
      if (!reward.isActive || (reward.validUntil && reward.validUntil <= now)) {
        throw new AppError('Reward not available', 400);
      }
      if (reward.validFrom > now) throw new AppError('Reward not available', 400);

      // Upsert account inside transaction
      const account = await tx.loyaltyAccount.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          tier: 'BRONZE',
          points: 0,
          lifetimePoints: 0,
          tierProgress: 0,
          cashbackBalance: 0,
          nextTierPoints: 0,
        },
      });

      // Atomic points deduction with guard — prevents concurrent over-spend (F1)
      const pointsUpdate = await tx.loyaltyAccount.updateMany({
        where: { id: account.id, points: { gte: reward.pointsCost } },
        data: { points: { decrement: reward.pointsCost } },
      });
      if (pointsUpdate.count === 0) throw new AppError('Insufficient points', 400);

      // Atomic stock check+decrement — prevents concurrent over-redemption (F2)
      if (reward.stockQuantity !== null) {
        const stockUpdate = await tx.reward.updateMany({
          where: { id: reward.id, stockQuantity: { gt: 0 } },
          data: { stockQuantity: { decrement: 1 }, redeemedCount: { increment: 1 } },
        });
        if (stockUpdate.count === 0) throw new AppError('Reward out of stock', 400);
      } else {
        await tx.reward.update({
          where: { id: reward.id },
          data: { redeemedCount: { increment: 1 } },
        });
      }

      // Create redemption record
      const redemption = await tx.rewardRedemption.create({
        data: {
          accountId: account.id,
          rewardId: reward.id,
          status: 'PENDING',
          pointsSpent: reward.pointsCost,
        },
      });

      // Audit trail
      await tx.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          type: 'REDEEMED',
          points: -reward.pointsCost,
          description: `Redeemed: ${reward.title}`,
          descriptionBg: reward.titleBg ? `Осребрено: ${reward.titleBg}` : undefined,
        },
      });

      return redemption;
    });

    res.status(201).json({ success: true, data: redemption });
  }),
);

/**
 * GET /api/loyalty/badges
 * List the authenticated user's earned badges (UserBadge joined with Badge).
 */
router.get('/badges', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const account = await prisma.loyaltyAccount.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!account) {
    return res.json({ success: true, data: [] });
  }

  const badges = await prisma.userBadge.findMany({
    where: { accountId: account.id },
    orderBy: { unlockedAt: 'desc' },
    include: {
      badge: true,
    },
  });

  res.json({ success: true, data: badges });
}));

export default router;
