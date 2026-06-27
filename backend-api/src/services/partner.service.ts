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

import { PartnerStatus, StickerStatus, PartnerRequestStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import { notificationService } from './notification.service';
import { AppError } from '../middleware/error.middleware';
import { detach } from '../utils/detach';

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
 * Spec §1.1 — canonical partner status enum has exactly three values:
 * ACTIVE | INACTIVE | ARCHIVED. PAUSED and SUSPENDED are admin/UI labels that
 * both map to the canonical INACTIVE (spec §1.3). notificationService
 * .notifyPartnerStatusChange rejects any non-canonical value and silently
 * drops the notification, so callers MUST canonicalize before invoking it.
 * The DB write of the raw status is unaffected — only notification copy uses this.
 */
function toCanonicalPartnerStatus(s: PartnerStatus): 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' {
  if (s === PartnerStatus.ARCHIVED) return 'ARCHIVED';
  if (s === PartnerStatus.ACTIVE) return 'ACTIVE';
  // INACTIVE, PAUSED, SUSPENDED (and any other non-canonical) → INACTIVE.
  return 'INACTIVE';
}

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

/**
 * M3 (Spec §1.4) — canonical Inactive sub_type metadata.
 *
 * The spec models voluntary pause (Пауза) vs admin-imposed deactivation (Спрян)
 * as a metadata `sub_type` field on the canonical Inactive status, NOT as separate
 * enum members. The DB enum still carries PAUSED/SUSPENDED (legacy, can't be
 * changed without a migration), so we derive the spec sub_type at the application
 * layer from the raw status + the `statusReason` metadata column.
 *
 *   PAUSED     → VOLUNTARY_PAUSE   (Пауза)
 *   SUSPENDED  → ADMIN_SUSPENSION  (Спрян)
 *   INACTIVE   → from statusReason marker, else GENERIC_INACTIVE
 *   PENDING    → ONBOARDING_INACTIVE (the §1.6 onboarding read-only stage)
 */
export type PartnerInactiveSubType =
  | 'VOLUNTARY_PAUSE'
  | 'ADMIN_SUSPENSION'
  | 'ONBOARDING_INACTIVE'
  | 'GENERIC_INACTIVE'
  | null;

/** Canonical statusReason marker written when a partner enters PAUSED/SUSPENDED. */
export const PARTNER_STATUS_SUBTYPE_REASON: Record<string, string> = {
  PAUSED: 'VOLUNTARY_PAUSE',
  SUSPENDED: 'ADMIN_SUSPENSION',
};

/**
 * Derive the canonical Inactive sub_type for a partner from its raw status and
 * the `statusReason` metadata. Returns null for ACTIVE/ARCHIVED partners (the
 * sub_type only applies within the canonical Inactive status).
 *
 * Spec §1.6 / §3.5 — ONBOARDING_INACTIVE applies ONLY when:
 *   - status === PENDING (account state)
 *   - AND requestStatus === ONBOARDING or APPROVED (application stage)
 *
 * NEW / COMMUNICATION / NEGOTIATION applications have NO partner account yet
 * (still status=null or unfilled), so they must NOT be labeled ONBOARDING_INACTIVE.
 */
