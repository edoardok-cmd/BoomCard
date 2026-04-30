import { prisma } from '../lib/prisma';

// Spec 3.2: Критични / Оперативни / Информационни
export type AlertTier = 'CRITICAL' | 'OPERATIONAL' | 'INFORMATIONAL';

export interface AlertItem {
  id: string;
  type: string;
  tier: AlertTier;
  title: string;
  count: number;
  link: string;
}

export interface AdminAlertsResult {
  critical: AlertItem[];
  operational: AlertItem[];
  informational: AlertItem[];
  totalCount: number;
  generatedAt: string;
}

export async function getAlerts(): Promise<AdminAlertsResult> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Read thresholds from settings, fall back to safe defaults.
  // Guard against malformed values: parseFloat can yield NaN, which would
  // silently break the Prisma `gte` comparisons below.
  const [payoutThresholdSetting, largeTxThresholdSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'payout_threshold' } }),
    prisma.systemSetting.findUnique({ where: { key: 'large_tx_threshold' } }),
  ]);
  const parseSetting = (raw: string | undefined, fallback: number): number => {
    if (!raw) return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const PAYOUT_THRESHOLD = parseSetting(payoutThresholdSetting?.value, 50);
  const LARGE_TX_THRESHOLD = parseSetting(largeTxThresholdSetting?.value, 500);

  const [
    partnerRequests,
    receiptReviews,
    partnerInvoicesOverdue,
    openPeriods,
    // Gap #4: open disputes
    openDisputes,
    pastDueSubscriptions,
    unpaidSubscriptions,
    // Spec risk tiers: 61+ = CRITICAL, 31-60 = OPERATIONAL (Gap #3)
    highRiskReceipts,
    mediumRiskReceipts,
    failedTransactions,
    // Gap #6: suspicious IBAN changes last 24h
    recentIbanChanges,
    walletsAtThreshold,
    largePendingTx,
    newRegistrations,
    // Fix #10: use verifiedAt (set on activation) instead of updatedAt
    activatedPartners,
    completedOnboarding,
  ] = await Promise.all([
    prisma.partner.count({ where: { status: 'PENDING' } }),
    prisma.receipt.count({ where: { status: 'MANUAL_REVIEW' } }),
    prisma.partnerCashbackPayment.count({ where: { status: 'OVERDUE' } }),
    prisma.reportingPeriod.count({ where: { status: 'FOR_REVIEW' } }),
    prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.subscription.count({ where: { status: 'PAST_DUE' } }),
    prisma.subscription.count({ where: { status: 'UNPAID' } }),
    // Exclude MANUAL_REVIEW so these don't double-count with `receipt_review`.
    prisma.receipt.count({
      where: {
        fraudScore: { gte: 61 },
        status: { notIn: ['APPROVED', 'REJECTED', 'EXPIRED', 'MANUAL_REVIEW'] },
      },
    }),
    prisma.receipt.count({
      where: {
        fraudScore: { gte: 31, lt: 61 },
        status: { notIn: ['APPROVED', 'REJECTED', 'EXPIRED', 'MANUAL_REVIEW'] },
      },
    }),
    prisma.transaction.count({
      where: { status: 'FAILED', createdAt: { gte: oneDayAgo } },
    }),
    prisma.user.count({
      where: { ibanLastChangedAt: { gte: oneDayAgo } },
    }),
    prisma.wallet.count({
      where: { balance: { gte: PAYOUT_THRESHOLD }, isLocked: false },
    }),
    prisma.walletTransaction.count({
      where: { status: 'PENDING', amount: { gte: LARGE_TX_THRESHOLD } },
    }),
    prisma.user.count({
      where: { createdAt: { gte: oneDayAgo }, status: { not: 'DELETED' } },
    }),
    prisma.partner.count({
      where: { status: 'ACTIVE', verifiedAt: { gte: oneDayAgo } },
    }),
    prisma.partner.count({
      where: { requestStatus: 'ODOBRENA', updatedAt: { gte: sevenDaysAgo } },
    }),
  ]);

  const critical: AlertItem[] = [];
  const operational: AlertItem[] = [];
  const informational: AlertItem[] = [];

  // ── Critical ────────────────────────────────────────────────────────────────
  if (receiptReviews > 0) {
    critical.push({
      id: 'receipt_review',
      type: 'RECEIPT_REVIEW',
      tier: 'CRITICAL',
      title: 'Касови бележки за проверка',
      count: receiptReviews,
      link: '/admin/control/risk',
    });
  }
  if (partnerInvoicesOverdue > 0) {
    // PartnerCashbackPayment.status = OVERDUE → BoomCard owes the partner
    // cashback that's now >30 days late. Surfaced as critical per spec §6.2.
    critical.push({
      id: 'partner_payouts_overdue',
      type: 'PARTNER_PAYOUTS_OVERDUE',
      tier: 'CRITICAL',
      title: 'Просрочени плащания към партньори',
      count: partnerInvoicesOverdue,
      link: '/admin/finance/invoices?status=OVERDUE',
    });
  }
  // Split PAST_DUE / UNPAID so each alert's link filter matches its count.
  if (pastDueSubscriptions > 0) {
    critical.push({
      id: 'failed_payments',
      type: 'FAILED_PAYMENTS',
      tier: 'CRITICAL',
      title: 'Неуспешни плащания',
      count: pastDueSubscriptions,
      link: '/admin/subscribers/subscriptions?status=PAST_DUE',
    });
  }
  if (unpaidSubscriptions > 0) {
    critical.push({
      id: 'unpaid_subscriptions',
      type: 'UNPAID_SUBSCRIPTIONS',
      tier: 'CRITICAL',
      title: 'Неплатени абонаменти',
      count: unpaidSubscriptions,
      link: '/admin/subscribers/subscriptions?status=UNPAID',
    });
  }
  if (highRiskReceipts > 0) {
    critical.push({
      id: 'risk_transactions',
      type: 'RISK_TRANSACTIONS',
      tier: 'CRITICAL',
      title: 'Рискови транзакции (висок риск 61+)',
      count: highRiskReceipts,
      link: '/admin/control/risk?bucket=HIGH_61_PLUS',
    });
  }
  if (failedTransactions > 0) {
    // Counts Transaction.status=FAILED in the last 24h — failed payment
    // transactions (Paysera/wallet/etc.). Surfaced under business-view
    // transactions, where the alerted rows are actually rendered.
    critical.push({
      id: 'failed_transactions',
      type: 'FAILED_TRANSACTIONS',
      tier: 'CRITICAL',
      title: 'Неуспешни транзакции (последните 24ч)',
      count: failedTransactions,
      link: '/admin/subscribers/transactions?view=business&status=FAILED',
    });
  }
  if (recentIbanChanges > 0) {
    // Gap #6: suspicious activity — IBAN changes tracked via User.ibanLastChangedAt
    critical.push({
      id: 'suspicious_iban_changes',
      type: 'SUSPICIOUS_IBAN_CHANGES',
      tier: 'CRITICAL',
      title: 'Промени на IBAN (последните 24ч)',
      count: recentIbanChanges,
      link: '/admin/control/security',
    });
  }

  // ── Operational ─────────────────────────────────────────────────────────────
  if (partnerRequests > 0) {
    operational.push({
      id: 'partner_requests',
      type: 'PARTNER_REQUESTS',
      tier: 'OPERATIONAL',
      title: 'Нови партньорски заявки',
      count: partnerRequests,
      link: '/admin/partners/requests',
    });
  }
  if (mediumRiskReceipts > 0) {
    // Gap #3: spec tier 31-60 = requires review → OPERATIONAL
    operational.push({
      id: 'medium_risk_transactions',
      type: 'MEDIUM_RISK_TRANSACTIONS',
      tier: 'OPERATIONAL',
      title: 'Транзакции за преглед (среден риск 31–60)',
      count: mediumRiskReceipts,
      link: '/admin/control/risk?bucket=REVIEW_31_60',
    });
  }
  if (openDisputes > 0) {
    // Gap #4: open/in-review disputes
    operational.push({
      id: 'open_disputes',
      type: 'OPEN_DISPUTES',
      tier: 'OPERATIONAL',
      title: 'Отворени спорове',
      count: openDisputes,
      link: '/admin/control/disputes',
    });
  }
  if (openPeriods > 0) {
    operational.push({
      id: 'periods_for_review',
      type: 'PERIODS_FOR_REVIEW',
      tier: 'OPERATIONAL',
      title: 'Периоди за проверка',
      count: openPeriods,
      link: '/admin/finance/periods',
    });
  }
  if (walletsAtThreshold > 0) {
    // Fix #5: threshold now comes from SystemSetting; link to Finance > Payments per spec
    operational.push({
      id: 'payout_threshold',
      type: 'PAYOUT_THRESHOLD',
      tier: 'OPERATIONAL',
      title: `Абонати достигнали праг за изплащане (≥${PAYOUT_THRESHOLD} лв)`,
      count: walletsAtThreshold,
      link: '/admin/finance/payouts',
    });
  }
  if (largePendingTx > 0) {
    // Fix #5: threshold now comes from SystemSetting
    operational.push({
      id: 'large_pending_transactions',
      type: 'LARGE_PENDING_TRANSACTIONS',
      tier: 'OPERATIONAL',
      title: `Чакащи транзакции над лимита (≥${LARGE_TX_THRESHOLD} лв)`,
      count: largePendingTx,
      link: '/admin/subscribers/transactions?view=wallet&status=PENDING',
    });
  }

  // ── Informational ────────────────────────────────────────────────────────────
  // Fix #2: deleted_users removed — cumulative count is not a daily signal per spec
  if (newRegistrations > 0) {
    informational.push({
      id: 'new_registrations',
      type: 'NEW_REGISTRATIONS',
      tier: 'INFORMATIONAL',
      title: 'Нови регистрации (последните 24ч)',
      count: newRegistrations,
      link: '/admin/subscribers/all',
    });
  }
  if (activatedPartners > 0) {
    informational.push({
      id: 'activated_partners',
      type: 'ACTIVATED_PARTNERS',
      tier: 'INFORMATIONAL',
      title: 'Активирани партньори (последните 24ч)',
      count: activatedPartners,
      link: '/admin/partners/active',
    });
  }
  if (completedOnboarding > 0) {
    informational.push({
      id: 'completed_onboarding',
      type: 'COMPLETED_ONBOARDING',
      tier: 'INFORMATIONAL',
      title: 'Завършен онбординг (последните 7 дни)',
      count: completedOnboarding,
      link: '/admin/partners/active',
    });
  }

  const totalCount =
    [...critical, ...operational, ...informational].reduce((sum, a) => sum + a.count, 0);

  return {
    critical,
    operational,
    informational,
    totalCount,
    generatedAt: new Date().toISOString(),
  };
}
