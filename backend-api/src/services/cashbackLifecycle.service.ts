/**
 * Cashback Lifecycle Service (Spec §4.4 v1.1)
 *
 * Entry-based cashback management. Each WalletTransaction of type
 * CASHBACK_CREDIT carries a CashbackEntryStatus through this finite state
 * machine:
 *
 *   PENDING ──approve──▶ CLEARED ──batch──▶ LOCKED ──payout──▶ PAID
 *      │                    │
 *      │                    └──60d elapse──▶ EXPIRED
 *      │
 *      └────────reject────▶ VOIDED
 *
 * CLEARED is the entry into the 60-day rolling validity (clearedAt drives
 * the expiry, NOT the original transaction date — per spec §4.4).
 *
 * VOIDED records remain visible to the user with `voidedReason` so the audit
 * trail is transparent (spec §4.4: "Потребителят го вижда ... със статус
 * 'Анулиран' и причина").
 *
 * The service is the single point of mutation for cashbackStatus. Direct
 * Prisma updates should be avoided — every transition writes an AuditLog
 * row so §10.4 "История на действията" stays complete.
 */
import { CashbackEntryStatus, ReceiptStatus, ScanStatus, WalletTransactionStatus, WalletTransactionType } from '@prisma/client';
import type { WalletTransaction } from '@prisma/client';
import prisma from '../lib/prisma';
import { writeAudit } from '../middleware/audit.middleware';
import { getSystemSettingInt } from '../utils/systemSettings';
import { logger } from '../utils/logger';

const CASHBACK_VALIDITY_DAYS_DEFAULT = 60;

async function getValidityDays(): Promise<number> {
  return getSystemSettingInt('cashback_expiry_days', CASHBACK_VALIDITY_DAYS_DEFAULT);
}

/**
 * Mark a cashback entry CLEARED. Idempotent: re-clearing a CLEARED row is
 * a no-op (preserves the original clearedAt so the 60-day window doesn't
 * extend on retry). Sets cashbackExpiresAt = clearedAt + N days.
 */
