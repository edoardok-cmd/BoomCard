/**
 * Partner Service
 *
 * Centralized helpers for partner state changes. The setPartnerStatus helper is
 * the single source of truth for the §5.3 / §5.4 v1.1 status matrix:
 *   - Reads previous status atomically with the update.
 *   - Writes a PartnerStatusChange audit row in the same transaction.
 *
 * Spec §1.4 / §3.5 / §8.1 point 5 — QR code auto-deactivation/reactivation:
 *   - Partner status → Inactive, Paused, Suspended, or Archived: all ACTIVE QR codes
 *     automatically deactivated (Sticker.status set to INACTIVE). Spec §1.4:
 *     "Transition to Inactive or Archived → All QR codes automatically deactivate in backend."
 *   - Inactive → Active: all INACTIVE QR codes automatically reactivated (bulk flip).
 *     Spec §1.4: "Transition back to Active → All QR codes automatically reactivate
 *     (no manual regeneration needed)."
 *   - Archived → Active: NO auto-reactivation. QR codes require explicit admin
 *     reactivation per sticker (spec §2.4 Gap 6). Admin must use the QR management UI.
 *
 * Implementation note: the fromStatus parameter distinguishes Inactive→Active from
 * Archived→Active so the correct reactivation policy is applied. Inactive→Active
 * reactivation is scoped to stickers where autoDeactivatedAt IS NOT NULL (set by
 * Case 1 deactivation) so manually-deactivated stickers are not bulk-reactivated.
 *
 * Statuses that trigger deactivation: INACTIVE, PAUSED, SUSPENDED, ARCHIVED.
 * Statuses that trigger reactivation: ACTIVE (only, and only from INACTIVE).
 *
 * NB: This service deliberately does NOT call writeAudit() — the AuditLog row
 * with the action label "partner.status.update" is written by the caller so
 * the actor's IP / userAgent can be attached. The PartnerStatusChange row IS
 * written here because it has no actor metadata to forward.
 */

