/**
 * Shared pagination parser — the single safe way to turn untrusted
 * `?page=&limit=&offset=` query params into Prisma `skip`/`take`.
 *
 * Why this exists: many list routes did `parseInt(req.query.limit)` and passed
 * the result straight to Prisma. A non-numeric value (`?limit=abc`) yields NaN,
 * and a negative/zero value yields an invalid `take`, both of which make Prisma
 * throw a validation error that surfaced as an HTTP 500 (and, in dev, a stack
 * trace). Routing all pagination through this helper clamps the inputs to a safe
 * range so untrusted input can never reach Prisma malformed.
 *
 * - page:   integer >= 1 (default 1); invalid/missing -> 1
 * - limit:  integer in [1, maxLimit] (default defaultLimit); invalid/missing/over -> clamped
 * - offset: integer >= 0; when provided it overrides page-derived skip
 */
export interface Pagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export function parsePagination(
  query: { page?: unknown; limit?: unknown; offset?: unknown } | undefined,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): Pagination {
  const defaultLimit = opts.defaultLimit ?? 20;
  const maxLimit = opts.maxLimit ?? 100;
  // Postgres skip/take are 32-bit ints. Cap page and offset so an absurd value
  // (e.g. a 21-digit ?page=) can't overflow `skip` and reach Prisma — which
  // would throw a validation error. MAX_SKIP keeps the computed offset in range.
  const MAX_SKIP = 1_000_000_000; // < int4 max (2_147_483_647)

  const rawLimit = Number.parseInt(String(query?.limit ?? ''), 10);
  let limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const rawPage = Number.parseInt(String(query?.page ?? ''), 10);
  let page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const maxPage = Math.max(1, Math.floor(MAX_SKIP / limit) + 1);
  if (page > maxPage) page = maxPage;

  const rawOffset = Number.parseInt(String(query?.offset ?? ''), 10);
  let skip = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : (page - 1) * limit;
  if (skip > MAX_SKIP) skip = MAX_SKIP;

  return { page, limit, skip, take: limit };
}