export async function markCleared(params: {
  walletTransactionId: string;
  actorUserId: string | null;
  reason?: string;
}) {
  const { walletTransactionId, actorUserId, reason } = params;
  const validityDays = await getValidityDays();

  const existing = await prisma.walletTransaction.findUnique({
    where: { id: walletTransactionId },
    select: { id: true, type: true, cashbackStatus: true, clearedAt: true, status: true },
  });
  if (!existing) throw new Error(`WalletTransaction ${walletTransactionId} not found`);
  if (existing.type !== WalletTransactionType.CASHBACK_CREDIT) {
    throw new Error(`WalletTransaction ${walletTransactionId} is not a CASHBACK_CREDIT`);
  }
  if (existing.cashbackStatus === CashbackEntryStatus.CLEARED) return existing;
  if (existing.cashbackStatus === CashbackEntryStatus.VOIDED) {
    throw new Error(`Cannot clear a VOIDED cashback entry (${walletTransactionId})`);
  }
  if (existing.cashbackStatus === CashbackEntryStatus.PAID) {
    throw new Error(`Cannot clear a PAID cashback entry (${walletTransactionId})`);
  }

  const clearedAt = new Date();
  const expiresAt = new Date(clearedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const updated = await prisma.walletTransaction.update({
    where: { id: walletTransactionId },
    data: {
      cashbackStatus: CashbackEntryStatus.CLEARED,
      clearedAt,
      cashbackExpiresAt: expiresAt,
    },
  });

  await writeAudit({
    actorUserId,
    action: 'CASHBACK_CLEARED',
    objectType: 'WalletTransaction',
    objectId: walletTransactionId,
    before: { cashbackStatus: existing.cashbackStatus },
    after: { cashbackStatus: CashbackEntryStatus.CLEARED, clearedAt, cashbackExpiresAt: expiresAt, reason: reason ?? null },
  }).catch((err) => logger.error('[cashbackLifecycle] audit write failed (markCleared):', err));

  return updated;
}

/**
 * Mark a cashback entry VOIDED. Per spec §7.1: when a transaction in risk
 * review is rejected, the Pending cashback record is NOT silently deleted —
 * it's flagged Voided with a visible reason and audit trail.
 *
 * If the entry was previously CLEARED (admin reversal), we also pull the
 * amount out of availableBalance so the user can't withdraw funds tied to
 * a now-voided credit.
 */
export async function markVoided(params: {
  walletTransactionId: string;
  reason: string;
  actorUserId: string | null;
}) {
  const { walletTransactionId, reason, actorUserId } = params;
  if (!reason || reason.trim().length === 0) {
    throw new Error('VOIDED transition requires a non-empty reason');
  }

  const existing = await prisma.walletTransaction.findUnique({
    where: { id: walletTransactionId },
    select: {
      id: true, type: true, cashbackStatus: true, status: true, amount: true,
      walletId: true,
    },
  });
  if (!existing) throw new Error(`WalletTransaction ${walletTransactionId} not found`);
  if (existing.type !== WalletTransactionType.CASHBACK_CREDIT) {
    throw new Error(`WalletTransaction ${walletTransactionId} is not a CASHBACK_CREDIT`);
  }
  if (existing.cashbackStatus === CashbackEntryStatus.VOIDED) return existing;
  if (existing.cashbackStatus === CashbackEntryStatus.PAID) {
    throw new Error(`Cannot void a PAID cashback entry (${walletTransactionId}) — issue a refund instead`);
  }
  if (existing.cashbackStatus === CashbackEntryStatus.LOCKED) {
    // §6.1 invariant: LOCKED entries are part of an in-flight WITHDRAWAL whose
    // balance is already debited. Voiding here without unwinding the payout
    // would leave the wallet in a torn state. Admin must reject/cancel the
    // pending payout first (which reverts LOCKED → CLEARED via revertLocked),
    // then void the now-CLEARED entry.
    throw new Error(
      `Cannot void a LOCKED cashback entry (${walletTransactionId}) — cancel the pending payout first`
    );
  }

  const voidedAt = new Date();
  const wasCleared = existing.cashbackStatus === CashbackEntryStatus.CLEARED;
  // TRIAL_PENDING credits increment wallet.balance only (not availableBalance)
  // at credit time — see walletService.credit. Voiding such an entry must mirror
  // that pattern: decrement balance only. The scheduler's own trial-void path
  // handles this directly; this branch makes the admin-action path consistent.
  const wasTrialPending = existing.status === WalletTransactionStatus.TRIAL_PENDING
    && existing.cashbackStatus !== CashbackEntryStatus.CLEARED;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.walletTransaction.update({
      where: { id: walletTransactionId },
      data: {
        cashbackStatus: CashbackEntryStatus.VOIDED,
        status: WalletTransactionStatus.ANNULLED,
        voidedAt,
        voidedReason: reason,
        voidedByUserId: actorUserId,
      },
    });

    if (wasCleared) {
      // Pull the cashback out of available + total balance so it can't be
      // withdrawn. Mirrors the cancellation path in wallet.service.ts.
      await tx.wallet.update({
        where: { id: existing.walletId },
        data: {
          balance: { decrement: existing.amount },
          availableBalance: { decrement: existing.amount },
        },
      });
    } else if (wasTrialPending) {
      // Trial-pending: balance was incremented, availableBalance was not.
      // Decrement balance only so the leaked credit is reclaimed.
      await tx.wallet.update({
        where: { id: existing.walletId },
        data: { balance: { decrement: existing.amount } },
      });
    }

    return row;
  });

  await writeAudit({
    actorUserId,
    action: 'CASHBACK_VOIDED',
    objectType: 'WalletTransaction',
    objectId: walletTransactionId,
    before: { cashbackStatus: existing.cashbackStatus },
    after: {
      cashbackStatus: CashbackEntryStatus.VOIDED,
      voidedAt,
      voidedReason: reason,
      // Audit-pass [X.2]: when voiding a CLEARED entry, surface the reversal
      // in the audit row so reconciliation reports (which currently sum
      // CASHBACK_CLEARED actions to compute "credited") can subtract this.
      // Without this flag, a CLEARED+VOIDED round-trip looks like a net
      // credit in the audit history even though the wallet was reverted.
      ...(wasCleared
        ? {
            balanceReversal: true,
            reversalAmount: existing.amount,
          }
        : {}),
    },
  }).catch((err) => logger.error('[cashbackLifecycle] audit write failed (markVoided):', err));

  return updated;
}

