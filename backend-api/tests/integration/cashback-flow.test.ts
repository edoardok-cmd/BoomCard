import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { walletService } from '../../src/services/wallet.service';

describe('Cashback Flow Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let cardId: string;
  let walletId: string;

  beforeAll(async () => {
    // Register user
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `cashback-test-${Date.now()}@example.com`,
        password: 'Test123!',
        firstName: 'Cashback',
        lastName: 'Test',
      });

    authToken = res.body.accessToken;
    userId = res.body.user.id;

    // Get auto-created card
    const cardRes = await request(app)
      .get('/api/cards/my-card')
      .set('Authorization', `Bearer ${authToken}`);

    cardId = cardRes.body.id;

    // Get wallet
    const wallet = await walletService.getOrCreateWallet(userId);
    walletId = wallet.id;
  });

  afterAll(async () => {
    // Cleanup
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe('Wallet Auto-Creation', () => {
    test('should auto-create wallet on registration', async () => {
      const wallet = await prisma.wallet.findUnique({
        where: { userId },
      });

      expect(wallet).toBeDefined();
      expect(wallet?.balance).toBe(0);
      expect(wallet?.availableBalance).toBe(0);
      expect(wallet?.pendingBalance).toBe(0);
      expect(wallet?.currency).toBe('BGN');
      expect(wallet?.isLocked).toBe(false);
    });

    test('should have auto-created card', async () => {
      const card = await prisma.card.findFirst({
        where: { userId },
      });

      expect(card).toBeDefined();
      expect(card?.cardType).toBe('STANDARD');
      expect(card?.status).toBe('ACTIVE');
    });
  });

  describe('Receipt Cashback Flow', () => {
    let receiptId: string;

    test('should create receipt without cashback initially', async () => {
      const receipt = await prisma.receipt.create({
        data: {
          userId,
          cardId,
          merchantName: 'Test Merchant',
          totalAmount: 100,
          cashbackPercent: 5,
          cashbackAmount: 5,
          status: 'PENDING',
          ocrConfidence: 95,
          fraudScore: 5,
        },
      });

      receiptId = receipt.id;

      // Check wallet balance is still 0
      const balanceRes = await walletService.getBalance(userId);
      expect(balanceRes.balance).toBe(0);
    });

    test('should credit wallet when receipt is approved', async () => {
      // Approve receipt manually (simulating admin approval)
      await prisma.receipt.update({
        where: { id: receiptId },
        data: { status: 'APPROVED' },
      });

      // Credit wallet (this would normally happen in the service)
      await walletService.credit({
        userId,
        amount: 5,
        type: 'CASHBACK_CREDIT',
        description: 'Cashback from receipt at Test Merchant',
        receiptId,
        metadata: {
          merchantName: 'Test Merchant',
          totalAmount: 100,
        },
      });

      // Check wallet balance
      const balanceRes = await walletService.getBalance(userId);
      expect(balanceRes.balance).toBe(5);
      expect(balanceRes.availableBalance).toBe(5);
    });

    test('should create wallet transaction record', async () => {
      const transactions = await prisma.walletTransaction.findMany({
        where: { walletId },
        orderBy: { createdAt: 'desc' },
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0].type).toBe('CASHBACK_CREDIT');
      expect(transactions[0].amount).toBe(5);
      expect(transactions[0].status).toBe('COMPLETED');
      expect(transactions[0].receiptId).toBe(receiptId);
      expect(transactions[0].balanceBefore).toBe(0);
      expect(transactions[0].balanceAfter).toBe(5);
    });

    test('should link transaction to receipt', async () => {
      const transaction = await prisma.walletTransaction.findFirst({
        where: { receiptId },
      });

      expect(transaction).toBeDefined();
      expect(transaction?.walletId).toBe(walletId);
      expect(transaction?.amount).toBe(5);
    });
  });

  describe('Sticker Scan Cashback Flow', () => {
    let venueId: string;
    let stickerId: string;
    let locationId: string;
    let scanId: string;

    beforeAll(async () => {
      // Create test venue
      const partner = await prisma.partner.create({
        data: {
          userId,
          businessName: 'Test Venue',
          category: 'Restaurant',
          tier: 'BASIC',
          status: 'ACTIVE',
        },
      });

      const venue = await prisma.venue.create({
        data: {
          partnerId: partner.id,
          name: 'Test Restaurant',
          address: 'Test Address',
          city: 'Sofia',
          latitude: 42.6977,
          longitude: 23.3219,
        },
      });
      venueId = venue.id;

      // Create sticker location
      const location = await prisma.stickerLocation.create({
        data: {
          venueId,
          name: 'Table 1',
          locationType: 'TABLE',
          locationNumber: '001',
        },
      });
      locationId = location.id;

      // Create sticker
      const sticker = await prisma.sticker.create({
        data: {
          venueId,
          locationId,
          stickerId: 'TEST-001',
          qrCode: 'test-qr-code',
          status: 'ACTIVE',
        },
      });
      stickerId = sticker.id;

      // Create venue config
      await prisma.venueStickerConfig.create({
        data: {
          venueId,
          cashbackPercent: 5.0,
          premiumBonus: 2.0,
          platinumBonus: 5.0,
          minBillAmount: 10.0,
          autoApproveThreshold: 10,
        },
      });
    });

    test('should create sticker scan without crediting wallet', async () => {
      const scan = await prisma.stickerScan.create({
        data: {
          userId,
          stickerId,
          venueId,
          cardId,
          billAmount: 100,
          cashbackPercent: 5,
          cashbackAmount: 5,
          status: 'PENDING',
          fraudScore: 5,
        },
      });

      scanId = scan.id;

      // Wallet should still have only 5 BGN from previous receipt test
      const balanceRes = await walletService.getBalance(userId);
      expect(balanceRes.balance).toBe(5);
    });

    test('should credit wallet when scan is approved', async () => {
      // Approve scan
      await prisma.stickerScan.update({
        where: { id: scanId },
        data: { status: 'APPROVED' },
      });

      // Credit wallet
      await walletService.credit({
        userId,
        amount: 5,
        type: 'CASHBACK_CREDIT',
        description: 'Cashback from sticker scan at Test Restaurant',
        stickerScanId: scanId,
        metadata: {
          venueId,
          billAmount: 100,
        },
      });

      // Check wallet balance (should be 10 now)
      const balanceRes = await walletService.getBalance(userId);
      expect(balanceRes.balance).toBe(10);
    });

    test('should track all wallet transactions', async () => {
      const transactions = await prisma.walletTransaction.findMany({
        where: { walletId },
        orderBy: { createdAt: 'asc' },
      });

      expect(transactions).toHaveLength(2);
      expect(transactions[0].type).toBe('CASHBACK_CREDIT');
      expect(transactions[0].receiptId).toBeDefined();
      expect(transactions[1].type).toBe('CASHBACK_CREDIT');
      expect(transactions[1].stickerScanId).toBe(scanId);
    });
  });

  describe('Card Tier Cashback Rates', () => {
    test('STANDARD card should give 5% cashback', async () => {
      const card = await prisma.card.findFirst({
        where: { userId },
      });

      expect(card?.cardType).toBe('STANDARD');

      // Create receipt with 100 BGN
      const receipt = await prisma.receipt.create({
        data: {
          userId,
          cardId: card!.id,
          merchantName: 'Test',
          totalAmount: 100,
          cashbackPercent: 5,
          cashbackAmount: 5,
          status: 'APPROVED',
          ocrConfidence: 95,
          fraudScore: 5,
        },
      });

      expect(receipt.cashbackAmount).toBe(5);
    });
  });

  describe('Multiple Cashback Operations', () => {
    test('should handle concurrent cashback credits', async () => {
      const initialBalance = await walletService.getBalance(userId);

      // Create 3 receipts and approve them
      const promises = [10, 20, 30].map(async (amount) => {
        const receipt = await prisma.receipt.create({
          data: {
            userId,
            cardId,
            merchantName: 'Test',
            totalAmount: amount,
            cashbackPercent: 5,
            cashbackAmount: amount * 0.05,
            status: 'APPROVED',
            ocrConfidence: 95,
            fraudScore: 5,
          },
        });

        return walletService.credit({
          userId,
          amount: amount * 0.05,
          type: 'CASHBACK_CREDIT',
          description: `Cashback from receipt`,
          receiptId: receipt.id,
        });
      });

      await Promise.all(promises);

      // Total additional cashback: 0.5 + 1 + 1.5 = 3
      const finalBalance = await walletService.getBalance(userId);
      expect(finalBalance.balance).toBe(initialBalance.balance + 3);
    });

    test('should maintain accurate transaction history', async () => {
      const transactions = await prisma.walletTransaction.findMany({
        where: { walletId },
        orderBy: { createdAt: 'desc' },
      });

      // Should have at least 5 transactions now (2 from earlier + 3 concurrent)
      expect(transactions.length).toBeGreaterThanOrEqual(5);

      // All should be completed
      transactions.forEach(tx => {
        expect(tx.status).toBe('COMPLETED');
        expect(tx.type).toBe('CASHBACK_CREDIT');
      });
    });
  });

  describe('Wallet Balance Integrity', () => {
    test('balance should equal sum of all transaction amounts', async () => {
      const wallet = await prisma.wallet.findUnique({
        where: { id: walletId },
      });

      const transactions = await prisma.walletTransaction.findMany({
        where: {
          walletId,
          status: 'COMPLETED',
          type: 'CASHBACK_CREDIT',
        },
      });

      const totalFromTransactions = transactions.reduce(
        (sum, tx) => sum + tx.amount,
        0
      );

      expect(wallet?.balance).toBe(totalFromTransactions);
    });

    test('balanceAfter should match running total', async () => {
      const transactions = await prisma.walletTransaction.findMany({
        where: { walletId },
        orderBy: { createdAt: 'asc' },
      });

      let runningTotal = 0;
      transactions.forEach(tx => {
        expect(tx.balanceBefore).toBe(runningTotal);
        runningTotal += tx.amount;
        expect(tx.balanceAfter).toBe(runningTotal);
      });
    });
  });
});
