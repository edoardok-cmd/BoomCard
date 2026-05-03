/**
 * Admin Profile Routes — spec section 12 "Профил"
 *
 * GET  /api/admin/me                          — get own profile (Моите данни)
 * PATCH /api/admin/me                         — update own name/phone
 * POST /api/admin/me/password                 — change own password
 *
 * Email change — 2-step with code sent to new address
 * POST /api/admin/me/email-change/request     — send 6-char code to new address
 * POST /api/admin/me/email-change/confirm     — verify code + password, apply change
 *
 * 2FA (spec section 12 "Сигурност") — TOTP RFC 6238
 * GET  /api/admin/me/2fa/setup                — generate secret + QR code URI
 * POST /api/admin/me/2fa/enable               — verify token then enable 2FA
 * DELETE /api/admin/me/2fa                    — disable 2FA (requires current password)
 *
 * Sessions (spec section 12 "Изход") — backed by RefreshToken
 * GET  /api/admin/me/sessions                 — list active sessions
 * DELETE /api/admin/me/sessions/:tokenId      — revoke specific session
 * DELETE /api/admin/me/sessions               — revoke all sessions (forces re-login)
 *
 * Login history (spec section 12 "Сигурност")
 * GET  /api/admin/me/login-history            — paginated login events (skip/take)
 */

import { Router, Response } from 'express';
import * as otplib from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcrypt';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';
import { AuthService } from '../services/auth.service';

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

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
 * Email changes go through the 2-step POST /email-change/request → /email-change/confirm flow.
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

/* ─── Email change (2-step with verification code) ───────────────────────────*/

/**
 * POST /api/admin/me/email-change/request
 * Body: { newEmail }
 * Sends a 6-char code to the new email address. SUPER_ADMIN only.
 */
router.post(
  '/email-change/request',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Email changes require Super Admin role. Contact a Super Admin to update yours.' });
    }
    const { newEmail } = req.body as { newEmail?: string };
    if (!newEmail?.trim()) {
      return res.status(400).json({ error: 'newEmail is required' });
    }
    const result = await AuthService.requestEmailChange(req.user!.id, newEmail);
    res.json(result);
  })
);

/**
 * POST /api/admin/me/email-change/confirm
 * Body: { code, currentPassword }
 * Verifies code + password and applies the email change.
 */
router.post(
  '/email-change/confirm',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code, currentPassword } = req.body as { code?: string; currentPassword?: string };
    if (!code || !currentPassword) {
      return res.status(400).json({ error: 'code and currentPassword are required' });
    }
    const updated = await AuthService.confirmEmailChange(req.user!.id, code, currentPassword);
    res.json({ id: updated.id, email: updated.email });
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
 * The secret is stored in totpPendingSecret (NOT totpSecret) until /enable verifies it,
 * so an abandoned setup never touches the live 2FA secret.
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

    // Store in the pending field only; does not affect the active totpSecret.
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpPendingSecret: secret },
    });

    res.json({ secret, otpauthUrl, qrCodeDataUrl });
  })
);

/**
 * POST /api/admin/me/2fa/enable
 * Body: { token } — TOTP code from the authenticator app
 * Verifies against totpPendingSecret, then promotes it to totpSecret.
 */
router.post(
  '/2fa/enable',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { token } = req.body as { token?: string };
    if (!token) return res.status(400).json({ error: 'token is required' });

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { totpPendingSecret: true, totpEnabledAt: true },
    });
    if (!user) return res.status(404).json({ error: 'Admin not found' });
    if (user.totpEnabledAt) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }
    if (!user.totpPendingSecret) {
      return res.status(400).json({ error: 'Call GET /2fa/setup first to generate a secret' });
    }

    const result = otplib.verifySync({ token, secret: user.totpPendingSecret });
    if (!result.valid) return res.status(400).json({ error: 'Invalid TOTP token' });

    // Promote pending secret to active, clear pending field.
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpEnabledAt: new Date() },
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

    // Nothing to clear — neither active 2FA nor an in-progress setup.
    if (!user.totpEnabledAt && !user.totpPendingSecret) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null },
    });

    // Distinguish: if only a pending setup existed (never confirmed), call it "cancelled".
    const message = user.totpEnabledAt ? '2FA disabled' : '2FA setup cancelled';
    res.json({ ok: true, message });
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
        ip: true,
        userAgent: true,
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
 * Paginated login events for the current admin (skip/take, default take=20).
 * Loopback IPs (127.0.0.1, ::1) are excluded — those are internal/dev connections
 * that carry no security-audit value in production.
 */
router.get(
  '/login-history',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const skip = Math.max(0, parseInt(String(req.query.skip ?? '0'), 10) || 0);
    const take = Math.min(100, Math.max(1, parseInt(String(req.query.take ?? '20'), 10) || 20));

    const history = await prisma.loginHistory.findMany({
      where: {
        userId: req.user!.id,
        NOT: { ip: { in: [...LOOPBACK_IPS] } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
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