/**
 * Lock a set of cashback entries for an outgoing payout batch. Idempotent
 * per-entry. Returns the count of newly-locked rows.
 */
export async function markLocked(params: {
  walletTransactionIds: string[];
  actorUserId: string | null;
}) {
  const { walletTransactionIds, actorUserId } = params;
  if (walletTransactionIds.length === 0) return { count: 0 };

  const result = await prisma.walletTransaction.updateMany({
    where: {
      id: { in: walletTransactionIds },
      type: WalletTransactionType.CASHBACK_CREDIT,
      cashbackStatus: CashbackEntryStatus.CLEARED,
    },
    data: { cashbackStatus: CashbackEntryStatus.LOCKED },
  });

  if (result.count > 0) {
    await writeAudit({
      actorUserId,
      action: 'CASHBACK_LOCKED',
      objectType: 'WalletTransaction',
      objectId: null,
      after: { count: result.count, ids: walletTransactionIds },
    }).catch((err) => logger.error('[cashbackLifecycle] audit write failed (markLocked):', err));
  }
  return { count: result.count };
}

/**
 * Lock all CLEARED cashback entries on a wallet at the moment a payout is
 * requested. Mirrors the §6.1 invariant that requestPayout drains the full
 * availableBalance — every CLEARED entry is part of the in-flight payout.
 *
 * Returns the IDs that were locked so callers can persist them in the
 * WITHDRAWAL metadata, allowing revertLocked / markPaid to target this batch
 * precisely even if the wallet accumulates new CLEARED entries while the
 * payout is in flight.
 */
export async function lockClearedForWallet(params: {
  walletId: string;
  actorUserId: string | null;
}): Promise<string[]> {
  const { walletId, actorUserId } = params;
  const cleared = await prisma.walletTransaction.findMany({
    where: {
      walletId,
      type: WalletTransactionType.CASHBACK_CREDIT,
      cashbackStatus: CashbackEntryStatus.CLEARED,
    },
    select: { id: true },
  });
  if (cleared.length === 0) return [];
  const ids = cleared.map((r) => r.id);
  await markLocked({ walletTransactionIds: ids, actorUserId });
  return ids;
}

/**
 * Revert LOCKED entries back to CLEARED. Used when a payout is rejected,
 * cancelled, or fails — the balance is restored elsewhere; this restores the
 * cashbackStatus annotation so the entries can be re-paid or voided.
 */
export async function revertLocked(params: {
  walletTransactionIds: string[];
  actorUserId: string | null;
  reason?: string;
}) {
  const { walletTransactionIds, actorUserId, reason } = params;
  if (walletTransactionIds.length === 0) return { count: 0 };

  const result = await prisma.walletTransaction.updateMany({
    where: {
      id: { in: walletTransactionIds },
      type: WalletTransactionType.CASHBACK_CREDIT,
      cashbackStatus: CashbackEntryStatus.LOCKED,
    },
    data: { cashbackStatus: CashbackEntryStatus.CLEARED },
  });

  if (result.count > 0) {
    await writeAudit({
      actorUserId,
      action: 'CASHBACK_LOCK_REVERTED',
      objectType: 'WalletTransaction',
      objectId: null,
      after: { count: result.count, ids: walletTransactionIds, reason: reason ?? null },
    }).catch((err) => logger.error('[cashbackLifecycle] audit write failed (revertLocked):', err));
  }
  return { count: result.count };
}

/**
 * Final transition after a payout has settled.
 */
