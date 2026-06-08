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
import * as crypto from 'crypto';
import * as otplib from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcrypt';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { uploadSingleAvatar, validateMagicBytes } from '../middleware/upload.middleware';
import { imageUploadService } from '../services/imageUpload.service';
import { prisma } from '../lib/prisma';
import { AuthService } from '../services/auth.service';
import { getClientIp } from '../utils/requestIp';

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/* ─── 2FA recovery codes ─────────────────────────────────────────────────────*/

// Number of one-time backup recovery codes generated when 2FA is enabled.
const RECOVERY_CODE_COUNT = 10;
// bcrypt cost factor — matches passwordHash hashing elsewhere in the codebase.
const RECOVERY_CODE_BCRYPT_ROUNDS = 12;
// Crockford-ish unambiguous alphabet (no 0/O/1/I/L) for human-readable codes.
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generates a single recovery code formatted as XXXXX-XXXXX (10 chars + dash).
 * Uses crypto.randomInt for unbiased character selection.
 */
function generateRecoveryCode(): string {
  let raw = '';
  for (let i = 0; i < 10; i++) {
    raw += RECOVERY_CODE_ALPHABET[crypto.randomInt(RECOVERY_CODE_ALPHABET.length)];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/**
 * Generates RECOVERY_CODE_COUNT plaintext codes and their bcrypt hashes.
 * Returns the plaintext for one-time display and the hashes for storage.
 * Recovery codes are normalised (uppercase, dash-less) before hashing so that
 * the login-time comparison is case/format insensitive.
 */
async function generateRecoveryCodeSet(): Promise<{ plaintext: string[]; hashes: string[] }> {
  const plaintext = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
  const hashes = await Promise.all(
    plaintext.map((code) => bcrypt.hash(normalizeRecoveryCode(code), RECOVERY_CODE_BCRYPT_ROUNDS))
  );
  return { plaintext, hashes };
}

/** Canonical form used for both hashing and login comparison: uppercase, no separators. */
function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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
    if ('email' in req.body) {
      return res.status(400).json({
        error: 'Email cannot be updated here. Use POST /admin/me/email-change/request instead.',
      });
    }

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

/* ─── Avatar upload ──────────────────────────────────────────────────────────*/

/**
 * POST /api/admin/me/avatar
 * Multipart form-data field: "image" (JPEG/PNG/WebP, max 2 MB)
 * Uploads to R2 under avatars/<userId>/ and stores the public URL.
 */
router.post(
  '/avatar',
  uploadSingleAvatar,
  validateMagicBytes,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Fetch the current avatar URL so we can delete the old R2 object after
    // a successful upload — prevents permanent storage leaks on each update.
    const current = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { avatar: true },
    });

    const upload = await imageUploadService.uploadImage({
      file: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder: 'avatars',
      userId: req.user!.id,
    });

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatar: upload.url },
      select: { id: true, avatar: true },
    });

    // Delete old R2 object after DB is updated. Non-fatal: log but never fail
    // the request if cleanup errors (e.g. object already gone, wrong host).
    if (current?.avatar) {
      try {
        const publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
        const parsed = new URL(current.avatar);
        const isOwnStorage =
          parsed.host.endsWith('.r2.dev') ||
          (publicUrl && parsed.origin === publicUrl) ||
          parsed.host.endsWith('.amazonaws.com');
        if (isOwnStorage) {
          const key = parsed.pathname.replace(/^\//, '');
          await imageUploadService.deleteImage(key);
        }
      } catch {
        // swallow — stale object in R2 is preferable to a failed avatar update
      }
    }

    res.json({ avatar: updated.avatar });
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
      data: { passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: false },
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

    // In this otplib version verifySync THROWS a TokenLengthError on a non-6-digit
    // token, which would surface as an unintended 500. Gate on /^\d{6}$/ so a
    // malformed token yields the same clean 400 as a wrong-but-valid-shape token.
    const result = /^\d{6}$/.test(token)
      ? otplib.verifySync({ token, secret: user.totpPendingSecret })
      : { valid: false };
    if (!result.valid) return res.status(400).json({ error: 'Invalid TOTP token' });

    // Generate one-time backup recovery codes. Only the bcrypt hashes are stored;
    // the plaintext is returned ONCE in this response and can never be retrieved again.
    const { plaintext, hashes } = await generateRecoveryCodeSet();

    // Promote pending secret to active, clear pending field, store recovery-code hashes.
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        totpSecret: user.totpPendingSecret,
        totpPendingSecret: null,
        totpEnabledAt: new Date(),
        totpRecoveryCodes: hashes,
      },
    });

    res.json({
      ok: true,
      message: '2FA enabled',
      // Shown exactly once — the admin must store these now; they are unrecoverable.
      recoveryCodes: plaintext,
    });
  })
);

/**
 * POST /api/admin/me/2fa/recovery-codes/regenerate
 * Body: { currentPassword } — password confirmation required.
 * Invalidates the existing recovery-code set and returns a fresh batch of
 * plaintext codes EXACTLY ONCE. 2FA must already be enabled.
 */
router.post(
  '/2fa/recovery-codes/regenerate',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword } = req.body as { currentPassword?: string };
    if (!currentPassword) return res.status(400).json({ error: 'currentPassword is required' });

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'Admin not found' });
    if (!user.totpEnabledAt) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const { plaintext, hashes } = await generateRecoveryCodeSet();
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { totpRecoveryCodes: hashes },
    });

    res.json({ ok: true, message: 'Recovery codes regenerated', recoveryCodes: plaintext });
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
      data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpRecoveryCodes: [] },
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
    const currentIp = getClientIp(req) ?? null;
    const currentUA = req.headers['user-agent'] ?? null;

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

    // Mark the most recent session whose IP+UA matches this request as current.
    // Sessions are desc-ordered so the first match is the most recently created one.
    let markedCurrent = false;
    const sessionsWithFlag = sessions.map((s) => {
      const isCurrent = !markedCurrent && s.ip === currentIp && s.userAgent === currentUA;
      if (isCurrent) markedCurrent = true;
      return { ...s, isCurrent };
    });

    res.json({ sessions: sessionsWithFlag });
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
 * Revoke all active sessions for the current user, including the current one.
 * The frontend is expected to call logout() immediately after — the short-lived
 * access token JWT remains valid until its natural expiry, which is intentional.
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
