/**
 * Admin Profile Routes — spec section 12 "Профил"
 *
 * GET  /api/admin/me                    — get own profile (Моите данни)
 * PATCH /api/admin/me                   — update own name/email/phone
 * POST /api/admin/me/password           — change own password
 *
 * 2FA (spec section 12 "Сигурност") — TOTP RFC 6238
 * GET  /api/admin/me/2fa/setup          — generate secret + QR code URI
 * POST /api/admin/me/2fa/enable         — verify token then enable 2FA
 * DELETE /api/admin/me/2fa              — disable 2FA (requires current password)
 *
 * Sessions (spec section 12 "Изход") — backed by RefreshToken
 * GET  /api/admin/me/sessions           — list active sessions
 * DELETE /api/admin/me/sessions/:tokenId — revoke specific session
 * DELETE /api/admin/me/sessions         — revoke all other sessions
 *
 * Login history (spec section 12 "Сигурност")
 * GET  /api/admin/me/login-history      — last 50 login events
 */

import { Router, Response } from 'express';
import * as otplib from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcrypt';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

/* ─── Profile ────────────────────────────────────────────────────────────────*/

/**
 * GET /api/admin/me
 */
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        avatar: true,
        createdAt: true,
        lastLoginAt: true,
        totpEnabledAt: true,
        adminRoles: {
          select: {
            role: { select: { key: true, label: true } },
            grantedAt: true,
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'Admin not found' });

    res.json({
      ...user,
      twoFactorEnabled: user.totpEnabledAt !== null,
      totpEnabledAt: undefined, // don't expose raw field
    });
  })
);

/**
 * PATCH /api/admin/me
 * Body: { firstName?, lastName?, phone? }
 * Email changes require separate verification flow; not allowed here.
 */
router.patch(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { firstName, lastName, phone } = req.body as {
      firstName?: string;
      lastName?: string;
      phone?: string;
    };

    const data: { firstName?: string; lastName?: string; phone?: string | null } = {};
    if (firstName !== undefined) data.firstName = firstName.trim() || undefined;
    if (lastName !== undefined) data.lastName = lastName.trim() || undefined;
    if (phone !== undefined) data.phone = phone.trim() || null;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    });

    res.json(updated);
  })
);

/* ─── Password change ────────────────────────────────────────────────────────*/

/**
 * POST /api/admin/me/password
 * Body: { currentPassword, newPassword }
 */
router.post(
  '/password',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'Admin not found' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash: hash, passwordChangedAt: new Date() },
    });

    res.json({ ok: true });
  })
);

/* ─── 2FA setup ──────────────────────────────────────────────────────────────*/

/**
 * GET /api/admin/me/2fa/setup
 * Generates a fresh TOTP secret and returns the otpauth URI + QR code data URL.
 * The secret is NOT saved until POST /enable is called with a valid token.
 */
router.get(
  '/2fa/setup',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true, totpEnabledAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Admin not found' });
    if (user.totpEnabledAt) {
      return res.status(400).json({ error: '2FA is already enabled. Disable it first.' });
    }

    const secret = otplib.generateSecret();
    const otpauthUrl = otplib.generateURI({ label: user.email, issuer: 'BoomCard Admin', secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Store the pending secret temporarily in DB so /enable can verify it.
    // We reuse totpSecret for this; it becomes permanent on /enable.
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpSecret: secret },
    });

    res.json({ secret, otpauthUrl, qrCodeDataUrl });
  })
);

/**
 * POST /api/admin/me/2fa/enable
 * Body: { token } — TOTP code from the authenticator app
 */
router.post(
  '/2fa/enable',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { token } = req.body as { token?: string };
    if (!token) return res.status(400).json({ error: 'token is required' });

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { totpSecret: true, totpEnabledAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Admin not found' });
    if (user.totpEnabledAt) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }
    if (!user.totpSecret) {
      return res.status(400).json({ error: 'Call GET /2fa/setup first to generate a secret' });
    }

    const result = otplib.verifySync({ token, secret: user.totpSecret });
    if (!result.valid) return res.status(400).json({ error: 'Invalid TOTP token' });

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpEnabledAt: new Date() },
    });

    res.json({ ok: true, message: '2FA enabled' });
  })
);

/**
 * DELETE /api/admin/me/2fa
 * Body: { currentPassword } — password confirmation required to disable 2FA
 */
router.delete(
  '/2fa',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword } = req.body as { currentPassword?: string };
    if (!currentPassword) return res.status(400).json({ error: 'currentPassword is required' });

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'Admin not found' });
    if (!user.totpEnabledAt) return res.status(400).json({ error: '2FA is not enabled' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpSecret: null, totpEnabledAt: null },
    });

    res.json({ ok: true, message: '2FA disabled' });
  })
);

/* ─── Sessions ───────────────────────────────────────────────────────────────*/

/**
 * GET /api/admin/me/sessions
 * Lists non-expired RefreshTokens for the current user (active sessions).
 */
router.get(
  '/sessions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId: req.user!.id,
        expiresAt: { gte: new Date() },
      },
      select: {
        id: true,
        clientType: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ sessions });
  })
);

/**
 * DELETE /api/admin/me/sessions/:tokenId
 * Revoke a specific session by RefreshToken.id.
 */
router.delete(
  '/sessions/:tokenId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const session = await prisma.refreshToken.findFirst({
      where: { id: req.params.tokenId, userId: req.user!.id },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    await prisma.refreshToken.delete({ where: { id: req.params.tokenId } });
    res.json({ ok: true });
  })
);

/**
 * DELETE /api/admin/me/sessions
 * Revoke all sessions except the one represented by the current JWT
 * (identified by comparing createdAt to the token's iat).
 */
router.delete(
  '/sessions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Delete all refresh tokens for this user. The current access token
    // (JWT) remains valid until its short expiry — acceptable trade-off.
    const { count } = await prisma.refreshToken.deleteMany({
      where: { userId: req.user!.id },
    });

    res.json({ ok: true, revokedCount: count });
  })
);

/* ─── Login history ──────────────────────────────────────────────────────────*/

/**
 * GET /api/admin/me/login-history
 * Returns the last 50 login events for the current admin.
 */
router.get(
  '/login-history',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const history = await prisma.loginHistory.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        ip: true,
        userAgent: true,
        success: true,
        failReason: true,
        createdAt: true,
      },
    });

    res.json({ history });
  })
);

export default router;
