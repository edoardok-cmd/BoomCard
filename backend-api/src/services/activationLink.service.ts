// Spec §5.2, §9.5 v1.1 — partner activation link issuance, resend, and consume.
//
// Two architectural invariants enforced here:
//   (1) "Every new link supersedes the previous" — the invalidate of the prior
//       active link and the create of the new link happen inside a single
//       prisma.$transaction with SERIALIZABLE isolation, so two concurrent
//       admin approves cannot both end up with a non-invalidated active link.
//       On a P2034 (serialization failure) we retry once — the second pass
//       sees the first writer's invalidate and proceeds cleanly.
//   (2) Consume = mark consumed + stamp Partner.verifiedAt + (optionally)
//       set the partner's password — all atomic. Crashes between any two of
//       these previously left the partner locked out (token spent, no
//       verifiedAt, no password). The transaction below removes that hole.

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Prisma, ActivationLinkReason, PartnerStatus, UserStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import { writeAudit } from '../middleware/audit.middleware';
import { SECURITY_CONFIG } from '../config/security.config';
import { validatePasswordPolicy } from '../validators/auth.validator';

const LINK_TTL_MS = SECURITY_CONFIG.SECURITY.PARTNER_ACTIVATION_EXPIRY_MS;
const SERIALIZATION_RETRY_LIMIT = 2;

/**
 * Typed error class so callers can map to HTTP status codes without
 * substring-matching the message text (L1 in the audit). All consumer-facing
 * failures throw one of these.
 */
export type ActivationErrorCode =
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_USED'
  // BC-QA-033: renamed from 'PASSWORD_TOO_SHORT' to the stable AUTH_* code
  // BC-QA-004's frontend error-code map already keys on for every other
  // password-policy failure (see auth.validator.ts's validatePasswordPolicy
  // callers in routes/auth.routes.ts). Keeping a distinct
  // 'PASSWORD_TOO_SHORT' member here would have been a parallel mechanism
  // for the exact same failure the other 3 call sites now report as
  // AUTH_PASSWORD_POLICY.
  | 'AUTH_PASSWORD_POLICY'
  | 'PASSWORD_REQUIRED';

export class ActivationLinkError extends Error {
  constructor(public code: ActivationErrorCode, message: string) {
    super(message);
    this.name = 'ActivationLinkError';
  }
}

export interface IssueLinkInput {
  partnerId: string;
  createdById: string;
  reason?: ActivationLinkReason;
}

