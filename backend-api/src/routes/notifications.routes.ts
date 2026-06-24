import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { emitNotification } from '../lib/socket';
import { getVapidPublicKey } from '../lib/webPush';
import { parsePagination } from '../utils/pagination';

const router = Router();

/**
 * Default preference shape returned when the user hasn't customized anything.
 * Matches NotificationPreferences in partner-dashboard/src/services/notifications.service.ts.
 */
const DEFAULT_PREFERENCES = {
  email: {
    enabled: true,
    bookingConfirmations: true,
    bookingReminders: true,
    newOffers: true,
    promotions: false,
    reviews: true,
    systemAnnouncements: true,
  },
  push: {
    enabled: true,
    bookingConfirmations: true,
    bookingReminders: true,
    newOffers: true,
    promotions: false,
    reviews: true,
    systemAnnouncements: true,
  },
  inApp: {
    enabled: true,
    showBadge: true,
    playSound: false,
    showDesktopNotifications: false,
  },
  sms: {
    enabled: false,
    bookingConfirmations: false,
    bookingReminders: false,
  },
  quietHours: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
  },
};

type DbNotification = Awaited<
  ReturnType<typeof prisma.notification.findFirst>
>;

const PREFERENCE_CATEGORY_KEYS = ['email', 'push', 'inApp', 'sms', 'quietHours'] as const;

function isPlainObject(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * OR clause that filters out expired notifications. Factory so `new Date()`
 * is evaluated at query time, not module load.
 */
function activeOnly() {
  return [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
}

/**
 * Map a Prisma Notification row → the shape the frontend NotificationsService expects.
 *
 * Backend stores type as an UPPER_SNAKE enum and read state across two columns
 * (isRead + archivedAt). The frontend service uses lowercase types and a single
 * `status: 'unread' | 'read' | 'archived'` field, so we normalize here.
 */
function serializeNotification(n: NonNullable<DbNotification>) {
  const status: 'unread' | 'read' | 'archived' = n.archivedAt
    ? 'archived'
    : n.isRead
      ? 'read'
      : 'unread';

  let metadata: Record<string, any> | undefined;
  if (n.data) {
    try {
      metadata = JSON.parse(n.data);
    } catch {
      metadata = undefined;
    }
  }

  return {
    id: n.id,
    userId: n.userId,
    type: n.type.toLowerCase(),
    priority: n.priority,
    status,
    title: n.title,
    titleBg: n.titleBg ?? n.title,
    message: n.message,
    messageBg: n.messageBg ?? n.message,
    actionUrl: n.actionUrl ?? undefined,
    actionText: n.actionText ?? undefined,
    actionTextBg: n.actionTextBg ?? undefined,
    relatedEntityType: n.relatedEntityType ?? undefined,
    relatedEntityId: n.relatedEntityId ?? undefined,
    imageUrl: n.imageUrl ?? undefined,
    metadata,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt?.toISOString(),
    archivedAt: n.archivedAt?.toISOString(),
    expiresAt: n.expiresAt?.toISOString(),
  };
}

/**
 * Build the Prisma where clause from query filters sent by the frontend.
 * Status filter maps onto the (isRead, archivedAt) columns.
 */
function buildWhere(userId: string, query: any) {
  const where: any = { userId };

  // Default: hide archived from un-filtered lists; explicit status filter overrides.
  if (query.status === 'unread') {
    where.isRead = false;
    where.archivedAt = null;
  } else if (query.status === 'read') {
    where.isRead = true;
    where.archivedAt = null;
  } else if (query.status === 'archived') {
    where.archivedAt = { not: null };
  } else {
    where.archivedAt = null;
  }

  if (query.type) {
    where.type = String(query.type).toUpperCase();
  }

  if (query.priority) {
    where.priority = String(query.priority);
  }

  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) where.createdAt.gte = new Date(query.startDate);
    if (query.endDate) where.createdAt.lte = new Date(query.endDate);
  }

  where.OR = activeOnly();

  return where;
}

// ============================================
// Preferences
// ============================================

/**
 * GET /api/notifications/preferences
 * Returns the merged (defaults + user overrides) preference object.
 */
router.get(
  '/preferences',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });

    const stored = (user?.notificationPreferences as Record<string, any>) || {};
    return res.json({ userId, ...DEFAULT_PREFERENCES, ...stored });
  })
);

/**
 * PUT /api/notifications/preferences
 * Shallow-merges incoming preferences with stored ones.
 */
