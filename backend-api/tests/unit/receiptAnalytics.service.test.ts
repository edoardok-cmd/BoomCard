/**
 * receiptAnalyticsService unit tests
 *
 * Focuses on updateAnalyticsOnStatusChange — the delta-based counter
 * update that avoids the key-assignment overwrite bug (where two blocks
 * targeting the same Prisma field would silently drop one of them).
 *
 * Key invariants tested:
 *   - APPROVED→REJECTED correctly decrements approved + cashback, increments rejected
 *   - PENDING→APPROVED correctly decrements pending, increments approved + cashback
 *   - MANUAL_REVIEW is treated as pending (same counter as PENDING)
 *   - APPROVED→APPROVED is a no-op (same-status early return)
 *   - successRate is computed as (newApproved / totalReceipts) * 100
 *   - No update is issued when all deltas are zero
 *   - Returns early without error when no analytics row exists
 */

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma: any = {
  receiptAnalytics: {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})),
    upsert: jest.fn(async () => ({})),
  },
  receipt: {
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    aggregate: jest.fn(async () => ({ _sum: { totalAmount: null, cashbackAmount: null } })),
  },
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

import { receiptAnalyticsService } from '../../src/services/receiptAnalytics.service';

const BASE_ANALYTICS = {
  userId: 'u-1',
  totalReceipts: 10,
  approvedReceipts: 5,
  rejectedReceipts: 2,
  pendingReceipts: 3,
  totalCashback: 50.0,
  totalSpent: 200.0,
  averageReceiptAmount: 20.0,
  successRate: 50.0,
  lastReceiptDate: new Date(),
};

beforeEach(() => jest.clearAllMocks());

// ─── updateAnalyticsOnStatusChange ───────────────────────────────────────────