export class ActivationLinkService {
  /**
   * Issue a new ActivationLink. Atomically invalidates any prior unconsumed,
   * non-invalidated link for the partner and creates the new row. Retries
   * once on a SERIALIZABLE conflict so two concurrent approves converge to
   * exactly one active link (the later writer wins).
   */
  async issue(input: IssueLinkInput): Promise<{ token: string; expiresAt: Date; id: string; reason: ActivationLinkReason }> {
    const { partnerId, createdById, reason = ActivationLinkReason.INITIAL } = input;

    for (let attempt = 0; attempt < SERIALIZATION_RETRY_LIMIT; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const now = new Date();
            await tx.activationLink.updateMany({
              where: { partnerId, consumedAt: null, invalidatedAt: null },
              data: { invalidatedAt: now },
            });

            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(now.getTime() + LINK_TTL_MS);

            const link = await tx.activationLink.create({
              data: { partnerId, token, expiresAt, createdById, reason },
            });
            return { token, expiresAt, id: link.id, reason };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034' &&
          attempt + 1 < SERIALIZATION_RETRY_LIMIT
        ) {
          logger.warn(`[activationLink] serialization conflict for partner=${partnerId}; retrying`);
          continue;
        }
        throw err;
      }
    }
    // Unreachable — the loop either returns or rethrows. TypeScript needs the explicit throw.
    throw new Error('activationLink.issue: exhausted retries');
  }

  /**
   * Resend = issue a new link with reason=RESEND + append LinkResendLog + AuditLog.
   * Verifies the partner exists; throws otherwise.
   */
  async resend({ partnerId, actorId }: { partnerId: string; actorId: string }) {
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) {
      throw new Error('Partner not found');
    }

    const issued = await this.issue({ partnerId, createdById: actorId, reason: ActivationLinkReason.RESEND });

    await prisma.linkResendLog.create({
      data: {
        linkType: 'PARTNER_ACTIVATION',
        subjectId: partnerId,
        actorId,
      },
    });

    await writeAudit({
      actorUserId: actorId,
      action: 'PARTNER_ACTIVATION_LINK_RESENT',
      objectType: 'Partner',
      objectId: partnerId,
      after: { expiresAt: issued.expiresAt },
    }).catch((err) => logger.error('[activationLink] audit write failed:', err));

    return issued;
  }

  /**
   * Mark email-send outcome on a link row. Both callers (initial issuance and
   * admin resend) call this after the email layer returns so the admin drawer
   * can show "delivered" vs "send failed" without a separate log table.
   *
   * Fire-and-forget on errors — telemetry beats correctness here: if we lose
   * the stamp the link still works, the audit just shows null. We log so a
   * pattern of misses surfaces.
   */
  async markEmail(linkId: string, outcome: { sent: true } | { sent: false; error: string }): Promise<void> {
    try {
      if (outcome.sent === true) {
        await prisma.activationLink.update({
          where: { id: linkId },
          data: { emailSentAt: new Date(), emailError: null },
        });
      } else {
        const errorText = outcome.error.slice(0, 500);
        await prisma.activationLink.update({
          where: { id: linkId },
          data: { emailError: errorText },
        });
      }
    } catch (err) {
      logger.error('[activationLink] markEmail failed:', err);
    }
  }

  /**
   * Consume a token. Single SERIALIZABLE transaction:
   *   - re-validates the token (must still be consumedAt=null)
   *   - atomically claims the row via an updateMany guarded on consumedAt=null
   *     so two concurrent consume calls cannot both succeed; the second one
   *     sees count=0 and throws "already used"
   *   - stamps Partner.verifiedAt if null
   *   - if a password is supplied, sets User.passwordHash and clears
   *     mustChangePassword (the admin-onboard "temp password" flow)
   *   - if Partner.status === PENDING, advances to ACTIVE
   *
   * On any internal error the whole consume is rolled back, so the token
   * stays unconsumed and the partner can click the link again.
   *
   * Retries once on a P2034 (SERIALIZABLE conflict) — the second pass sees
   * the other writer's commit and throws "already used" cleanly. Other errors
   * propagate.
   *
   * Defensive error messages — this is partner-facing.
   */
  async consume(token: string, opts: { password?: string } = {}) {
    if (!token || typeof token !== 'string') {
      throw new ActivationLinkError('INVALID_TOKEN', 'Invalid activation link');
    }

    // Validate password BEFORE entering the transaction. This ensures that
    // if the password is weak, we fail fast without consuming the token.
    // The transaction will re-validate this (defensive, belt-and-braces) but
    // the early exit here prevents wasteful token consumption on bad input.
    if (opts.password) {
      const policyError = validatePasswordPolicy(opts.password);
      if (policyError) {
        throw new ActivationLinkError('AUTH_PASSWORD_POLICY', policyError);
      }
    }

    for (let attempt = 0; attempt < SERIALIZATION_RETRY_LIMIT; attempt++) {
      try {
        return await this.consumeOnce(token, opts);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034' &&
          attempt + 1 < SERIALIZATION_RETRY_LIMIT
        ) {
          logger.warn(`[activationLink] consume serialization conflict; retrying`);
          continue;
        }
        throw err;
      }
    }
    throw new Error('activationLink.consume: exhausted retries');
  }

  private async consumeOnce(token: string, opts: { password?: string }) {
    return prisma.$transaction(
      async (tx) => {
      const link = await tx.activationLink.findUnique({
        where: { token },
        include: { partner: { include: { user: { select: { mustChangePassword: true } } } } },
      });

      if (!link) throw new ActivationLinkError('INVALID_TOKEN', 'Invalid activation link');
      if (link.invalidatedAt) throw new ActivationLinkError('INVALID_TOKEN', 'Invalid activation link');
      if (link.consumedAt) throw new ActivationLinkError('TOKEN_USED', 'Activation link already used');
      if (link.expiresAt.getTime() < Date.now()) throw new ActivationLinkError('TOKEN_EXPIRED', 'Activation link has expired');

      // Spec §5.2 v1.1 — admin-onboarded partners have mustChangePassword=true
      // because the temp password generated at /partners/onboard was never
      // shown to them. If no password is supplied here the token is consumed
      // but the partner has no usable credential and is locked out. Enforce
      // this at the API boundary so the UI's required gate can't be bypassed.
      if (link.partner.user?.mustChangePassword && !opts.password) {
        throw new ActivationLinkError(
          'PASSWORD_REQUIRED',
          'A password is required to activate this account. Please set one via the activation link page.',
        );
      }

      // 1. Atomic claim: guard on consumedAt=null + invalidatedAt=null so a
      //    race-loser sees count=0 and we never consume a token that was
      //    concurrently superseded by issue().
      //
      //    Two races this protects against:
      //    a) consume+consume: two callers racing on the same token.
      //       Postgres UPDATE re-evaluates the WHERE predicate post-lock, so
      //       the second caller sees consumedAt≠null and gets count=0.
      //       This works at READ COMMITTED; SERIALIZABLE is belt-and-braces.
      //    b) issue+consume: a concurrent issue() invalidates this token while
      //       consume is in flight. The invalidatedAt=null guard here closes
      //       the window. SERIALIZABLE (SSI) is REQUIRED for this race because
      //       the findUnique above reads from a snapshot and cannot see the
      //       concurrent invalidate; SSI detects the read-write conflict and
      //       raises P2034 on the loser, whose retry then hits the
      //       `if (link.invalidatedAt)` guard at line 211.
      const claim = await tx.activationLink.updateMany({
        where: { id: link.id, consumedAt: null, invalidatedAt: null },
        data: { consumedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new ActivationLinkError('TOKEN_USED', 'Activation link already used');
      }
      const consumed = await tx.activationLink.findUniqueOrThrow({
        where: { id: link.id },
        include: { partner: true },
      });

      // 2. Stamp verifiedAt the first time. Re-activations from SUSPENDED don't
      //    reset it (the partner has already "fully activated" once).
      const partnerUpdate: Prisma.PartnerUpdateInput = {};
      if (!consumed.partner.verifiedAt) {
        partnerUpdate.verifiedAt = new Date();
      }
      // B1 (r2m): Guard against ARCHIVED/REJECTED partners consuming an
      // activation link that was issued before archival. Spec §1.7 and §12 rule 5
      // ("Archived Reactivation Requires Full Onboarding Review") prohibit a
      // partner from self-activating out of the ARCHIVED state. An ARCHIVED
      // partner still within the original link TTL must be blocked here; the
      // link should have been invalidated at archival time but that is a
      // belt-and-suspenders requirement, not a guarantee.
      if (
        consumed.partner.status === PartnerStatus.ARCHIVED ||
        consumed.partner.status === PartnerStatus.REJECTED
      ) {
        throw new ActivationLinkError('INVALID_TOKEN', 'Invalid activation link');
      }

      // Spec §1.6 / §3.5 / §5.2 — the activation link is the canonical
      // hand-off for all approval flows. The approve endpoint now leaves
      // the partner at their current status (PENDING) and does NOT set ACTIVE
      // prematurely; this consume step is the single place that transitions
      // to ACTIVE. Covers PENDING (standard first-time activation) and any
      // other non-terminal, non-archived status (e.g. INACTIVE on re-approval).
      // verifiedAt is already handled above (stamped on first activation only).
      if (consumed.partner.status !== PartnerStatus.ACTIVE) {
        partnerUpdate.status = PartnerStatus.ACTIVE;
      }
      if (Object.keys(partnerUpdate).length > 0) {
        await tx.partner.update({
          where: { id: consumed.partner.id },
          data: partnerUpdate,
        });
      }

      // 3. Set the partner user's password. Every partner sets their password
      //    here at activation — none is collected at registration. The route
      //    layer requires it; internal callers may still omit it (the no-password
      //    branch below keeps the account consistent), but the normal path always
      //    supplies one. Also force-set status=ACTIVE and emailVerified — at this
      //    point the token (an out-of-band secret) is sufficient proof.
      if (opts.password) {
        // Enforce the canonical password policy (min 8 chars + uppercase +
        // lowercase + digit + special) — the single source of truth shared with
        // /auth/register, change-password, reset-password and the activate route.
        // Using the shared validator here (instead of a bare length check against
        // SECURITY_CONFIG.MIN_PASSWORD_LENGTH) guarantees every code path that
        // bypasses the HTTP layer (admin tools, tests, internal invocations)
        // enforces the SAME policy.
        const policyError = validatePasswordPolicy(opts.password);
        if (policyError) {
          throw new ActivationLinkError('AUTH_PASSWORD_POLICY', policyError);
        }
        const passwordHash = await bcrypt.hash(opts.password, 12);
        await tx.user.update({
          where: { id: consumed.partner.userId },
          data: {
            passwordHash,
            status: UserStatus.ACTIVE,
            emailVerified: true,
            emailVerifiedAt: new Date(),
            mustChangePassword: false,
            passwordChangedAt: new Date(),
          },
        });
      } else {
        // No password supplied — still ensure the partner user is ACTIVE and
        // emailVerified so the login gate doesn't trip on the user-level
        // status check for self-registered partners who set their password
        // at registration time.
        await tx.user.update({
          where: { id: consumed.partner.userId },
          data: {
            status: UserStatus.ACTIVE,
            emailVerified: true,
            ...(consumed.partner.verifiedAt ? {} : { emailVerifiedAt: new Date() }),
          },
        });
      }

      logger.info(`[activationLink] consumed token for partner=${consumed.partner.id} (passwordSet=${!!opts.password})`);
      return consumed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

export const activationLinkService = new ActivationLinkService();
