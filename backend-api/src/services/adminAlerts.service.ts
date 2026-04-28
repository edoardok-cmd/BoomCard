import { prisma } from '../lib/prisma';

export type AlertSeverity = 'danger' | 'warning' | 'info';
export type AlertType =
  | 'PARTNER_REQUESTS'
  | 'RECEIPT_REVIEW'
  | 'CASHBACK_OVERDUE'
  | 'MENU_APPROVALS';

export interface AdminAlert {
  type: AlertType;
  severity: AlertSeverity;
  count: number;
  link: string;
}

export interface AdminAlertsResult {
  alerts: AdminAlert[];
  total: number;
  generatedAt: string;
}

export async function getAlerts(): Promise<AdminAlertsResult> {
  const [partnerRequests, receiptReviews, cashbackOverdue, menuApprovals] = await Promise.all([
    prisma.partner.count({ where: { status: 'PENDING' } }),
    prisma.receipt.count({ where: { status: 'MANUAL_REVIEW' } }),
    prisma.partnerCashbackPayment.count({ where: { status: 'OVERDUE' } }),
    prisma.venue.count({ where: { pendingMenuUrl: { not: null } } }),
  ]);

  const candidates: Array<AdminAlert & { _count: number }> = [
    {
      type: 'PARTNER_REQUESTS',
      severity: 'warning',
      count: partnerRequests,
      _count: partnerRequests,
      link: '/admin/partners/new/requests',
    },
    {
      type: 'RECEIPT_REVIEW',
      severity: 'danger',
      count: receiptReviews,
      _count: receiptReviews,
      link: '/admin/control/risk',
    },
    {
      type: 'CASHBACK_OVERDUE',
      severity: 'danger',
      count: cashbackOverdue,
      _count: cashbackOverdue,
      link: '/admin/subscribers/cashback',
    },
    {
      type: 'MENU_APPROVALS',
      severity: 'warning',
      count: menuApprovals,
      _count: menuApprovals,
      link: '/admin/partners/new/locations',
    },
  ];

  const severityOrder: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };

  const alerts: AdminAlert[] = candidates
    .filter(a => a._count > 0)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ _count, ...a }) => a)
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    alerts,
    total: alerts.reduce((sum, a) => sum + a.count, 0),
    generatedAt: new Date().toISOString(),
  };
}