export async function markPaid(params: {
  walletTransactionIds: string[];
  actorUserId: string | null;
}) {
  const { walletTransactionIds, actorUserId } = params;
  if (walletTransactionIds.length === 0) return { count: 0 };

  const result = await prisma.walletTransaction.updateMany({
    where: {
      id: { in: walletTransactionIds },
      type: WalletTransactionType.CASHBACK_CREDIT,
      cashbackStatus: CashbackEntryStatus.LOCKED,
    },
    data: {
      cashbackStatus: CashbackEntryStatus.PAID,
      cashbackPaidAt: new Date(),
    },
  });

  if (result.count > 0) {
    await writeAudit({
      actorUserId,
      action: 'CASHBACK_PAID',
      objectType: 'WalletTransaction',
      objectId: null,
      after: { count: result.count, ids: walletTransactionIds },
    }).catch((err) => logger.error('[cashbackLifecycle] audit write failed (markPaid):', err));
  }
  return { count: result.count };
}

/**
 * @deprecated NOT wired to the production scheduler. The scheduler uses
 * expireWallet() (jobs/scheduler.ts:runCashbackExpiry) which handles the same
 * sweep via a raw SQL UPDATE…RETURNING for per-wallet atomic balance adjustments.
 * Wiring both in would cause double-processing and double-decrements.
 *
 * Retained for testing. If you intend to change production expiry behaviour,
 * edit expireWallet() in jobs/scheduler.ts instead.
 *
 * Sweep CLEARED entries past their cashbackExpiresAt and mark them EXPIRED.
 * Returns the count of expired rows.
 */
export async function expireOverdueCashback(actorUserId: string | null = null) {
  const now = new Date();

  // Find candidates first so we can adjust balances row-by-row.
  const overdue = await prisma.walletTransaction.findMany({
    where: {
      type: WalletTransactionType.CASHBACK_CREDIT,
      cashbackStatus: CashbackEntryStatus.CLEARED,
      cashbackExpiresAt: { lt: now },
    },
    select: { id: true, walletId: true, amount: true },
  });

  if (overdue.length === 0) return { count: 0 };

  let actualCount = 0;
  for (const row of overdue) {
    try {
      await prisma.$transaction(async (tx) => {
        // Precondition inside the tx: only proceed if the row is still CLEARED.
        // A concurrent scheduler run or admin action may have already expired or
        // voided this entry between the outer findMany and this tx — without the
        // precondition a double-decrement would silently corrupt the wallet balance.
        const result = await tx.walletTransaction.updateMany({
          where: { id: row.id, cashbackStatus: CashbackEntryStatus.CLEARED },
          data: { cashbackStatus: CashbackEntryStatus.EXPIRED },
        });
        if (result.count === 0) return; // already transitioned — skip wallet debit
        actualCount += result.count;
        await tx.wallet.update({
          where: { id: row.walletId },
          data: {
            balance: { decrement: row.amount },
            availableBalance: { decrement: row.amount },
          },
        });
      });
    } catch (err) {
      logger.error(`[cashbackLifecycle] failed to expire ${row.id}:`, err);
    }
  }

  await writeAudit({
    actorUserId,
    action: 'CASHBACK_EXPIRED_BATCH',
    objectType: 'WalletTransaction',
    objectId: null,
    // `staleIds` = all candidates; `count` = confirmed transitions (may be less
    // if a concurrent admin action won the CAS race for some entries).
    after: { count: actualCount, staleIds: overdue.map((r) => r.id) },
  }).catch((err) => logger.error('[cashbackLifecycle] audit write failed (expireOverdue):', err));

  return { count: actualCount };
}

/**
 * Create a "ghost" Voided cashback row for a transaction that was rejected
 * at risk review BEFORE a wallet credit was issued. The row is visible to
 * the user (balance unaffected, amount = computed cashback) so they see
 * "Cashback voided — reason X" instead of silence.
 *
 * Use this for sticker scans that fail risk review.
 */
