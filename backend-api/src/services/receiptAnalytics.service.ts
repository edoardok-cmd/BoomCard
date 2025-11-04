import { prisma } from '../lib/prisma';

/**
 * Receipt Analytics Service
 *
 * Tracks and calculates receipt submission analytics for users
 * - Maintains aggregate statistics in ReceiptAnalytics table
 * - Calculates success rates, averages, totals
 * - Identifies top merchants
 * - Generates global platform statistics
 *
 * Analytics are updated in real-time as receipts are processed
 */

interface AnalyticsData {
  userId: string;
  totalReceipts: number;
  approvedReceipts: number;
  rejectedReceipts: number;
  pendingReceipts: number;
  totalCashback: number;
  totalSpent: number;
  averageReceiptAmount: number;
  successRate: number;
  lastReceiptDate: Date;
  topMerchants?: Array<{ name: string; count: number; totalSpent: number }>;
}

interface MonthlyStats {
  month: string;
  receipts: number;
  cashback: number;
  avgAmount: number;
}

class ReceiptAnalyticsService {
  /**
   * Get user analytics with top merchants
   * Creates analytics record if it doesn't exist
   */
  async getAnalytics(userId: string): Promise<AnalyticsData> {
    // Get or create analytics record
    let analytics = await prisma.receiptAnalytics.findUnique({
      where: { userId },
    });

    if (!analytics) {
      // Create initial analytics record
      analytics = await prisma.receiptAnalytics.create({
        data: {
          userId,
          totalReceipts: 0,
          approvedReceipts: 0,
          rejectedReceipts: 0,
          pendingReceipts: 0,
          totalCashback: 0,
          totalSpent: 0,
          averageReceiptAmount: 0,
          successRate: 0,
        },
      });
    }

    // Calculate top merchants from actual receipts
    const topMerchants = await this.getTopMerchants(userId);

    return {
      ...analytics,
      topMerchants,
    };
  }

