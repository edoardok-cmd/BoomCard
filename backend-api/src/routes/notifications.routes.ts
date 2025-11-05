import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router = Router();

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
      // Check if token already exists
      const existingToken = await prisma.pushToken.findFirst({
        where: {
          token,
          userId,
        },
      });

      if (existingToken) {
        // Update existing token
        await prisma.pushToken.update({
          where: { id: existingToken.id },
          data: {
            platform,
            deviceId,
            isActive: true,
            lastUsedAt: new Date(),
          },
        });

        logger.info(`Push token updated for user ${userId}`);
      } else {
        // Create new token
        await prisma.pushToken.create({
          data: {
            userId,
            token,
            platform,
            deviceId,
            isActive: true,
            lastUsedAt: new Date(),
          },
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
        where: {
          token,
          userId,
        },
        data: {
          isActive: false,
        },
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

/**
 * @swagger
 * /api/notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification preferences retrieved
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get(
  '/preferences',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          notificationPreferences: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
      }

      return res.status(200).json({
        preferences: user.notificationPreferences || {
          pushEnabled: true,
          emailEnabled: false,
          offers: true,
          receipts: true,
          wallet: true,
        },
      });
    } catch (error) {
      logger.error('Failed to get notification preferences:', error);
      return res.status(500).json({
        error: 'Server Error',
        message: 'Failed to get notification preferences',
      });
    }
  })
);

/**
 * @swagger
 * /api/notifications/preferences:
 *   put:
 *     summary: Update notification preferences
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
 *               pushEnabled:
 *                 type: boolean
 *               emailEnabled:
 *                 type: boolean
 *               offers:
 *                 type: boolean
 *               receipts:
 *                 type: boolean
 *               wallet:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put(
  '/preferences',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const preferences = req.body;

    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          notificationPreferences: preferences,
        },
      });

      logger.info(`Notification preferences updated for user ${userId}`);

      return res.status(200).json({
        success: true,
        message: 'Notification preferences updated',
        preferences,
      });
    } catch (error) {
      logger.error('Failed to update notification preferences:', error);
      return res.status(500).json({
        error: 'Server Error',
        message: 'Failed to update notification preferences',
      });
    }
  })
);

export default router;