router.put(
  '/preferences',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const incoming = (isPlainObject(req.body) ? req.body : {}) as Record<string, any>;

    // Validate each category is an object — without this, a client PATCH like
    // `{ email: "nope" }` would corrupt the stored JSON and crash the frontend.
    for (const key of PREFERENCE_CATEGORY_KEYS) {
      if (key in incoming && !isPlainObject(incoming[key])) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `preferences.${key} must be an object`,
        });
      }
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });
    const stored = (existing?.notificationPreferences as Record<string, any>) || {};

    // Deep-merge per category so a partial update like `{ email: { enabled: false } }`
    // doesn't clobber sibling fields (bookingConfirmations, promotions, …).
    const merged: Record<string, any> = {};
    for (const key of PREFERENCE_CATEGORY_KEYS) {
      merged[key] = {
        ...(DEFAULT_PREFERENCES as any)[key],
        ...(isPlainObject(stored[key]) ? stored[key] : {}),
        ...(isPlainObject(incoming[key]) ? incoming[key] : {}),
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { notificationPreferences: merged },
    });

    return res.json({ userId, ...merged });
  })
);

// ============================================
// Unread count
// ============================================

/**
 * GET /api/notifications/unread/count
 * Cheap endpoint polled by the bell-icon badge.
 */
router.get(
  '/unread/count',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const count = await prisma.notification.count({
      where: { userId, isRead: false, archivedAt: null, OR: activeOnly() },
    });
    return res.json({ count });
  })
);

// ============================================
// Mark all as read
// ============================================

/**
 * POST /api/notifications/read-all
 * Marks every unread notification for this user as read.
 */
router.post(
  '/read-all',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false, archivedAt: null, OR: activeOnly() },
      data: { isRead: true, readAt: new Date() },
    });
    return res.json({ success: true, updated: result.count });
  })
);

// ============================================
// Delete all
// ============================================

/**
 * DELETE /api/notifications/all
 * Hard-deletes every notification for the user. Mounted before /:id so the
 * wildcard route doesn't capture "all".
 */
router.delete(
  '/all',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const result = await prisma.notification.deleteMany({ where: { userId } });
    return res.json({ success: true, deleted: result.count });
  })
);

// ============================================
// Statistics
// ============================================

/**
 * GET /api/notifications/statistics
 * Aggregate counts by type/priority over an optional date range.
 */
router.get(
  '/statistics',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const where: any = { userId, OR: activeOnly() };

    if (req.query.startDate || req.query.endDate) {
      where.createdAt = {};
      if (req.query.startDate) where.createdAt.gte = new Date(String(req.query.startDate));
      if (req.query.endDate) where.createdAt.lte = new Date(String(req.query.endDate));
    }

    const [total, unread, byTypeRaw, byPriorityRaw] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { ...where, isRead: false, archivedAt: null },
      }),
      prisma.notification.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
      }),
      prisma.notification.groupBy({
        by: ['priority'],
        where,
        _count: { _all: true },
      }),
    ]);

    const byType: Record<string, number> = {};
    byTypeRaw.forEach((row) => {
      byType[row.type.toLowerCase()] = row._count._all;
    });

    const byPriority: Record<string, number> = {};
    byPriorityRaw.forEach((row) => {
      byPriority[row.priority] = row._count._all;
    });

    return res.json({ total, unread, byType, byPriority });
  })
);

// ============================================
// Test notification
// ============================================

/**
 * POST /api/notifications/test
 * Inserts a test notification for the calling user. Useful for verifying the
 * realtime + UI plumbing without waiting for a real event.
 */
router.post(
  '/test',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const created = await prisma.notification.create({
      data: {
        userId,
        type: 'SYSTEM',
        priority: 'low',
        title: 'Test notification',
        titleBg: 'Тестово известие',
        message: 'This is a test notification from your settings page.',
        messageBg: 'Това е тестово известие от страницата с настройки.',
        isRead: false,
      },
    });

    const payload = serializeNotification(created);
    emitNotification(userId, payload);
    return res.status(201).json(payload);
  })
);

// ============================================
// List
// ============================================

/**
 * GET /api/notifications
 * Paginated, filterable list of notifications for the current user.
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });

    const where = buildWhere(userId, req.query);

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId, isRead: false, archivedAt: null, OR: activeOnly() },
      }),
    ]);

    return res.json({
      data: items.map(serializeNotification),
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  })
);

// ============================================
// Single notification operations
// ============================================

/**
 * GET /api/notifications/:id
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const notif = await prisma.notification.findFirst({
      where: { id: req.params.id, userId },
    });

    if (!notif) {
      return res.status(404).json({ error: 'Not Found', message: 'Notification not found' });
    }

    return res.json(serializeNotification(notif));
  })
);

/**
 * POST /api/notifications/:id/read
 */
router.post(
  '/:id/read',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    // Scope the update by userId so users can't mark each other's notifications.
    const existing = await prisma.notification.findFirst({
      where: { id: req.params.id, userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Notification not found' });
    }

    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: { isRead: true, readAt: existing.readAt ?? new Date() },
    });

    return res.json(serializeNotification(updated));
  })
);

