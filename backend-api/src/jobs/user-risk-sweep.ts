/**
 * User Risk Sweep Job
 *
 * Spec §4.1 + §7.2 — recompute risk score/bucket for every USER row in batches.
 * The admin subscribers list does lazy-on-read recompute, but that only updates
 * users who are paginated to. A user nobody filters into can sit on a stale
 * cached score forever, breaking the SQL risk-level filter and producing
 * inconsistencies (UI shows fresh score, filter uses stale).
 *
 * This job converges all users to a fresh score on a periodic cadence.
 *
 * Runs daily at 04:00 Sofia (low traffic). Can also be invoked as a one-off:
 *   npx tsx src/jobs/user-risk-sweep.ts
 */

import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { computeRiskForUsers, persistRiskAssessments } from '../services/userRisk.service';

const BATCH_SIZE = 200;

export async function runUserRiskSweep(): Promise<{ processed: number; updated: number }> {
  const startedAt = new Date();
  logger.info(`[user-risk-sweep] Starting run at ${startedAt.toISOString()}`);

  let processed = 0;
  let updated = 0;
  let cursor: string | null = null;

  // Cursor-paginate over all USER rows (deletedAt is irrelevant — we still
  // want stale soft-deleted rows to converge, otherwise risk filters could
  // miss restored users).
  for (;;) {
    const batch: Array<{ id: string; createdAt: Date; ibanLastChangedAt: Date | null; riskScore: number; riskBucket: string | null }> =
      await prisma.user.findMany({
        where: { role: 'USER' },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          createdAt: true,
          ibanLastChangedAt: true,
          riskScore: true,
          riskBucket: true,
        },
      });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    processed += batch.length;

    let assessments: Awaited<ReturnType<typeof computeRiskForUsers>>;
    try {
      assessments = await computeRiskForUsers(
        batch.map((u) => ({ id: u.id, createdAt: u.createdAt, ibanLastChangedAt: u.ibanLastChangedAt })),
      );
    } catch (err) {
      // Log the error and skip this batch — the sweep continues and processes
      // the remaining users. Individual batch failure does not abort the entire
      // nightly cron (per spec §7.2).
      logger.error(
        `[user-risk-sweep] Failed to compute risk for batch starting at ${cursor}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    // Only count rows that actually need a write — persistRiskAssessments will
    // skip writes for unchanged rows via its `where` guard, but we want a real
    // counter for the log line so anomalies are visible.
    const changed = batch.filter((u) => {
      const a = assessments.get(u.id);
      return a && (a.score !== u.riskScore || a.bucket !== (u.riskBucket as typeof a.bucket | null));
    });

    if (changed.length > 0) {
      await persistRiskAssessments(
        changed.map((u) => assessments.get(u.id)!),
      );
      updated += changed.length;
    }
  }

  logger.info(
    `[user-risk-sweep] Done — processed ${processed} user(s), updated ${updated}` +
    ` in ${Date.now() - startedAt.getTime()}ms`,
  );

  return { processed, updated };
}

// CLI entry point — `npx tsx src/jobs/user-risk-sweep.ts`
if (require.main === module) {
  runUserRiskSweep()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('[user-risk-sweep] CLI run failed:', err);
      process.exit(1);
    });
}
