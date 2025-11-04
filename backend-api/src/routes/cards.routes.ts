import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { cardService } from '../services/card.service';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

/**
 * POST /api/cards
 * Create card for user
 */
const createCardSchema = z.object({
  cardType: z.enum(['STANDARD', 'PREMIUM', 'PLATINUM']).default('STANDARD'),
});

router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { cardType } = createCardSchema.parse(req.body);

  const card = await cardService.createCard({ userId, cardType });

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

  const benefits = cardService.getCardBenefits(card.type);

  res.json({
    ...card,
    benefits,
  });
}));

/**
 * GET /api/cards/benefits
 * Get all card tier benefits
 */
router.get('/benefits', asyncHandler(async (req: AuthRequest, res: Response) => {
  const tiers = (['STANDARD', 'PREMIUM', 'PLATINUM'] as const).map(tier => ({
    tier,
    ...cardService.getCardBenefits(tier),
  }));

  res.json({ tiers });
}));

/**
 * POST /api/cards/:id/upgrade
 * Upgrade card tier
 */
const upgradeSchema = z.object({
  newTier: z.enum(['PREMIUM', 'PLATINUM']),
});

router.post('/:id/upgrade', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { newTier } = upgradeSchema.parse(req.body);

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

  const card = await cardService.deactivateCard(id, reason);

  res.json(card);
}));

/**
 * POST /api/cards/:id/activate
 * Activate card
 */
router.post('/:id/activate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const card = await cardService.activateCard(id);

  res.json(card);
}));

/**
 * GET /api/cards/:id/statistics
 * Get card usage statistics
 */
router.get('/:id/statistics', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const stats = await cardService.getCardStatistics(id);

  res.json(stats);
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