  /**
   * Get top merchants for user
   * Returns top 10 merchants by receipt count
   */
  async getTopMerchants(
    userId: string
  ): Promise<Array<{ name: string; count: number; totalSpent: number }>> {
    const receipts = await prisma.receipt.findMany({
      where: {
        userId,
        merchantName: { not: null },
      },
      select: {
        merchantName: true,
        totalAmount: true,
      },
    });

    // Group by merchant name
    const merchantMap = new Map<string, { count: number; totalSpent: number }>();

    receipts.forEach((r) => {
      if (r.merchantName) {
        const current = merchantMap.get(r.merchantName) || { count: 0, totalSpent: 0 };
        merchantMap.set(r.merchantName, {
          count: current.count + 1,
          totalSpent: current.totalSpent + (r.totalAmount || 0),
        });
      }
    });

    // Convert to array and sort by count
    const topMerchants = Array.from(merchantMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return topMerchants;
  }

  /**
   * Update analytics after receipt submission
   * Increments counters and recalculates averages
   */
  async updateAnalytics(params: {
    userId: string;
    receiptId: string;
    status: string;
    cashbackAmount: number;
    totalAmount: number;
  }): Promise<void> {
    const { userId, status, cashbackAmount, totalAmount } = params;

    try {
      // Get current analytics or create new
      let analytics = await prisma.receiptAnalytics.findUnique({
        where: { userId },
      });

      if (!analytics) {
        // First receipt for user - create initial record
        await prisma.receiptAnalytics.create({
          data: {
            userId,
            totalReceipts: 1,
            approvedReceipts: status === 'APPROVED' ? 1 : 0,
            rejectedReceipts: status === 'REJECTED' ? 1 : 0,
            pendingReceipts: ['PENDING', 'MANUAL_REVIEW', 'PROCESSING'].includes(status) ? 1 : 0,
            totalCashback: status === 'APPROVED' ? cashbackAmount : 0,
            totalSpent: totalAmount,
            averageReceiptAmount: totalAmount,
            lastReceiptDate: new Date(),
            successRate: status === 'APPROVED' ? 100 : 0,
          },
        });
      } else {
        // Update existing analytics
        const newTotalReceipts = analytics.totalReceipts + 1;
        const newApproved =
          status === 'APPROVED' ? analytics.approvedReceipts + 1 : analytics.approvedReceipts;
        const newRejected =
          status === 'REJECTED' ? analytics.rejectedReceipts + 1 : analytics.rejectedReceipts;
        const newPending = ['PENDING', 'MANUAL_REVIEW', 'PROCESSING'].includes(status)
          ? analytics.pendingReceipts + 1
          : analytics.pendingReceipts;
        const newTotalCashback =
          status === 'APPROVED' ? analytics.totalCashback + cashbackAmount : analytics.totalCashback;
        const newTotalSpent = analytics.totalSpent + totalAmount;
        const newAverage = newTotalSpent / newTotalReceipts;
        const newSuccessRate = (newApproved / newTotalReceipts) * 100;

        await prisma.receiptAnalytics.update({
          where: { userId },
          data: {
            totalReceipts: newTotalReceipts,
            approvedReceipts: newApproved,
            rejectedReceipts: newRejected,
            pendingReceipts: newPending,
            totalCashback: newTotalCashback,
            totalSpent: newTotalSpent,
            averageReceiptAmount: newAverage,
            lastReceiptDate: new Date(),
            successRate: newSuccessRate,
          },
        });
      }

      console.log(`📊 Analytics updated for user ${userId}`);
    } catch (error) {
      console.error('❌ Error updating analytics:', error);
      // Don't throw - analytics update shouldn't block receipt processing
    }
  }

  /**
   * Update analytics when receipt status changes (admin review)
   * Adjusts counters based on status transition
   */
  async updateAnalyticsOnStatusChange(params: {
    userId: string;
    oldStatus: string;
    newStatus: string;
    cashbackAmount: number;
  }): Promise<void> {
    const { userId, oldStatus, newStatus, cashbackAmount } = params;

    try {
      const analytics = await prisma.receiptAnalytics.findUnique({
        where: { userId },
      });

      if (!analytics) return;

      const updates: any = {};

      // Handle status transitions
      if (oldStatus === 'PENDING' || oldStatus === 'MANUAL_REVIEW') {
        updates.pendingReceipts = { decrement: 1 };
      } else if (oldStatus === 'APPROVED') {
        updates.approvedReceipts = { decrement: 1 };
        updates.totalCashback = { decrement: cashbackAmount };
      } else if (oldStatus === 'REJECTED') {
        updates.rejectedReceipts = { decrement: 1 };
      }

      if (newStatus === 'APPROVED') {
        updates.approvedReceipts = { increment: 1 };
        updates.totalCashback = { increment: cashbackAmount };
      } else if (newStatus === 'REJECTED') {
        updates.rejectedReceipts = { increment: 1 };
      } else if (newStatus === 'MANUAL_REVIEW' || newStatus === 'PENDING') {
        updates.pendingReceipts = { increment: 1 };
      }

      await prisma.receiptAnalytics.update({
        where: { userId },
        data: updates,
      });

      // Recalculate success rate
      const updated = await prisma.receiptAnalytics.findUnique({
        where: { userId },
      });

      if (updated) {
        await prisma.receiptAnalytics.update({
          where: { userId },
          data: {
            successRate: (updated.approvedReceipts / updated.totalReceipts) * 100,
          },
        });
      }

      console.log(`📊 Analytics updated for status change: ${oldStatus} → ${newStatus}`);
    } catch (error) {
      console.error('❌ Error updating analytics on status change:', error);
    }
  }

  /**
   * Get monthly statistics for user
   * Returns last 12 months of data
   */
  async getMonthlyStats(userId: string): Promise<MonthlyStats[]> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const receipts = await prisma.receipt.findMany({
      where: {
        userId,
        createdAt: { gte: twelveMonthsAgo },
      },
      select: {
        createdAt: true,
        cashbackAmount: true,
        totalAmount: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month
    const monthlyMap = new Map<string, { receipts: number; cashback: number; totalAmount: number }>();

    receipts.forEach((r) => {
      const monthKey = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, '0')}`;
      const current = monthlyMap.get(monthKey) || { receipts: 0, cashback: 0, totalAmount: 0 };

      monthlyMap.set(monthKey, {
        receipts: current.receipts + 1,
        cashback: current.cashback + r.cashbackAmount,
        totalAmount: current.totalAmount + (r.totalAmount || 0),
      });
    });

    // Convert to array and calculate averages
    const monthlyStats: MonthlyStats[] = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        month,
        receipts: data.receipts,
        cashback: parseFloat(data.cashback.toFixed(2)),
        avgAmount: parseFloat((data.totalAmount / data.receipts).toFixed(2)),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return monthlyStats;
  }

  /**
   * Get global platform analytics
   * Used for admin dashboard
   */
  async getGlobalAnalytics() {
    const stats = await prisma.receipt.groupBy({
      by: ['status'],
      _count: true,
      _sum: {
        cashbackAmount: true,
        totalAmount: true,
        fraudScore: true,
      },
      _avg: {
        fraudScore: true,
        ocrConfidence: true,
      },
    });

    const totalReceipts = stats.reduce((sum, s) => sum + s._count, 0);
    const totalCashback = stats.reduce((sum, s) => sum + (s._sum.cashbackAmount || 0), 0);
    const totalSpent = stats.reduce((sum, s) => sum + (s._sum.totalAmount || 0), 0);

    // Get user count
    const userCount = await prisma.receiptAnalytics.count();

    // Get top merchants globally
    const topMerchantsGlobal = await this.getTopMerchantsGlobal();

    return {
      totalReceipts,
      totalCashback: parseFloat(totalCashback.toFixed(2)),
      totalSpent: parseFloat(totalSpent.toFixed(2)),
      averageReceiptAmount:
        totalReceipts > 0 ? parseFloat((totalSpent / totalReceipts).toFixed(2)) : 0,
      totalUsers: userCount,
      byStatus: stats.map((s) => ({
        status: s.status,
        count: s._count,
        totalCashback: s._sum.cashbackAmount || 0,
        totalSpent: s._sum.totalAmount || 0,
        avgFraudScore: s._avg.fraudScore || 0,
        avgOcrConfidence: s._avg.ocrConfidence || 0,
      })),
      topMerchants: topMerchantsGlobal,
    };
  }

  /**
   * Get top merchants globally (all users)
   */
  async getTopMerchantsGlobal(): Promise<Array<{ name: string; count: number; totalSpent: number }>> {
    const result = await prisma.receipt.groupBy({
      by: ['merchantName'],
      where: {
        merchantName: { not: null },
      },
      _count: true,
      _sum: {
        totalAmount: true,
      },
      orderBy: {
        _count: {
          merchantName: 'desc',
        },
      },
      take: 10,
    });

    return result.map((r) => ({
      name: r.merchantName || 'Unknown',
      count: r._count,
      totalSpent: r._sum.totalAmount || 0,
    }));
  }

  /**
   * Get analytics for specific date range
   */
  async getAnalyticsForDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    receipts: number;
    cashback: number;
    spent: number;
    avgAmount: number;
  }> {
    const result = await prisma.receipt.aggregate({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: true,
      _sum: {
        cashbackAmount: true,
        totalAmount: true,
      },
    });

    const receipts = result._count;
    const cashback = result._sum.cashbackAmount || 0;
    const spent = result._sum.totalAmount || 0;

    return {
      receipts,
      cashback: parseFloat(cashback.toFixed(2)),
      spent: parseFloat(spent.toFixed(2)),
      avgAmount: receipts > 0 ? parseFloat((spent / receipts).toFixed(2)) : 0,
    };
  }

  /**
   * Recalculate analytics for user from scratch
   * Useful for fixing inconsistencies
   */
  async recalculateAnalytics(userId: string): Promise<void> {
    console.log(`🔄 Recalculating analytics for user ${userId}...`);

    const receipts = await prisma.receipt.findMany({
      where: { userId },
      select: {
        status: true,
        cashbackAmount: true,
        totalAmount: true,
        createdAt: true,
      },
    });

    const totalReceipts = receipts.length;
    const approvedReceipts = receipts.filter((r) => r.status === 'APPROVED').length;
    const rejectedReceipts = receipts.filter((r) => r.status === 'REJECTED').length;
    const pendingReceipts = receipts.filter((r) =>
      ['PENDING', 'MANUAL_REVIEW', 'PROCESSING'].includes(r.status)
    ).length;

    const totalCashback = receipts
      .filter((r) => r.status === 'APPROVED')
      .reduce((sum, r) => sum + r.cashbackAmount, 0);

    const totalSpent = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    const averageReceiptAmount = totalReceipts > 0 ? totalSpent / totalReceipts : 0;
    const successRate = totalReceipts > 0 ? (approvedReceipts / totalReceipts) * 100 : 0;

    const lastReceipt = receipts.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )[0];

    await prisma.receiptAnalytics.upsert({
      where: { userId },
      create: {
        userId,
        totalReceipts,
        approvedReceipts,
        rejectedReceipts,
        pendingReceipts,
        totalCashback,
        totalSpent,
        averageReceiptAmount,
        successRate,
        lastReceiptDate: lastReceipt?.createdAt || new Date(),
      },
      update: {
        totalReceipts,
        approvedReceipts,
        rejectedReceipts,
        pendingReceipts,
        totalCashback,
        totalSpent,
        averageReceiptAmount,
        successRate,
        lastReceiptDate: lastReceipt?.createdAt,
      },
    });

    console.log(`✅ Analytics recalculated for user ${userId}`);
  }
}

export const receiptAnalyticsService = new ReceiptAnalyticsService();
