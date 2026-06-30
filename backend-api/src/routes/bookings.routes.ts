import { Router, Response } from 'express';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { authenticate, AuthRequest, requireActiveSubscription, requireActiveAdmin } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import prisma from '../lib/prisma';

const router = Router();
router.use(authenticate);

const idParamSchema = z.string().uuid('id must be a valid UUID');

const BookingStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']);

const createSchema = z.object({
  partnerId: z.string().uuid(),
  venueId: z.string().uuid().optional(),
  bookingDate: z.string().datetime({ offset: true }).refine(v => new Date(v) > new Date(), 'bookingDate must be in the future'),
  bookingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'bookingTime must be a valid 24-hour time in HH:MM format'),
  guestCount: z.number().int().positive(),
  specialRequests: z.string().max(2000).optional(),
  specialRequestsBg: z.string().max(2000).optional(),
});

const updateSchema = z.object({
  bookingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'bookingTime must be a valid 24-hour time in HH:MM format').optional(),
  guestCount: z.number().int().positive().optional(),
  specialRequests: z.string().max(2000).optional(),
  specialRequestsBg: z.string().max(2000).optional(),
});

const cancelSchema = z.object({
  cancellationReason: z.string().max(1000).optional(),
});

const listQuerySchema = z.object({
  status: BookingStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const partnerStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED']),
  cancellationReason: z.string().max(1000).optional(),
});

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

async function generateConfirmationCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CHARS[randomInt(CHARS.length)];
    }
    const existing = await prisma.booking.findUnique({ where: { confirmationCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique confirmation code');
}

router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;

  // §1.5 aro gate: INACTIVE admins (aro=true) must not enumerate all bookings
  if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && req.user!.aro === true) {
    return res.status(403).json({
      success: false,
      error: 'Your admin account is inactive. Operational rights are limited to read-only access. Contact a Super Admin to restore full access.',
    });
  }

  const { status, page, limit } = listQuerySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    where.userId = userId;
  }
  if (status) where.status = status;

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        partnerId: true,
        venueId: true,
        bookingDate: true,
        bookingTime: true,
        guestCount: true,
        specialRequests: true,
        status: true,
        confirmationCode: true,
        cancelledAt: true,
        cancellationReason: true,
        createdAt: true,
        updatedAt: true,
        partner: { select: { id: true, businessName: true } },
        venue: { select: { id: true, name: true } },
      },
    }),
  ]);

  res.json({ success: true, data: bookings, meta: { total, page, limit } });
}));

router.post('/', requireActiveSubscription, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const body = createSchema.parse(req.body);

  const partner = await prisma.partner.findUnique({ where: { id: body.partnerId }, select: { id: true } });
  if (!partner) {
    return res.status(404).json({ success: false, error: 'Partner not found' });
  }

  if (body.venueId) {
    const venue = await prisma.venue.findUnique({ where: { id: body.venueId }, select: { id: true, partnerId: true } });
    if (!venue || venue.partnerId !== body.partnerId) {
      return res.status(400).json({ success: false, error: 'Venue does not belong to the specified partner' });
    }
  }

  const confirmationCode = await generateConfirmationCode();

  const booking = await prisma.booking.create({
    data: {
      userId,
      partnerId: body.partnerId,
      venueId: body.venueId ?? null,
      bookingDate: new Date(body.bookingDate),
      bookingTime: body.bookingTime,
      guestCount: body.guestCount,
      specialRequests: body.specialRequests ?? null,
      specialRequestsBg: body.specialRequestsBg ?? null,
      confirmationCode,
      status: 'PENDING',
    },
    select: {
      id: true,
      partnerId: true,
      venueId: true,
      bookingDate: true,
      bookingTime: true,
      guestCount: true,
      specialRequests: true,
      status: true,
      confirmationCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json({ success: true, data: booking });
}));

router.get('/partner', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  if (role !== 'PARTNER') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const { status, page, limit } = listQuerySchema.parse(req.query);
  const skip = (page - 1) * limit;

  const partner = await prisma.partner.findUnique({ where: { userId }, select: { id: true } });
  if (!partner) {
    return res.status(404).json({ success: false, error: 'Partner profile not found' });
  }

  const where: Record<string, unknown> = { partnerId: partner.id };
  if (status) where.status = status;

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { bookingDate: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        userId: true,
        venueId: true,
        bookingDate: true,
        bookingTime: true,
        guestCount: true,
        specialRequests: true,
        specialRequestsBg: true,
        notes: true,
        status: true,
        confirmationCode: true,
        cancelledAt: true,
        cancellationReason: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        venue: { select: { id: true, name: true } },
      },
    }),
  ]);

  res.json({ success: true, data: bookings, meta: { total, page, limit } });
}));

