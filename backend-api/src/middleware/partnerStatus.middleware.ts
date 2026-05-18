/**
 * Partner status enforcement middleware (Spec §5.3 v1.1).
 *
 * Use `requireActivePartnerForWrites` to gate non-GET endpoints behind an
 * ACTIVE partner status. Per spec §5.3:
 *
 *   Active     → full operational access (allowed)
 *   Inactive   → read-only operational mode (writes blocked here)
 *   Suspended  → limited / no operational access (writes blocked; login itself
 *                 gates this earlier so should rarely reach here)
 *   Archived   → no operational access (login gates earlier)
 *
 * Non-partner roles (admin/super admin) bypass this gate. Read-only methods
 * (GET, HEAD, OPTIONS) bypass regardless of status so the partner can still
 * view their data when Inactive (spec: "✓ Преглед на транзакции (read-only)").
 *
 * Support/help endpoints intentionally do NOT mount this — Inactive partners
 * keep the ability to submit support tickets per the spec matrix.
 *
 * Audit-pass [3.1]: mounted on ALL partner-writable routers (partners,
 * venues, stickers/locations) — not just /api/partners. Spec §5.3
 * "read-only operational режим" is broader than the original /api/partners
 * mount implied.
 *
 * Audit-pass [3.2]: fails CLOSED on DB error rather than fall-through.
 * A transient Prisma exception used to bypass the gate silently; now we
 * return 503 so the caller retries instead of an Inactive partner sneaking
 * a write through during the outage.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function requireActivePartnerForWrites(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Bypass for read-only requests — spec allows view in Inactive/Suspended.
  if (READ_ONLY_METHODS.has(req.method)) return next();

  const user = req.user;
  if (!user) return next(); // unauthenticated requests handled upstream

  // Bypass for admin roles — they manage partner state and must always write.
  if (user.role !== 'PARTNER') return next();

  try {
    const partner = await prisma.partner.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (!partner) return next(); // no partner row — let the route decide

    if (partner.status === 'ACTIVE') return next();

    const messages: Record<string, string> = {
      INACTIVE:
        'Вашият партньорски акаунт е в режим само за четене. Свържете се с office@boomcard.bg за повторно активиране.',
      PAUSED:
        'Вашият партньорски акаунт е временно спрян. Свържете се с office@boomcard.bg.',
      SUSPENDED:
        'Вашият партньорски акаунт е временно спрян. Свържете се с office@boomcard.bg.',
      ARCHIVED:
        'Вашият партньорски акаунт е архивиран и достъпът е прекратен.',
      PENDING:
        'Вашият партньорски акаунт все още не е активиран.',
    };
    const msg = messages[partner.status] ?? 'Партньорският акаунт няма право да извършва промени в момента.';
    res.status(403).json({
      success: false,
      error: msg,
      code: 'PARTNER_STATUS_BLOCKED',
      partnerStatus: partner.status,
    });
    return;
  } catch (err) {
    // Audit-pass [3.2]: fail CLOSED. A transient Prisma exception used to
    // fall through to next() — meaning a DB outage degraded this gate to
    // allow-all for write methods. Return 503 instead so the client retries
    // and an Inactive partner can't sneak writes through during an outage.
    logger.error('[partnerStatus.middleware] partner lookup failed:', err);
    res.status(503).json({
      success: false,
      error: 'Не може да се провери партньорският статус в момента. Моля, опитайте отново.',
      code: 'PARTNER_STATUS_CHECK_FAILED',
    });
    return;
  }
}
