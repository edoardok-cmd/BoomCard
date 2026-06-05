/**
 * Spec §5.1 v1.1 — internal SLA helper for partner-request pickup.
 *
 * The internal deadline is 24 hours from joinedAt for any request that has
 * not yet reached a terminal pipeline state (APPROVED / REJECTED). The
 * external promise to the applicant is "до 2 работни дни" — handled in the
 * application-ack email (see emailService.sendPartnerApplicationAck).
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
  joinedAt: Date | string,
  requestStatus: string | null,
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
  const hoursElapsed = (Date.now() - new Date(joinedAt).getTime()) / 36e5;
  const state: PartnerSlaState =
    isClosed ? 'ok'
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
