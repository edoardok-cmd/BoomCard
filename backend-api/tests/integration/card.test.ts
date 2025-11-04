import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';

describe('Card API Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let cardId: string;

  beforeAll(async () => {
    // Register user
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `card-test-${Date.now()}@example.com`,
        password: 'Test123!',
        firstName: 'Card',
        lastName: 'Test',
      });

    authToken = res.body.accessToken;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    // Cleanup
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe('POST /api/cards', () => {
    test('should auto-create STANDARD card on registration', async () => {
      const res = await request(app)
        .get('/api/cards/my-card')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('cardNumber');
      expect(res.body).toHaveProperty('qrCode');
      expect(res.body.cardType).toBe('STANDARD');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.benefits).toBeDefined();
      expect(res.body.benefits.cashbackRate).toBe(0.05);

      cardId = res.body.id;
    });

    test('should reject creating duplicate card', async () => {
      const res = await request(app)
        .post('/api/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cardType: 'STANDARD' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already has a card');
    });

    test('should generate valid card number format', async () => {
      const res = await request(app)
        .get('/api/cards/my-card')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.body.cardNumber).toMatch(/^BOOM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    test('should generate valid QR code', async () => {
      const res = await request(app)
        .get('/api/cards/my-card')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('GET /api/cards/my-card', () => {
    test('should return card with benefits', async () => {
      const res = await request(app)
        .get('/api/cards/my-card')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(cardId);
      expect(res.body.benefits).toEqual({
        cashbackRate: 0.05,
        bonusCashback: 0,
        features: expect.arrayContaining([
          '5% cashback on receipts',
          'Standard QR code',
          'Basic rewards',
        ]),
      });
    });

    test('should require authentication', async () => {
      const res = await request(app)
        .get('/api/cards/my-card');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/cards/benefits', () => {
    test('should return all tier benefits', async () => {
      const res = await request(app)
        .get('/api/cards/benefits')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.tiers).toHaveLength(3);
      expect(res.body.tiers[0].tier).toBe('STANDARD');
      expect(res.body.tiers[1].tier).toBe('PREMIUM');
      expect(res.body.tiers[2].tier).toBe('PLATINUM');
      expect(res.body.tiers[2].cashbackRate).toBe(0.10);
    });
  });

  describe('POST /api/cards/:id/upgrade', () => {
    test('should reject upgrade without subscription', async () => {
      const res = await request(app)
        .post(`/api/cards/${cardId}/upgrade`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ newTier: 'PREMIUM' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('subscription');
    });

    test('should reject downgrade', async () => {
      // First upgrade to PREMIUM (skip subscription check in test)
      // This test validates tier order logic
      const res = await request(app)
        .post(`/api/cards/${cardId}/upgrade`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ newTier: 'STANDARD' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('higher tier');
    });
  });

  describe('POST /api/cards/:id/deactivate', () => {
    test('should deactivate card', async () => {
      const res = await request(app)
        .post(`/api/cards/${cardId}/deactivate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'Test deactivation' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SUSPENDED');
      expect(res.body.blockedReason).toBe('Test deactivation');
      expect(res.body.blockedAt).toBeDefined();
    });
  });

  describe('POST /api/cards/:id/activate', () => {
    test('should reactivate card', async () => {
      const res = await request(app)
        .post(`/api/cards/${cardId}/activate`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.blockedReason).toBeNull();
      expect(res.body.blockedAt).toBeNull();
    });
  });

  describe('GET /api/cards/:id/statistics', () => {
    test('should return card statistics', async () => {
      const res = await request(app)
        .get(`/api/cards/${cardId}/statistics`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('receiptsScanned');
      expect(res.body).toHaveProperty('stickersScanned');
      expect(res.body).toHaveProperty('totalCashbackEarned');
      expect(res.body).toHaveProperty('cardType');
      expect(res.body).toHaveProperty('memberSince');
      expect(res.body.cardType).toBe('STANDARD');
    });
  });

  describe('POST /api/cards/validate', () => {
    test('should validate active card', async () => {
      // Get card number first
      const cardRes = await request(app)
        .get('/api/cards/my-card')
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .post('/api/cards/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cardNumber: cardRes.body.cardNumber });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.card).toBeDefined();
    });

    test('should reject invalid card number', async () => {
      const res = await request(app)
        .post('/api/cards/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cardNumber: 'BOOM-INVALID-1234-5678' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toBe('Card not found');
    });

    test('should reject suspended card', async () => {
      // Deactivate card
      await request(app)
        .post(`/api/cards/${cardId}/deactivate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'Test' });

      // Get card number
      const cardRes = await request(app)
        .get('/api/cards/my-card')
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .post('/api/cards/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cardNumber: cardRes.body.cardNumber });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.reason).toContain('SUSPENDED');
    });
  });
});
