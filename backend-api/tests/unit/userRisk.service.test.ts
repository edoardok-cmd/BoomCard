/**
 * Unit tests for the canonical five-signal risk scorer (spec §2.1).
 * Mocks Prisma to verify each spec signal contributes its additive weight
 * and that bucketing matches the spec thresholds (0–20 Low, 21–50 Medium, 51+ High).
 *
 * BC-CASHBACK-RISK FIX 2: these expectations were rewritten from the previous
 * (non-spec) signal set — failed logins / tx-frequency / disputes / dunning /
 * new-account velocity / receipt fraudScore roll-up — to the spec §2.1 canonical
 * five: IBAN-24h (+40), receipt confidence <60% (+30), QR location mismatch (+20),
 * 3+ Voided records (+20), partner active risk flag (+10).
 */

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    receipt:           { groupBy: jest.fn() },
    stickerScan:       { groupBy: jest.fn(), findMany: jest.fn() },
    walletTransaction: { groupBy: jest.fn(), findMany: jest.fn() },
    wallet:            { findMany: jest.fn() },
    user:              { findMany: jest.fn(), updateMany: jest.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { computeRiskForUsers, persistRiskAssessments, bucketFor, RiskAssessment } from '../../src/services/userRisk.service';

const mockedPrisma = prisma as unknown as {
  receipt:           { groupBy: jest.Mock };
  stickerScan:       { groupBy: jest.Mock; findMany: jest.Mock };
  walletTransaction: { groupBy: jest.Mock; findMany: jest.Mock };
  wallet:            { findMany: jest.Mock };
  user:              { findMany: jest.Mock; updateMany: jest.Mock };
};

const NONE = () => Promise.resolve([]);

function setBaselineMocks() {
  mockedPrisma.receipt.groupBy.mockImplementation(NONE);
  mockedPrisma.stickerScan.groupBy.mockImplementation(NONE);
  mockedPrisma.stickerScan.findMany.mockImplementation(NONE);
  mockedPrisma.walletTransaction.groupBy.mockImplementation(NONE);
  mockedPrisma.walletTransaction.findMany.mockImplementation(NONE);
  mockedPrisma.wallet.findMany.mockImplementation(NONE);
  mockedPrisma.user.findMany.mockImplementation(NONE);
  mockedPrisma.user.updateMany.mockImplementation(() => Promise.resolve({ count: 1 }));
}

const baseUser = (overrides: Partial<{ id: string; ibanLastChangedAt: Date | null }> = {}) => ({
  id: overrides.id ?? 'u1',
  ibanLastChangedAt: overrides.ibanLastChangedAt ?? null,
});

describe('userRisk.service (spec §2.1 canonical five signals)', () => {
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
      expect(mockedPrisma.receipt.groupBy).not.toHaveBeenCalled();
      expect(mockedPrisma.stickerScan.groupBy).not.toHaveBeenCalled();
    });

    // Signal 1 — IBAN changed in last 24h → +40
    it('adds 40 for an IBAN change within 24h', async () => {
      const u = baseUser({ ibanLastChangedAt: new Date(Date.now() - 12 * 60 * 60 * 1000) });
      const out = await computeRiskForUsers([u]);
      expect(out.get('u1')!.score).toBe(40);
      expect(out.get('u1')!.bucket).toBe('MEDIUM_21_50');
      expect(out.get('u1')!.reasons).toContain('IBAN changed / 24h');
    });

    it('does not fire the IBAN signal for a change older than 24h', async () => {
      const u = baseUser({ ibanLastChangedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) });
      const out = await computeRiskForUsers([u]);
      expect(out.get('u1')!.score).toBe(0);
    });

    // Signal 2 — receipt match confidence < 60% → +30
    it('adds 30 for a recent low-confidence receipt', async () => {
      mockedPrisma.receipt.groupBy.mockResolvedValueOnce([
        { userId: 'u1', _count: { _all: 1 } },
      ]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(30);
      expect(out.get('u1')!.reasons).toContain('receipt match confidence < 60%');
    });

    // Signal 3 — QR location mismatch → +20
    it('adds 20 for a recent QR location-mismatch scan', async () => {
      mockedPrisma.stickerScan.groupBy.mockResolvedValueOnce([
        { userId: 'u1', _count: { _all: 2 } },
      ]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(20);
      expect(out.get('u1')!.reasons).toContain('QR location mismatch');
    });

    // Signal 4 — 3+ Voided records → +20
    it('adds 20 for a user with 3+ voided cashback records', async () => {
      mockedPrisma.walletTransaction.groupBy.mockResolvedValueOnce([
        { walletId: 'w1', _count: { _all: 3 } },
      ]);
      mockedPrisma.wallet.findMany.mockResolvedValueOnce([{ id: 'w1', userId: 'u1' }]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(20);
      expect(out.get('u1')!.reasons).toContain('3+ voided cashback records');
    });

    it('does not fire the voided signal below 3 records', async () => {
      mockedPrisma.walletTransaction.groupBy.mockResolvedValueOnce([
        { walletId: 'w1', _count: { _all: 2 } },
      ]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(0);
      expect(mockedPrisma.wallet.findMany).not.toHaveBeenCalled();
    });

    // Signal 5 — partner active risk flag → +10
    it('adds 10 when the user scanned at a partner with an active risk flag', async () => {
      mockedPrisma.stickerScan.findMany.mockResolvedValueOnce([{ userId: 'u1' }]);
      const out = await computeRiskForUsers([baseUser()]);
      expect(out.get('u1')!.score).toBe(10);
      expect(out.get('u1')!.reasons).toContain('partner has active risk flag');
    });

    it('crosses into HIGH when enough signals stack (40 + 20 = 60)', async () => {
      mockedPrisma.stickerScan.groupBy.mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 1 } }]); // +20
      const u = baseUser({ ibanLastChangedAt: new Date(Date.now() - 1 * 60 * 60 * 1000) });           // +40
      const out = await computeRiskForUsers([u]);
      expect(out.get('u1')!.score).toBe(60);
      expect(out.get('u1')!.bucket).toBe('HIGH_51_PLUS');
    });

    it('caps the score at 100 when every signal fires (sum 120)', async () => {
      mockedPrisma.receipt.groupBy.mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 1 } }]);          // +30
      mockedPrisma.stickerScan.groupBy.mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 1 } }]);      // +20
      mockedPrisma.walletTransaction.groupBy.mockResolvedValueOnce([{ walletId: 'w1', _count: { _all: 5 } }]); // +20
      mockedPrisma.wallet.findMany.mockResolvedValueOnce([{ id: 'w1', userId: 'u1' }]);
      mockedPrisma.stickerScan.findMany.mockResolvedValueOnce([{ userId: 'u1' }]);                          // +10
      const u = baseUser({ ibanLastChangedAt: new Date(Date.now() - 1 * 60 * 60 * 1000) });                // +40
      const out = await computeRiskForUsers([u]);
      // 40 + 30 + 20 + 20 + 10 = 120, capped at 100.
      expect(out.get('u1')!.score).toBe(100);
      expect(out.get('u1')!.bucket).toBe('HIGH_51_PLUS');
    });

    it('keeps separate users in separate buckets', async () => {
      mockedPrisma.stickerScan.findMany.mockResolvedValueOnce([{ userId: 'u2' }]); // +10 for u2 only
      const out = await computeRiskForUsers([
        baseUser({ id: 'u1' }),
        baseUser({ id: 'u2' }),
      ]);
      expect(out.get('u1')!.score).toBe(0);
      expect(out.get('u2')!.score).toBe(10);
    });
  });

  // M1 (BC-ADMIN-USERMGMT-SPEC-FIX) — admin manual risk edits must be durable:
  // persistRiskAssessments skips users flagged with riskOverriddenAt so the
  // behaviour recompute never clobbers a manually-edited score/bucket.
  describe('persistRiskAssessments — admin override durability', () => {
    const assess = (userId: string, score: number): RiskAssessment => ({
      userId, score, bucket: bucketFor(score), reasons: [],
    });

    it('skips updating users whose riskOverriddenAt is set', async () => {
      // u1 is admin-overridden; u2 is not.
      mockedPrisma.user.findMany.mockResolvedValueOnce([{ id: 'u1' }]);
      await persistRiskAssessments([assess('u1', 5), assess('u2', 5)]);

      const updatedIds = mockedPrisma.user.updateMany.mock.calls.map((c) => c[0].where.id);
      expect(updatedIds).toContain('u2');
      expect(updatedIds).not.toContain('u1');
    });

    it('updates all users when none are overridden', async () => {
      mockedPrisma.user.findMany.mockResolvedValueOnce([]);
      await persistRiskAssessments([assess('u1', 5), assess('u2', 30)]);

      const updatedIds = mockedPrisma.user.updateMany.mock.calls.map((c) => c[0].where.id);
      expect(updatedIds).toEqual(expect.arrayContaining(['u1', 'u2']));
    });

    it('preserves the RISK_HOLD floor (61/HIGH) for non-overridden users with an open hold', async () => {
      // u1 has an open RISK_HOLD payout and a low live score → floored to 61/HIGH.
      mockedPrisma.user.findMany.mockResolvedValueOnce([]); // no overrides
      mockedPrisma.walletTransaction.findMany.mockResolvedValueOnce([{ wallet: { userId: 'u1' } }]);
      await persistRiskAssessments([assess('u1', 10)]);

      const call = mockedPrisma.user.updateMany.mock.calls.find((c) => c[0].where.id === 'u1');
      expect(call?.[0].data).toEqual({ riskScore: 61, riskBucket: 'HIGH_51_PLUS' });
    });

    it('does NOT apply the RISK_HOLD floor to an overridden user (override wins)', async () => {
      // u1 is overridden AND has an open hold — it must be filtered out entirely,
      // so no floor write happens and the stored manual value is left untouched.
      mockedPrisma.user.findMany.mockResolvedValueOnce([{ id: 'u1' }]);
      mockedPrisma.walletTransaction.findMany.mockResolvedValueOnce([{ wallet: { userId: 'u1' } }]);
      await persistRiskAssessments([assess('u1', 10)]);

      const updatedIds = mockedPrisma.user.updateMany.mock.calls.map((c) => c[0].where.id);
      expect(updatedIds).not.toContain('u1');
    });
  });
});
