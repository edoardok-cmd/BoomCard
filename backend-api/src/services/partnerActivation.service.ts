/**
 * Partner activation — spec §5.2 v1.1
 *
 * After admin approval, a partner receives a one-time activation link valid
 * for 72h. Clicking the link consumes the token AND sets a password (the
 * partner-facing dashboard collects it on the activation page), AND stamps
 * Partner.verifiedAt — all in a single transaction (see activationLink.service).
 *
 * Partners have no self-service resend — they don't have a working login
 * before activation. Only an admin can resend from the active-partners /
 * requests pages.
 *
 * DB-level token operations live in activationLink.service.ts; this file is
 * the high-level helper (URL building, email sending, email-outcome stamp,
 * consume wrapper) used by the admin partner routes and the public
 * /auth/partner/activate endpoint.
 */

import { ActivationLinkReason } from '@prisma/client';
import { logger } from '../utils/logger';
import { emailService } from './email.service';
import { activationLinkService } from './activationLink.service';

export const ACTIVATION_TTL_HOURS = 72;

function buildActivationUrl(token: string): string {
  const base = process.env.FRONTEND_URL || 'https://boomcard.bg';
  return `${base}/partner/activate?token=${encodeURIComponent(token)}`;
}

export interface IssueActivationLinkInput {
  partnerId: string;
  adminId: string;
  reason?: 'initial' | 'resend';
}

export interface IssuedActivationLink {
  token: string;
  url: string;
  expiresAt: Date;
  linkId: string;
}

/**
 * Mint a new activation link. Invalidates any prior unconsumed link for the
 * partner. Returns the plaintext token + URL + linkId — the caller is
 * expected to (a) email the URL out and (b) stamp the email-send outcome
 * back onto the row via stampEmailOutcome below.
 *
 * For resends, activationLinkService.resend appends a LinkResendLog row
 * AND an AuditLog row. The initial issue at approve-time doesn't log to
 * LinkResendLog (it's not a resend); the approve action's own AuditLog row
 * captures the initial issuance.
 */
export async function issueActivationLink(
  input: IssueActivationLinkInput,
): Promise<IssuedActivationLink> {
  const { partnerId, adminId, reason = 'initial' } = input;
  const issued =
    reason === 'resend'
      ? await activationLinkService.resend({ partnerId, actorId: adminId })
      : await activationLinkService.issue({
          partnerId,
          createdById: adminId,
          reason: ActivationLinkReason.INITIAL,
        });
  return {
    token: issued.token,
    url: buildActivationUrl(issued.token),
    expiresAt: issued.expiresAt,
    linkId: issued.id,
  };
}

/**
 * Record the email send outcome on the ActivationLink row so the admin
 * drawer can render "Sent at X" vs "Send failed: …" without a separate
 * log table.
 */
export async function stampEmailOutcome(
  linkId: string,
  outcome: { sent: true } | { sent: false; error: string },
) {
  return activationLinkService.markEmail(linkId, outcome);
}

/**
 * Send the activation email. Self-contained template (BG by default).
 * Returns the email-layer result so the caller can stamp the outcome.
 *
 * Brand color is #0f766e (matches the H1 / button on the partner dashboard);
 * the previous template used an inconsistent orange (#c96442) for the CTA.
 */
export async function sendActivationEmail(opts: {
  email: string;
  firstName: string;
  businessName: string;
  activationUrl: string;
  expiresAt: Date;
  isResend?: boolean;
}) {
  const expiryStr = opts.expiresAt.toLocaleDateString('bg-BG', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const subject = opts.isResend
    ? `BoomCard – Нов активационен линк (${opts.businessName})`
    : `BoomCard – Активирайте партньорския си акаунт – ${opts.businessName}`;
  const html = `<!DOCTYPE html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#f5f5f5;padding:20px;">
    <table width="600" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:32px;">
      <tr><td>
        <h1 style="color:#0f766e;margin:0 0 16px;">${opts.isResend ? '🔄 Нов активационен линк' : '🎉 Партньорството ви е одобрено!'}</h1>
        <p>Здравейте ${opts.firstName},</p>
        <p>Вашата кандидатура за <strong>${opts.businessName}</strong> е одобрена. За да активирате партньорския си панел и да зададете парола, натиснете бутона по-долу.</p>
        <p style="text-align:center;margin:32px 0;">
          <a href="${opts.activationUrl}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:bold;">
            Активирай партньорския панел
          </a>
        </p>
        <p style="color:#666;font-size:14px;">
          ⚠ Линкът е валиден до <strong>${expiryStr}</strong> (${ACTIVATION_TTL_HOURS} часа). След изтичане се свържете с office@boomcard.bg за нов линк.
        </p>
        <p style="color:#999;font-size:12px;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">
          Ако не сте подавали тази заявка, моля игнорирайте този имейл.
        </p>
      </td></tr>
    </table></body></html>`;
  const text = `Здравейте ${opts.firstName},

Вашата кандидатура за ${opts.businessName} е одобрена. Активирайте партньорския си панел и задайте парола:
${opts.activationUrl}

Линкът е валиден до ${expiryStr} (${ACTIVATION_TTL_HOURS} часа).

— BoomCard`;
  return emailService.sendEmail({ to: opts.email, subject, html, text, audience: 'partner' });
}

/**
 * Consume an activation token. Throws on missing/expired/already-used tokens.
 * Stamps Partner.verifiedAt, optionally sets the partner user's password, and
 * advances PENDING partners to ACTIVE — all atomically (see
 * activationLinkService.consume).
 *
 * `password` is optional: self-registered partners already set one during
 * /auth/register; admin-onboarded partners must supply one here.
 */
export async function consumeActivationToken(
  token: string,
  opts: { password?: string } = {},
) {
  const consumed = await activationLinkService.consume(token, opts);
  logger.info(`[partner-activation] consumed token for partner ${consumed.partner.id}`);
  return {
    partnerId: consumed.partner.id,
    businessName: consumed.partner.businessName,
    userId: consumed.partner.userId,
  };
}
