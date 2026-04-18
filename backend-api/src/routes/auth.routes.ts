import { Router, Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { registerValidation, loginValidation, updateProfileValidation, changePasswordValidation } from '../validators/auth.validator';
import { AuthService } from '../services/auth.service';
import { imageUploadService } from '../services/imageUpload.service';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { authRateLimiter, switchAccountRateLimiter, switchableAccountsRateLimiter, impersonateRateLimiter } from '../middleware/security.middleware';

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
});

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
    const { email, password, firstName, lastName, phone, acceptTerms, accountType, businessInfo } = req.body;

    const result = await AuthService.register({
      email,
      password,
      firstName,
      lastName,
      phone,
      acceptTerms,
      accountType,
      businessInfo,
    });

    res.status(201).json({
      success: true,
      message: accountType === 'partner'
        ? 'Partner application received — pending verification'
        : 'User registered successfully',
      data: result,
    });
  })
);

router.get(
  '/verify-email',
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.query as { token?: string };
    const frontendBase = process.env.FRONTEND_URL || 'https://boomcard.bg';

    if (!token) {
      return res.redirect(`${frontendBase}/login?error=missing_token`);
    }

    try {
      const { alreadyVerified } = await AuthService.verifyEmail(token);
      const dest = alreadyVerified
        ? `${frontendBase}/login?emailVerified=already`
        : `${frontendBase}/login?emailVerified=true`;
      return res.redirect(dest);
    } catch (err: any) {
      const msg = encodeURIComponent(err?.message || 'invalid_token');
      return res.redirect(`${frontendBase}/login?error=${msg}`);
    }
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
    const { email, password, clientType } = req.body;

    const result = await AuthService.login({ email, password, clientType });

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

    // Echo impersonation claims from the bearer token so the frontend can
    // reconcile its local banner state against authoritative server truth.
    // Without this, a cleared localStorage entry (or a tab that rehydrates
    // from stale state) would desync the banner from the actual session.
    const impersonation = req.user!.imp
      ? {
          adminId: req.user!.impBy!,
          adminRole: req.user!.impByRole!,
        }
      : undefined;

    res.json({
      success: true,
      data: {
        ...user,
        ...(impersonation ? { impersonation } : {}),
      },
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
 * POST /api/auth/forgot-password
 * Send password reset OTP to email
 */
router.post(
  '/forgot-password',
  authRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Validation Error', message: 'Email is required' });
    }

    const result = await AuthService.forgotPassword(email);

    res.json({ success: true, message: result.message });
  })
);

/**
 * POST /api/auth/reset-password
 * Reset password using OTP
 */
router.post(
  '/reset-password',
  authRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Validation Error', message: 'Email, OTP, and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Validation Error', message: 'Password must be at least 8 characters' });
    }

    const result = await AuthService.resetPassword(email, otp, newPassword);

    res.json({ success: true, message: result.message });
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

/**
 * POST /api/auth/avatar
 * Upload profile photo
 */
router.post(
  '/avatar',
  authenticate,
  avatarUpload.single('avatar'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Validation Error', message: 'No image file provided' });
    }

    const userId = req.user!.id;
    const result = await imageUploadService.uploadImage({
      file: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder: 'avatars',
      userId,
    });

    const user = await AuthService.updateAvatar(userId, result.url);

    res.json({
      success: true,
      message: 'Profile photo updated',
      data: user,
    });
  })
);

/**
 * DELETE /api/auth/avatar
 * Remove profile photo
 */
router.delete(
  '/avatar',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const user = await AuthService.removeAvatar(userId);

    res.json({
      success: true,
      message: 'Profile photo removed',
      data: user,
    });
  })
);

// Prefer the `ct` claim stamped at login time. Tokens minted before that
// claim existed (pre-deploy) fall back to Origin/Referer inference: a
// browser always sends at least one of those; the Expo native app sends
// neither. Role-based inference was lossy for USER-on-web sessions (a
// customer browsing the web app would be misclassified as mobile and get
// 403'd on /switch-account).
function resolveClientType(req: AuthRequest): 'mobile' | 'web' {
  if (req.user!.ct) return req.user!.ct;
  const origin = req.get('origin') || req.get('referer');
  return origin ? 'web' : 'mobile';
}

/**
 * GET /api/auth/switchable-accounts
 * List sibling accounts the current session can switch into without re-auth.
 * Empty list when the session's login matched a single account.
 */
router.get(
  '/switchable-accounts',
  authenticate,
  switchableAccountsRateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const accounts = await AuthService.getSwitchableAccounts(req.user!.ag, resolveClientType(req));

    res.json({ success: true, data: accounts });
  }),
);

/**
 * POST /api/auth/switch-account
 * Mint a fresh token pair for one of the sibling accounts from the current
 * session's ag claim. Old refresh token (if supplied) is rotated out.
 *
 * Rate-limited via `switchAccountRateLimiter` (userId-keyed, 30/15min) —
 * tighter than ordinary API traffic but loose enough to never get in a
 * real user's way. Mounted AFTER `authenticate` so the limiter keys by
 * req.user.id rather than IP (office NAT would otherwise starve itself).
 */
