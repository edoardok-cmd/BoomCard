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
 * Audit-pass [3.1]: mounted on partner-writable routers — specifically
 * partners.routes.ts, receipts.enhanced.routes.ts, and per-route on
 * POST /api/venues/:id/menu/submit and POST /api/venues/:id/menu/withdraw
 * (venues.routes.ts), where PARTNER self-service is explicitly authorised.
 * Other venue/sticker write paths remain ADMIN/SUPER_ADMIN only.
 * Spec §5.3 "read-only operational режим" scope.
 *
 * Audit-pass [3.2]: fails CLOSED on DB error rather than fall-through.
 * A transient Prisma exception used to bypass the gate silently; now we
 * return 503 so the caller retries instead of an Inactive partner sneaking
 * a write through during the outage.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest, authenticate } from './auth.middleware';
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
    // INFO-1 (r2g): fail closed when the PARTNER JWT has no corresponding Partner
    // row (e.g., the row was deleted after the token was issued). Failing open
    // would allow a stale token to perform writes despite having no live partner.
    if (!partner) {
      res.status(403).json({
        success: false,
        error: 'Партньорският акаунт не е намерен.',
        code: 'PARTNER_NOT_FOUND',
      });
      return;
    }

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
      // LOW-2: REJECTED added so the middleware returns a meaningful Bulgarian
      // message rather than the generic fallback, as defence-in-depth for the
      // case where the auth layer allows a REJECTED partner to reach this gate.
      REJECTED:
        'Вашият партньорски акаунт е отказан.',
    };
    const msg = messages[partner.status] ?? 'Партньорският акаунт няма право да извършва промени в момента.';

    // MEDIUM-1 (spec §1.1): the public-facing API exposes only the canonical
    // three-value enum (ACTIVE | INACTIVE | ARCHIVED). Internal sub-types
    // PAUSED, SUSPENDED, PENDING, REJECTED are DB implementation details and
    // must not be serialised into partner-visible responses. Map to canonical
    // before responding.
    // PENDING maps to INACTIVE (not ARCHIVED): spec §2.2 defines PENDING as
    // the onboarding stage with read-only access, not a closed/terminated account.
    // Mapping to ARCHIVED would trigger "account closed" UI on the client for a
    // partner that is merely awaiting activation.
    // Title-case to match every other partner-facing surface (/auth/me, login,
    // /:id, /me, /me/stickers all emit Active|Inactive|Archived).
    function toCanonicalStatus(s: string): 'Active' | 'Inactive' | 'Archived' {
      if (s === 'ACTIVE') return 'Active';
      if (['INACTIVE', 'PAUSED', 'SUSPENDED', 'PENDING'].includes(s)) return 'Inactive';
      return 'Archived'; // ARCHIVED, REJECTED only
    }

    res.status(403).json({
      success: false,
      error: msg,
      code: 'PARTNER_STATUS_BLOCKED',
      partnerStatus: toCanonicalStatus(partner.status),
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

/**
 * HIGH (security) fix — write-gate ordering.
 *
 * When `requireActivePartnerForWrites` was mounted via `router.use(...)` at the
 * TOP of a router (partners/venues/stickers), it ran BEFORE each route's own
 * `authenticate`. So req.user was undefined at gate time and it hit the
 * `if (!user) return next()` branch — the gate was a no-op for EVERY write, and
 * an Inactive partner's writes were never blocked (spec §5.3 bypass).
 *
 * This wrapper fixes the ordering for router-level mounts:
 *   - Read methods (GET/HEAD/OPTIONS): pass straight through, untouched.
 *   - Write methods WITHOUT an Authorization header: pass through with next() so
 *     genuinely-public write routes and each route's own auth handling are
 *     unaffected (the gate must NOT become a blanket 401 on all writes).
 *   - Write methods WITH an Authorization header: run `authenticate` first to
 *     populate req.user, then run the existing gate logic so an Inactive partner
 *     is correctly blocked. If `authenticate` rejects (bad/expired token), its
 *     own error propagates and the gate logic is skipped.
 *
 * Routes still keep their own `authenticate` (this is idempotent — it just
 * re-verifies the same token and re-populates req.user).
 */
export function requireActivePartnerForWritesAuthed(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  // Read-only requests bypass entirely — never touch auth here.
  if (READ_ONLY_METHODS.has(req.method)) {
    next();
    return;
  }

  // Unauthenticated writes: do not force auth. Let the route's own handling
  // (its authenticate, or its public nature) decide. This keeps the gate from
  // turning into a blanket 401 on writes that have no token.
  if (!req.headers.authorization) {
    next();
    return;
  }

  // Perf: if an earlier middleware already populated req.user (i.e. the route's
  // own `authenticate` ran before this wrapper, or another wrapper did), skip
  // the redundant JWT verify and run the gate directly. This avoids a second
  // jwt.verify per partner write while preserving the security ordering — the
  // gate still runs against an authenticated req.user. Only when req.user is
  // absent do we authenticate here to populate it before gating.
  if (req.user) {
    void requireActivePartnerForWrites(req, res, next);
    return;
  }

  // Authenticated write (token present but req.user not yet populated):
  // populate req.user via authenticate, THEN run the gate.
  void authenticate(req, res, (err?: unknown) => {
    if (err) {
      next(err as any);
      return;
    }
    void requireActivePartnerForWrites(req, res, next);
  });
}
