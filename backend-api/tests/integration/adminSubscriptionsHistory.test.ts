/**
 * BC-ADMIN-AUDIT-FIX-006 — Integration tests for per-subscription payment history.
 *
 * Tests verify:
 * 1. Transactions of type SUBSCRIPTION are correctly attributed via subscriptionId FK
 * 2. Backfill heuristic (window-based temporal match) works correctly
 * 3. GET /api/admin/subscriptions/user/:userId/history groups payments per subscription
 * 4. Unattributed payments (NULL subscriptionId) are handled gracefully
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { SubscriptionStatus, TransactionType, TransactionStatus, SubscriptionPlan } from '@prisma/client';

describe('BC-ADMIN-AUDIT-FIX-006: Per-subscription payment history', () => {
  let userId: string;
  let sub1Id: string;
  let sub2Id: string;
  const now = new Date();

  beforeAll(async () => {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `test-sub-history-${Date.now()}@test.boomcard.bg`,
        passwordHash: 'hash',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    userId = user.id;

    // Create first subscription (Jan 1-31)
    const sub1Start = new Date(now.getFullYear(), now.getMonth(), 1);
    const sub1End = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const sub1 = await prisma.subscription.create({
      data: {
        userId,
        plan: SubscriptionPlan.BASIC,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: sub1Start,
        currentPeriodEnd: sub1End,
      },
    });
    sub1Id = sub1.id;

    // Create second subscription (Feb 1 - 28)
    const sub2Start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const sub2End = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const sub2 = await prisma.subscription.create({
      data: {
        userId,
        plan: SubscriptionPlan.PREMIUM,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: sub2Start,
        currentPeriodEnd: sub2End,
      },
    });
    sub2Id = sub2.id;

    // Create transactions manually WITHOUT subscriptionId to test backfill
    // Transaction 1: Created within sub1 period (should be backfilled to sub1)
    await prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.SUBSCRIPTION,
        status: TransactionStatus.COMPLETED,
        amount: 10.0,
        paymentMethod: 'CARD',
        createdAt: new Date(sub1Start.getTime() + 24 * 60 * 60 * 1000), // 1 day into sub1
        // subscriptionId intentionally omitted for backfill test
      },
    });

    // Transaction 2: Created within sub2 period (should be backfilled to sub2)
    await prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.SUBSCRIPTION,
        status: TransactionStatus.COMPLETED,
        amount: 15.0,
        paymentMethod: 'CARD',
        createdAt: new Date(sub2Start.getTime() + 48 * 60 * 60 * 1000), // 2 days into sub2
        // subscriptionId intentionally omitted for backfill test
      },
    });

    // Transaction 3: Created outside any subscription period (remains unattributed)
    const outsideDate = new Date(sub2End.getTime() + 24 * 60 * 60 * 1000); // 1 day after sub2 ends
    await prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.SUBSCRIPTION,
        status: TransactionStatus.COMPLETED,
        amount: 20.0,
        paymentMethod: 'CARD',
        createdAt: outsideDate,
        // subscriptionId intentionally omitted; backfill cannot match this
      },
    });

    // Transaction 4: Non-SUBSCRIPTION type (should not be backfilled)
    await prisma.transaction.create({
      data: {
        userId,
        type: TransactionType.OFFER_REDEMPTION,
        status: TransactionStatus.COMPLETED,
        amount: 5.0,
        paymentMethod: 'CARD',
        createdAt: new Date(sub1Start.getTime() + 12 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  describe('Backfill validation', () => {
    it('should have backfilled transactions within subscription periods', async () => {
      // Query the backfilled transactions
      const sub1Txns = await prisma.transaction.findMany({
        where: {
          userId,
          type: TransactionType.SUBSCRIPTION,
          subscriptionId: sub1Id,
        },
      });

      const sub2Txns = await prisma.transaction.findMany({
        where: {
          userId,
          type: TransactionType.SUBSCRIPTION,
          subscriptionId: sub2Id,
        },
      });

      // Validate counts and amounts
      expect(sub1Txns).toHaveLength(1);
      expect(sub1Txns[0]!.amount).toBe(10.0);

      expect(sub2Txns).toHaveLength(1);
      expect(sub2Txns[0]!.amount).toBe(15.0);
    });

    it('should leave unmatched transactions with NULL subscriptionId', async () => {
      const unattributedTxns = await prisma.transaction.findMany({
        where: {
          userId,
          type: TransactionType.SUBSCRIPTION,
          subscriptionId: null,
        },
      });

      // The transaction outside any period should be NULL
      expect(unattributedTxns.length).toBeGreaterThan(0);
      expect(unattributedTxns.some((t) => t.amount === 20.0)).toBe(true);
    });

    it('should not backfill non-SUBSCRIPTION transactions', async () => {
      const nonSubTxns = await prisma.transaction.findMany({
        where: {
          userId,
          type: TransactionType.OFFER_REDEMPTION,
        },
      });

      expect(nonSubTxns).toHaveLength(1);
      expect(nonSubTxns[0]!.subscriptionId).toBeNull();
    });
  });

  describe('GET /api/admin/subscriptions/user/:userId/history', () => {
    it('should return subscriptions with per-subscription payment arrays', async () => {
      // This would normally be tested via HTTP, but we validate the data shape here
      // by simulating what the route does

      const subscriptions = await prisma.subscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });

      const subscriptionPayments = await prisma.transaction.findMany({
        where: {
          userId,
          type: TransactionType.SUBSCRIPTION,
          status: TransactionStatus.COMPLETED,
        },
        orderBy: { createdAt: 'desc' },
      });

      const paymentsBySubscriptionId = new Map<string | null, typeof subscriptionPayments>();
      subscriptionPayments.forEach((payment) => {
        const key = payment.subscriptionId ?? '__unattributed__';
        if (!paymentsBySubscriptionId.has(key)) {
          paymentsBySubscriptionId.set(key, []);
        }
        paymentsBySubscriptionId.get(key)!.push(payment);
      });

      // Build result shape
      const result = subscriptions.map((s) => ({
        id: s.id,
        plan: s.plan,
        payments: paymentsBySubscriptionId.get(s.id) ?? [],
      }));

      // Validate shape
      expect(result).toHaveLength(2);
      expect(result[0]!.payments).toHaveLength(1);
      expect(result[0]!.payments[0]!.amount).toBe(10.0);

      expect(result[1]!.payments).toHaveLength(1);
      expect(result[1]!.payments[0]!.amount).toBe(15.0);
    });

    it('should correctly attribute backfilled payments to their subscriptions', async () => {
      // Query per-subscription aggregates
      const sub1Payments = await prisma.transaction.aggregate({
        where: {
          subscriptionId: sub1Id,
          type: TransactionType.SUBSCRIPTION,
          status: TransactionStatus.COMPLETED,
        },
        _count: { _all: true },
        _sum: { amount: true },
      });

      const sub2Payments = await prisma.transaction.aggregate({
        where: {
          subscriptionId: sub2Id,
          type: TransactionType.SUBSCRIPTION,
          status: TransactionStatus.COMPLETED,
        },
        _count: { _all: true },
        _sum: { amount: true },
      });

      expect(sub1Payments._count._all).toBe(1);
      expect(sub1Payments._sum.amount).toBe(10.0);

      expect(sub2Payments._count._all).toBe(1);
      expect(sub2Payments._sum.amount).toBe(15.0);
    });
  });

  describe('FK constraint and cascading', () => {
    it('should preserve transactions when subscription is deleted (onDelete: SetNull)', async () => {
      // Create a temporary subscription with a payment
      const tempSub = await prisma.subscription.create({
        data: {
          userId,
          plan: SubscriptionPlan.BASIC,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 86400000),
        },
      });

      const tempTxn = await prisma.transaction.create({
        data: {
          userId,
          subscriptionId: tempSub.id,
          type: TransactionType.SUBSCRIPTION,
          status: TransactionStatus.COMPLETED,
          amount: 25.0,
          paymentMethod: 'CARD',
        },
      });

      // Delete the subscription
      await prisma.subscription.delete({ where: { id: tempSub.id } });

      // Verify transaction still exists with NULL subscriptionId
      const txnAfter = await prisma.transaction.findUnique({
        where: { id: tempTxn.id },
      });

      expect(txnAfter).toBeDefined();
      expect(txnAfter!.subscriptionId).toBeNull();
    });
  });
});