router.post(
  '/switch-account',
  authenticate,
  switchAccountRateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { targetAccountId, refreshToken } = req.body as {
      targetAccountId?: string;
      refreshToken?: string;
    };

    if (!targetAccountId || typeof targetAccountId !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'targetAccountId is required',
      });
    }

    // Belt-and-braces: impersonation tokens intentionally carry no `ag`, so
    // switchAccount already refuses them at the service layer (no sibling
    // group). Rejecting them at the route gives a clearer error and mirrors
    // the guard on /auth/impersonate so the two flows can't interleave.
    if (req.user!.imp) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Cannot switch accounts while impersonating — stop impersonation first',
      });
    }

    const result = await AuthService.switchAccount({
      currentUserId: req.user!.id,
      accountGroup: req.user!.ag,
      clientType: resolveClientType(req),
      targetAccountId,
      currentRefreshToken: refreshToken,
      tokenIssuedAt: req.user!.iat,
    });

    res.json({
      success: true,
      message: 'Account switched',
      data: result,
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/auth/users/partners
// Admin only — returns users with PARTNER role who don't yet have
// a Partner record (i.e., unattached PARTNER users available for
// partner creation). Supports optional ?search= query.
// ----------------------------------------------------------------
router.get(
  '/users/partners',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { search } = req.query as { search?: string };

    const where: any = { role: 'PARTNER' };
    if (search && search.trim()) {
      where.OR = [
        { firstName: { contains: search.trim(), mode: 'insensitive' } },
        { lastName: { contains: search.trim(), mode: 'insensitive' } },
        { email: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    // Fetch all PARTNER-role users
    const users = await prisma.user.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 50,
    });

    // Exclude users who already have a Partner record
    const existingPartnerUserIds = await prisma.partner
      .findMany({ select: { userId: true } })
      .then(partners => new Set(partners.map(p => p.userId)));

    const available = users.filter(u => !existingPartnerUserIds.has(u.id));

    res.json({ success: true, data: available });
  }),
);

// ----------------------------------------------------------------
// GET /api/auth/impersonatable-partners
// Admin only — lists partners (PARTNER users WITH an attached Partner
// record) that an admin can impersonate. Distinct from /users/partners,
// which returns partner-role users WITHOUT a Partner record (for the
// attach-partner admin flow). Response is intentionally minimal.
// ----------------------------------------------------------------
router.get(
  '/impersonatable-partners',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { search } = req.query as { search?: string };

    const where: any = {
      user: { role: 'PARTNER', status: 'ACTIVE' },
    };
    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { businessName: { contains: term, mode: 'insensitive' } },
        { businessNameBg: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { user: { firstName: { contains: term, mode: 'insensitive' } } },
        { user: { lastName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const partners = await prisma.partner.findMany({
      where,
      select: {
        id: true,
        userId: true,
        businessName: true,
        businessNameBg: true,
        logo: true,
        status: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
        },
      },
      orderBy: [{ businessName: 'asc' }],
      take: 100,
    });

    res.json({
      success: true,
      data: partners.map((p) => ({
        partnerId: p.id,
        userId: p.userId,
        businessName: p.businessName,
        businessNameBg: p.businessNameBg,
        logo: p.logo,
        status: p.status,
        email: p.user.email,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        avatar: p.user.avatar,
      })),
    });
  }),
);

// ----------------------------------------------------------------
// POST /api/auth/impersonate
// Admin only — assume a PARTNER session. Issues tokens stamped with
// `imp:true` + `impBy:<adminId>` so /auth/stop-impersonate can restore
// the admin without re-auth. See AuthService.impersonate for invariants.
// ----------------------------------------------------------------
router.post(
  '/impersonate',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  impersonateRateLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { targetPartnerUserId, refreshToken } = req.body as {
      targetPartnerUserId?: string;
      refreshToken?: string;
    };

    if (!targetPartnerUserId || typeof targetPartnerUserId !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'targetPartnerUserId is required',
      });
    }

    // Refuse to start a nested impersonation — the `imp` bit on the caller's
    // token means they're already impersonating. Requiring them to stop
    // first keeps the audit trail linear and avoids "impBy of impBy" chains.
    if (req.user!.imp) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Already impersonating — stop the current session first',
      });
    }

    const result = await AuthService.impersonate({
      adminId: req.user!.id,
      adminRole: req.user!.role,
      adminAccountGroup: req.user!.ag,
      targetPartnerUserId,
      clientType: resolveClientType(req),
      tokenIssuedAt: req.user!.iat,
      currentAdminRefreshToken: refreshToken,
    });

    res.json({
      success: true,
      message: 'Impersonation started',
      data: result,
    });
  }),
);

// ----------------------------------------------------------------
// POST /api/auth/stop-impersonate
// Ends the current impersonation session and issues a fresh admin token
// pair based on the `impBy` claim. Requires an impersonation token.
// ----------------------------------------------------------------
router.post(
  '/stop-impersonate',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { refreshToken } = req.body as { refreshToken?: string };

    const result = await AuthService.stopImpersonate({
      currentUserId: req.user!.id,
      impersonatedBy: req.user!.impBy,
      impersonatedByAg: req.user!.impAg,
      isImpersonation: req.user!.imp === true,
      clientType: resolveClientType(req),
      currentRefreshToken: refreshToken,
    });

    res.json({
      success: true,
      message: 'Impersonation ended',
      data: result,
    });
  }),
);

export default router;