router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { id } = req.params;
  const parseId = idParamSchema.safeParse(id);
  if (!parseId.success) {
    return res.status(400).json({ success: false, error: 'Invalid booking id' });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      partnerId: true,
      venueId: true,
      bookingDate: true,
      bookingTime: true,
      guestCount: true,
      specialRequests: true,
      specialRequestsBg: true,
      notes: true,
      status: true,
      confirmationCode: true,
      cancelledAt: true,
      cancellationReason: true,
      createdAt: true,
      updatedAt: true,
      partner: { select: { id: true, businessName: true, userId: true } },
      venue: { select: { id: true, name: true } },
    },
  });

  if (!booking) {
    return res.status(404).json({ success: false, error: 'Booking not found' });
  }

  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isOwner = booking.userId === userId;
  const isPartnerOwner = role === 'PARTNER' && booking.partner.userId === userId;

  if (!isOwner && !isPartnerOwner && !isAdmin) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const { userId: _partnerUserId, ...partnerPublic } = booking.partner;
  const responseData = { ...booking, partner: partnerPublic };
  res.json({ success: true, data: responseData });
}));

router.patch('/partner/:id/status', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const parseId = idParamSchema.safeParse(id);
  if (!parseId.success) {
    return res.status(400).json({ success: false, error: 'Invalid booking id' });
  }
  const role = req.user!.role;
  if (role !== 'PARTNER') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const { status, cancellationReason } = partnerStatusSchema.parse(req.body);

  const partner = await prisma.partner.findUnique({ where: { userId }, select: { id: true } });
  if (!partner) {
    return res.status(404).json({ success: false, error: 'Partner profile not found' });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, partnerId: true, status: true },
  });

  if (!booking) {
    return res.status(404).json({ success: false, error: 'Booking not found' });
  }

  if (booking.partnerId !== partner.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const TERMINAL_STATES: string[] = ['CANCELLED', 'COMPLETED', 'NO_SHOW'];
  if (TERMINAL_STATES.includes(booking.status)) {
    return res.status(409).json({ success: false, error: `Cannot update a booking with terminal status ${booking.status}` });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status,
      ...(status === 'CANCELLED' && { cancelledAt: new Date() }),
      ...(status === 'CANCELLED' && cancellationReason !== undefined && { cancellationReason }),
    },
    select: {
      id: true,
      status: true,
      cancelledAt: true,
      cancellationReason: true,
      updatedAt: true,
    },
  });

  res.json({ success: true, data: updated });
}));

router.patch('/:id', requireActiveAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { id } = req.params;
  const parseId = idParamSchema.safeParse(id);
  if (!parseId.success) {
    return res.status(400).json({ success: false, error: 'Invalid booking id' });
  }
  const body = updateSchema.parse(req.body);

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });

  if (!booking) {
    return res.status(404).json({ success: false, error: 'Booking not found' });
  }

  if (booking.userId !== userId && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  if (booking.status !== 'PENDING') {
    return res.status(409).json({ success: false, error: 'Only PENDING bookings can be updated' });
  }

  const data = {
    ...(body.bookingTime !== undefined && { bookingTime: body.bookingTime }),
    ...(body.guestCount !== undefined && { guestCount: body.guestCount }),
    ...(body.specialRequests !== undefined && { specialRequests: body.specialRequests }),
    ...(body.specialRequestsBg !== undefined && { specialRequestsBg: body.specialRequestsBg }),
  };

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ success: false, error: 'No updatable fields provided' });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data,
    select: {
      id: true,
      bookingDate: true,
      bookingTime: true,
      guestCount: true,
      specialRequests: true,
      status: true,
      confirmationCode: true,
      updatedAt: true,
    },
  });

  res.json({ success: true, data: updated });
}));

router.delete('/:id', requireActiveAdmin, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { id } = req.params;
  const parseId = idParamSchema.safeParse(id);
  if (!parseId.success) {
    return res.status(400).json({ success: false, error: 'Invalid booking id' });
  }
  const { cancellationReason } = cancelSchema.parse(req.body);

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });

  if (!booking) {
    return res.status(404).json({ success: false, error: 'Booking not found' });
  }

  if (booking.userId !== userId && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED' || booking.status === 'NO_SHOW') {
    return res.status(409).json({ success: false, error: `Cannot cancel a booking with status ${booking.status}` });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancellationReason: cancellationReason ?? null,
    },
    select: {
      id: true,
      status: true,
      cancelledAt: true,
      cancellationReason: true,
      updatedAt: true,
    },
  });

  res.json({ success: true, data: updated });
}));

export default router;
