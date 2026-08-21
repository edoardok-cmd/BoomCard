import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { cardService } from '../services/card.service';
import { foldMixedCurrencyToEur, RESPONSE_CURRENCY } from '../utils/currency';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

/**
 * POST /api/cards
 * Create a PREMIUM_WEEKLY card for users who don't have one yet.
 * Card type is always PREMIUM_WEEKLY at creation — use /upgrade to promote
 * after an active subscription has been confirmed.
 */
router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const card = await cardService.createCard({ userId, cardType: 'PREMIUM_WEEKLY' });
  res.status(201).json(card);
}));

/**
 * GET /api/cards/my-card
 * Get user's card
 */
router.get('/my-card', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const card = await cardService.getUserCard(userId);

  if (!card) {
    return res.status(404).json({ error: 'No card found. Create one first.' });
  }

  const benefits = await cardService.getCardBenefits(card.type);

  // Include active subscription expiry
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'TRIALING', 'PAUSED'] } },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { currentPeriodStart: true, currentPeriodEnd: true, plan: true },
  });

  res.json({
    ...card,
    issuedAt: card.createdAt,
    cardType: card.type,
    benefits,
    validFrom: subscription?.currentPeriodStart ?? card.createdAt,
    validUntil: subscription?.currentPeriodEnd ?? null,
    subscriptionPlan: subscription?.plan ?? null,
  });
}));

/**
 * GET /api/cards/benefits
 * Get all card tier benefits
 */
router.get('/benefits', asyncHandler(async (req: AuthRequest, res: Response) => {
  const tiers = await Promise.all(
    (['PREMIUM_WEEKLY', 'BASIC', 'PREMIUM'] as const).map(async tier => ({
      tier,
      ...await cardService.getCardBenefits(tier),
    })),
  );

  res.json({ tiers });
}));

/**
 * POST /api/cards/:id/upgrade
 * Upgrade card tier
 */
const upgradeSchema = z.object({
  newTier: z.enum(['BASIC', 'PREMIUM']),
});

router.post('/:id/upgrade', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { newTier } = upgradeSchema.parse(req.body);

  const existing = await prisma.card.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) {
    return res.status(404).json({ error: 'Card not found' });
  }
  if (existing.userId !== req.user!.id) {
    return res.status(403).json({ error: 'You do not have permission to upgrade this card' });
  }

  const card = await cardService.upgradeCardTier(id, newTier);

  res.json(card);
}));

/**
 * POST /api/cards/:id/deactivate
 * Deactivate card
 */
const deactivateSchema = z.object({
  reason: z.string().optional(),
});

router.post('/:id/deactivate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = deactivateSchema.parse(req.body);

  const existing = await prisma.card.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) {
    return res.status(404).json({ error: 'Card not found' });
  }
  if (existing.userId !== req.user!.id) {
    return res.status(403).json({ error: 'You do not have permission to deactivate this card' });
  }

  const card = await cardService.deactivateCard(id, reason);

  res.json(card);
}));

/**
 * POST /api/cards/:id/activate
 * Activate card
 */
router.post('/:id/activate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.card.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) {
    return res.status(404).json({ error: 'Card not found' });
  }
  if (existing.userId !== req.user!.id) {
    return res.status(403).json({ error: 'You do not have permission to activate this card' });
  }

  const card = await cardService.activateCard(id);

  res.json(card);
}));

/**
 * GET /api/cards/:id/statistics
 * Get card usage statistics
 */
router.get('/:id/statistics', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.card.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) {
    return res.status(404).json({ error: 'Card not found' });
  }
  if (existing.userId !== req.user!.id) {
    return res.status(403).json({ error: 'You do not have permission to view this card' });
  }

  const { cashbackByCurrency, ...stats } = await cardService.getCardStatistics(id);

  // BC-QA-031-FOLLOWUP-1 task-r2 F14 — CONVERT AT THE ROUTE BOUNDARY.
  //
  // `totalCashbackEarned` used to leave this handler as the raw BGN magnitude
  // the service computed, and the mobile app renders it with `formatEurAmount`
  // (`MyCardScreen` card banner, `DashboardScreen` hero tiles), so a stored 100
  // BGN was displayed as €100.00 against a true €51.13. `GET
  // /api/wallet/statistics` reported the honest figure for the very same rows.
  //
  // The fold converts each per-currency subtotal and drops what it has no rate
  // for, so this response now agrees with every other money surface in the app,
  // and says what it could not account for instead of silently absorbing it.
  const cashback = foldMixedCurrencyToEur(cashbackByCurrency);

  res.json({
    ...stats,
    totalCashbackEarned: cashback.total,
    currency: RESPONSE_CURRENCY,
    excludedCount: cashback.excludedCount,
    excludedCurrencies: cashback.excludedCurrencies,
  });
}));

/**
 * POST /api/cards/validate
 * Validate card by number (for QR scanning)
 */
const validateSchema = z.object({
  cardNumber: z.string(),
});

router.post('/validate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cardNumber } = validateSchema.parse(req.body);
  const validation = await cardService.validateCard(cardNumber);

  res.json(validation);
}));

export default router;
