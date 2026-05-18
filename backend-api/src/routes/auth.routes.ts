import { Router, Request, Response } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { registerValidation, loginValidation, updateProfileValidation, changePasswordValidation } from '../validators/auth.validator';
import { AuthService } from '../services/auth.service';
import { imageUploadService } from '../services/imageUpload.service';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { authRateLimiter, switchAccountRateLimiter, switchableAccountsRateLimiter, impersonateRateLimiter } from '../middleware/security.middleware';
import { z } from 'zod';
import { SubscriptionStatus, SubscriptionPlan, UserStatus, CardType } from '@prisma/client';
import QRCode from 'qrcode';
import { cardService } from '../services/card.service';
import { walletService } from '../services/wallet.service';
import { emailService } from '../services/email.service';
import { writeAudit } from '../middleware/audit.middleware';
import { getClientIp } from '../utils/requestIp';
import { fireAutomation } from '../lib/automationDispatcher';
import { consumeActivationToken } from '../services/partnerActivation.service';
import { ActivationLinkError } from '../services/activationLink.service';

const TERMS_VERSION = process.env.TERMS_VERSION || '2026-02-24';

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
 * POST /api/auth/resend-email-verification — spec §9.5 v1.1
 * Self-service resend for the 24h email verification link. Authenticated:
 * any user can re-trigger a fresh link to their own account.
 */
router.post(
  '/resend-email-verification',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { alreadyVerified } = await AuthService.resendEmailVerification(req.user!.id);
    res.json({
      success: true,
      data: { alreadyVerified },
      message: alreadyVerified ? 'Email is already verified' : 'Verification email sent',
    });
  })
);

/**
 * POST /api/auth/request-email-verification — spec §9.5 v1.1 (public).
 *
 * Self-service when the user is locked out of login (emailVerified=false
 * blocks /login). Takes only an email; always returns success so the
 * endpoint can't be used for account enumeration. Auth rate-limiter applied
 * to throttle abuse.
 */
router.post(
  '/request-email-verification',
  authRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email address is required',
      });
    }
    await AuthService.requestEmailVerificationByEmail(email);
    res.json({
      success: true,
      message:
        'If an account exists for that email and is not yet verified, a verification link has been sent.',
    });
  })
);

/**
 * POST /api/auth/partner/activate — spec §5.2 v1.1
 * Public endpoint. Consumes a one-time activation token (issued at approve
 * or admin-onboard time, valid 72h). On success:
 *   - Partner.verifiedAt is stamped (login gate unblocks)
 *   - PENDING partners advance to ACTIVE
 *   - User.passwordHash is set if a password is supplied
 *
 * The `password` field is OPTIONAL: self-registered partners already chose
 * one at /auth/register and may omit it; admin-onboarded partners MUST
 * supply one (the temp password generated by /partners/onboard was never
 * shown to them).
 *
 * The whole consume — token mark, verifiedAt stamp, password hash —
 * happens inside one transaction in activationLinkService.consume, so a
 * crash mid-way can't leave the partner locked out.
 */
router.post(
  '/partner/activate',
  authRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'token is required' });
    }
    if (password !== undefined) {
      if (typeof password !== 'string') {
        return res.status(400).json({ success: false, error: 'password must be a string' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      }
    }
    try {
      const result = await consumeActivationToken(token, password ? { password } : {});

      // Spec §8.3 — "Активиран партньор: Незабавно след клик на activation link."
      // Fire AFTER the token is consumed so the partner record is fully active.
      fireAutomation('partner.approved', {
        partnerId: result.partnerId,
        recipientName: result.businessName,
      }).catch((err2) => logger.error('[automation] partner.approved fire failed (activate):', err2));

      return res.json({
        success: true,
        message: 'Partner activated. You may now log in.',
        partnerId: result.partnerId,
        businessName: result.businessName,
      });
    } catch (err: any) {
      // Spec §5.2 v1.1 — map typed ActivationLinkError to 400; everything else
      // is an unexpected 500. Substring-matching the message (the prior impl)
      // silently breaks when the message text changes.
      if (err instanceof ActivationLinkError) {
        return res.status(400).json({ success: false, error: err.message, code: err.code });
      }
      const msg = err?.message || 'Invalid activation link';
      return res.status(500).json({ success: false, error: msg });
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
    const { email, password, totpCode } = req.body;
    const origin = req.get('origin') || req.get('referer') || '';
    const clientType: 'mobile' | 'web' = req.body.clientType;

    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];
    const result = await AuthService.login({ email, password, clientType, ip, userAgent, totpCode });

    writeAudit({
      actorUserId: result.user?.id ?? null,
      action: 'auth.login',
      objectType: 'user',
      objectId: result.user?.id ?? null,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    }).catch(() => undefined);

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

    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];
    const tokens = await AuthService.refreshToken(refreshToken, { ip, userAgent });

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
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    if (refreshToken) {
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        select: { userId: true },
      }).catch(() => null);

      await AuthService.logout(refreshToken);

      if (storedToken?.userId) {
        writeAudit({
          actorUserId: storedToken.userId,
          action: 'auth.logout',
          objectType: 'user',
          objectId: storedToken.userId,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        }).catch(() => undefined);
      }
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
    const { firstName, lastName, phone, city, country, preferredLanguage } = req.body;

    const user = await AuthService.updateProfile(userId, {
      firstName,
      lastName,
      phone,
      city,
      country,
      preferredLanguage,
    } as any);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user,
    });
  })
);