describe('receiptAnalyticsService.updateAnalyticsOnStatusChange — deltas', () => {
  it('returns early without error when no analytics row exists', async () => {
    mockPrisma.receiptAnalytics.findUnique.mockResolvedValueOnce(null);
    await expect(
      receiptAnalyticsService.updateAnalyticsOnStatusChange({
        userId: 'u-1', oldStatus: 'PENDING', newStatus: 'APPROVED', cashbackAmount: 10,
      }),
    ).resolves.toBeUndefined();
    expect(mockPrisma.receiptAnalytics.update).not.toHaveBeenCalled();
  });

  it('same-status (APPROVED→APPROVED) is a no-op — no update issued', async () => {
    mockPrisma.receiptAnalytics.findUnique.mockResolvedValueOnce({ ...BASE_ANALYTICS });
    await receiptAnalyticsService.updateAnalyticsOnStatusChange({
      userId: 'u-1', oldStatus: 'APPROVED', newStatus: 'APPROVED', cashbackAmount: 10,
    });
    expect(mockPrisma.receiptAnalytics.update).not.toHaveBeenCalled();
  });

  it('same-status (PENDING→PENDING) is a no-op', async () => {
    mockPrisma.receiptAnalytics.findUnique.mockResolvedValueOnce({ ...BASE_ANALYTICS });
    await receiptAnalyticsService.updateAnalyticsOnStatusChange({
      userId: 'u-1', oldStatus: 'PENDING', newStatus: 'PENDING', cashbackAmount: 0,
    });
    expect(mockPrisma.receiptAnalytics.update).not.toHaveBeenCalled();
  });

  it('PENDING→APPROVED: decrements pendingReceipts, increments approvedReceipts + cashback', async () => {
    mockPrisma.receiptAnalytics.findUnique.mockResolvedValueOnce({ ...BASE_ANALYTICS });
    await receiptAnalyticsService.updateAnalyticsOnStatusChange({
      userId: 'u-1', oldStatus: 'PENDING', newStatus: 'APPROVED', cashbackAmount: 15,
    });
    const data = mockPrisma.receiptAnalytics.update.mock.calls[0][0].data;
    expect(data.pendingReceipts).toEqual({ decrement: 1 });
    expect(data.approvedReceipts).toEqual({ increment: 1 });
    expect(data.totalCashback).toEqual({ increment: 15 });
    expect(data.rejectedReceipts).toBeUndefined();
  });

  it('APPROVED→REJECTED: decrements approvedReceipts + cashback, increments rejectedReceipts', async () => {
    mockPrisma.receiptAnalytics.findUnique.mockResolvedValueOnce({ ...BASE_ANALYTICS });
    await receiptAnalyticsService.updateAnalyticsOnStatusChange({
      userId: 'u-1', oldStatus: 'APPROVED', newStatus: 'REJECTED', cashbackAmount: 20,
    });
    const data = mockPrisma.receiptAnalytics.update.mock.calls[0][0].data;
    expect(data.approvedReceipts).toEqual({ decrement: 1 });
    expect(data.totalCashback).toEqual({ decrement: 20 });
    expect(data.rejectedReceipts).toEqual({ increment: 1 });
    expect(data.pendingReceipts).toBeUndefined();
  });

  it('MANUAL_REVIEW→APPROVED: decrements pendingReceipts (MANUAL_REVIEW = pending), increments approved', async () => {
    mockPrisma.receiptAnalytics.findUnique.mockResolvedValueOnce({ ...BASE_ANALYTICS });
    await receiptAnalyticsService.updateAnalyticsOnStatusChange({
      userId: 'u-1', oldStatus: 'MANUAL_REVIEW', newStatus: 'APPROVED', cashbackAmount: 8,
    });
    const data = mockPrisma.receiptAnalytics.update.mock.calls[0][0].data;
    expect(data.pendingReceipts).toEqual({ decrement: 1 });
    expect(data.approvedReceipts).toEqual({ increment: 1 });
  });

  it('PENDING→REJECTED: decrements pending, increments rejected, no cashback change', async () => {
    mockPrisma.receiptAnalytics.findUnique.mockResolvedValueOnce({ ...BASE_ANALYTICS });
    await receiptAnalyticsService.updateAnalyticsOnStatusChange({
      userId: 'u-1', oldStatus: 'PENDING', newStatus: 'REJECTED', cashbackAmount: 0,
    });
    const data = mockPrisma.receiptAnalytics.update.mock.calls[0][0].data;
    expect(data.pendingReceipts).toEqual({ decrement: 1 });
    expect(data.rejectedReceipts).toEqual({ increment: 1 });
    expect(data.totalCashback).toBeUndefined();
  });

  it('successRate is computed as (newApproved / totalReceipts) * 100 with 2 decimal precision', async () => {
    // BASE: 10 total, 5 approved → 50% success rate
    // After PENDING→APPROVED: 6 approved / 10 total = 60%
    mockPrisma.receiptAnalytics.findUnique.mockResolvedValueOnce({ ...BASE_ANALYTICS });
    await receiptAnalyticsService.updateAnalyticsOnStatusChange({
      userId: 'u-1', oldStatus: 'PENDING', newStatus: 'APPROVED', cashbackAmount: 5,
    });
    const data = mockPrisma.receiptAnalytics.update.mock.calls[0][0].data;
    expect(data.successRate).toBeCloseTo(60.0, 2);
  });

  it('successRate is 0 when totalReceipts is 0 (avoids division by zero)', async () => {
    const emptyAnalytics = { ...BASE_ANALYTICS, totalReceipts: 0, approvedReceipts: 0 };
    mockPrisma.receiptAnalytics.findUnique.mockResolvedValueOnce(emptyAnalytics);
    await receiptAnalyticsService.updateAnalyticsOnStatusChange({
      userId: 'u-1', oldStatus: 'PENDING', newStatus: 'APPROVED', cashbackAmount: 10,
    });
    const data = mockPrisma.receiptAnalytics.update.mock.calls[0][0].data;
    expect(data.successRate).toBe(0);
  });
});
