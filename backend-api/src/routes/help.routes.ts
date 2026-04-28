import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const router = Router();

const submitTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  body: z.string().min(10).max(5000),
  category: z.enum(['CASHBACK', 'ACCOUNT', 'PAYMENT', 'TECHNICAL', 'OTHER']),
});

/**
 * POST /api/help/ticket
 * Submit a support ticket from the mobile app.
 */
router.post(
  '/ticket',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parseResult = submitTicketSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request',
        errors: parseResult.error.issues,
      });
    }

    const { subject, body, category } = parseResult.data;
    const userId = req.user!.id;

    const ticket = await prisma.helpTicket.create({
      data: { subject, body, category, userId },
      select: { id: true, subject: true, category: true, status: true, createdAt: true },
    });

    return res.status(201).json({ success: true, data: ticket });
  })
);

/**
 * GET /api/help/tickets
 * List the current user's own tickets.
 */
router.get(
  '/tickets',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const tickets = await prisma.helpTicket.findMany({
      where: { userId: req.user!.id },
      select: { id: true, subject: true, category: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return res.json({ success: true, data: tickets });
  })
);

export default router;
