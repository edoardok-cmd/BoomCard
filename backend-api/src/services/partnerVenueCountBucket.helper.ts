/**
 * Spec §5.1 v1.1 — boundary helpers for the declared-venue-count bucket.
 *
 * The DB column (Partner.requestObjectCount) is the `PartnerVenueCountBucket`
 * Prisma enum (ONE / TWO_TO_FIVE / SIX_TO_TEN / ELEVEN_PLUS), so non-validated
 * callers cannot smuggle arbitrary strings into the column. The wire format
 * the UI uses on both register form input and admin list filter is the
 * display string ("1" / "2-5" / "6-10" / "11+"), which matches the physical
 * column values via the `@map` directives on the enum.
 *
 * These helpers do the boundary translation:
 *   - parseVenueCountBucket("2-5")    → PartnerVenueCountBucket.TWO_TO_FIVE
 *   - formatVenueCountBucket(TWO_TO_FIVE) → "2-5"
 *
 * Keeping both helpers in one place means a future bucket added to the spec
 * (e.g. "50+") gets exactly one line to change.
 */

import { PartnerVenueCountBucket } from '@prisma/client';

const TO_BUCKET: Record<string, PartnerVenueCountBucket> = {
  '1': PartnerVenueCountBucket.ONE,
  '2-5': PartnerVenueCountBucket.TWO_TO_FIVE,
  '6-10': PartnerVenueCountBucket.SIX_TO_TEN,
  '11+': PartnerVenueCountBucket.ELEVEN_PLUS,
};

const FROM_BUCKET: Record<PartnerVenueCountBucket, string> = {
  [PartnerVenueCountBucket.ONE]: '1',
  [PartnerVenueCountBucket.TWO_TO_FIVE]: '2-5',
  [PartnerVenueCountBucket.SIX_TO_TEN]: '6-10',
  [PartnerVenueCountBucket.ELEVEN_PLUS]: '11+',
};

export const VENUE_COUNT_BUCKET_DISPLAY_VALUES = ['1', '2-5', '6-10', '11+'] as const;
export type VenueCountBucketDisplay = (typeof VENUE_COUNT_BUCKET_DISPLAY_VALUES)[number];

export function parseVenueCountBucket(
  input: string | null | undefined,
): PartnerVenueCountBucket | null {
  if (input === null || input === undefined || input === '') return null;
  return TO_BUCKET[input] ?? null;
}

export function formatVenueCountBucket(
  bucket: PartnerVenueCountBucket | null | undefined,
): string | null {
  if (!bucket) return null;
  return FROM_BUCKET[bucket] ?? null;
}

/**
 * Convenience: takes any object that may contain a `requestObjectCount` enum
 * value and returns a copy with the value serialised to the wire format the
 * frontend expects. Existing list / detail responses route through this so
 * the migration to the enum is transparent.
 */
export function serializeRequestObjectCount<
  T extends { requestObjectCount?: PartnerVenueCountBucket | null }
>(row: T): Omit<T, 'requestObjectCount'> & { requestObjectCount: string | null } {
  return {
    ...row,
    requestObjectCount: formatVenueCountBucket(row.requestObjectCount ?? null),
  };
}