import { PartnerStatus, StickerStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';

/**
 * Spec §1.4 / §3.6 — Partner statuses that trigger QR code auto-deactivation.
 * INACTIVE, PAUSED (admin-imposed pause), SUSPENDED, ARCHIVED all block scanning.
 */
const QR_DEACTIVATING_STATUSES: PartnerStatus[] = [
  PartnerStatus.INACTIVE,
  PartnerStatus.PAUSED,
  PartnerStatus.SUSPENDED,
  PartnerStatus.ARCHIVED,
];

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
   * Atomically transition a partner's status, log the change to
   * PartnerStatusChange, and auto-deactivate/reactivate QR codes per spec.
   *
   * Spec §1.4 / §3.5 / §8.1 point 5:
   *   - → Inactive/Archived/Suspended/Paused: all partner QR codes deactivated.
   *   - → Active: all partner QR codes reactivated.
   *
   * The QR status flip runs OUTSIDE the main transaction (post-commit step) so
   * a sticker-update failure does NOT roll back the partner status change (which
   * is the authoritative operational state). Sticker status is derived from
   * partner status — a transient failure is logged but not fatal. A background
   * reconciliation can be run if needed (sticker status should match partner
   * operational state at all times).
   *
   * Throws if the partner is missing or already in the target state.
   */
  async setPartnerStatus(params: SetPartnerStatusParams): Promise<SetPartnerStatusResult> {
    const { partnerId, toStatus, reason, changedById } = params;

    const result = await prisma.$transaction(async (tx) => {
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

    // Spec §1.4 / §3.5: QR code auto-deactivation/reactivation after status flip commits.
    // Runs outside the main transaction — sticker failure is non-fatal for the status change.
    await this.syncQrCodesForPartner(partnerId, toStatus, result.fromStatus);

    return result;
  }

  /**
   * Spec §1.4 / §3.5 / §8.1 point 5 — Sync QR code (Sticker) status with partner
   * operational status. Called after every partner status transition.
   *
   * Three distinct behaviors based on fromStatus + toStatus:
   *
   *   1. Any status → Inactive, Paused, Suspended, Archived:
   *      Deactivate ALL ACTIVE stickers (flip to INACTIVE).
   *
   *   2. Inactive → Active:
   *      Reactivate INACTIVE stickers that were auto-deactivated by this function
   *      (autoDeactivatedAt IS NOT NULL). Spec §1.4: "Transition back to Active →
   *      All QR codes automatically reactivate (no manual regeneration needed)."
   *      Scoped to auto-deactivated stickers only so manually-deactivated stickers
   *      are not bulk-reactivated. Clears autoDeactivatedAt on reactivation.
   *
   *   3. Archived → Active:
   *      NO auto-reactivation. Spec §2.4 Gap 6 states QR codes require "explicit
   *      admin reactivation per code" after an archived partner is re-onboarded.
   *      Admin must reactivate individual stickers via the QR management UI.
   */
  async syncQrCodesForPartner(
    partnerId: string,
    toStatus: PartnerStatus,
    fromStatus: PartnerStatus | undefined,
  ): Promise<void> {
    try {
      if (QR_DEACTIVATING_STATUSES.includes(toStatus)) {
        // Case 1: Spec §1.4: "Transition to Inactive or Archived → All QR codes automatically deactivate"
        const result = await prisma.sticker.updateMany({
          where: {
            venue: { partnerId },
            status: StickerStatus.ACTIVE,
          },
          data: { status: StickerStatus.INACTIVE, autoDeactivatedAt: new Date() },
        });
        logger.info(
          `[partner.syncQr] partnerId=${partnerId} → ${toStatus}: deactivated ${result.count} sticker(s)`
        );
      } else if (toStatus === PartnerStatus.ACTIVE) {
        if (fromStatus === undefined) {
          // Safety guard: caller did not supply previous status. We cannot determine the
          // correct reactivation policy (Inactive→Active vs Archived→Active), so we skip
          // reactivation entirely rather than risk bulk-reactivating stickers that should
          // remain inactive. Admin must reactivate stickers manually via the QR management UI.
          logger.warn(
            `[partner.syncQr] partnerId=${partnerId} → ACTIVE: fromStatus missing — ` +
            `skipping QR reactivation for safety. Admin must reactivate stickers manually.`
          );
        } else if (fromStatus === PartnerStatus.ARCHIVED) {
          // Case 3: Archived → Active. Spec §2.4 Gap 6 — QR codes require explicit
          // admin reactivation per sticker. Do NOT auto-reactivate.
          logger.info(
            `[partner.syncQr] partnerId=${partnerId} transitioned from ARCHIVED to ACTIVE. ` +
            `QR codes require explicit admin reactivation per sticker (spec §2.4 Gap 6). ` +
            `Admin must use the QR management UI to reactivate individual stickers.`
          );
        } else {
          // Case 2: Inactive (or other non-Archived) → Active. Spec §1.4 bulk reactivation.
          // Scoped to stickers that were auto-deactivated by this function (autoDeactivatedAt IS NOT NULL)
          // so manually-deactivated stickers are not unintentionally bulk-reactivated.
          const result = await prisma.sticker.updateMany({
            where: {
              venue: { partnerId },
              status: StickerStatus.INACTIVE,
              autoDeactivatedAt: { not: null },
            },
            data: { status: StickerStatus.ACTIVE, autoDeactivatedAt: null },
          });
          logger.info(
            `[partner.syncQr] partnerId=${partnerId} → ACTIVE (from ${fromStatus}): ` +
            `reactivated ${result.count} sticker(s) per spec §1.4`
          );
        }
      }
    } catch (err) {
      // Non-fatal: log and continue. The partner status change is already committed.
      // The QR sync intentionally runs outside the partner-status transaction so a
      // sticker failure does not roll back the status change (see spec §1.4).
      //
      // Recovery path: a background reconciliation script should periodically run
      // `SELECT * FROM "Sticker" WHERE "status" = 'ACTIVE' AND venue.partner.status IN (INACTIVE, PAUSED, SUSPENDED, ARCHIVED)`
      // and flip those stickers. Track as a follow-up ops task (not in scope of BC-SCHEMA-1).
      logger.error(
        `[partner.syncQr] WARN: QR sync failed for partner ${partnerId} → ${toStatus}. ` +
        `Manual reconciliation may be needed. Error: ${err}`
      );
    }
  }
}

export const partnerService = new PartnerService();
