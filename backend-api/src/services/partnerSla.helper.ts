/**
 * Spec §1.6 / §3.5 / §5.1 v1.1 — internal SLA helper for partner-request pickup.
 *
 * The internal deadline is 24 hours from APPLICATION CREATION (createdAt) for any
 * request that has not yet been ASSIGNED to an admin. The external promise to the
 * applicant is "до 2 работни дни" — handled in the application-ack email
 * (see emailService.sendPartnerApplicationAck).
 *
 * M3 fix: the clock anchors on createdAt — the same anchor the scheduler's
 * escalateOverduePartnerSla uses — so the badge and the alert agree on a single
 * 24h clock. (Previously the badge measured from joinedAt while the scheduler
 * measured from createdAt: two clocks for one SLA.)
 *
 * M4 fix: the 24h SLA is an ASSIGNMENT deadline (§1.6: "24 hours from creation for
 * admin ASSIGNMENT"). The scheduler fires only on assignedAdminId: null, so an
 * application that has been claimed has MET the SLA regardless of age. The badge
 * now mirrors that: an assigned application is always 'ok' (SLA satisfied), never
 * 'overdue'.
 *
 * Kept in its own module so the live admin routes AND the unit test pull
 * from the same source (previously the test had a copy-paste of the helper
 * with a comment to "keep in sync", which it never did).
 */

import { PartnerRequestStatus } from '@prisma/client';

export const SLA_HOURS_INTERNAL = 24;

export type PartnerSlaState = 'ok' | 'warning' | 'overdue';

export interface PartnerSla {
  hoursElapsed: number;
  hoursRemaining: number;
  state: PartnerSlaState;
  deadlineHours: number;
  isClosed: boolean;
}

export function computePartnerSla(
  /** M3: SLA clock anchor — application createdAt (NOT joinedAt). */
  createdAt: Date | string,
  requestStatus: string | null,
  /**
   * M4: assignment state. When the application has been claimed by an admin
   * (assignedAdminId is set / truthy), the assignment SLA is satisfied and the
   * badge reports 'ok' regardless of elapsed time. Defaults to null (unassigned)
   * so existing callers that omit it keep the pre-fix unassigned behavior.
   */
  assignedAdminId: string | null = null,
): PartnerSla {
  // HIGH-1 (r2n): Use Prisma enum constants instead of raw strings.
  // The schema.prisma defines: APPROVED @map("ODOBRENA"), REJECTED @map("OTKAZANA")
  // The current generated client (pre-generate) still exposes the Bulgarian DB keys.
  // After the next `prisma generate` the keys become APPROVED/REJECTED.
  // Until then we reference the enum object so the key name is not duplicated:
  // both here and in the scheduler use PartnerRequestStatus.APPROVED / .OTKAZANA.
  // When `prisma generate` is run this file only needs two identifier renames —
  // no grep-for-raw-strings needed.
  // TODO: after `prisma generate` rename ODOBRENA→APPROVED and OTKAZANA→REJECTED.
  const isClosed = requestStatus === PartnerRequestStatus.APPROVED
    || requestStatus === PartnerRequestStatus.REJECTED;
  // M4: an assigned application has met the assignment SLA — treat it as satisfied.
  const isAssigned = assignedAdminId != null && assignedAdminId !== '';
  const hoursElapsed = (Date.now() - new Date(createdAt).getTime()) / 36e5;
  const state: PartnerSlaState =
    isClosed || isAssigned ? 'ok'
    : hoursElapsed >= SLA_HOURS_INTERNAL ? 'overdue'
    : hoursElapsed >= SLA_HOURS_INTERNAL * 0.75 ? 'warning'
    : 'ok';
  return {
    hoursElapsed: Math.round(hoursElapsed * 10) / 10,
    hoursRemaining: Math.max(0, Math.round((SLA_HOURS_INTERNAL - hoursElapsed) * 10) / 10),
    state,
    deadlineHours: SLA_HOURS_INTERNAL,
    isClosed,
  };
}