export async function recordRejectedAsVoided(params: {
  userId: string;
  amount: number;
  reason: string;
  actorUserId: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
  stickerScanId?: string;
  receiptId?: string;
}) {
  const { userId, amount, reason, actorUserId, description, metadata, stickerScanId, receiptId } = params;

  if (amount < 0) {
    // Defensive — negative amounts make no sense for a cashback record.
    return null;
  }

  // Find or create the wallet without modifying balances.
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId } });
  }

  const now = new Date();
  const row = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: WalletTransactionType.CASHBACK_CREDIT,
      amount,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance, // balance unaffected — never credited
      status: WalletTransactionStatus.ANNULLED,
      cashbackStatus: CashbackEntryStatus.VOIDED,
      voidedAt: now,
      voidedReason: reason,
      voidedByUserId: actorUserId,
      description: description ?? `Кешбек анулиран — ${reason}`,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      ...(stickerScanId ? { stickerScanId } : {}),
      ...(receiptId ? { receiptId } : {}),
    },
  });

  await writeAudit({
    actorUserId,
    action: 'CASHBACK_VOIDED_GHOST',
    objectType: 'WalletTransaction',
    objectId: row.id,
    after: { userId, amount, reason, stickerScanId, receiptId },
  }).catch((err) => logger.error('[cashbackLifecycle] audit write failed (recordRejectedAsVoided):', err));

  return row;
}

/**
 * Spec §7.1 v1.1 — every transaction in risk review must have a visible PENDING
 * cashback record. Create a wallet entry with status=PENDING + cashbackStatus=PENDING,
 * no wallet balance change. The entry is later promoted to CLEARED (admin approve)
 * via promotePendingToCleared, or VOIDED (admin reject) via markVoided.
 *
 * Idempotent: returns the existing row if one already exists for the same scan/receipt.
 */
export async function recordPendingForRiskReview(params: {
  userId: string;
  amount: number;
  description?: string;
  metadata?: Record<string, unknown>;
  stickerScanId?: string;
  receiptId?: string;
}): Promise<WalletTransaction | null> {
  const { userId, amount, description, metadata, stickerScanId, receiptId } = params;
  if (amount <= 0) return null;
  if (!stickerScanId && !receiptId) {
    throw new Error('recordPendingForRiskReview requires stickerScanId or receiptId');
  }

  // Idempotency: if a wallet entry already exists for this scan/receipt, return it.
  const existing = await prisma.walletTransaction.findFirst({
    where: {
      type: WalletTransactionType.CASHBACK_CREDIT,
      ...(stickerScanId ? { stickerScanId } : {}),
      ...(receiptId ? { receiptId } : {}),
    },
  });
  if (existing) return existing;

  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId } });
  }

  const row = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: WalletTransactionType.CASHBACK_CREDIT,
      amount,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance, // balance unchanged — not yet credited
      status: WalletTransactionStatus.PENDING,
      cashbackStatus: CashbackEntryStatus.PENDING,
      description: description ?? 'Чакащ кешбек (риск преглед)',
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      ...(stickerScanId ? { stickerScanId } : {}),
      ...(receiptId ? { receiptId } : {}),
    },
  });

  return row;
}

/**
 * Promote a PENDING cashback entry to CLEARED, incrementing the wallet balance
 * by the entry amount. Used when an admin approves a scan/receipt that was in
 * risk review. Idempotent: re-promoting a CLEARED row is a no-op.
 *
 * The wallet balance change happens here (not at the original
 * recordPendingForRiskReview time) because the funds were never credited
 * while in PENDING.
 */
