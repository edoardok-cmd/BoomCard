import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { apiRateLimiter } from '../middleware/security.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import prisma from '../lib/prisma';

const router = Router();
router.use(authenticate);
// Mutating favorites endpoints share the standard 30 req/min cap so a leaked
// access token can't be used to spam upserts/deletes. GET stays under the
// global `/api/` limiter mounted in server.ts.
const writeLimiter = apiRateLimiter;

const FavoriteKindSchema = z.enum(['partner', 'offer', 'venue']);

const upsertSchema = z.object({
  entityKind: FavoriteKindSchema,
  entityId: z.string().min(1).max(200),
});

/**
 * GET /api/favorites
 * Returns the authenticated user's favorited entity references.
 */
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const rows = await prisma.favorite.findMany({
    where: { userId, NOT: { entityId: null } },
    select: { id: true, entityKind: true, entityId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: rows });
}));

/**
 * POST /api/favorites — idempotent add.
 */
router.post('/', writeLimiter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { entityKind, entityId } = upsertSchema.parse(req.body);
  const row = await prisma.favorite.upsert({
    where: { userId_entityKind_entityId: { userId, entityKind, entityId } },
    update: {},
    create: { userId, entityKind, entityId },
    select: { id: true, entityKind: true, entityId: true, createdAt: true },
  });
  res.json({ success: true, data: row });
}));

/**
 * DELETE /api/favorites — remove a single favorite.
 */
router.delete('/', writeLimiter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { entityKind, entityId } = upsertSchema.parse(req.body);
  await prisma.favorite.deleteMany({ where: { userId, entityKind, entityId } });
  res.json({ success: true });
}));

/**
 * DELETE /api/favorites/all — clear every favorite for the current user.
 */
router.delete('/all', writeLimiter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  await prisma.favorite.deleteMany({ where: { userId, NOT: { entityId: null } } });
  res.json({ success: true });
}));

export default router;
