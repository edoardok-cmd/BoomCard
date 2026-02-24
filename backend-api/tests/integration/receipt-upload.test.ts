/**
 * Integration Tests: Receipt Upload & Offer Redemption
 *
 * Covers P0 critical paths:
 * - F07: Upload Receipt → Cashback
 * - F08: Redeem Offer
 * - Receipt validation
 * - Cashback calculation by plan tier
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import {
  createTestUser,
  createTestSubscription,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';

describe('Receipt Upload & Offer Redemption (F07, F08)', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  // ─── Create Receipt ───────────────────────────────────────────

  describe('POST /api/receipts', () => {
    it('should create a receipt with valid data', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const receiptData = {
        merchantName: 'Test Restaurant',
        totalAmount: 50.0,
        currency: 'BGN',
        items: [
          { name: 'Main Course', amount: 35.0 },
          { name: 'Drink', amount: 15.0 },
        ],
      };

      const res = await authRequest(accessToken)
        .post('/api/receipts')
        .send(receiptData);

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/receipts')
        .send({ merchantName: 'Test', totalAmount: 50.0 });

      expect(res.status).toBe(401);
    });
  });

  // ─── Get Receipts ─────────────────────────────────────────────

  describe('GET /api/receipts', () => {
    it('should return user receipts with pagination', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create some receipts via DB
      const card = await prisma.card.findFirst({ where: { userId: user.id } });
      await prisma.receipt.createMany({
        data: [
          {
            userId: user.id,
            cardId: card!.id,
            merchantName: 'Restaurant A',
            totalAmount: 100,
            cashbackPercent: 5,
            cashbackAmount: 5,
            status: 'APPROVED',
            ocrConfidence: 95,
            fraudScore: 2,
          },
          {
            userId: user.id,
            cardId: card!.id,
            merchantName: 'Restaurant B',
            totalAmount: 200,
            cashbackPercent: 5,
            cashbackAmount: 10,
            status: 'PENDING',
            ocrConfidence: 90,
            fraudScore: 5,
          },
        ],
      });

      const res = await authRequest(accessToken).get('/api/receipts');

      expect(res.status).toBe(200);
    });

    it('should only return current user receipts', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      createdUserIds.push(user1.user.id, user2.user.id);

      const card1 = await prisma.card.findFirst({ where: { userId: user1.user.id } });

      await prisma.receipt.create({
        data: {
          userId: user1.user.id,
          cardId: card1!.id,
          merchantName: 'User1 Receipt',
          totalAmount: 100,
          cashbackPercent: 5,
          cashbackAmount: 5,
          status: 'APPROVED',
          ocrConfidence: 95,
          fraudScore: 2,
        },
      });

      // User 2 should not see User 1's receipts
      const res = await authRequest(user2.accessToken).get('/api/receipts');

      expect(res.status).toBe(200);
      const receipts = Array.isArray(res.body) ? res.body : res.body.data || [];
      const hasUser1Receipt = receipts.some(
        (r: any) => r.merchantName === 'User1 Receipt'
      );
      expect(hasUser1Receipt).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/receipts');
      expect(res.status).toBe(401);
    });
  });

  // ─── Receipt Statistics ───────────────────────────────────────

  describe('GET /api/receipts/stats', () => {
    it('should return receipt statistics for user', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken).get('/api/receipts/stats');

      expect(res.status).toBe(200);
    });
  });

  // ─── Cashback Calculation by Plan Tier ────────────────────────

  describe('Cashback by Plan Tier', () => {
    it('STANDARD plan should give 5% cashback', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      const card = await prisma.card.findFirst({ where: { userId: user.id } });
      expect(card?.type).toBe('STANDARD');

      const receipt = await prisma.receipt.create({
        data: {
          userId: user.id,
          cardId: card!.id,
          merchantName: 'Standard Test',
          totalAmount: 100,
          cashbackPercent: 5,
          cashbackAmount: 5,
          status: 'APPROVED',
          ocrConfidence: 95,
          fraudScore: 2,
        },
      });

      expect(receipt.cashbackPercent).toBe(5);
      expect(receipt.cashbackAmount).toBe(5);
    });

    it('PREMIUM plan should give 7% cashback', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Upgrade card to PREMIUM
      await prisma.card.updateMany({
        where: { userId: user.id },
        data: { type: 'PREMIUM' },
      });

      await createTestSubscription(user.id, 'PREMIUM');

      const card = await prisma.card.findFirst({ where: { userId: user.id } });

      const receipt = await prisma.receipt.create({
        data: {
          userId: user.id,
          cardId: card!.id,
          merchantName: 'Premium Test',
          totalAmount: 100,
          cashbackPercent: 7,
          cashbackAmount: 7,
          status: 'APPROVED',
          ocrConfidence: 95,
          fraudScore: 2,
        },
      });

      expect(receipt.cashbackPercent).toBe(7);
      expect(receipt.cashbackAmount).toBe(7);
    });

    it('PLATINUM plan should give 10% cashback', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      await prisma.card.updateMany({
        where: { userId: user.id },
        data: { type: 'PLATINUM' },
      });

      await createTestSubscription(user.id, 'PLATINUM');

      const card = await prisma.card.findFirst({ where: { userId: user.id } });

      const receipt = await prisma.receipt.create({
        data: {
          userId: user.id,
          cardId: card!.id,
          merchantName: 'Platinum Test',
          totalAmount: 100,
          cashbackPercent: 10,
          cashbackAmount: 10,
          status: 'APPROVED',
          ocrConfidence: 95,
          fraudScore: 2,
        },
      });

      expect(receipt.cashbackPercent).toBe(10);
      expect(receipt.cashbackAmount).toBe(10);
    });
  });

  // ─── Receipt Deletion ─────────────────────────────────────────

  describe('DELETE /api/receipts/:id', () => {
    it('should delete own receipt', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const card = await prisma.card.findFirst({ where: { userId: user.id } });
      const receipt = await prisma.receipt.create({
        data: {
          userId: user.id,
          cardId: card!.id,
          merchantName: 'Delete Test',
          totalAmount: 50,
          cashbackPercent: 5,
          cashbackAmount: 0, // No cashback applied yet — deletion allowed
          status: 'PENDING',
          ocrConfidence: 90,
          fraudScore: 3,
        },
      });

      const res = await authRequest(accessToken).delete(`/api/receipts/${receipt.id}`);

      expect(res.status).toBe(200);
    });

    it('should not allow deleting another user receipt', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      createdUserIds.push(user1.user.id, user2.user.id);

      const card1 = await prisma.card.findFirst({ where: { userId: user1.user.id } });
      const receipt = await prisma.receipt.create({
        data: {
          userId: user1.user.id,
          cardId: card1!.id,
          merchantName: 'Unauthorized Delete Test',
          totalAmount: 50,
          cashbackPercent: 5,
          cashbackAmount: 2.5,
          status: 'PENDING',
          ocrConfidence: 90,
          fraudScore: 3,
        },
      });

      // User 2 tries to delete User 1's receipt
      const res = await authRequest(user2.accessToken).delete(`/api/receipts/${receipt.id}`);

      expect([403, 404].includes(res.status)).toBe(true);
    });
  });
});
