/**
 * Unit tests for the rule-sum risk scorer (spec §4.1 + §7.1).
 * Mocks Prisma to verify each rule contributes its expected score
 * and that the total bucketing matches the spec thresholds.
 */

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    loginHistory: { groupBy: jest.fn() },
    transaction:  { groupBy: jest.fn() },
    subscription: { groupBy: jest.fn() },
    dispute:      { groupBy: jest.fn() },
    receipt:      { groupBy: jest.fn() },
    user:         { update: jest.fn(), updateMany: jest.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { computeRiskForUsers, bucketFor, HIGH_TX_24H_THRESHOLD } from '../../src/services/userRisk.service';

const mockedPrisma = prisma as unknown as {
  loginHistory: { groupBy: jest.Mock };
  transaction:  { groupBy: jest.Mock };
  subscription: { groupBy: jest.Mock };
  dispute:      { groupBy: jest.Mock };
  receipt:      { groupBy: jest.Mock };
};

const NO_HITS = () => Promise.resolve([]);

function setBaselineMocks() {
  mockedPrisma.loginHistory.groupBy.mockImplementation(NO_HITS);
  mockedPrisma.transaction.groupBy.mockImplementation(NO_HITS);
  mockedPrisma.subscription.groupBy.mockImplementation(NO_HITS);
  mockedPrisma.dispute.groupBy.mockImplementation(NO_HITS);
  mockedPrisma.receipt.groupBy.mockImplementation(NO_HITS);
}

const baseUser = (overrides: Partial<{ id: string; createdAt: Date; ibanLastChangedAt: Date | null }> = {}) => ({
  id: overrides.id ?? 'u1',
  createdAt: overrides.createdAt ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
  ibanLastChangedAt: overrides.ibanLastChangedAt ?? null,
});

describe('userRisk.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setBaselineMocks();
  });

  describe('bucketFor', () => {
    it('matches the canonical RiskBucket thresholds at the boundaries', () => {
      expect(bucketFor(0)).toBe('LOW_0_20');
      expect(bucketFor(20)).toBe('LOW_0_20');
      expect(bucketFor(21)).toBe('MEDIUM_21_50');
      expect(bucketFor(50)).toBe('MEDIUM_21_50');
      expect(bucketFor(51)).toBe('HIGH_51_PLUS');
      expect(bucketFor(100)).toBe('HIGH_51_PLUS');
    });
  });

  describe('computeRiskForUsers', () => {
    it('returns LOW with 0 score for users with no signals', async () => {
      const out = await computeRiskForUsers([baseUser()]);
      const a = out.get('u1')!;
      expect(a.score).toBe(0);
      expect(a.bucket).toBe('LOW_0_20');
      expect(a.reasons).toEqual([]);
    });

    it('handles empty input without firing any DB queries', async () => {
      const out = await computeRiskForUsers([]);
      expect(out.size).toBe(0);
      expect(mockedPrisma.loginHistory.groupBy).not.toHaveBeenCalled();
    });

    it('adds 15 for 3+ failed logins in last 7d', async () => {
      mockedPrisma.loginHistory.groupBy.mockResolvedValueOnce([
        { userId: 'u1', _count: { _all: 3 } },
      ]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(15);
      expect(out.get('u1')!.reasons).toContain('3+ failed logins / 7d');
    });

    it('does not fire failed-login rule below threshold', async () => {
      mockedPrisma.loginHistory.groupBy.mockResolvedValueOnce([
        { userId: 'u1', _count: { _all: 2 } },
      ]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(0);
    });

    it('adds 25 for 10+ transactions in last 24h', async () => {
      mockedPrisma.transaction.groupBy
        .mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 12 } }]) // 24h
        .mockResolvedValueOnce([])                                       // failed 30d
        .mockResolvedValueOnce([]);                                       // total tx
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(25);
    });

    it('adds 30 for an open dispute', async () => {
      mockedPrisma.dispute.groupBy.mockResolvedValueOnce([
        { userId: 'u1', _count: { _all: 1 } },
      ]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(30);
      expect(out.get('u1')!.bucket).toBe('MEDIUM_21_50');
    });

    it('adds 20 for past-due / unpaid subscription', async () => {
      mockedPrisma.subscription.groupBy.mockResolvedValueOnce([
        { userId: 'u1', _count: { _all: 1 } },
      ]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(20);
    });

    it('adds 10 for an IBAN change within 7d', async () => {
      const u = baseUser({ ibanLastChangedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });
      const out = await computeRiskForUsers([u]);
      expect(out.get('u1')!.score).toBe(10);
    });

    it('does not fire IBAN-change rule for an old change', async () => {
      const u = baseUser({ ibanLastChangedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });
      const out = await computeRiskForUsers([u]);
      expect(out.get('u1')!.score).toBe(0);
    });

    it('adds 20 for a brand-new account with 3+ transactions', async () => {
      mockedPrisma.transaction.groupBy
        .mockResolvedValueOnce([])                                       // 24h
        .mockResolvedValueOnce([])                                       // failed 30d
        .mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 3 } }]); // total
      const u = baseUser({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
      const out = await computeRiskForUsers([u]);
      expect(out.get('u1')!.score).toBe(20);
    });

    it('caps score at 100 even when many rules fire', async () => {
      mockedPrisma.loginHistory.groupBy.mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 5 } }]);
      mockedPrisma.transaction.groupBy
        .mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 50 } }]) // 24h → 25
        .mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 5 } }])  // failed → 10
        .mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 10 } }]); // total tx
      mockedPrisma.subscription.groupBy.mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 1 } }]); // 20
      mockedPrisma.dispute.groupBy.mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 1 } }]);     // 30
      const u = baseUser({
        ibanLastChangedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // +10
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),     // new acct +20
      });
      const out = await computeRiskForUsers([u]);
      // Rule sum is 15+25+10+20+30+10+20=130, capped at 100.
      expect(out.get('u1')!.score).toBe(100);
      expect(out.get('u1')!.bucket).toBe('HIGH_51_PLUS');
    });

    it('crosses into MEDIUM bucket at the 21-50 band', async () => {
      mockedPrisma.subscription.groupBy.mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 1 } }]); // 20
      mockedPrisma.transaction.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 1 } }]) // failed 30d → 10
        .mockResolvedValueOnce([]);
      const u = baseUser({ ibanLastChangedAt: new Date(Date.now() - 12 * 60 * 60 * 1000) }); // +10
      const out = await computeRiskForUsers([u]);
      expect(out.get('u1')!.score).toBe(40);
      expect(out.get('u1')!.bucket).toBe('MEDIUM_21_50');
    });

    it('adds 15 for 3+ flagged receipts in last 30d (spec §7.2 Receipt match)', async () => {
      mockedPrisma.receipt.groupBy.mockResolvedValueOnce([
        { userId: 'u1', _count: { _all: 4 } },
      ]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(15);
      expect(out.get('u1')!.reasons).toContain('3+ flagged receipts / 30d');
    });

    it('does not fire receipt-mismatch rule below threshold', async () => {
      mockedPrisma.receipt.groupBy.mockResolvedValueOnce([
        { userId: 'u1', _count: { _all: 2 } },
      ]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(0);
    });

    it('suppresses NEW_ACCOUNT_HIGH_VELOCITY when HIGH_TX_FREQUENCY_24H already fired', async () => {
      // A new account doing a 24h burst would otherwise double-count the same
      // signal (20 + 25). Only the higher 24h-frequency rule should fire.
      mockedPrisma.transaction.groupBy
        .mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 12 } }]) // 24h ≥10 → 25
        .mockResolvedValueOnce([])                                       // failed 30d
        .mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 12 } }]); // total tx
      const u = baseUser({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
      const out = await computeRiskForUsers([u]);
      expect(out.get('u1')!.score).toBe(25);
      expect(out.get('u1')!.reasons).toContain(`${HIGH_TX_24H_THRESHOLD}+ transactions / 24h`);
      expect(out.get('u1')!.reasons).not.toContain('new account, 3+ transactions');
    });

    it('still fires NEW_ACCOUNT_HIGH_VELOCITY when 24h frequency is below threshold', async () => {
      mockedPrisma.transaction.groupBy
        .mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 5 } }]) // 24h <10 → no points
        .mockResolvedValueOnce([])                                       // failed 30d
        .mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 5 } }]); // total tx ≥3
      const u = baseUser({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
      const out = await computeRiskForUsers([u]);
      expect(out.get('u1')!.score).toBe(20);
      expect(out.get('u1')!.reasons).toContain('new account, 3+ transactions');
    });

    it('keeps separate users in separate buckets', async () => {
      mockedPrisma.dispute.groupBy.mockResolvedValueOnce([
        { userId: 'u2', _count: { _all: 1 } },
      ]);
      const out = await computeRiskForUsers([
        baseUser({ id: 'u1' }),
        baseUser({ id: 'u2' }),
      ]);
      expect(out.get('u1')!.score).toBe(0);
      expect(out.get('u2')!.score).toBe(30);
    });
  });
});
