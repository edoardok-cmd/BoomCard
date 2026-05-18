/**
 * Partner Service
 *
 * Centralized helpers for partner state changes. The setPartnerStatus helper is
 * the single source of truth for the §5.3 / §5.4 v1.1 status matrix:
 *   - Reads previous status atomically with the update.
 *   - Writes a PartnerStatusChange audit row in the same transaction.
 *
 * Spec §5.4 — "QR кодовете автоматично се деактивират в backend-а" is
 * implemented as a synthetic, scan-time gate in sticker.service (createSession,
 * scanSticker, validateStickerById all reject when partner.status !== ACTIVE
 * or verifiedAt is null). We DELIBERATELY do not flip Sticker.status rows on
 * partner status transitions because:
 *
 *   1. The row flip is lossy on re-activation — manually INACTIVE stickers
 *      (damaged QR, decommissioned printout) would be silently flipped back
 *      to ACTIVE when the partner returns from SUSPENDED. No flag exists to
 *      distinguish auto- vs manual-deactivation; the cleanest answer is
 *      to keep the sticker row authoritative for sticker-level state and
 *      keep the partner row authoritative for operational gating.
 *   2. Wide UPDATEs on a chain with thousands of stickers can hit lock
 *      timeouts inside the status transition, so a single failed UPDATE
 *      blocks the suspend.
 *   3. The scan gate already covers the user-visible behaviour (scans fail
 *      while suspended). Reporting that filters on Sticker.status='ACTIVE'
 *      may need to join Partner.status — see Open Questions in the audit
 *      report; a v_active_stickers view is the cleanest follow-up if needed.
 *
 * Any future "operationally active stickers" query MUST also gate on the
 * owning partner — use isPartnerOperationallyActive(partner) exported from
 * this module. No current reporting code filters on Sticker.status='ACTIVE'
 * alone, so no regression today, but the helper is now the authoritative check.
 *
 * NB: This service deliberately does NOT call writeAudit() — the AuditLog row
 * with the action label "partner.status.update" is written by the caller so
 * the actor's IP / userAgent can be attached. The PartnerStatusChange row IS
 * written here because it has no actor metadata to forward.
 */

import { PartnerStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';

/**
 * Spec §5.3 / §5.4 v1.1 — single source of truth for "is this partner
 * operationally active?"  A partner is operationally active when BOTH:
 *   1. status === ACTIVE
 *   2. verifiedAt IS NOT NULL  (activation link was consumed by the partner)
 *
 * Use this instead of checking only `partner.status === 'ACTIVE'` everywhere.
 * The verifiedAt=null case means admin approved but partner never clicked the
 * link — QR scans must be blocked (handled in sticker.service) and the partner
 * must not appear in public venue listings.
 *
 * Reporting queries: any query filtering on `Sticker.status = 'ACTIVE'` MUST
 * also join the owning partner and call this check, otherwise suspended partners'
 * stickers appear active in reports.
 */
export function isPartnerOperationallyActive(partner: { status: string; verifiedAt: Date | null }): boolean {
  return partner.status === PartnerStatus.ACTIVE && partner.verifiedAt !== null;
}

export interface SetPartnerStatusParams {
  partnerId: string;
  toStatus: PartnerStatus;
  reason?: string | null;
  changedById?: string | null;
}

export interface SetPartnerStatusResult {
  partnerId: string;
  fromStatus: PartnerStatus;
  toStatus: PartnerStatus;
}

export class PartnerService {
  /**
   * Atomically transition a partner's status and log the change to
   * PartnerStatusChange. QR auto-deactivation is enforced at scan-time
   * (see sticker.service) — no row mutation on stickers here.
   *
   * Throws if the partner is missing or already in the target state.
   */
  async setPartnerStatus(params: SetPartnerStatusParams): Promise<SetPartnerStatusResult> {
    const { partnerId, toStatus, reason, changedById } = params;

    return prisma.$transaction(async (tx) => {
      const partner = await tx.partner.findUnique({
        where: { id: partnerId },
        select: { id: true, status: true },
      });
      if (!partner) {
        throw new Error(`Partner ${partnerId} not found`);
      }
      const fromStatus = partner.status;
      if (fromStatus === toStatus) {
        throw new Error(`Partner ${partnerId} is already in ${toStatus} state`);
      }

      await tx.partner.update({
        where: { id: partnerId },
        data: { status: toStatus },
      });

      await tx.partnerStatusChange.create({
        data: {
          partnerId,
          fromStatus,
          toStatus,
          reason: reason?.trim() || null,
          changedById: changedById ?? null,
        },
      });

      logger.info(
        `[partner.setStatus] ${partnerId}: ${fromStatus} → ${toStatus}` +
        (changedById ? ` by=${changedById}` : '')
      );

      return { partnerId, fromStatus, toStatus };
    });
  }
}

export const partnerService = new PartnerService();
