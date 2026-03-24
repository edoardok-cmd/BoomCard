/**
 * Admin Cashback Service
 *
 * Computes per-partner monthly cashback summaries from approved receipts
 * and manages PartnerCashbackPayment records.
 */

import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { emailService } from './email.service';

export interface CashbackSummaryEntry {
  partnerId: string;
  partnerName: string;
  partnerEmail: string | null;
  month: string;          // "YYYY-MM"
  receiptCount: number;
  totalOwed: number;      // sum of cashbackAmount from APPROVED receipts
  paymentStatus: 'PENDING' | 'PAID' | 'OVERDUE';
  paidAt: Date | null;
  paidBy: string | null;
  notes: string | null;
}

class AdminCashbackService {
  /**
   * Get monthly cashback summary for all partners.
   * Groups APPROVED receipts by partner and month, enriched with payment status.
   *
   * @param month Optional "YYYY-MM" filter. Defaults to current month.
   * @param status Optional payment status filter.
   */
  async getSummary(params?: {
    month?: string;
    status?: 'PENDING' | 'PAID' | 'OVERDUE';
  }): Promise<CashbackSummaryEntry[]> {
    const targetMonth = params?.month || this.currentMonth();

    // Build date range for the month
    const [year, mon] = targetMonth.split('-').map(Number);
    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd = new Date(year, mon, 1);

    // Aggregate APPROVED receipts: group by venueId, sum cashbackAmount
    // Note: venueId in Receipt is stored as Partner.id (see receipt.service.ts)
    const rawGroups = await prisma.receipt.groupBy({
      by: ['venueId'],
      where: {
        status: 'APPROVED' as any,
        createdAt: { gte: monthStart, lt: monthEnd },
        venueId: { not: null },
      },
      _sum: { cashbackAmount: true },
      _count: { id: true },
    });

    if (rawGroups.length === 0) return [];

    // Fetch partner details for each group
    const partnerIds = rawGroups.map(g => g.venueId!);
    const partners = await prisma.partner.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, businessName: true, email: true },
    });

    const partnerMap = new Map(partners.map(p => [p.id, p]));

    // Fetch existing payment records for this month
    const payments = await prisma.partnerCashbackPayment.findMany({
      where: { partnerId: { in: partnerIds }, month: targetMonth },
    });
    const paymentMap = new Map(payments.map(p => [p.partnerId, p]));

    const now = new Date();
    const overdueThreshold = new Date(monthEnd);
    overdueThreshold.setDate(overdueThreshold.getDate() + 30); // overdue after 30 days past end of month

    const results: CashbackSummaryEntry[] = rawGroups.map(group => {
      const partner = partnerMap.get(group.venueId!);
      const payment = paymentMap.get(group.venueId!);
      const totalOwed = group._sum.cashbackAmount ?? 0;

      let paymentStatus: CashbackSummaryEntry['paymentStatus'] = 'PENDING';
      if (payment?.status === 'PAID') {
        paymentStatus = 'PAID';
      } else if (now > overdueThreshold) {
        paymentStatus = 'OVERDUE';
      }

      return {
        partnerId: group.venueId!,
        partnerName: partner?.businessName ?? 'Unknown Partner',
        partnerEmail: partner?.email ?? null,
        month: targetMonth,
        receiptCount: group._count.id,
        totalOwed,
        paymentStatus,
        paidAt: payment?.paidAt ?? null,
        paidBy: payment?.paidBy ?? null,
        notes: payment?.notes ?? null,
      };
    });

    // Filter by status if requested
    if (params?.status) {
      return results.filter(r => r.paymentStatus === params.status);
    }

    return results.sort((a, b) => a.partnerName.localeCompare(b.partnerName));
  }

  /**
   * Mark a partner's monthly cashback as paid.
   */
  async markPaid(params: {
    partnerId: string;
    month: string;
    adminUserId: string;
    notes?: string;
    totalOwed?: number;
  }): Promise<void> {
    // Compute totalOwed if not provided
    let totalOwed = params.totalOwed ?? 0;
    if (!totalOwed) {
      const [year, mon] = params.month.split('-').map(Number);
      const monthStart = new Date(year, mon - 1, 1);
      const monthEnd = new Date(year, mon, 1);
      const agg = await prisma.receipt.aggregate({
        where: {
          venueId: params.partnerId,
          status: 'APPROVED' as any,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { cashbackAmount: true },
      });
      totalOwed = agg._sum.cashbackAmount ?? 0;
    }

    await prisma.partnerCashbackPayment.upsert({
      where: { partnerId_month: { partnerId: params.partnerId, month: params.month } },
      create: {
        partnerId: params.partnerId,
        month: params.month,
        totalCashbackOwed: totalOwed,
        status: 'PAID',
        paidAt: new Date(),
        paidBy: params.adminUserId,
        notes: params.notes,
      },
      update: {
        status: 'PAID',
        paidAt: new Date(),
        paidBy: params.adminUserId,
        notes: params.notes,
        totalCashbackOwed: totalOwed,
      },
    });

    logger.info(`Admin ${params.adminUserId} marked cashback PAID for partner ${params.partnerId}, month ${params.month}`);
  }

  /**
   * Send a cashback payment reminder email to a partner.
   */
  async sendReminder(partnerId: string, month?: string): Promise<{ sent: boolean; reason?: string }> {
    const targetMonth = month || this.currentMonth();

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { businessName: true, email: true },
    });

    if (!partner) return { sent: false, reason: 'Partner not found' };
    if (!partner.email) return { sent: false, reason: 'Partner has no email address' };

    // Compute outstanding amount
    const [year, mon] = targetMonth.split('-').map(Number);
    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd = new Date(year, mon, 1);
    const agg = await prisma.receipt.aggregate({
      where: {
        venueId: partnerId,
        status: 'APPROVED' as any,
        createdAt: { gte: monthStart, lt: monthEnd },
      },
      _sum: { cashbackAmount: true },
    });

    const amount = agg._sum.cashbackAmount ?? 0;
    if (amount <= 0) return { sent: false, reason: 'No outstanding cashback for this month' };

    const result = await emailService.sendCashbackReminder(partner.email, {
      partnerName: partner.businessName,
      month: targetMonth,
      amount,
    });

    logger.info(`Cashback reminder ${result.success ? 'sent' : 'failed'} for partner ${partnerId}, month ${targetMonth}`);
    return { sent: result.success };
  }

  /**
   * Get summary stats for admin dashboard cards.
   */
  async getDashboardStats(): Promise<{
    pendingTotal: number;
    paidThisMonth: number;
    overdueCount: number;
    activePartners: number;
  }> {
    const currentMon = this.currentMonth();
    const summary = await this.getSummary({ month: currentMon });

    return {
      pendingTotal: summary
        .filter(s => s.paymentStatus !== 'PAID')
        .reduce((acc, s) => acc + s.totalOwed, 0),
      paidThisMonth: summary
        .filter(s => s.paymentStatus === 'PAID')
        .reduce((acc, s) => acc + s.totalOwed, 0),
      overdueCount: summary.filter(s => s.paymentStatus === 'OVERDUE').length,
      activePartners: summary.length,
    };
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}

export const adminCashbackService = new AdminCashbackService();
