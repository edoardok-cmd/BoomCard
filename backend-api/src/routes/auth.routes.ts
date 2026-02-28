import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { registerValidation, loginValidation, updateProfileValidation, changePasswordValidation } from '../validators/auth.validator';
import { AuthService } from '../services/auth.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     description: Create a new user account with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           example:
 *             email: newuser@boomcard.bg
 *             password: SecurePass123!
 *             firstName: John
 *             lastName: Doe
 *             phone: "+359888123456"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  '/register',
  validate(registerValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, firstName, lastName, phone, acceptTerms } = req.body;

    const result = await AuthService.register({
      email,
      password,
      firstName,
      lastName,
      phone,
      acceptTerms,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result,
    });
  })
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     description: Authenticate user and receive JWT tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           example:
 *             email: user@boomcard.bg
 *             password: SecurePass123!
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  '/login',
  validate(loginValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const result = await AuthService.login({ email, password });

    res.json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  })
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Refresh token is required',
      });
    }

    const tokens = await AuthService.refreshToken(refreshToken);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: tokens,
    });
  })
);

/**
 * POST /api/auth/logout
 * Logout user (invalidate refresh token)
 */
router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await AuthService.logout(refreshToken);
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  })
);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    const user = await AuthService.getUserById(userId);

    res.json({
      success: true,
      data: user,
    });
  })
);

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put(
  '/profile',
  authenticate,
  validate(updateProfileValidation),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { firstName, lastName, phone } = req.body;

    const user = await AuthService.updateProfile(userId, {
      firstName,
      lastName,
      phone,
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user,
    });
  })
);

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordValidation),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    const result = await AuthService.changePassword(userId, currentPassword, newPassword);

    res.json({
      success: true,
      message: result.message,
    });
  })
);

/**
 * DELETE /api/auth/account
 * Delete user account (GDPR Art. 17 - Right to Erasure)
 * Requires password confirmation
 */
router.delete(
  '/account',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Password is required to confirm account deletion',
      });
    }

    const result = await AuthService.deleteAccount(userId, password);

    res.json({
      success: true,
      message: result.message,
    });
  })
);

/**
 * GET /api/auth/data-export
 * Export all user data (GDPR Art. 20 - Right to Data Portability)
 */
router.get(
  '/data-export',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    const exportData = await AuthService.exportUserData(userId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="boomcard-data-export-${new Date().toISOString().split('T')[0]}.json"`
    );

    res.json(exportData);
  })
);

/**
 * POST /api/auth/consent
 * Record user consent (GDPR audit trail)
 */
router.post(
  '/consent',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { type, version, granted } = req.body;

    if (!type || !['terms', 'privacy', 'marketing'].includes(type)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Consent type must be one of: terms, privacy, marketing',
      });
    }

    const result = await AuthService.recordConsent(userId, type, version, granted);

    res.json({
      success: true,
      message: 'Consent recorded successfully',
      data: result,
    });
  })
);

export default router;
