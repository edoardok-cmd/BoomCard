/**
 * Tests for recordRejectedAsVoided (Spec §8.1 rule 6 + §1.3 — controlled void vocabulary)
 *
 * §8.1 rule 6 + §1.3 require every Voided cashback record to carry a controlled
 * void-reason CATEGORY (DUPLICATE | FRAUD | SYSTEM_ERROR | ADMIN_CORRECTION |
 * PARTNER_DISPUTE | OTHER). The sticker-reject caller pre-normalizes, but the
 * receipt-reject caller (receipt.service.ts) passes raw free-text. The guarantee
 * must therefore hold INSIDE recordRejectedAsVoided regardless of caller.
 *
 * These tests pin the contract:
 *   1. Raw free-text (e.g. a Bulgarian rejection message) is prefixed with the
 *      neutral default category OTHER — NOT FRAUD (voided reasons are
 *      user-visible per §8.1 rule 6, so an un-categorized rejection must not
 *      become an unwarranted fraud accusation).
 *   2. A reason already carrying a canonical category prefix is preserved.
 *   3. The persisted voidedReason always passes assertVoidReasonCategory.
 */

// ── Captured created row ────────────────────────────────────────────────────

let createdData: any = null;

jest.mock('../../src/lib/prisma', () => {
  const client = {
    wallet: {
      findUnique: jest.fn(async () => ({ id: 'wallet-1', userId: 'user-1', balance: 0, availableBalance: 0 })),
      create: jest.fn(async () => ({ id: 'wallet-1', userId: 'user-1', balance: 0, availableBalance: 0 })),
    },
    walletTransaction: {
      create: jest.fn(async (args: any) => {
        createdData = args.data;
        return { id: 'wt-ghost-1', ...args.data };
      }),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => undefined),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingInt: jest.fn(async (_key: string, fallback: number) => fallback),
}));

// ── Imports ─────────────────────────────────────────────────────────────────

import {
  recordRejectedAsVoided,
  assertVoidReasonCategory,
  VOID_REASON_CATEGORIES,
} from '../../src/services/cashbackLifecycle.service';

const categoryOf = (reason: string) => reason.split(':')[0].trim().toUpperCase();

describe('recordRejectedAsVoided — controlled void vocabulary (§8.1 rule 6 + §1.3)', () => {
  beforeEach(() => {
    createdData = null;
    jest.clearAllMocks();
  });

  it('prefixes raw free-text (receipt-reject path) with the neutral OTHER category', async () => {
    const raw = 'Касовата бележка не премина проверката';
    await recordRejectedAsVoided({
      userId: 'user-1',
      amount: 5,
      reason: raw,
      actorUserId: null,
      receiptId: 'rcpt-1',
    });

    expect(createdData).not.toBeNull();
    expect(createdData.voidedReason).toBe(`OTHER: ${raw}`);
    // The stored category is controlled, and it is NOT a fraud accusation.
    expect(categoryOf(createdData.voidedReason)).toBe('OTHER');
    expect(categoryOf(createdData.voidedReason)).not.toBe('FRAUD');
    // Whatever was stored must pass the canonical guard.
    expect(() => assertVoidReasonCategory(createdData.voidedReason)).not.toThrow();
    expect(VOID_REASON_CATEGORIES as readonly string[]).toContain(categoryOf(createdData.voidedReason));
  });

  it('preserves a reason that already carries a canonical category prefix', async () => {
    await recordRejectedAsVoided({
      userId: 'user-1',
      amount: 5,
      reason: 'DUPLICATE: receipt was already approved',
      actorUserId: 'admin-1',
      receiptId: 'rcpt-2',
    });

    expect(createdData.voidedReason).toBe('DUPLICATE: receipt was already approved');
    expect(() => assertVoidReasonCategory(createdData.voidedReason)).not.toThrow();
  });

  it('normalizes empty / whitespace reason to a controlled OTHER category', async () => {
    await recordRejectedAsVoided({
      userId: 'user-1',
      amount: 5,
      reason: '   ',
      actorUserId: null,
      receiptId: 'rcpt-3',
    });

    expect(categoryOf(createdData.voidedReason)).toBe('OTHER');
    expect(() => assertVoidReasonCategory(createdData.voidedReason)).not.toThrow();
  });
});
