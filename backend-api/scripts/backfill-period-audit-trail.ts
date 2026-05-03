/**
 * One-off migration: backfill openedAt / openedBy / reviewedAt / reviewedBy on
 * ReportingPeriod records that reached LOCKED or INVOICED before the full lifecycle
 * was enforced.  The transition guard now requires OPEN → FOR_REVIEW → LOCKED → INVOICED,
 * but periods created earlier may have been advanced directly to LOCKED, leaving the
 * earlier audit timestamps null and producing an incomplete audit trail.
 *
 * Strategy:
 *   - openedAt: set to the first day of the period's month at 00:00 Sofia time
 *               (the period was conceptually open from month-start, even if the
 *               record itself was created later).  openedBy = lockedBy.
 *   - reviewedAt: set to lockedAt - 1 minute (review happens immediately before lock,
 *               since both were performed in the same session pre-enforcement).
 *               reviewedBy = lockedBy (same admin who locked it).
 *   - lockedAt:  for INVOICED periods missing lockedAt, set to invoicedAt - 1 minute.
 *
 * Only fills in NULL values — never overwrites existing audit timestamps.
 *
 * Imports the project's prisma client (which configures the pg driver adapter required
 * by Prisma 7) instead of `new PrismaClient()`, which would fail at runtime.
 *
 * Usage:
 *   DRY_RUN=true npx ts-node scripts/backfill-period-audit-trail.ts
 *   npx ts-node scripts/backfill-period-audit-trail.ts
 */

import { prisma } from '../src/lib/prisma';

const DRY_RUN = process.env.DRY_RUN === 'true';

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

  // Find periods that reached LOCKED or INVOICED but are missing prior audit timestamps.
  // Also catches INVOICED periods missing lockedAt (the immediately-prior step).
  const stale = await prisma.reportingPeriod.findMany({
    where: {
      OR: [
        {
          status: { in: ['LOCKED', 'INVOICED'] },
          OR: [{ openedAt: null }, { reviewedAt: null }],
        },
        { status: 'INVOICED', lockedAt: null },
      ],
    },
  });

  console.log(`Found ${stale.length} period(s) with incomplete audit trail.`);
  if (stale.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  for (const rp of stale) {
    const [year, month] = rp.month.split('-').map(Number);
    // Sofia winter offset (+02:00) — symmetric with the date anchoring used in the
    // /reports endpoint.  This is conservative: openedAt is treated as month-start
    // local Sofia time so the displayed audit line shows "01.MM.YYYY 00:00".
    const monthStartSofia = new Date(`${rp.month}-01T00:00:00.000+02:00`);

    const updates: {
      openedAt?: Date;
      openedBy?: string | null;
      reviewedAt?: Date;
      reviewedBy?: string | null;
      lockedAt?: Date;
      lockedBy?: string | null;
    } = {};

    // For an INVOICED period with no lockedAt, infer lockedAt = invoicedAt - 1 minute.
    // Compute this early so reviewedAt can chain off the inferred lockedAt below.
    if (rp.status === 'INVOICED' && !rp.lockedAt) {
      if (rp.invoicedAt) {
        updates.lockedAt = new Date(rp.invoicedAt.getTime() - 60_000);
        updates.lockedBy = rp.invoicedBy ?? null;
      } else {
        console.warn(`[skip] ${rp.month} INVOICED but no lockedAt or invoicedAt — manual review required`);
        continue;
      }
    }
    if (rp.status === 'LOCKED' && !rp.lockedAt) {
      console.warn(`[skip] ${rp.month} LOCKED but lockedAt is null — schema invariant violated, manual review required`);
      continue;
    }

    if (!rp.openedAt) {
      updates.openedAt = monthStartSofia;
      updates.openedBy = rp.lockedBy ?? rp.invoicedBy ?? null;
    }

    // reviewedAt: 1 minute before lockedAt (real or inferred).  If neither lockedAt nor
    // invoicedAt is available we'd already have continued above, so anchor is non-null here.
    if (!rp.reviewedAt) {
      const anchor = rp.lockedAt ?? updates.lockedAt ?? rp.invoicedAt;
      if (anchor) {
        updates.reviewedAt = new Date(anchor.getTime() - 60_000);
        updates.reviewedBy = rp.lockedBy ?? rp.invoicedBy ?? null;
      }
    }

    console.log(`[${rp.month}] status=${rp.status} → set ${Object.keys(updates).join(', ')}`);
    if (Object.keys(updates).length === 0) {
      // Nothing to update for this row (already has all required timestamps despite
      // matching the where clause — race condition or stale data from earlier read).
      continue;
    }

    if (!DRY_RUN) {
      await prisma.reportingPeriod.update({
        where: { id: rp.id },
        data: updates,
      });
    }
  }

  console.log(DRY_RUN ? 'Dry run complete — no writes performed.' : 'Backfill complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