export function derivePartnerInactiveSubType(partner: {
  status: string;
  statusReason?: string | null;
  requestStatus?: string | null;
}): PartnerInactiveSubType {
  switch (partner.status) {
    case 'PAUSED':
      return 'VOLUNTARY_PAUSE';
    case 'SUSPENDED':
      return 'ADMIN_SUSPENSION';
    case 'PENDING': {
      // Spec §1.6 / §3.5 — PENDING account status combined with ONBOARDING or
      // APPROVED requestStatus indicates the onboarding stage (read-only access).
      // Earlier stages (NEW, COMMUNICATION, NEGOTIATION) have no account yet.
      const reqStatus = partner.requestStatus ?? '';
      if (reqStatus === 'ONBOARDING' || reqStatus === 'APPROVED') {
        return 'ONBOARDING_INACTIVE';
      }
      // NEW / COMMUNICATION / NEGOTIATION applications have no account, so no sub-type.
      return null;
    }
    case 'INACTIVE': {
      const r = partner.statusReason ?? '';
      if (r.startsWith('VOLUNTARY_PAUSE')) return 'VOLUNTARY_PAUSE';
      if (r.startsWith('ADMIN_SUSPENSION')) return 'ADMIN_SUSPENSION';
      if (r.startsWith('ONBOARDING_INACTIVE')) return 'ONBOARDING_INACTIVE';
      return 'GENERIC_INACTIVE';
    }
    default:
      return null;
  }
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
   * BC-ADMIN-SPEC-REAUDIT-QR-SYNC-DURABILITY-1: The QR status flip now runs
   * INSIDE the status transaction (atomic write). This guarantees that either:
   *   a) Both partner.status AND all sticker.status updates commit, OR
   *   b) Both roll back on any failure.
   *
   * Sticker deactivation is idempotent (Sticker.status can be safely set to
   * INACTIVE multiple times) and bounded (deactivating a partner's stickers
   * only touches rows scoped to that partner's venues), so transactional rollback
   * is not a performance concern. A persistent DB fault during the sticker update
   * will roll back the entire status change, allowing the caller to retry or
   * decide on error recovery. There is no more "best effort" window for sync
   * failures.
   *
   * The background reconciliation cron (scheduler.reconcileQrCodes, 4 AM daily)
   * remains as defense-in-depth: if a caller crashes or network fault prevents
   * this method from completing at all, the cron will catch any stale-ACTIVE
   * stickers and flip them to match the now-active partner status change.
   *
   * Throws if the partner is missing, already in the target state, or if any
   * transactional write (status, audit, or sticker deactivation) fails.
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

      // Spec §1.6 transition table: ARCHIVED is terminal except for explicit
      // re-onboarding back to ACTIVE. Blocking ARCHIVED → INACTIVE/PAUSED/SUSPENDED
      // closes the QR-reactivation bypass: the sequence Active → Archived → Inactive
      // → Active would otherwise let syncQrCodesForPartner Case 2 bulk-reactivate
      // stickers that were deactivated during the Archived phase, which spec §2.4
      // requires be reactivated explicitly per code. (setPartnerStatus is the single
      // choke point for post-onboarding transitions — adminPartners /:id/partner-status
      // routes through here.)
      if (fromStatus === PartnerStatus.ARCHIVED && toStatus !== PartnerStatus.ACTIVE) {
        // AppError(…, 400) so errorHandler returns a clean 400 to the client.
        // A bare Error would be treated as an unexpected fault → HTTP 500 with the
        // raw message leaked as an "Internal Server Error".
        throw new AppError(
          `Illegal partner status transition ARCHIVED → ${toStatus}. ` +
          `An archived partner may only be re-activated (ARCHIVED → ACTIVE).`,
          400,
        );
      }

      // Spec §1.7 / §2.4 / §12 rule 5: reactivating an ARCHIVED partner requires a
      // NEW onboarding review — the partner must NOT go operationally live in one
      // click. On ARCHIVED → ACTIVE we therefore re-enter the onboarding pipeline
      // (requestStatus → ONBOARDING) and clear verifiedAt, so the partner must be
      // re-approved AND re-activate via a fresh activation link before they count as
      // operationally active (isPartnerOperationallyActive requires verifiedAt != null).
      // QR codes are NOT auto-reactivated here either (syncQrCodesForPartner Case 3).
      const isArchivedReactivation =
        fromStatus === PartnerStatus.ARCHIVED && toStatus === PartnerStatus.ACTIVE;

      // M3 (§1.4) — stamp the canonical Inactive sub_type metadata on statusReason.
      // PAUSED → VOLUNTARY_PAUSE (Пауза); SUSPENDED → ADMIN_SUSPENSION (Спрян).
      // A free-text admin reason is appended after the marker so both the
      // structured sub_type and the human note are retained:
      //   "ADMIN_SUSPENSION: repeated chargebacks".
      // Leaving Inactive for ACTIVE/ARCHIVED clears the marker.
      const subTypeMarker = PARTNER_STATUS_SUBTYPE_REASON[toStatus as string];
      const trimmedReason = reason?.trim() || '';
      let statusReasonUpdate: { statusReason?: string | null } = {};
      if (subTypeMarker) {
        statusReasonUpdate = {
          statusReason: trimmedReason ? `${subTypeMarker}: ${trimmedReason}` : subTypeMarker,
        };
      } else if (toStatus === PartnerStatus.ACTIVE || toStatus === PartnerStatus.ARCHIVED) {
        statusReasonUpdate = { statusReason: null };
      }

      await tx.partner.update({
        where: { id: partnerId },
        data: {
          // Spec §1.7 / §2.4 / §12 rule 5: ARCHIVED → ACTIVE reactivation must
          // re-enter the onboarding pipeline (status=PENDING) rather than jumping
          // directly to ACTIVE. This ensures the partner goes through the approval
          // flow and activation link consumption before becoming operationally
          // live (isPartnerOperationallyActive requires verifiedAt != null).
          // For all other transitions, apply the requested status directly.
          status: isArchivedReactivation ? PartnerStatus.PENDING : toStatus,
          ...statusReasonUpdate,
          ...(isArchivedReactivation
            ? { requestStatus: PartnerRequestStatus.ONBOARDING, verifiedAt: null }
            : {}),
        },
      });

      // Spec §1.7 / §12 rule 5: DEFECT 1 FIX — invalidate activation links on
      // ARCHIVED and SUSPENDED transitions. When a partner is archived or suspended,
      // any unconsumed activation links should be dead. The consume path (line 280-285
      // in activationLink.service.ts) already defends against this, but spec intent is
      // the link should be explicitly invalidated at archival time.
      if (toStatus === PartnerStatus.ARCHIVED || toStatus === PartnerStatus.SUSPENDED) {
        const now = new Date();
        await tx.activationLink.updateMany({
          where: {
            partnerId,
            consumedAt: null,
            invalidatedAt: null,
          },
          data: { invalidatedAt: now },
        });
      }

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

      // BC-ADMIN-SPEC-REAUDIT-QR-SYNC-DURABILITY-1: Perform QR sync INSIDE the
      // transaction (atomic with status change). Rollback if any sticker update fails.
      await this.syncQrCodesForPartnerTx(tx, partnerId, toStatus, fromStatus);

      // Return the actual status written to the database. For ARCHIVED→ACTIVE
      // reactivation, we wrote PENDING (not the requested ACTIVE) per spec §1.7 / §2.4 / §12 rule 5.
      // The return value must match reality so the audit trail is accurate.
      const actualWrittenStatus = isArchivedReactivation ? PartnerStatus.PENDING : toStatus;
      return { partnerId, fromStatus, toStatus: actualWrittenStatus };
    });

    // Spec §9.1 template 6 / Clash 6.6: partners MUST be notified of account status changes.
    const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { userId: true, businessName: true } });
    if (partner?.userId) {
      detach(notificationService.notifyPartnerStatusChange({
        partnerUserId: partner.userId,
        businessName: partner.businessName,
        // r2i F1: parameter names must match the function signature (toStatus/fromStatus).
        // Prior bug: newStatus/previousStatus caused both values to be undefined at runtime,
        // producing "changed to undefined" messages and wrong priority classification.
        //
        // Spec §1.3: PAUSED/SUSPENDED both canonicalize to INACTIVE. notifyPartnerStatusChange
        // rejects non-canonical values and silently drops the notification, so we map the raw
        // PartnerStatus enum to the canonical ACTIVE | INACTIVE | ARCHIVED set here. The DB
        // write above keeps the raw status; only the notification value is canonicalized.
        toStatus: toCanonicalPartnerStatus(toStatus),
        fromStatus: toCanonicalPartnerStatus(result.fromStatus),
      }), (err: unknown) => logger.error('[partner.setStatus] status-change notification failed:', err));
    }

    return result;
  }

  /**
   * Spec §1.4 / §3.5 / §8.1 point 5 — Sync QR code (Sticker) status with partner
   * operational status, INSIDE the partner-status transaction.
   *
   * BC-ADMIN-SPEC-REAUDIT-QR-SYNC-DURABILITY-1: This method is called INSIDE
   * prisma.$transaction by setPartnerStatus, so failures propagate and roll back
   * the entire status change atomically. No retries or soft logging — transactional
   * semantics mean either everything commits or nothing does.
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
  private async syncQrCodesForPartnerTx(
    tx: any, // Prisma transaction client
    partnerId: string,
    toStatus: PartnerStatus,
    fromStatus: PartnerStatus | undefined,
  ): Promise<void> {
    if (QR_DEACTIVATING_STATUSES.includes(toStatus)) {
      // Case 1: Spec §1.4 / §8.1 rule 5: "Transition to Inactive or Archived →
      // ALL QR codes automatically deactivate." H3 fix: previously only ACTIVE
      // stickers were flipped, leaving PROCESSING ("In Processing") and PENDING
      // stickers in a non-deactivated state on a non-operational partner. Flip
      // every non-terminal sticker (ACTIVE, PROCESSING, PENDING) to INACTIVE.
      // REPLACED / RETIRED / DAMAGED are already terminal/non-scannable and are
      // left untouched (transitioning them would corrupt their lifecycle history).
      //
      // autoDeactivatedAt is stamped ONLY on the stickers that were ACTIVE, because
      // only those should auto-reactivate when the partner returns to Active (Case 2).
      // A PROCESSING/PENDING sticker was never operational, so it must NOT be promoted
      // to ACTIVE by the bulk reactivation — it stays INACTIVE until admin handles it.
      const deactivatedAt = new Date();
      const activeResult = await tx.sticker.updateMany({
        where: {
          venue: { partnerId },
          status: StickerStatus.ACTIVE,
        },
        data: { status: StickerStatus.INACTIVE, autoDeactivatedAt: deactivatedAt },
      });
      const pendingResult = await tx.sticker.updateMany({
        where: {
          venue: { partnerId },
          status: { in: [StickerStatus.PROCESSING, StickerStatus.PENDING] },
        },
        data: { status: StickerStatus.INACTIVE },
      });
      logger.info(
        `[partner.syncQr] partnerId=${partnerId} → ${toStatus}: deactivated ` +
        `${activeResult.count} active + ${pendingResult.count} processing/pending sticker(s) [ATOMIC]`
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
        //
        // DEFECT 2 FIX: Clear autoDeactivatedAt for all INACTIVE codes so they do not
        // get bulk-reactivated by a later Inactive→Active cycle. During the ARCHIVED
        // phase, stickers may have been manually deactivated (autoDeactivatedAt=null)
        // or auto-deactivated (autoDeactivatedAt!=null). When transitioning back to
        // ACTIVE, we must require explicit per-sticker reactivation (spec §2.4 Gap 6),
        // so we clear the timestamp on ALL INACTIVE stickers. This ensures that if the
        // partner later becomes Inactive and then Active again, the stickers are not
        // unexpectedly bulk-reactivated — they require admin action per the spec.
        await tx.sticker.updateMany({
          where: {
            venue: { partnerId },
            status: StickerStatus.INACTIVE,
          },
          data: { autoDeactivatedAt: null },
        });
        logger.info(
          `[partner.syncQr] partnerId=${partnerId} transitioned from ARCHIVED to ACTIVE. ` +
          `QR codes require explicit admin reactivation per sticker (spec §2.4 Gap 6). ` +
          `Cleared autoDeactivatedAt on all INACTIVE stickers to prevent accidental bulk-reactivation. ` +
          `Admin must use the QR management UI to reactivate individual stickers.`
        );
      } else {
        // Case 2: Inactive (or other non-Archived) → Active. Spec §1.4 bulk reactivation.
        // Scoped to stickers that were auto-deactivated by this function (autoDeactivatedAt IS NOT NULL)
        // so manually-deactivated stickers are not unintentionally bulk-reactivated.
        const result = await tx.sticker.updateMany({
          where: {
            venue: { partnerId },
            status: StickerStatus.INACTIVE,
            autoDeactivatedAt: { not: null },
          },
          data: { status: StickerStatus.ACTIVE, autoDeactivatedAt: null },
        });
        logger.info(
          `[partner.syncQr] partnerId=${partnerId} → ACTIVE (from ${fromStatus}): ` +
          `reactivated ${result.count} sticker(s) per spec §1.4 [ATOMIC]`
        );
      }
    }
  }

  /**
   * Spec §1.4 / §3.5 / §8.1 point 5 — Sync QR code (Sticker) status with partner
   * operational status, OUTSIDE any transaction (legacy/post-commit path).
   *
   * DEPRECATED: This method is kept for backward compatibility. New code should
   * use the atomic setPartnerStatus method, which performs deactivation inside
   * the transaction. This method is only called by the background reconciliation
   * cron (scheduler.reconcileQrCodes) and tests.
   *
   * Runs OUTSIDE the status transaction with bounded retries on failure. Useful
   * for background reconciliation where failures are acceptable and don't need to
   * roll back other operations.
   *
   * Same three behaviors as syncQrCodesForPartnerTx.
   */
  async syncQrCodesForPartner(
    partnerId: string,
    toStatus: PartnerStatus,
    fromStatus: PartnerStatus | undefined,
  ): Promise<void> {
    // Bounded retry for the sticker updateMany. Retrying up to 3 times with a
    // short backoff narrows the window for recoverable faults while still failing
    // soft (logging only) for persistent ones.
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = 200;
    const runWithRetry = async (
      label: string,
      op: () => Promise<{ count: number }>,
    ): Promise<{ count: number }> => {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          return await op();
        } catch (err) {
          lastErr = err;
          if (attempt < MAX_ATTEMPTS) {
            logger.warn(
              `[partner.syncQr] ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed for ` +
              `partner ${partnerId}; retrying in ${BACKOFF_MS * attempt}ms. Error: ${err}`
            );
            await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS * attempt));
          }
        }
      }
      throw lastErr;
    };

    try {
      if (QR_DEACTIVATING_STATUSES.includes(toStatus)) {
        // Case 1: Spec §1.4 / §8.1 rule 5: "Transition to Inactive or Archived →
        // ALL QR codes automatically deactivate."
        const deactivatedAt = new Date();
        const activeResult = await runWithRetry('deactivate-active', () =>
          prisma.sticker.updateMany({
            where: {
              venue: { partnerId },
              status: StickerStatus.ACTIVE,
            },
            data: { status: StickerStatus.INACTIVE, autoDeactivatedAt: deactivatedAt },
          })
        );
        const pendingResult = await runWithRetry('deactivate-pending', () =>
          prisma.sticker.updateMany({
            where: {
              venue: { partnerId },
              status: { in: [StickerStatus.PROCESSING, StickerStatus.PENDING] },
            },
            data: { status: StickerStatus.INACTIVE },
          })
        );
        logger.info(
          `[partner.syncQr] partnerId=${partnerId} → ${toStatus}: deactivated ` +
          `${activeResult.count} active + ${pendingResult.count} processing/pending sticker(s) [post-commit]`
        );
      } else if (toStatus === PartnerStatus.ACTIVE) {
        if (fromStatus === undefined) {
          logger.warn(
            `[partner.syncQr] partnerId=${partnerId} → ACTIVE: fromStatus missing — ` +
            `skipping QR reactivation for safety. Admin must reactivate stickers manually.`
          );
        } else if (fromStatus === PartnerStatus.ARCHIVED) {
          logger.info(
            `[partner.syncQr] partnerId=${partnerId} transitioned from ARCHIVED to ACTIVE. ` +
            `QR codes require explicit admin reactivation per sticker (spec §2.4 Gap 6).`
          );
        } else {
          // Case 2: Inactive → Active. Spec §1.4 bulk reactivation.
          const result = await runWithRetry('reactivate', () =>
            prisma.sticker.updateMany({
              where: {
                venue: { partnerId },
                status: StickerStatus.INACTIVE,
                autoDeactivatedAt: { not: null },
              },
              data: { status: StickerStatus.ACTIVE, autoDeactivatedAt: null },
            })
          );
          logger.info(
            `[partner.syncQr] partnerId=${partnerId} → ACTIVE (from ${fromStatus}): ` +
            `reactivated ${result.count} sticker(s) per spec §1.4 [post-commit]`
          );
        }
      }
    } catch (err) {
      // Non-fatal: log and continue. This is a post-commit reconciliation path;
      // failure does not roll back any previous operations. The background cron
      // (scheduler.reconcileQrCodes at 4 AM) will catch any stale stickers.
      //
      // SECURITY NOTE: The AUTHORITATIVE protection against scanning a non-active
      // partner's stickers is the SCAN-TIME gate `isPartnerOperationallyActive` in
      // sticker.service, not the sticker.status column. Even if this sync fails and
      // leaves stickers in ACTIVE state, they CANNOT be scanned on a non-active
      // partner (scan-time gate enforced). This method only keeps the status column
      // consistent for reporting/display purposes.
      logger.error(
        `[partner.syncQr] WARN: Post-commit QR sync failed for partner ${partnerId} → ${toStatus}. ` +
        `The 4 AM reconciliation cron will correct any stale stickers. Error: ${err}`
      );
    }
  }
}

export const partnerService = new PartnerService();