export async function promotePendingToCleared(params: {
  walletTransactionId: string;
  actorUserId: string | null;
  reason?: string;
  /**
   * Audit-pass [1.1]: if provided, atomically reconcile the entry's amount
   * (admin override) WITH the promotion + wallet credit in the same transaction.
   * Without this, a separate update + promote leaves a window where the wallet
   * balance increment uses a stale amount.
   */
  overrideAmount?: number;
}): Promise<WalletTransaction> {
  const { walletTransactionId, actorUserId, reason, overrideAmount } = params;
  const validityDays = await getValidityDays();

  const clearedAt = new Date();
  const expiresAt = new Date(clearedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);

  // Audit-fix [2]: read + promote in a single $transaction with a status
  // predicate on the UPDATE (via updateMany) to close the promote-vs-reject
  // TOCTOU window. Previously the UPDATE used `where: { id }` only; a
  // concurrent reject that committed between the findUnique and the update
  // would overwrite the VOIDED row back to CLEARED and double-credit the
  // wallet. Using updateMany with `cashbackStatus: PENDING` makes the update
  // a no-op if the row was concurrently changed, and we detect that by
  // checking count === 0, then re-reading to decide CLEARED (idempotent) or
  // throw (race with reject/void).
  const { row, didPromote, previousStatus } = await prisma.$transaction(async (tx) => {
    const existing = await tx.walletTransaction.findUnique({
      where: { id: walletTransactionId },
      select: {
        id: true, type: true, cashbackStatus: true, status: true, amount: true,
        walletId: true, clearedAt: true,
      },
    });
    if (!existing) throw new Error(`WalletTransaction ${walletTransactionId} not found`);
    if (existing.type !== WalletTransactionType.CASHBACK_CREDIT) {
      throw new Error(`WalletTransaction ${walletTransactionId} is not a CASHBACK_CREDIT`);
    }
    if (existing.cashbackStatus === CashbackEntryStatus.CLEARED) {
      return { row: existing as WalletTransaction, didPromote: false, previousStatus: existing.cashbackStatus };
    }
    if (existing.cashbackStatus !== CashbackEntryStatus.PENDING) {
      throw new Error(
        `Cannot promote — entry ${walletTransactionId} is in ${existing.cashbackStatus} state, not PENDING`,
      );
    }

    const finalAmount = overrideAmount != null ? overrideAmount : existing.amount;

    // updateMany with status predicate: if a concurrent reject already committed,
    // count will be 0 and we detect + handle it below instead of overwriting.
    const { count } = await tx.walletTransaction.updateMany({
      where: { id: walletTransactionId, cashbackStatus: CashbackEntryStatus.PENDING },
      data: {
        status: WalletTransactionStatus.COMPLETED,
        cashbackStatus: CashbackEntryStatus.CLEARED,
        clearedAt,
        cashbackExpiresAt: expiresAt,
        ...(overrideAmount != null ? { amount: finalAmount } : {}),
      },
    });

    if (count === 0) {
      // Race: concurrent operation changed cashbackStatus after our read.
      const current = await tx.walletTransaction.findUniqueOrThrow({
        where: { id: walletTransactionId },
        select: { cashbackStatus: true },
      });
      if (current.cashbackStatus === CashbackEntryStatus.CLEARED) {
        // A concurrent promote already ran — idempotent return.
        return { row: existing as WalletTransaction, didPromote: false, previousStatus: existing.cashbackStatus };
      }
      throw new Error(
        `Cannot promote — entry ${walletTransactionId} was concurrently changed to ${current.cashbackStatus}`,
      );
    }

    const updated = await tx.walletTransaction.findUniqueOrThrow({
      where: { id: walletTransactionId },
    });

    await tx.wallet.update({
      where: { id: existing.walletId },
      data: {
        balance: { increment: finalAmount },
        availableBalance: { increment: finalAmount },
      },
    });

    return { row: updated, didPromote: true, previousStatus: existing.cashbackStatus };
  });

  if (didPromote) {
    await writeAudit({
      actorUserId,
      action: 'CASHBACK_CLEARED',
      objectType: 'WalletTransaction',
      objectId: walletTransactionId,
      before: { cashbackStatus: previousStatus },
      after: {
        cashbackStatus: 'CLEARED',
        clearedAt,
        cashbackExpiresAt: expiresAt,
        reason: reason ?? null,
        ...(overrideAmount != null ? { amountOverride: overrideAmount } : {}),
      },
    }).catch((err) => logger.error('[cashbackLifecycle] audit write failed (promotePendingToCleared):', err));
  }

  return row;
}

