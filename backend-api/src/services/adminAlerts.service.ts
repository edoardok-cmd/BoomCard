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
  const [
    partnerRequests,
    receiptReviews,
    cashbackOverdue,
    menuApprovals,
    openPeriods,
    deletedUsers,
  ] = await Promise.all([
    prisma.partner.count({ where: { status: 'PENDING' } }),
    prisma.receipt.count({ where: { status: 'MANUAL_REVIEW' } }),
    prisma.partnerCashbackPayment.count({ where: { status: 'OVERDUE' } }),
    prisma.venue.count({ where: { pendingMenuUrl: { not: null } } }),
    // Periods that have been in FOR_REVIEW for a while — operational signal
    prisma.reportingPeriod.count({ where: { status: 'FOR_REVIEW' } }),
    // Soft-deleted users pending cleanup — informational
    prisma.user.count({ where: { status: 'DELETED' } }),
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
