import { Router } from 'express';
import { WalletTransactionStatus, WalletTransactionType, SubscriptionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email.service';
import { walletService } from '../services/wallet.service';
import { notificationService } from '../services/notification.service';
import { resolvePayoutEligibility } from '../services/payoutEligibility.service';
import { logger } from '../utils/logger';
import { runWithConcurrency } from '../utils/concurrency';
import { parsePagination } from '../utils/pagination';
import { detach } from '../utils/detach';
import { reasonIndicatesIbanProblem } from '../utils/payoutFailureReason';
import { buildDualCurrencyMap, isCurrencyTransitionWindowOpen } from '../utils/currencyDisplay';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

// Spec §3.7 / §4.1 / Clash 4.1 — payout eligibility for NEW payouts:
//   Allowed: Active subscription OR Cancelled-within-paid-period (currentPeriodEnd still in the future).
//   Blocked: Latest subscription is Failed Payment, or Cancelled post-period, or Expired.
//   In-flight payouts: always continue regardless of subscription status (earned-rights model).
//
// Note: TRIALING is included as an operationally-Active equivalent so trial-period
// subscribers can also receive payouts (not in the spec source but consistent with
// the TRIALING subscription representing an active billing relationship).
//
// The admin-approval gate intentionally routes through resolvePayoutEligibility
// (the canonical single source of truth per payoutEligibility.service.ts) so that
// eligibility checks are identical across request → approve → in-flight paths.
// Earned-rights (Clash 4.1) ensures in-flight payouts continue regardless of
// later subscription status changes, so the approval of an already-enqueued
// payout sees the same FAILED_PAYMENT hard-block that requestPayout() did.

type SubGateResult =
  | { eligible: true }
  | { eligible: false; reason: 'NO_SUBSCRIPTION' | 'FAILED_PAYMENT'; status?: SubscriptionStatus };

async function checkSubscriptionGate(userId: string): Promise<SubGateResult> {
  // Single source of truth: route through resolvePayoutEligibility so all three
  // eligibility paths (request → approve → in-flight) share identical logic.
  // This prevents drift between routes on the documented FAILED_PAYMENT hard-block.
  const eligibility = await resolvePayoutEligibility(userId);

  if (!eligibility.eligible) {
    if (eligibility.hasFailedPayment) {
      return { eligible: false, reason: 'FAILED_PAYMENT', status: 'FAILED_PAYMENT' };
    }
    // No active/trialing/cancelled-in-period subscription found
    return { eligible: false, reason: 'NO_SUBSCRIPTION' };
  }

  return { eligible: true };
}

const SUB_STATUS_BG: Record<string, string> = {
  FAILED_PAYMENT:     'неуспешно плащане',
  PAST_DUE:           'неуспешно плащане',
  UNPAID:             'неплатен',
  CANCELLED:          'отказан',
  EXPIRED:            'изтекъл',
  PAUSED:             'на пауза',
  INCOMPLETE:         'незавършен',
  INCOMPLETE_EXPIRED: 'незавършен/изтекъл',
};

function subGateMessage(gate: SubGateResult): string {
  if (gate.eligible === true) return ''; // unreachable: caller gates on !gate.eligible
  // After the eligible===true short-circuit `gate` is the rejected variant.
  const rejected = gate as Extract<SubGateResult, { eligible: false }>;
  if (rejected.reason === 'NO_SUBSCRIPTION') {
    return 'Не може да се одобри: абонатът няма регистриран абонамент. Изплащане е възможно само при активен абонамент (§3.7).';
  }
  if (rejected.reason === 'FAILED_PAYMENT') {
    return 'Не може да се одобри: последната подписка е "неуспешно плащане". Payout се задържа до възстановяване на абонамента (§3.7).';
  }
  const label = rejected.status ? (SUB_STATUS_BG[rejected.status] ?? rejected.status) : 'неактивен';
  return `Не може да се одобри: абонаментът е „${label}". Payout се задържа до възстановяване на абонамента (§3.7).`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Spec §3.7 + §8.1 rule 4 — DEFECT 2 gate: omit raw BGN fields from payout
// objects when the currency transition window is CLOSED. This helper gates
// a single payout returned from a mutation endpoint, applying the same logic
// as the GET endpoint (lines 312–328). Prevents data leakage when window CLOSED.
async function gateBgnInPayoutResponse(payout: any): Promise<any> {
  const windowOpen = await isCurrencyTransitionWindowOpen();
  if (windowOpen) {
    return payout;
  }
  return {
    ...payout,
    amount: undefined,
    balanceBefore: undefined,
    balanceAfter: undefined,
    wallet: {
      ...payout.wallet,
      availableBalance: undefined,
      pendingBalance: undefined,
    },
  };
}

// Concurrency cap for /bulk-approve: limits in-flight Paysera Transfer API calls
// so a large batch does not (a) exhaust the Prisma connection pool, (b) trip
// Paysera rate limits, or (c) blow past the Fly.io edge proxy's ~60s idle-write
// timeout. With ~1s per Paysera call and a 60s response budget, 5-way
// concurrency tolerates batches up to ~300 payouts before the proxy intervenes.
const BULK_APPROVE_CONCURRENCY = 5;

// L1 — `reasonIndicatesIbanProblem` now lives in ../utils/payoutFailureReason
// so the admin /fail path and the Paysera auto-fail path (wallet.service.ts)
// classify failure reasons identically (single source of truth).

async function notifySubscriber(
  payoutId: string,
  event: 'approved' | 'completed' | 'rejected' | 'held' | 'released' | 'failed' | 'failed_other',
  note?: string,
) {
  try {
    const tx = await prisma.walletTransaction.findUnique({
      where: { id: payoutId },
      select: {
        amount: true,
        currency: true,
        wallet: { select: { userId: true, user: { select: { email: true, firstName: true, lastName: true } } } },
      },
    });
    if (!tx) return;

    const name = [tx.wallet.user.firstName, tx.wallet.user.lastName].filter(Boolean).join(' ') || 'Абонат';
    const amt = Math.abs(tx.amount).toFixed(2);
    const currency = tx.currency;

    const subjectMap: Record<typeof event, string> = {
      approved:  `Плащането ви от ${amt} ${currency} е одобрено`,
      completed: `Плащането ви от ${amt} ${currency} е изпратено`,
      rejected:  `Плащането ви от ${amt} ${currency} е отхвърлено`,
      held:        `Плащането ви от ${amt} ${currency} е задържано за проверка`,
      released:    `Плащането ви от ${amt} ${currency} е освободено`,
      failed:      `Плащането ви от ${amt} ${currency} не беше успешно`,
      failed_other: `Плащането ви от ${amt} ${currency} не беше успешно`,
    };

    const bodyMap: Record<typeof event, string> = {
      approved:  'Заявката ви за плащане беше одобрена и е в процес на обработка. Очаквайте превода в рамките на 5 работни дни.',
      completed: 'Паричният превод беше изпратен успешно. Средствата ще постъпят по сметката ви в рамките на 1–3 работни дни.',
      rejected:  `Заявката ви за плащане беше отхвърлена и балансът ви е възстановен.${note ? ` Причина: ${note}` : ''}`,
      held:      'Заявката ви за плащане е задържана за допълнителна проверка съгласно нашата политика за сигурност. Ще се свържем с вас при необходимост.',
      released:    'Заявката ви за плащане беше освободена от задържане и ще бъде обработена нормално.',
      // §3.7 first-failure "(invalid IBAN)" wording — used only when the failure
      // reason indicates a bank-account / IBAN problem.
      failed:      `Плащането не беше успешно. Моля, проверете и коригирайте своя IBAN / банкова сметка в профила си, за да може следващото изплащане да бъде обработено успешно. Балансът ви е възстановен.${note ? ` Причина: ${note}` : ''}`,
      // Neutral first-failure wording — used when the reason is not IBAN-related.
      failed_other: `Плащането не беше успешно и може да се наложи действие от ваша страна. Балансът ви е възстановен.${note ? ` Причина: ${note}` : ''}`,
    };

    await emailService.sendEmail({
      to: tx.wallet.user.email,
      subject: subjectMap[event],
      html: `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:2rem;color:#141413">
          <h2 style="margin-bottom:.5rem">${subjectMap[event]}</h2>
          <p>Здравейте, ${name},</p>
          <p>${bodyMap[event]}</p>
          <p style="color:#8c8678;font-size:.875rem;margin-top:2rem">© ${new Date().getFullYear()} BoomCard. Всички права запазени.</p>
        </div>
      `,
      text: `${subjectMap[event]}\n\n${bodyMap[event]}`,
    });

    // §11 — in-app notification + push alongside the email.
    // Non-fatal: run fire-and-forget so an in-app failure never rolls back the
    // status transition or prevents the email from being sent first.
    detach(
      notificationService.notifyPayoutEvent({
        userId: tx.wallet.userId,
        payoutId,
        // The in-app payout-event tier has no separate "failed_other" variant —
        // both IBAN and non-IBAN first failures map to the single 'failed' event.
        event: event === 'failed_other' ? 'failed' : event,
        amount: Math.abs(tx.amount),
        currency: tx.currency,
      }),
      (err) => logger.error(`[adminPayouts] notifyPayoutEvent failed for ${payoutId}:`, err),
    );
  } catch (err) {
    // Non-fatal — log and continue
    console.error('[adminPayouts] email notification failed', err);
  }
}

// ─── GET /api/admin/payouts ───────────────────────────────────────────────────
router.get(
  '/',
  requirePermission('finance.payouts.read'),
  async (req, res, next) => {
    try {
      const { search, status, dateFrom, dateTo } = req.query as Record<string, string>;

      const { skip, page: pageNum, limit: limitNum } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

      // Base filter (search + date only) — used for filter-aware summary cards
      const whereBase: Parameters<typeof prisma.walletTransaction.findMany>[0]['where'] = {
        type: 'WITHDRAWAL',
      };

      if (search) {
        whereBase.wallet = {
          user: {
            OR: [
              { email:     { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName:  { contains: search, mode: 'insensitive' } },
              { phone:     { contains: search, mode: 'insensitive' } },
            ],
          },
        };
      }

      if (dateFrom || dateTo) {
        whereBase.createdAt = {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo   ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
        };
      }

      // Full filter — adds status on top of base
      const where: typeof whereBase = { ...whereBase };
      if (status && Object.values(WalletTransactionStatus).includes(status as WalletTransactionStatus)) {
        where.status = status as WalletTransactionStatus;
      }

      // Global summary counts (always system-wide) + filter-aware groupBy in parallel
      const [
        payouts, total,
        pendingCount, pendingTotal,
        processingCount, processingTotal,
        completedCount, completedTotal,
        riskHoldCount,
        failedCount, failedTotal,
        totalCount,
        filteredGroupBy,
      ] = await Promise.all([
        prisma.walletTransaction.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, type: true, amount: true, balanceBefore: true, balanceAfter: true,
            currency: true, status: true, description: true, createdAt: true, metadata: true,
            wallet: {
              select: {
                id: true, availableBalance: true, pendingBalance: true,
                payoutIban: true, payoutBeneficiaryName: true,
                user: {
                  select: {
                    id: true, firstName: true, lastName: true, email: true, phone: true,
                    subscriptions: {
                      // Latest subscription regardless of status — the UI gates
                      // approval on whether status ∈ {ACTIVE, TRIALING} (§6.1 v1.1).
                      select: { plan: true, status: true },
                      take: 1,
                      orderBy: { createdAt: 'desc' },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.walletTransaction.count({ where }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: 'PENDING' } }),
        prisma.walletTransaction.aggregate({ where: { type: 'WITHDRAWAL', status: 'PENDING' }, _sum: { amount: true } }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: 'PROCESSING' } }),
        prisma.walletTransaction.aggregate({ where: { type: 'WITHDRAWAL', status: 'PROCESSING' }, _sum: { amount: true } }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: 'COMPLETED' } }),
        prisma.walletTransaction.aggregate({ where: { type: 'WITHDRAWAL', status: 'COMPLETED' }, _sum: { amount: true } }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: 'RISK_HOLD' } }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: 'FAILED' } }),
        prisma.walletTransaction.aggregate({ where: { type: 'WITHDRAWAL', status: 'FAILED' }, _sum: { amount: true } }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL' } }),
        // Filter-aware breakdown (respects search + date but not status)
        prisma.walletTransaction.groupBy({
          by: ['status'],
          where: whereBase,
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);

      // DEFECT 1 gate: raw BGN scalars only shown when window is open
      // NOTE: isCurrencyTransitionWindowOpen() uses a 60-second in-process cache.
      // In multi-process deployments, when the setting is updated, only the process
      // that handled the PUT request invalidates its cache. Other processes will serve
      // stale cached values for up to 60 seconds (eventual-consistency behavior).
      // For true immediate propagation across all processes, the cache would need to
      // be migrated to Redis-backed storage.
      const windowOpen = await isCurrencyTransitionWindowOpen();

      const fgb = (s: string) => filteredGroupBy.find(g => g.status === s);
      const filteredSummary = {
        pendingCount:    fgb('PENDING')?._count._all    ?? 0,
        ...(windowOpen && { pendingTotal:    Math.abs(fgb('PENDING')?._sum.amount    ?? 0) }),
        processingCount: fgb('PROCESSING')?._count._all ?? 0,
        ...(windowOpen && { processingTotal: Math.abs(fgb('PROCESSING')?._sum.amount ?? 0) }),
        completedCount:  fgb('COMPLETED')?._count._all  ?? 0,
        ...(windowOpen && { completedTotal:  Math.abs(fgb('COMPLETED')?._sum.amount  ?? 0) }),
        riskHoldCount:   fgb('RISK_HOLD')?._count._all  ?? 0,
        failedCount:     fgb('FAILED')?._count._all     ?? 0,
        ...(windowOpen && { failedTotal:     Math.abs(fgb('FAILED')?._sum.amount     ?? 0) }),
        cancelledCount:  fgb('CANCELLED')?._count._all  ?? 0,
        totalCount:      filteredGroupBy.reduce((acc, g) => acc + g._count._all, 0),
      };

      const pendingTotalBgn    = Math.abs(pendingTotal._sum.amount    ?? 0);
      const processingTotalBgn = Math.abs(processingTotal._sum.amount ?? 0);
      const completedTotalBgn  = Math.abs(completedTotal._sum.amount  ?? 0);
      const failedTotalBgn     = Math.abs(failedTotal._sum.amount     ?? 0);

      // M7 / Spec §3.7 + §8.1 rule 4 — dual-currency display for payout totals
      // (stored BGN). Added alongside the existing scalar BGN totals (backward-compat).
      const summaryDisplay = await buildDualCurrencyMap({
        pendingTotal:    pendingTotalBgn,
        processingTotal: processingTotalBgn,
        completedTotal:  completedTotalBgn,
        failedTotal:     failedTotalBgn,
      });

      // DEFECT 2 gate: payouts array items should omit raw BGN fields when window closed
      const payoutsDisplay = payouts.map(p => {
        if (windowOpen) {
          return p;
        }
        return {
          ...p,
          amount: undefined,
          balanceBefore: undefined,
          balanceAfter: undefined,
          wallet: {
            ...p.wallet,
            availableBalance: undefined,
            pendingBalance: undefined,
          },
        };
      });

      res.json({
        payouts: payoutsDisplay,
        total,
        page: pageNum,
        limit: limitNum,
        summary: {
          pendingCount,
          ...(windowOpen && { pendingTotal: pendingTotalBgn }),
          processingCount,
          ...(windowOpen && { processingTotal: processingTotalBgn }),
          completedCount,
          ...(windowOpen && { completedTotal: completedTotalBgn }),
          riskHoldCount,
          failedCount,
          ...(windowOpen && { failedTotal: failedTotalBgn }),
          totalCount,
          // M7 — dual-currency {bgn, eur} pairs (BGN null after transition window).
          display: summaryDisplay,
        },
        filteredSummary,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /bulk-approve  ALL PENDING with IBAN → PROCESSING ─────────────────
router.patch(
  '/bulk-approve',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const pending = await prisma.walletTransaction.findMany({
        where: { type: 'WITHDRAWAL', status: 'PENDING' },
        include: { wallet: { include: { user: { select: { id: true } } } } },
      });

      // Fix C — no-IBAN payouts are held+notified, not skipped.
      // Separate them so we can hold them and fire user notifications.
      const noIbanPayouts = pending.filter(p => !p.wallet.payoutIban);
      const withIban = pending.filter(p => p.wallet.payoutIban);

      // §6.1 v1.1 subscription gate — check eligibility across all subscriptions
      // so a CANCELLED-within-paid-period user is not wrongly blocked by a newer
      // ineligible row (Fix D).
      const userIds = Array.from(new Set(withIban.map(p => p.wallet.user.id)));
      const subGates = await Promise.all(userIds.map(uid => checkSubscriptionGate(uid)));
      const eligibleUserIds = new Set(userIds.filter((_, i) => subGates[i].eligible));
      const eligible = withIban.filter(p => eligibleUserIds.has(p.wallet.user.id));
      const skippedNoSub = withIban.length - eligible.length;

      let approved         = 0;  // newly transitioned PENDING → PROCESSING by this call
      let alreadyProcessed = 0;  // claimed by a concurrent caller (still counts as in-flight)
      let failed           = 0;
      let held             = 0;  // newly held due to no-IBAN (Fix C)

      // Fix C — hold no-IBAN payouts and notify users to add their bank details.
      for (const payout of noIbanPayouts) {
        try {
          const noIbanBulkMeta = payout.metadata ? JSON.parse(payout.metadata) : {};
          await prisma.walletTransaction.update({
            where: { id: payout.id },
            data: {
              status: 'RISK_HOLD',
              description: 'Задържано - липсва банкова сметка (IBAN). Моля добавете вашия IBAN преди повторно одобрение.',
              metadata: JSON.stringify({ ...noIbanBulkMeta, noIbanHold: true }),
            },
          });
          held++;
          // Spec §3.2 / §6.1 — notify user to add their bank details.
          detach(notificationService
            .notifyPayoutHeldNoIban({
              userId: payout.wallet.user.id,
              availableBalance: Math.abs(payout.amount), // absolute value of the held amount
              threshold: 0, // n/a for this context
            }), (err) => logger.error(`[bulk-approve] no-IBAN notification failed for user ${payout.wallet.user.id}:`, err));
        } catch (err) {
          logger.error(`[bulk-approve] failed to hold no-IBAN payout ${payout.id}:`, err);
          failed++;
        }
      }

      // §6.1 v1.1 — delegate the atomic PENDING → PROCESSING transition to
      // executePayoutTransfer so we share the same race-safe path the single
      // /approve endpoint uses. Notifications fire from the *actual outcome* of
      // the transfer (not optimistically before it runs) so the user never gets
      // an "approved" email for a payout that immediately failed at Paysera.
      // Bounded concurrency keeps Paysera fan-out + Prisma pool usage sane
      // (see BULK_APPROVE_CONCURRENCY rationale above).
      const results = await runWithConcurrency(
        eligible,
        BULK_APPROVE_CONCURRENCY,
        (p) => walletService.executePayoutTransfer(p.id),
      );
      for (let i = 0; i < results.length; i++) {
        const payout = eligible[i];
        const result = results[i];
        if (result.status === 'fulfilled') {
          if (result.value.alreadyProcessed) {
            alreadyProcessed++;
          } else {
            approved++;
            detach(notifySubscriber(payout.id, 'approved'), () => {});
          }
        } else {
          failed++;
          const reason = result.reason as any;
          logger.error(`[bulk-approve] transfer for payout ${payout.id} failed: ${reason?.message ?? reason}`);
          // executePayoutTransfer has already reverted balance + marked FAILED.
          detach(notifySubscriber(payout.id, 'failed', reason?.message), () => {});
        }
      }

      res.json({
        approved,
        alreadyProcessed,
        failed,
        held,
        skippedNoSub,
        // Aggregate kept for backwards compatibility with any older callers.
        skipped: held + skippedNoSub + failed,
        total: pending.length,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/approve  PENDING → PROCESSING ────────────────────────────────
router.patch(
  '/:id/approve',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const payout = await prisma.walletTransaction.findFirst({
        where: { id, type: 'WITHDRAWAL' },
        include: { wallet: true },
      });

      if (!payout) {
        res.status(404).json({ message: 'Payout not found' });
        return;
      }
      if (payout.status !== 'PENDING') {
        res.status(400).json({ message: 'Only PENDING payouts can be approved' });
        return;
      }

      // Fix C — no-IBAN payouts are held+notified, not rejected with 422.
      // This allows users to fix their IBAN and retry the payout (spec §3.2 / §6.1).
      if (!payout.wallet.payoutIban) {
        try {
          // Hold the payout for manual review with a description indicating no-IBAN.
          const noIbanSingleMeta = payout.metadata ? JSON.parse(payout.metadata) : {};
          await prisma.walletTransaction.update({
            where: { id: payout.id },
            data: {
              status: 'RISK_HOLD',
              description: 'Задържано - липсва банкова сметка (IBAN). Моля добавете вашия IBAN преди повторно одобрение.',
              metadata: JSON.stringify({ ...noIbanSingleMeta, noIbanHold: true }),
            },
          });
          // Fetch the updated payout with wallet for gating
          const held = await prisma.walletTransaction.findUnique({
            where: { id: payout.id },
            include: { wallet: true },
          });
          // Spec §3.2 / §6.1 — notify user to add their bank details.
          detach(notificationService
            .notifyPayoutHeldNoIban({
              userId: payout.wallet.userId,
              availableBalance: Math.abs(payout.amount),
              threshold: 0, // n/a for this context
            }), (err) => logger.error(`[approve] no-IBAN notification failed for user ${payout.wallet.userId}:`, err));
          const gated = await gateBgnInPayoutResponse(held);
          res.status(202).json({
            ...gated,
            message: 'Payout held — user notified to add bank details (IBAN) before retry.',
            reason: 'NO_IBAN_HELD_FOR_UPDATE',
          });
        } catch (err) {
          res.status(500).json({ message: 'Failed to hold payout', reason: 'HOLD_FAILED', error: String(err) });
        }
        return;
      }

      const gate = await checkSubscriptionGate(payout.wallet.userId);
      if (!gate.eligible) {
        const rejected = gate as Extract<SubGateResult, { eligible: false }>;
        res.status(422).json({
          message: subGateMessage(gate),
          reason: rejected.reason,
          ...(rejected.status ? { subscriptionStatus: rejected.status } : {}),
        });
        return;
      }

      // §6.1 v1.1 — atomic PENDING → PROCESSING + fire Paysera transfer in one
      // call. executePayoutTransfer handles the state transition, idempotency,
      // and rollback-on-failure. We notify the subscriber after the transition
      // succeeds (the helper has its own logging/error handling).
      let updated;
      try {
        const result = await walletService.executePayoutTransfer(id);
        if (result.alreadyProcessed) {
          // Lost a race — return current row state without re-notifying.
          updated = await prisma.walletTransaction.findUnique({
            where: { id },
            include: { wallet: true },
          });
          const gated = await gateBgnInPayoutResponse(updated);
          res.json(gated);
          return;
        }
        updated = await prisma.walletTransaction.findUnique({
          where: { id },
          include: { wallet: true },
        });
      } catch (err: any) {
        // Paysera failed and the helper has already reverted balance + marked FAILED.
        logger.error(`[approve] transfer for payout ${id} failed: ${err?.message ?? err}`);
        res.status(502).json({
          message: 'Одобрението е записано, но банковият превод не успя — балансът е възстановен и payout-ът е маркиран като „неуспешен".',
          reason: 'TRANSFER_FAILED',
          detail: err?.message ?? String(err),
        });
        return;
      }

      detach(notifySubscriber(id, 'approved'), () => {});
      const gated = await gateBgnInPayoutResponse(updated);
      res.json(gated);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/reject  PENDING|RISK_HOLD → CANCELLED (balance restored) ──────
router.patch(
  '/:id/reject',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body as { reason?: string };

      const payout = await prisma.walletTransaction.findFirst({
        where: { id, type: 'WITHDRAWAL' },
        include: { wallet: true },
      });
      if (!payout) {
        res.status(404).json({ message: 'Payout not found' });
        return;
      }
      // WITHDRAWAL rows are never TRIAL_PENDING (that status is reserved for
      // CASHBACK_CREDIT entries held during the 24h trial refund window).
      if (payout.status !== 'PENDING' && payout.status !== 'RISK_HOLD') {
        res.status(400).json({ message: 'Only PENDING or RISK_HOLD payouts can be rejected' });
        return;
      }

      const restoreAmount = -payout.amount; // amounts stored as negative debits

      // The PENDING|RISK_HOLD precondition above was read outside the write, so a
      // second admin action (/reject, /complete, /fail) could race between the
      // findFirst and the balance restore and double-credit the wallet. Guard the
      // status transition with a conditional updateMany (mirrors /reset-stuck):
      // the wallet increment only runs when this call is the one that flipped the
      // row to CANCELLED. count === 0 means another transition won the race.
      const rejected = await prisma.$transaction(async (tx) => {
        const upd = await tx.walletTransaction.updateMany({
          where: { id, status: { in: ['PENDING', 'RISK_HOLD'] } },
          data: {
            status: 'CANCELLED',
            description: reason ? `Отхвърлено от администратор: ${reason}` : 'Отхвърлено от администратор',
          },
        });
        if (upd.count === 0) {
          return false;
        }
        await tx.wallet.update({
          where: { id: payout.walletId },
          data: {
            balance:          { increment: restoreAmount },
            availableBalance: { increment: restoreAmount },
          },
        });
        return true;
      });

      if (!rejected) {
        res.status(409).json({
          message: 'Payout state changed concurrently — reload and retry.',
          reason: 'CONCURRENT_TRANSITION',
        });
        return;
      }

      // Spec §4.4 v1.1 — revert the cashback entries from LOCKED back to
      // CLEARED so they're eligible for a future payout.
      await walletService.revertCashbackLockForWithdrawal(
        id,
        (req as AuthRequest).user?.id ?? null,
        reason ?? 'admin rejection',
      );

      detach(notifySubscriber(id, 'rejected', reason), () => {});
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/complete  PROCESSING → COMPLETED ────────────────────────────
router.patch(
  '/:id/complete',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const payout = await prisma.walletTransaction.findFirst({ where: { id, type: 'WITHDRAWAL' } });

      if (!payout) {
        res.status(404).json({ message: 'Payout not found' });
        return;
      }
      if (payout.status !== 'PROCESSING') {
        res.status(400).json({ message: 'Only PROCESSING payouts can be marked complete' });
        return;
      }

      const existingMeta = payout.metadata ? JSON.parse(payout.metadata) : {};
      await prisma.walletTransaction.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          metadata: JSON.stringify({ ...existingMeta, completedAt: new Date().toISOString() }),
        },
      });

      // Spec §4.4 v1.1 — terminal lifecycle transition for the locked cashback
      // entries that funded this payout: LOCKED → PAID.
      await walletService.markCashbackPaidForWithdrawal(
        id,
        (req as AuthRequest).user?.id ?? null,
      );

      // Fetch the updated payout with wallet for gating
      const updated = await prisma.walletTransaction.findUnique({
        where: { id },
        include: { wallet: true },
      });

      detach(notifySubscriber(id, 'completed'), () => {});
      const gated = await gateBgnInPayoutResponse(updated);
      res.json(gated);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/hold  PENDING → RISK_HOLD ────────────────────────────────────
router.patch(
  '/:id/hold',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body as { reason?: string };

      const payout = await prisma.walletTransaction.findFirst({ where: { id, type: 'WITHDRAWAL' } });
      if (!payout) {
        res.status(404).json({ message: 'Payout not found' });
        return;
      }
      if (payout.status !== 'PENDING') {
        res.status(400).json({ message: 'Only PENDING payouts can be placed on hold' });
        return;
      }

      // Fix A & B — stamp metadata.manualHold=true to discriminate this hold from
      // escalated RISK_HOLD rows (which have metadata.escalatedSecondFailure=true).
      // This allows /release to refuse escalated rows (409) and prevents manual holds
      // from inflating the strike count.
      const existingMeta = payout.metadata ? JSON.parse(payout.metadata) : {};
      await prisma.walletTransaction.update({
        where: { id },
        data: {
          status: 'RISK_HOLD',
          description: reason
            ? `Задържано за проверка: ${reason}`
            : 'Задържано за проверка при съмнение',
          metadata: JSON.stringify({ ...existingMeta, manualHold: true }),
        },
      });

      // Fetch the updated payout with wallet for gating
      const updated = await prisma.walletTransaction.findUnique({
        where: { id },
        include: { wallet: true },
      });

      detach(notifySubscriber(id, 'held', reason), () => {});
      const gated = await gateBgnInPayoutResponse(updated);
      res.json(gated);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/release  RISK_HOLD → PENDING ─────────────────────────────────
router.patch(
  '/:id/release',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const payout = await prisma.walletTransaction.findFirst({ where: { id, type: 'WITHDRAWAL' } });
      if (!payout) {
        res.status(404).json({ message: 'Payout not found' });
        return;
      }
      if (payout.status !== 'RISK_HOLD') {
        res.status(400).json({ message: 'Only RISK_HOLD payouts can be released' });
        return;
      }

      // Fix A — refuse to release escalated RISK_HOLD rows (second-failure escalations).
      // Escalated rows have metadata.escalatedSecondFailure=true and MUST be resolved
      // via /reject (restore balance + revert cashback) or /complete (mark PAID).
      // Releasing them back to PENDING would cause a double-spend: /approve would
      // fire a fresh Paysera transfer for cashback already debited twice before.
      const meta = payout.metadata ? JSON.parse(payout.metadata) : {};
      if (meta.escalatedSecondFailure === true) {
        res.status(409).json({
          message: 'Cannot release: this payout was escalated after repeated failures. Resolve via /reject (revert) or /complete (mark paid) only.',
          reason: 'ESCALATED_RISK_HOLD',
          escalatedAt: meta.escalatedAt ?? 'unknown',
        });
        return;
      }

      // Preserve the hold reason for audit trail; prefix it so admins know the hold was lifted
      const releasedDesc = payout.description
        ? `[Освободено] ${payout.description}`
        : null;

      await prisma.walletTransaction.update({
        where: { id },
        data: { status: 'PENDING', description: releasedDesc },
      });

      // Fetch the updated payout with wallet for gating
      const updated = await prisma.walletTransaction.findUnique({
        where: { id },
        include: { wallet: true },
      });

      detach(notifySubscriber(id, 'released'), () => {});
      const gated = await gateBgnInPayoutResponse(updated);
      res.json(gated);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/fail  PROCESSING → FAILED (bank-side failure, balance restored) ──
router.patch(
  '/:id/fail',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body as { reason?: string };

      const payout = await prisma.walletTransaction.findFirst({
        where: { id, type: 'WITHDRAWAL' },
        include: { wallet: true },
      });
      if (!payout) {
        res.status(404).json({ message: 'Payout not found' });
        return;
      }
      if (payout.status !== 'PROCESSING') {
        res.status(400).json({ message: 'Only PROCESSING payouts can be marked as failed' });
        return;
      }

      // Spec §3.7 — payout failure escalation:
      //   First failure → restore wallet balance, revert cashback LOCKED→CLEARED
      //                   so user can retry, then notify user to correct IBAN.
      //   Second failure → route to RISK_HOLD for manual review + mark HIGH risk.
      //                    Do NOT restore wallet balance here: /reject already does
      //                    the restore when admin resolves the RISK_HOLD, so restoring
      //                    here would credit the user twice.
      //                    Do NOT revert cashback: leave it LOCKED while the payout
      //                    is in manual review (reverting here would show cashback as
      //                    Available while RISK_HOLD is still open — a contradiction).
      //                    User is NOT notified of manual review status (spec §3.7).
      //
      // Two-strike model: the spec counts PAYOUT RECORDS, not /fail calls on the same
      // record. The status guard above ensures /fail can only be called once per payout
      // (while it is PROCESSING). So "first failure" = this wallet has 0 previous FAILED
      // withdrawals; "second failure" = this wallet already has ≥1 FAILED withdrawal.
      // The current payout is still PROCESSING at this point, so it is not yet in the
      // FAILED count — no exclusion filter is needed.
      // Fix B (TOCTOU): move previousFailedCount inside the transaction so the
      // count and the subsequent writes share Serializable semantics on PostgreSQL.
      // Two concurrent /fail calls can no longer both read count=0 and both take
      // the first-failure path.
      //
      // Fix B (scope): count only genuine payout failures, excluding manual holds.
      // Manual holds have metadata.manualHold=true; escalated second-failures have
      // metadata.escalatedSecondFailure=true. Only rows WITHOUT manualHold=true count.
      //
      // Side-effectful calls (revertCashbackLockForWithdrawal, notifySubscriber) are
      // DB-independent and remain outside the transaction callback after the branch
      // decision is captured.
      // Fix B — return branch decision from the callback instead of mutating outer scope,
      // so any future retry wrapper starts with fresh state rather than stale captured state.
      let txResult: { isSecondFailure: boolean };
      try {
        txResult = await prisma.$transaction(async (tx) => {
          // Fix B — count inside the transaction AND exclude manual holds.
          // Only count genuine payout failures, not administrative holds.
          // M4 — count BOTH FAILED and RISK_HOLD prior withdrawals so the strike
          // count stays consistent with the Paysera auto-fail path (a prior
          // second-strike produces a RISK_HOLD row, not a FAILED one).
          const allFailedRows = await tx.walletTransaction.findMany({
            where: {
              walletId: payout.walletId,
              type: 'WITHDRAWAL',
              status: { in: ['FAILED', 'RISK_HOLD'] as WalletTransactionStatus[] },
            },
            select: { metadata: true, description: true },
          });
          // Filter out manual holds (metadata.manualHold=true), no-IBAN administrative holds
          // (metadata.noIbanHold=true), and legacy no-IBAN holds written before this flag was
          // introduced (identifiable by their canonical no-IBAN hold description).
          const genuineFailures = allFailedRows.filter((row) => {
            const meta = row.metadata ? JSON.parse(row.metadata) : {};
            if (meta.manualHold === true || meta.noIbanHold === true) return false;
            if (row.description?.includes('липсва банкова сметка')) return false;
            return true;
          });
          const previousFailedCount = genuineFailures.length;

          if (previousFailedCount >= 1) {
            // Second (or subsequent) failure: escalate to manual review + mark HIGH risk.
            // Wallet balance is NOT restored here — /reject will restore it when the admin
            // resolves the RISK_HOLD, preventing a double-credit.
            // Cashback stays LOCKED — it will be released or consumed when an admin
            // resolves the RISK_HOLD via /reject (revert) or /complete (mark PAID).

            const existingMeta = payout.metadata ? JSON.parse(payout.metadata) : {};
            await tx.walletTransaction.update({
              where: { id },
              data: {
                status: 'RISK_HOLD',
                description: reason
                  ? `Ескалирано за ръчен преглед след повторен неуспех: ${reason}`
                  : 'Ескалирано за ръчен преглед след повторен неуспех на банков превод',
                // Fix A — stamp metadata.escalatedSecondFailure=true so /release can
                // distinguish this from a manual hold and refuse to re-arm it.
                metadata: JSON.stringify({
                  ...existingMeta,
                  escalatedSecondFailure: true,
                  escalatedAt: new Date().toISOString(),
                }),
              },
            });
            // Mark the user as HIGH risk per spec §3.7 / §2.1. Shared two-strike
            // helper floors riskScore at 51 (canonical boundary) and uses updateMany
            // so a user soft-deleted between the outer findFirst and this transaction
            // body is a no-op rather than a P2025 that would roll back the whole
            // transaction and leave the payout stuck. Runs on the transaction client
            // so it shares this Serializable transaction.
            await walletService.escalateRiskAfterRepeatedPayoutFailure(payout.wallet.userId, tx);

            return { isSecondFailure: true };
          } else {
            // First failure: record FAILED status and restore wallet balance.
            const restoreAmount = -payout.amount;
            await tx.walletTransaction.update({
              where: { id },
              data: {
                status: 'FAILED',
                description: reason
                  ? `Неуспешен банков превод: ${reason}`
                  : 'Неуспешен банков превод',
              },
            });
            const restored = await tx.wallet.update({
              where: { id: payout.walletId },
              data: {
                balance:          { increment: restoreAmount },
                availableBalance: { increment: restoreAmount },
              },
            });
            // Paired ADJUSTMENT reversal credit — matches the Paysera auto-fail
            // first-failure path (wallet.service.ts ~L1189). Without this row the
            // user-facing masking helper (maskUserFacingPayoutStatus) treats the
            // FAILED withdrawal as an un-reversed race and masks it as PROCESSING.
            await tx.walletTransaction.create({
              data: {
                walletId: payout.walletId,
                type: WalletTransactionType.ADJUSTMENT,
                amount: restoreAmount,
                balanceBefore: restored.balance - restoreAmount,
                balanceAfter: restored.balance,
                status: WalletTransactionStatus.COMPLETED,
                description: 'Сторниране на изплащане — балансът е възстановен',
                metadata: JSON.stringify({ reversedWithdrawalId: id, reason: reason ?? 'bank transfer failure' }),
              },
            });

            return { isSecondFailure: false };
          }
        }, { isolationLevel: 'Serializable' });
      } catch (txErr: any) {
        // Fix A (P2034) — Serializable isolation can produce a serialization failure
        // when two concurrent /fail calls race. Return 409 so the caller can retry
        // rather than leaving the payout stuck in PROCESSING with an unhandled 500.
        if (txErr?.code === 'P2034') {
          res.status(409).json({
            message: 'Concurrent modification — please retry.',
            reason: 'CONCURRENT_TRANSITION',
          });
          return;
        }
        throw txErr;
      }

      const { isSecondFailure } = txResult;

      if (isSecondFailure) {
        logger.warn(
          `[adminPayouts] Second payout failure for wallet ${payout.walletId} — ` +
          `escalated to RISK_HOLD and user marked HIGH risk (spec §3.7). ` +
          `Wallet balance NOT restored (will be restored by /reject when admin resolves RISK_HOLD).`,
        );
        // M4 / MEDIUM-1 — notification parity with the Paysera auto-fail path
        // (wallet.service.ts executePayoutTransfer second-failure branch): fire the
        // same admin-ops alert so a RISK_HOLD escalated via the admin /fail route is
        // visible to ops and not missed indefinitely. Same payload shape + severity.
        const escalatedUserId = payout.wallet.userId;
        detach(notificationService
          .notifyAdminOps({
            opsType: 'payout_failure_high_risk',
            title: 'User flagged high-risk after repeated payout failures',
            message: `User ${escalatedUserId} had a repeated payout failure. Payout escalated to RISK_HOLD and flagged for manual admin review per spec §3.7.`,
            severity: 'warning',
            fields: [
              { label: 'User ID', value: escalatedUserId },
              { label: 'Last error', value: (reason ?? 'bank transfer failure').slice(0, 200) },
            ],
          }), (err) => logger.error(`[adminPayouts] admin notification failed for user ${escalatedUserId}:`, err));
      } else {
        // Spec §4.4 v1.1 — mirrors the /reject handler for the first-failure path.
        // These side effects run outside the transaction (DB-independent).
        await walletService.revertCashbackLockForWithdrawal(
          id,
          (req as AuthRequest).user?.id ?? null,
          reason ?? 'bank transfer failure',
        );
        // L1 — use IBAN-correction wording only when the reason points at an IBAN /
        // bank-account problem; otherwise neutral "action may be required" wording.
        const failEvent = reasonIndicatesIbanProblem(reason) ? 'failed' : 'failed_other';
        detach(notifySubscriber(id, failEvent, reason), () => {});
      }

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/reset-stuck  PROCESSING → PENDING (crash-recovery only) ──────
// Recovers payouts where executePayoutTransfer won the PENDING→PROCESSING race
// but crashed before Paysera createTransfer was called. The row is stuck
// PROCESSING with no payseraTransferId and no bank transfer was ever
// initiated, so it is safe to demote back to PENDING for a fresh /approve.
//
// Strict guardrails — refuses to reset if any of these are not met:
//   • status is exactly PROCESSING
//   • metadata.payseraTransferId is absent (no transfer ever created)
//   • metadata.manualHold is not set (i.e. the row is not parked by the
//     no-Paysera-configured path that requires admin /complete)
//   • processingStartedAt is older than 2 minutes (avoid racing an
//     executePayoutTransfer call that is still in flight in another process)
const STUCK_PROCESSING_GRACE_MS = 2 * 60 * 1000;

router.patch(
  '/:id/reset-stuck',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const payout = await prisma.walletTransaction.findFirst({
        where: { id, type: 'WITHDRAWAL' },
      });
      if (!payout) {
        res.status(404).json({ message: 'Payout not found' });
        return;
      }
      if (payout.status !== 'PROCESSING') {
        res.status(400).json({
          message: 'Only PROCESSING payouts can be reset to PENDING',
          reason: 'NOT_PROCESSING',
        });
        return;
      }

      const meta = payout.metadata ? JSON.parse(payout.metadata) : {};
      if (meta.payseraTransferId) {
        // A transfer was created at Paysera — resetting to PENDING is unsafe
        // because the bank side is already committed. Use /fail to reverse.
        res.status(409).json({
          message: 'Cannot reset: a Paysera transfer was already created. Use /fail to reverse.',
          reason: 'TRANSFER_ALREADY_CREATED',
          payseraTransferId: meta.payseraTransferId,
        });
        return;
      }

      if (meta.manualHold === true) {
        // Row is parked in PROCESSING by the no-Paysera-configured branch and
        // is awaiting an admin /complete or /fail — not a crash recovery case.
        res.status(409).json({
          message: 'Cannot reset: this payout is held for manual completion (Paysera transfer not configured). Use /complete or /fail.',
          reason: 'MANUAL_HOLD',
        });
        return;
      }

      if (meta.processingStartedAt) {
        const startedAt = new Date(meta.processingStartedAt).getTime();
        if (Number.isFinite(startedAt) && Date.now() - startedAt < STUCK_PROCESSING_GRACE_MS) {
          res.status(409).json({
            message: `Payout entered PROCESSING less than ${STUCK_PROCESSING_GRACE_MS / 60000} minute(s) ago — may still be in flight. Retry after grace period.`,
            reason: 'WITHIN_GRACE_PERIOD',
          });
          return;
        }
      }

      // Atomic PROCESSING → PENDING. Strip processingStartedAt so the SLA
      // tag in the dashboard does not double-count the wait.
      const { processingStartedAt: _drop, ...metaWithoutStart } = meta as Record<string, unknown>;
      const upd = await prisma.walletTransaction.updateMany({
        where: { id, status: WalletTransactionStatus.PROCESSING },
        data: {
          status: WalletTransactionStatus.PENDING,
          description: 'Възстановено за повторно одобрение (нямаше иницииран превод)',
          metadata: JSON.stringify({ ...metaWithoutStart, resetStuckAt: new Date().toISOString() }),
        },
      });

      if (upd.count === 0) {
        res.status(409).json({
          message: 'Payout state changed concurrently — reload and retry.',
          reason: 'CONCURRENT_TRANSITION',
        });
        return;
      }

      // Fetch the updated payout with wallet for gating
      const updated = await prisma.walletTransaction.findUnique({
        where: { id },
        include: { wallet: true },
      });
      logger.warn(`[reset-stuck] Payout ${id} reset PROCESSING → PENDING (no payseraTransferId; admin recovery).`);
      const gated = await gateBgnInPayoutResponse(updated);
      res.json(gated);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
