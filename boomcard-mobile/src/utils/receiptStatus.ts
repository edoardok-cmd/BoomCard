/**
 * Receipt status canonicalization (R5 §3.2)
 *
 * Internal pipeline states (PROCESSING/VALIDATING/MANUAL_REVIEW/PENDING_CONFIRMATION)
 * are never shown to the user — they collapse onto the canonical "In Review" vocabulary.
 * Both the receipts list and the receipt detail screen MUST use this single mapping so
 * they always agree.
 */

const CANONICAL_STATUS: Record<string, string> = {
  PENDING: 'IN_REVIEW',
  PENDING_CONFIRMATION: 'IN_REVIEW',
  PROCESSING: 'IN_REVIEW',
  VALIDATING: 'IN_REVIEW',
  MANUAL_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
};

export const toCanonicalStatus = (status: string): string =>
  CANONICAL_STATUS[status] || status;
