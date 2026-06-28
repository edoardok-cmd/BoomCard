/**
 * Integration Tests: Admin Transactions Audit Fixes (BC-ADMIN-AUDIT-FIX-007)
 *
 * Covers defects from the admin code audit:
 *
 * DEFECT A: POST /transactions/adjust non-string userId type validation
 *   - Malformed userId (object, array) should return 400, not 500
 *   - Empty or whitespace-only userId should return 400
 *
 * DEFECT B: /business/stats & /business filter parity
 *   - Stats total amount must match sum of visible rows for same filter
 *   - If buildBusinessWhere changes, both endpoints stay consistent
 */

import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';

const PASSWORD = 'AdminPass123!';

interface TestFixtures {
  superAdminToken: string;
  userId: string;
  walletId: string;
}

async function createTestFixtures(): Promise<TestFixtures> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Create SUPER_ADMIN
  const admin = await prisma.user.create({
    data: {
      email: `admin-tx-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'Transactions',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      phone: '+359000000000',
    },
  });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: PASSWORD, clientType: 'web' });
  if (loginRes.status !== 200) {
    throw new Error(`Admin login failed: ${loginRes.status}`);
  }

  // Create a regular user with a wallet
  const user = await prisma.user.create({
    data: {
      email: `user-tx-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'User',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
      phone: '+359000000001',
    },
  });

  const wallet = await prisma.wallet.create({
    data: {
      userId: user.id,
      balance: 500,
      availableBalance: 500,
      currency: 'BGN',
    },
  });

  return {
    superAdminToken: loginRes.body.token,
    userId: user.id,
    walletId: wallet.id,
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

describe('Admin Transactions Audit Fixes (BC-ADMIN-AUDIT-FIX-007)', () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await createTestFixtures();
  });

  afterAll(async () => {
    // Find the admin user and delete it
    const adminUsers = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', email: { contains: 'admin-tx-' } },
    });
    for (const user of adminUsers) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
    // Cleanup test user
    await cleanupFixtures(fixtures.userId).catch(() => {});
  });

  describe('DEFECT A: POST /transactions/adjust — userId type validation', () => {
    it('should return 400 when userId is an object (not a string)', async () => {
      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({
          userId: { x: 1 }, // Object instead of string
          amount: 50,
          reason: 'Test adjustment',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/userId.*required/i);
    });

    it('should return 400 when userId is an array (not a string)', async () => {
      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({
          userId: ['id1', 'id2'], // Array instead of string
          amount: 50,
          reason: 'Test adjustment',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/userId.*required/i);
    });

    it('should return 400 when userId is whitespace-only', async () => {
      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({
          userId: '   ', // Whitespace only
          amount: 50,
          reason: 'Test adjustment',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/userId.*required/i);
    });

    it('should accept a valid string userId and create adjustment', async () => {
      const res = await request(app)
        .post('/api/admin/transactions/adjust')
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({
          userId: fixtures.userId,
          amount: 50,
          reason: 'Valid test adjustment',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.type).toBe('ADJUSTMENT');
      expect(res.body.amount).toBe(50);
    });
  });

  describe('DEFECT B: /business & /business/stats filter parity', () => {
    let partnerId: string;
    let userId: string;

    beforeEach(async () => {
      // Create a partner
      const partner = await prisma.partner.create({
        data: {
          businessName: `Test Partner ${Date.now()}`,
          email: `partner-${Date.now()}@test.com`,
          status: 'ACTIVE',
          verifiedAt: new Date(),
        },
      });
      partnerId = partner.id;

      // Create a test user
      const hash = await bcrypt.hash(PASSWORD, 10);
      const user = await prisma.user.create({
        data: {
          email: `tx-user-${Date.now()}@test.com`,
          passwordHash: hash,
          firstName: 'Tx',
          lastName: 'User',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          phone: '+359000000002',
        },
      });
      userId = user.id;

      // Create test transactions for this partner
      for (let i = 0; i < 3; i++) {
        await prisma.transaction.create({
          data: {
            userId,
            partnerId,
            type: 'PURCHASE',
            status: 'COMPLETED',
            amount: 100 + i * 10,
            finalAmount: 100 + i * 10,
            currency: 'BGN',
            paymentMethod: 'CARD',
          },
        });
      }
    });

    afterEach(async () => {
      // Cleanup transactions
      await prisma.transaction.deleteMany({
        where: { userId },
      });
      // Cleanup user
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      // Cleanup partner
      await prisma.partner.delete({ where: { id: partnerId } }).catch(() => {});
    });

    it('should have consistent totalVolume between /business list and /business/stats', async () => {
      // Get transactions from /business endpoint
      const listRes = await request(app)
        .get(`/api/admin/transactions/business?partnerId=${partnerId}`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.transactions).toHaveLength(3);

      // Sum amounts from the list
      const listTotal = listRes.body.transactions.reduce(
        (sum: number, tx: any) => sum + tx.amount,
        0,
      );

      // Get stats for the same filter
      const statsRes = await request(app)
        .get(`/api/admin/transactions/business/stats?partnerId=${partnerId}`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.totalVolume).toBe(listTotal);
      expect(statsRes.body.count).toBe(3);
    });

    it('should have consistent totalVolume when filtering by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const dateFrom = yesterday.toISOString().split('T')[0];
      const dateTo = tomorrow.toISOString().split('T')[0];

      // Get transactions from /business with date filter
      const listRes = await request(app)
        .get(
          `/api/admin/transactions/business?partnerId=${partnerId}&dateFrom=${dateFrom}&dateTo=${dateTo}`,
        )
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(listRes.status).toBe(200);

      const listTotal = listRes.body.transactions.reduce(
        (sum: number, tx: any) => sum + tx.amount,
        0,
      );

      // Get stats with the same date filter
      const statsRes = await request(app)
        .get(
          `/api/admin/transactions/business/stats?partnerId=${partnerId}&dateFrom=${dateFrom}&dateTo=${dateTo}`,
        )
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.totalVolume).toBe(listTotal);
      expect(statsRes.body.count).toBe(listRes.body.transactions.length);
    });

    it('should have consistent count between /business list and /business/stats', async () => {
      // Get transactions from /business endpoint
      const listRes = await request(app)
        .get(`/api/admin/transactions/business?partnerId=${partnerId}`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(listRes.status).toBe(200);
      const listCount = listRes.body.transactions.length;

      // Get stats for the same filter
      const statsRes = await request(app)
        .get(`/api/admin/transactions/business/stats?partnerId=${partnerId}`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.count).toBe(listCount);
    });
  });
});
