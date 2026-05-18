/**
 * Spec §5.3 v1.1 — public visibility gate for the partner matrix.
 *
 * A partner is "publicly visible" — appears in customer-facing lists,
 * detail pages, search results, maps, featured carousels — only when ALL
 * of the following hold:
 *   - status === ACTIVE                  (post-onboarding, not suspended/archived)
 *   - verifiedAt is not null             (activation link has been consumed,
 *                                         §5.2 — operator cannot bypass)
 *   - isVisible === true                 (admin "Видимост" toggle is on)
 *
 * Any code path that returns Partner / Venue / Offer rows to a non-admin
 * caller MUST pass through this filter. Concentrating the rule here keeps
 * the matrix consistent — previously this gate was implemented inline in
 * /api/partners only, leaking suspended partners through /api/offers and
 * /api/venues.
 */

import { Prisma } from '@prisma/client';

export const publicPartnerFilter: Prisma.PartnerWhereInput = {
  status: 'ACTIVE',
  verifiedAt: { not: null },
  isVisible: true,
};

/**
 * Returns the partner-filter shape suitable for use inside a venue/offer
 * `where.partner = ...` clause. Identical contents, named differently so
 * call sites read clearly.
 */
export const publicPartnerJoinFilter: Prisma.PartnerWhereInput = publicPartnerFilter;
