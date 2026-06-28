/**
 * Test: BC-ADMIN-SPEC-REAUDIT4-CB-MARKCLEARED-GUARD-1
 *
 * Verifies that markCleared() rejects EXPIRED cashback entries (terminal state).
 *
 * SPEC: §1.3 / Part 7 §8.1 rule 2: "Expired is terminal — no transitions out."
 *
 * FINDING: cashbackLifecycle.service.ts:142-188 markCleared() rejected only
 * VOIDED and PAID source states, so EXPIRED→CLEARED was STRUCTURALLY ALLOWED.
 * Today nothing reaches it (approveEntry inlines its own Pending-only transition),
 * but it becomes exploitable the moment markCleared is wired to any other caller.
 *
 * FIX: Add EXPIRED to the terminal-state rejection set in markCleared
 * (reject VOIDED, PAID, AND EXPIRED).
 *
 * TEST: Verify that markCleared on an EXPIRED entry throws the illegal-transition error.
 */

import bcrypt from 'bcrypt';
import { CashbackEntryStatus, WalletTransactionType } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { walletService } from '../../src/services/wallet.service';
import { markCleared } from '../../src/services/cashbackLifecycle.service';

const PASSWORD = 'TestPass123!';

interface TestFixtures {
  userId: string;
  walletId: string;
  expiredEntryId: string;
}

async function createTestFixtures(): Promise<TestFixtures> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Create a test user
  const user = await prisma.user.create({
    data: {
      email: `test-user-expired-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'User',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
      phone: '+359000000000',
    },
  });

  // Create wallet
  const wallet = await walletService.getOrCreateWallet(user.id);

  // Get current wallet balance for transaction tracking
  const balanceBefore = wallet.balance;
  const balanceAfter = balanceBefore + 50;

  // Create a CASHBACK_CREDIT transaction in EXPIRED state
  const expiredEntry = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: WalletTransactionType.CASHBACK_CREDIT,
      amount: 50,
      balanceBefore,
      balanceAfter,
      status: 'COMPLETED',
      cashbackStatus: CashbackEntryStatus.EXPIRED,
      cashbackExpiresAt: new Date(Date.now() - 1000), // Already expired
      description: 'Test expired cashback entry',
    },
  });

  return {
    userId: user.id,
    walletId: wallet.id,
    expiredEntryId: expiredEntry.id,
  };
}

async function cleanupFixtures(userId: string) {
  // Delete all transactions
  await prisma.walletTransaction.deleteMany({ where: { wallet: { userId } } });
  // Delete wallet
  await prisma.wallet.deleteMany({ where: { userId } });
  // Delete user
  await prisma.user.delete({ where: { id: userId } });
}

describe('BC-ADMIN-SPEC-REAUDIT4-CB-MARKCLEARED-GUARD-1: markCleared EXPIRED guard', () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await createTestFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures(fixtures.userId).catch(() => {});
  });

  describe('markCleared() terminal-state guards', () => {
    it('should reject markCleared on an EXPIRED entry', async () => {
      expect.assertions(1);
      try {
        await markCleared({
          walletTransactionId: fixtures.expiredEntryId,
          actorUserId: fixtures.userId,
          reason: 'Test clear attempt',
        });
        fail('Expected markCleared to throw on EXPIRED entry, but it did not');
      } catch (error: any) {
        expect(error.message).toMatch(/EXPIRED is terminal/i);
      }
    });

    it('should reference the spec section (§1.3) in the error message', async () => {
      expect.assertions(1);
      try {
        await markCleared({
          walletTransactionId: fixtures.expiredEntryId,
          actorUserId: fixtures.userId,
        });
        fail('Expected markCleared to throw on EXPIRED entry, but it did not');
      } catch (error: any) {
        expect(error.message).toMatch(/§1\.3/);
      }
    });

    it('should verify EXPIRED status is not cleared on failed attempt', async () => {
      // Attempt to clear the EXPIRED entry
      try {
        await markCleared({
          walletTransactionId: fixtures.expiredEntryId,
          actorUserId: fixtures.userId,
        });
      } catch {
        // Expected to fail
      }

      // Verify the entry is still EXPIRED
      const entry = await prisma.walletTransaction.findUnique({
        where: { id: fixtures.expiredEntryId },
        select: { cashbackStatus: true },
      });

      expect(entry?.cashbackStatus).toBe(CashbackEntryStatus.EXPIRED);
    });
  });
});
