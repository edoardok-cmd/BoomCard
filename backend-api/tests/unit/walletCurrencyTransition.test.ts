/**
 * Unit Tests: Wallet Currency Transition Window
 *
 * BC-ADMIN-SPEC-REAUDIT2-CURRENCY-WALLET-SCALAR-2
 *
 * Verifies that walletService.getBalance() honors the currency transition window
 * and returns EUR-only amounts when the window is closed.
 */

import { prisma } from '../../src/lib/prisma';
import { walletService } from '../../src/services/wallet.service';
import { invalidateCurrencyDisplayCache, bgnToEur } from '../../src/utils/currencyDisplay';
import { EUR_TO_BGN_RATE } from '../../src/constants/receipt.constants';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

describe('Wallet Currency Transition Window (BC-ADMIN-SPEC-REAUDIT2-CURRENCY-WALLET-SCALAR-2)', () => {
  let userId: string;

  beforeAll(async () => {
    // Create a test user using the helper
    const testData = await createTestUser();
    userId = testData.user.id;
  });

  afterAll(async () => {
    // Cleanup
    await cleanupTestUser(userId);
  });

  /**
   * Helper to set the currency transition window setting
   */
  async function setCurrencyTransitionWindowOpen(isOpen: boolean) {
    const value = isOpen ? 'true' : 'false';
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      update: { value },
      create: { key: 'currency_transition_window_open', value },
    });
    // Invalidate cache so it picks up the new value
    invalidateCurrencyDisplayCache();
    // Give cache invalidation a moment to settle
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  describe('getBalance() with Transition Window CLOSED', () => {
    it('should return EUR-only amounts when transition window is CLOSED', async () => {
      // Seed wallet with known BGN amount
      await walletService.credit({
        userId,
        amount: 100.0,
        type: 'CASHBACK_CREDIT',
      });

      // Set transition window to CLOSED
      await setCurrencyTransitionWindowOpen(false);

      const balance = await walletService.getBalance(userId);

      // AC1: currency should be EUR when window is closed
      expect(balance.currency).toBe('EUR');

      // AC2: Top-level balance should be EUR-denominated
      const expectedBalanceEUR = bgnToEur(100.0);
      expect(balance.balance).toBe(expectedBalanceEUR);
      expect(balance.availableBalance).toBe(expectedBalanceEUR);

      // AC3: Should NOT have any BGN-denominated scalar fields
      expect(balance.balanceBGN).toBeUndefined();
      expect(balance.availableBalanceBGN).toBeUndefined();

      // AC4: Should have EUR fields
      expect(balance.balanceEUR).toBe(expectedBalanceEUR);
      expect(balance.availableBalanceEUR).toBe(expectedBalanceEUR);
    });

    it('should return dual-currency amounts when transition window is OPEN', async () => {
      // Clear the wallet first
      await prisma.walletTransaction.deleteMany({ where: { wallet: { userId } } });
      await prisma.wallet.update({
        where: { userId },
        data: { balance: 0, availableBalance: 0 },
      });

      // Seed wallet with known BGN amount
      await walletService.credit({
        userId,
        amount: 100.0,
        type: 'CASHBACK_CREDIT',
      });

      // Set transition window to OPEN
      await setCurrencyTransitionWindowOpen(true);

      const balance = await walletService.getBalance(userId);

      // When window is OPEN, currency should still be BGN
      expect(balance.currency).toBe('BGN');

      // Should have BGN fields during open window
      expect(balance.balance).toBe(100.0);
      expect(balance.availableBalance).toBe(100.0);
      expect(balance.balanceBGN).toBe(100.0);
      expect(balance.availableBalanceBGN).toBe(100.0);

      // Should also have EUR fields
      const expectedBalanceEUR = bgnToEur(100.0);
      expect(balance.balanceEUR).toBe(expectedBalanceEUR);
      expect(balance.availableBalanceEUR).toBe(expectedBalanceEUR);
    });

    it('should not include pending/expiring BGN fields when window is CLOSED', async () => {
      // Clear wallet
      await prisma.walletTransaction.deleteMany({ where: { wallet: { userId } } });
      await prisma.wallet.update({
        where: { userId },
        data: { balance: 0, availableBalance: 0 },
      });

      // Set window to CLOSED first
      await setCurrencyTransitionWindowOpen(false);

      const balance = await walletService.getBalance(userId);

      // Should NOT have pending/expiring BGN fields
      expect(balance.pendingBalanceBGN).toBeUndefined();
      expect(balance.expiringBalanceBGN).toBeUndefined();

      // Should still have EUR versions for consistency
      expect(balance.pendingBalanceEUR).toBeDefined();
      expect(balance.expiringBalanceEUR).toBeDefined();

      // AC2 (Acceptance Criterion 2): Verify top-level fields equal their EUR equivalents when window is closed
      expect(balance.pendingBalance).toBe(balance.pendingBalanceEUR);
      expect(balance.expiringBalance).toBe(balance.expiringBalanceEUR);
    });

    it('should include pending/expiring in both currencies when window is OPEN', async () => {
      // Set window to OPEN
      await setCurrencyTransitionWindowOpen(true);

      const balance = await walletService.getBalance(userId);

      // When window is OPEN, should have pending/expiring in both currencies
      expect(balance.pendingBalanceBGN).toBeDefined();
      expect(balance.expiringBalanceBGN).toBeDefined();
      expect(balance.pendingBalanceEUR).toBeDefined();
      expect(balance.expiringBalanceEUR).toBeDefined();
    });

    it('should return payoutThreshold in EUR when window is CLOSED', async () => {
      // Set window to CLOSED
      await setCurrencyTransitionWindowOpen(false);

      const balance = await walletService.getBalance(userId);

      // When window is CLOSED, top-level payoutThreshold should be EUR
      // and should equal payoutThresholdEUR
      expect(balance.payoutThreshold).toBeDefined();
      expect(balance.payoutThresholdEUR).toBeDefined();
      expect(balance.payoutThreshold).toBe(balance.payoutThresholdEUR);
    });

    it('should return payoutThreshold in BGN when window is OPEN', async () => {
      // Set window to OPEN
      await setCurrencyTransitionWindowOpen(true);

      const balance = await walletService.getBalance(userId);

      // When window is OPEN, top-level payoutThreshold should be BGN
      // and should NOT equal payoutThresholdEUR
      expect(balance.payoutThreshold).toBeDefined();
      expect(balance.payoutThresholdEUR).toBeDefined();

      // Should be different (one is BGN, one is EUR)
      const expectedThresholdBGN = balance.payoutThreshold;
      const expectedThresholdEUR = bgnToEur(expectedThresholdBGN);
      expect(balance.payoutThresholdEUR).toBe(expectedThresholdEUR);
    });
  });
});