/**
 * POST /api/auth/change-email/request
 * Initiate email change — sends a 6-char code to the new address (§5.8)
 */
router.post(
  '/change-email/request',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { newEmail } = req.body;
    if (!newEmail || typeof newEmail !== 'string') {
      return res.status(400).json({ error: 'Validation Error', message: 'newEmail is required' });
    }
    await AuthService.requestEmailChange(userId, newEmail);
    res.json({ success: true, message: 'Verification code sent' });
  })
);

/**
 * POST /api/auth/change-email/verify
 * Confirm email change with code + password (§5.8)
 */
router.post(
  '/change-email/verify',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { code, password } = req.body;
    if (!code || !password) {
      return res.status(400).json({ error: 'Validation Error', message: 'code and password are required' });
    }
    const user = await AuthService.confirmEmailChange(userId, code, password);
    res.json({ success: true, data: user });
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

    const validTypes = ['terms', 'privacy', 'marketing', 'email_marketing', 'phone_marketing'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Consent type must be one of: terms, privacy, marketing, email_marketing, phone_marketing',
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

// ============================================
// Complete Profile (anonymous checkout post-payment)
// POST /api/auth/complete-profile — no authentication; uses one-time payment token
// ============================================

function calcPeriodEnd(billingPeriod: string): Date {
  const d = new Date();
  if (billingPeriod === 'weekly') d.setDate(d.getDate() + 7);
  else if (billingPeriod === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

const completeProfileSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  marketingConsentEmail: z.boolean().optional().default(false),
  marketingConsentPhone: z.boolean().optional().default(false),
  lang: z.enum(['bg', 'en']).default('bg'),
});

router.post(
  '/complete-profile',
  authRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parseResult = completeProfileSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, message: 'Invalid request body', errors: parseResult.error.issues });
    }

    const { token, password, firstName, lastName, phone, marketingConsentEmail, marketingConsentPhone, lang } = parseResult.data;

    // Look up the PAID PendingSubscription by one-time token
    const pending = await prisma.pendingSubscription.findFirst({
      where: { token, status: 'PAID' },
      include: { plan: true },
    });

    if (!pending) {
      return res.status(400).json({ success: false, message: 'Invalid or expired registration token' });
    }

    if (!pending.tokenExpiresAt || pending.tokenExpiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'Registration token has expired' });
    }

    // Block same-email + same-role duplicate (cross-role coexistence is allowed per project rules)
    const existing = await prisma.user.findFirst({
      where: { email: pending.email, role: 'USER' },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please log in.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const planCodeMap: Record<string, SubscriptionPlan> = {
      LIGHT: SubscriptionPlan.LIGHT,
      BASIC: SubscriptionPlan.BASIC,
      PREMIUM: SubscriptionPlan.PREMIUM,
    };
    const subscriptionPlan = planCodeMap[pending.plan.planCode];
    if (!subscriptionPlan) {
      return res.status(500).json({ success: false, message: 'Invalid plan configuration' });
    }

    // Derive billingPeriod from plan code (LIGHT = weekly, others = monthly)
    // Use the billingPeriod stored at checkout — fall back to plan-code inference only for
    // legacy PendingSubscriptions created before the billingPeriod field was added.
    const billingPeriod: 'weekly' | 'monthly' | 'yearly' =
      (pending.billingPeriod === 'weekly' || pending.billingPeriod === 'yearly')
        ? pending.billingPeriod
        : 'monthly';
    const marketingConsent = !!(marketingConsentEmail || marketingConsentPhone);
    const now = new Date();

    // Pre-generate card assets outside the transaction (no DB access needed).
    const cardNumber = (() => {
      const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
      return `BOOM-${part()}-${part()}-${part()}`;
    })();
    const planToCardType: Record<string, CardType> = {
      LIGHT: CardType.LIGHT,
      BASIC: CardType.BASIC,
      PREMIUM: CardType.PREMIUM,
    };
    const cardTypeForPlan = planToCardType[subscriptionPlan] ?? CardType.LIGHT;
    const qrCodeData = JSON.stringify({ cardNumber, type: cardTypeForPlan, issuedAt: now.toISOString() });
    const qrCodeUrl = await QRCode.toDataURL(qrCodeData, { errorCorrectionLevel: 'H', width: 300, margin: 2 });

    // Atomic transaction: create user + loyalty + subscription + card + wallet,
    // mark PendingSubscription complete. All-or-nothing — no stranded users.
    const { user } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: pending.email,
          passwordHash,
          firstName: firstName?.trim() || pending.email.split('@')[0],
          lastName: lastName?.trim() || '',
          phone: phone?.trim() || null,
          role: 'USER',
          status: UserStatus.ACTIVE,
          emailVerified: true,
          emailVerifiedAt: now,
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          termsVersion: TERMS_VERSION,
          marketingConsentEmail,
          marketingConsentPhone,
          marketingConsent,
          preferredLanguage: lang,
        },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true },
      });

      // Create loyalty account
      await tx.loyaltyAccount.create({
        data: {
          userId: newUser.id,
          tier: 'BRONZE',
          points: 0,
          lifetimePoints: 0,
        },
      });

      // Create subscription
      await tx.subscription.create({
        data: {
          userId: newUser.id,
          plan: subscriptionPlan,
          status: SubscriptionStatus.ACTIVE,
          planId: pending.planId,
          payseraOrderId: pending.payseraOrderId,
          currentPeriodStart: pending.paidAt || now,
          currentPeriodEnd: calcPeriodEnd(billingPeriod),
          trialRefundEligibleUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          autoRenewal: true,
          metadata: JSON.stringify({ billingPeriod, source: 'payment_first_onboarding', completedAt: now.toISOString() }),
        },
      });

      // Create card inline so it's covered by the transaction
      await tx.card.create({
        data: {
          userId: newUser.id,
          cardNumber,
          type: cardTypeForPlan,
          status: 'ACTIVE',
          qrCode: qrCodeUrl,
        },
      });

      // Create wallet inline so it's covered by the transaction
      await tx.wallet.upsert({
        where: { userId: newUser.id },
        update: {},
        create: { userId: newUser.id, balance: 0, availableBalance: 0, pendingBalance: 0 },
      });

      // Mark PendingSubscription as COMPLETED and nullify the one-time token
      await tx.pendingSubscription.update({
        where: { id: pending.id },
        data: { status: 'COMPLETED', completedAt: now, token: null },
      });

      return { user: newUser };
    });

    // Sync card type to match the activated subscription plan
    await cardService.syncCardTypeWithSubscription(user.id, subscriptionPlan).catch((err) => {
      logger.error(`Failed to sync card type for user ${user.id}:`, err);
    });

    // Generate JWT tokens
    const tokens = await AuthService.createSession({ id: user.id, email: user.email, role: user.role });

    // Send welcome email (fire-and-forget). Spec §7.1: respect the language
    // the user explicitly selected at profile creation.
    const customerName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email.split('@')[0];
    emailService.sendWelcomeEmail(user.email, {
      customerName,
      email: user.email,
      dashboardUrl: process.env.APP_URL || 'https://mobile.boomcard.bg',
    }, lang).catch((err) => logger.error('Failed to send welcome email:', err));

    // Transactional welcome email is sent above via emailService.sendWelcomeEmail().
    // user.signup / card.issued automation triggers are not wired to active templates
    // (marketing welcome sequences are opt-in and managed via adminMarketing defaults).

    logger.info(`Payment-first onboarding completed: user ${user.id} created for order ${pending.payseraOrderId}`);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
        ...tokens,
      },
    });
  }),
);

export default router;