/**
 * Spec §4.4 — expire PENDING cashback entries that have been waiting longer
 * than the configured validity window (default 60 days from createdAt).
 *
 * The spec says Pending cashback "stays Pending until subscription recovery
 * OR natural expiry by the 60-day rule". Because PENDING entries never reach
 * CLEARED they have no clearedAt / cashbackExpiresAt. We use createdAt as the
 * baseline — after validityDays from creation the entry is stale enough that
 * administrative cleanup is appropriate, matching the 60-day window applied to
 * CLEARED entries. Balance is unaffected: PENDING entries are never credited.
 *
 * NOTE: TRIAL_PENDING entries are excluded. Although they share
 * cashbackStatus=PENDING, they carry status=TRIAL_PENDING and are owned by
 * resolveTrialPendingCashback() (scheduler 5:30 AM). Including them here would
 * set cashbackStatus=EXPIRED while leaving status=TRIAL_PENDING unchanged, so
 * the 5:30 AM job would still match on status and overwrite the transition.
 *
 * NOTE: entries linked to an active risk review (StickerScan or Receipt in
 * MANUAL_REVIEW) are excluded. Spec §4.4: "Pending кешбек за транзакция,
 * попаднала в риск преглед, трябва да остане видим за потребителя до
 * финализиране на проверката." The review finalises via approveScan /
 * rejectScan which call promotePendingToCleared / markVoided; expiring the
 * entry here before that decision is made violates the spec guarantee.
 *
 * Returns the count of entries transitioned to EXPIRED.
 */
export async function expireStalePendingCashback(actorUserId: string | null = null): Promise<{ count: number }> {
  const validityDays = await getValidityDays();
  const cutoff = new Date(Date.now() - validityDays * 24 * 60 * 60 * 1000);

  const stale = await prisma.walletTransaction.findMany({
    where: {
      type: WalletTransactionType.CASHBACK_CREDIT,
      cashbackStatus: CashbackEntryStatus.PENDING,
      // Exclude TRIAL_PENDING entries — see JSDoc above.
      status: { not: WalletTransactionStatus.TRIAL_PENDING },
      createdAt: { lt: cutoff },
      // Spec §4.4 — entries linked to an active risk review must not be
      // expired until the review is finalised (approve / reject).
      NOT: [
        { stickerScan: { status: ScanStatus.MANUAL_REVIEW } },
        { receipt: { status: ReceiptStatus.MANUAL_REVIEW } },
      ],
    },
    select: { id: true },
  });

  if (stale.length === 0) return { count: 0 };

  const ids = stale.map((r) => r.id);

  // Use updateMany with the PENDING predicate so a concurrent approve/void that
  // wins the race leaves count=0 and is correctly skipped (no double-transition).
  const result = await prisma.walletTransaction.updateMany({
    where: {
      id: { in: ids },
      cashbackStatus: CashbackEntryStatus.PENDING,
    },
    data: { cashbackStatus: CashbackEntryStatus.EXPIRED },
  });

  if (result.count > 0) {
    // `staleIds` = all candidates found by findMany. `count` = entries actually
    // transitioned by updateMany (may be less if a concurrent approve/void won
    // the CAS race for some entries). Prisma updateMany has no RETURNING, so we
    // cannot cheaply recover the exact subset; labelling the field `staleIds`
    // (not `ids`) makes the distinction explicit in the audit trail.
    await writeAudit({
      actorUserId,
      action: 'CASHBACK_PENDING_EXPIRED_BATCH',
      objectType: 'WalletTransaction',
      objectId: null,
      after: { count: result.count, staleIds: ids, cutoffDays: validityDays },
    }).catch((err) => logger.error('[cashbackLifecycle] audit write failed (expireStalePending):', err));
  }

  logger.info(`[cashbackLifecycle] expireStalePendingCashback: expired ${result.count} stale PENDING entries (>${validityDays}d old)`);
  return { count: result.count };
}

export const cashbackLifecycleService = {
  markCleared,
  markVoided,
  markLocked,
  lockClearedForWallet,
  revertLocked,
  markPaid,
  expireOverdueCashback,
  expireStalePendingCashback,
  recordRejectedAsVoided,
  recordPendingForRiskReview,
  promotePendingToCleared,
};