/**
 * POST /api/notifications/:id/archive
 */
router.post(
  '/:id/archive',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const existing = await prisma.notification.findFirst({
      where: { id: req.params.id, userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Notification not found' });
    }

    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    });

    return res.json(serializeNotification(updated));
  })
);

/**
 * DELETE /api/notifications/:id
 */
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const result = await prisma.notification.deleteMany({
      where: { id: req.params.id, userId },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Notification not found' });
    }

    return res.json({ success: true });
  })
);

// ============================================
// Push subscription aliases
// ============================================
// The existing /register-token + /unregister-token endpoints below cover Expo
// device tokens. The frontend service also calls /push/subscribe + /push/unsubscribe
// for browser PushSubscription objects — alias to the same handlers, treating
// the subscription endpoint as the platform=web token.

/**
 * GET /api/notifications/push/vapid-public-key
 * Public so the browser can fetch the applicationServerKey before the user is
 * logged in (subscription happens on first opt-in, not after auth gate).
 */
router.get(
  '/push/vapid-public-key',
  asyncHandler(async (_req, res: Response) => {
    const key = getVapidPublicKey();
    if (!key) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Web push is not configured on this server',
      });
    }
    return res.json({ publicKey: key });
  })
);

/**
 * POST /api/notifications/push/subscribe
 * Body: { subscription: PushSubscriptionJSON }
 */
router.post(
  '/push/subscribe',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const subscription = req.body?.subscription;

    if (!subscription?.endpoint) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'subscription.endpoint is required',
      });
    }

    // Use the endpoint URL as a stable token identifier.
    const token = subscription.endpoint;
    const data = JSON.stringify(subscription);

    const existing = await prisma.pushToken.findFirst({
      where: { token, userId },
    });

    if (existing) {
      await prisma.pushToken.update({
        where: { id: existing.id },
        data: { platform: 'web', deviceId: data, isActive: true, lastUsedAt: new Date() },
      });
    } else {
      await prisma.pushToken.create({
        data: { userId, token, platform: 'web', deviceId: data, isActive: true, lastUsedAt: new Date() },
      });
    }

    return res.json({ success: true });
  })
);

/**
 * POST /api/notifications/push/unsubscribe
 * Disables every active web subscription for this user.
 */
router.post(
  '/push/unsubscribe',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const result = await prisma.pushToken.updateMany({
      where: { userId, platform: 'web', isActive: true },
      data: { isActive: false },
    });
    return res.json({ success: true, deactivated: result.count });
  })
);

// ============================================
// Push token registration (Expo / native)
// ============================================

/**
 * @swagger
 * /api/notifications/register-token:
 *   post:
 *     summary: Register push notification token
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Push notification token from Expo
 *               platform:
 *                 type: string
 *                 enum: [ios, android, web]
 *                 description: Device platform
 *               deviceId:
 *                 type: string
 *                 description: Unique device identifier
 *             required:
 *               - token
 *               - platform
 *     responses:
 *       200:
 *         description: Token registered successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  '/register-token',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { token, platform, deviceId } = req.body;
    const userId = req.user!.id;

    if (!token || !platform) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token and platform are required',
      });
    }

    try {
      const existingToken = await prisma.pushToken.findFirst({
        where: { token, userId },
      });

      if (existingToken) {
        await prisma.pushToken.update({
          where: { id: existingToken.id },
          data: { platform, deviceId, isActive: true, lastUsedAt: new Date() },
        });
        logger.info(`Push token updated for user ${userId}`);
      } else {
        await prisma.pushToken.create({
          data: { userId, token, platform, deviceId, isActive: true, lastUsedAt: new Date() },
        });
        logger.info(`New push token registered for user ${userId}`);
      }

      return res.status(200).json({
        success: true,
        message: 'Push token registered successfully',
      });
    } catch (error) {
      logger.error('Failed to register push token:', error);
      return res.status(500).json({
        error: 'Server Error',
        message: 'Failed to register push token',
      });
    }
  })
);

/**
 * @swagger
 * /api/notifications/unregister-token:
 *   post:
 *     summary: Unregister push notification token
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Push notification token to unregister
 *             required:
 *               - token
 *     responses:
 *       200:
 *         description: Token unregistered successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  '/unregister-token',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { token } = req.body;
    const userId = req.user!.id;

    if (!token) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token is required',
      });
    }

    try {
      await prisma.pushToken.updateMany({
        where: { token, userId },
        data: { isActive: false },
      });

      logger.info(`Push token unregistered for user ${userId}`);

      return res.status(200).json({
        success: true,
        message: 'Push token unregistered successfully',
      });
    } catch (error) {
      logger.error('Failed to unregister push token:', error);
      return res.status(500).json({
        error: 'Server Error',
        message: 'Failed to unregister push token',
      });
    }
  })
);

export default router;
