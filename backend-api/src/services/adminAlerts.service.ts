import { prisma } from '../lib/prisma';

// Spec 3.2: Критични / Оперативни / Информационни
export type AlertTier = 'CRITICAL' | 'OPERATIONAL' | 'INFORMATIONAL';

export interface AlertItem {
  id: string;           // stable identifier for front-end routing
  type: string;         // machine-readable type
  tier: AlertTier;
  title: string;        // human-readable title
  count: number;
  link: string;         // front-end route the item links to
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

  // Payout threshold: wallets at ≥50 BGN are actionable for cashback withdrawal
  const PAYOUT_THRESHOLD = 50;
  // Large pending tx threshold: wallet transactions ≥500 BGN stuck in PENDING
  const LARGE_TX_THRESHOLD = 500;

  const [
    partnerRequests,
    receiptReviews,
    cashbackOverdue,
    menuApprovals,
    openPeriods,
    deletedUsers,
    // G2 CRITICAL — неуспешни плащания (failed Stripe charges)
    failedSubscriptions,
    // G2 CRITICAL — рискови транзакции (HIGH_61_PLUS bucket)
    riskReceipts,
    // G2 CRITICAL — системни грешки (failed transactions last 24h)
    failedTransactions,
    // G2 OPERATIONAL — абонати достигнали праг за изплащане
    walletsAtThreshold,
    // G2 OPERATIONAL — pending transactions above limit
    largePendingTx,
    // G2 INFORMATIONAL — нови регистрации
    newRegistrations,
    // G2 INFORMATIONAL — активирани партньори
    activatedPartners,
    // G2 INFORMATIONAL — завършен онбординг
    completedOnboarding,
  ] = await Promise.all([
    prisma.partner.count({ where: { status: 'PENDING' } }),
    prisma.receipt.count({ where: { status: 'MANUAL_REVIEW' } }),
    prisma.partnerCashbackPayment.count({ where: { status: 'OVERDUE' } }),
    prisma.venue.count({ where: { pendingMenuUrl: { not: null } } }),
    prisma.reportingPeriod.count({ where: { status: 'FOR_REVIEW' } }),
    prisma.user.count({ where: { status: 'DELETED' } }),
    prisma.subscription.count({ where: { status: { in: ['PAST_DUE', 'UNPAID'] } } }),
    prisma.receipt.count({
      where: {
        fraudScore: { gte: 61 },
        status: { notIn: ['APPROVED', 'REJECTED', 'EXPIRED'] },
      },
    }),
    prisma.transaction.count({
      where: { status: 'FAILED', createdAt: { gte: oneDayAgo } },
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
      where: { status: 'ACTIVE', updatedAt: { gte: oneDayAgo } },
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
  if (cashbackOverdue > 0) {
    critical.push({
      id: 'cashback_overdue',
      type: 'CASHBACK_OVERDUE',
      tier: 'CRITICAL',
      title: 'Просрочени кешбек плащания',
      count: cashbackOverdue,
      link: '/admin/finance/invoices?status=OVERDUE',
    });
  }
  if (failedSubscriptions > 0) {
    critical.push({
      id: 'failed_payments',
      type: 'FAILED_PAYMENTS',
      tier: 'CRITICAL',
      title: 'Неуспешни плащания',
      count: failedSubscriptions,
      link: '/admin/subscriptions?status=PAST_DUE',
    });
  }
  if (riskReceipts > 0) {
    critical.push({
      id: 'risk_transactions',
      type: 'RISK_TRANSACTIONS',
      tier: 'CRITICAL',
      title: 'Рискови транзакции (висок риск)',
      count: riskReceipts,
      link: '/admin/control/risk-queue?tier=HIGH_61_PLUS',
    });
  }
  if (failedTransactions > 0) {
    critical.push({
      id: 'system_errors',
      type: 'SYSTEM_ERRORS',
      tier: 'CRITICAL',
      title: 'Системни грешки (последните 24ч)',
      count: failedTransactions,
      link: '/admin/transactions?status=FAILED',
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
  if (menuApprovals > 0) {
    operational.push({
      id: 'menu_approvals',
      type: 'MENU_APPROVALS',
      tier: 'OPERATIONAL',
      title: 'Менюта за одобрение',
      count: menuApprovals,
      link: '/admin/partners/locations',
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
    operational.push({
      id: 'payout_threshold',
      type: 'PAYOUT_THRESHOLD',
      tier: 'OPERATIONAL',
      title: `Абонати достигнали праг за изплащане (≥${PAYOUT_THRESHOLD} лв)`,
      count: walletsAtThreshold,
      link: '/admin/subscribers?filter=payout_ready',
    });
  }
  if (largePendingTx > 0) {
    operational.push({
      id: 'large_pending_transactions',
      type: 'LARGE_PENDING_TRANSACTIONS',
      tier: 'OPERATIONAL',
      title: `Чакащи транзакции над лимита (≥${LARGE_TX_THRESHOLD} лв)`,
      count: largePendingTx,
      link: '/admin/transactions?status=PENDING',
    });
  }

  // ── Informational ────────────────────────────────────────────────────────────
  if (deletedUsers > 0) {
    informational.push({
      id: 'deleted_users',
      type: 'DELETED_USERS',
      tier: 'INFORMATIONAL',
      title: 'Изтрити потребители',
      count: deletedUsers,
      link: '/admin/subscribers?status=DELETED',
    });
  }
  if (newRegistrations > 0) {
    informational.push({
      id: 'new_registrations',
      type: 'NEW_REGISTRATIONS',
      tier: 'INFORMATIONAL',
      title: 'Нови регистрации (последните 24ч)',
      count: newRegistrations,
      link: '/admin/subscribers?filter=new',
    });
  }
  if (activatedPartners > 0) {
    informational.push({
      id: 'activated_partners',
      type: 'ACTIVATED_PARTNERS',
      tier: 'INFORMATIONAL',
      title: 'Активирани партньори (последните 24ч)',
      count: activatedPartners,
      link: '/admin/partners?status=ACTIVE&filter=recent',
    });
  }
  if (completedOnboarding > 0) {
    informational.push({
      id: 'completed_onboarding',
      type: 'COMPLETED_ONBOARDING',
      tier: 'INFORMATIONAL',
      title: 'Завършен онбординг (последните 7 дни)',
      count: completedOnboarding,
      link: '/admin/partners?requestStatus=ODOBRENA&filter=recent',
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
