import { Router } from 'express';
import { PartnerStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/admin/partner-requests?page=1&limit=20&search=...
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('partners.requests.read'), async (req, res, next) => {
  try {
    const { search, page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where: Parameters<typeof prisma.partner.findMany>[0]['where'] = {
      status: PartnerStatus.PENDING,
    };

    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        where,
        skip,
        take,
        orderBy: { joinedAt: 'asc' },
        select: {
          id: true,
          businessName: true,
          category: true,
          email: true,
          phone: true,
          city: true,
          discountRate: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      prisma.partner.count({ where }),
    ]);

    res.json({ partners, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/partner-requests/:id/approve
router.post('/:id/approve', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('partners.requests.write'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    if (partner.status !== PartnerStatus.PENDING) {
      return res.status(400).json({ success: false, error: 'Partner is not in PENDING state' });
    }

    const updated = await prisma.partner.update({
      where: { id },
      data: { status: PartnerStatus.ACTIVE, verifiedAt: new Date() },
    });

    res.json({ success: true, partner: updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/partner-requests/:id/reject
router.post('/:id/reject', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('partners.requests.write'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!reason?.trim()) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }

    const partner = await prisma.partner.findUnique({ where: { id } });
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    if (partner.status !== PartnerStatus.PENDING) {
      return res.status(400).json({ success: false, error: 'Partner is not in PENDING state' });
    }

    const updated = await prisma.partner.update({
      where: { id },
      data: { status: PartnerStatus.INACTIVE },
    });

    res.json({ success: true, partner: updated, reason });
  } catch (error) {
    next(error);
  }
});

export default router;
