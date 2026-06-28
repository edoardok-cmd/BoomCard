/**
 * BC-ADMIN-SPEC-REAUDIT-CONTRACT-NOTIFY-1 Integration Tests
 *
 * Spec §5.1 Part 5 / Source 6.1 — Contract Changes notification must fire when
 * admin edits partner commission/discount rate.
 *
 * Test cases:
 * 1. Admin PUT /partners/:id with discountRate change triggers notification
 * 2. Admin PUT /partners/:id with no discountRate change does NOT trigger notification
 * 3. Admin PUT /partners/:id with same discountRate (no-op) does NOT trigger notification
 * 4. Notification redacts percentages per spec §11.3
 * 5. Notification is sent to partner user, not admin
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { UserStatus, PartnerStatus } from '@prisma/client';

interface TestContext {
  adminUser: any;
  partnerUser: any;
  partner: any;
  adminToken: string;
}

const ctx: TestContext = {
  adminUser: null,
  partnerUser: null,
  partner: null,
  adminToken: '',
};

beforeAll(async () => {
  console.log('BC-ADMIN-SPEC-REAUDIT-CONTRACT-NOTIFY-1 tests starting');

  // Create test admin user
  const adminEmail = `admin-${Date.now()}@boomcard.bg`;
  const adminPasswordHash = await bcrypt.hash('AdminPass123!', 12);

  ctx.adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: UserStatus.ACTIVE,
      emailVerified: true,
      firstName: 'Test',
      lastName: 'Admin',
      phone: '+359000000000',
    },
  });

  // Create test partner user
  const partnerEmail = `partner-${Date.now()}@boomcard.bg`;
  const partnerPasswordHash = await bcrypt.hash('PartnerPass123!', 12);

  ctx.partnerUser = await prisma.user.create({
    data: {
      email: partnerEmail,
      passwordHash: partnerPasswordHash,
      role: 'PARTNER',
      status: UserStatus.ACTIVE,
      emailVerified: true,
      firstName: 'Partner',
      lastName: 'Test',
      phone: '+359000000001',
    },
  });

  // Create a partner with initial discountRate
  ctx.partner = await prisma.partner.create({
    data: {
      userId: ctx.partnerUser.id,
      businessName: 'Test Partner Business',
      status: PartnerStatus.ACTIVE,
      verifiedAt: new Date(),
      discountRate: 5, // Initial rate
      category: 'restaurant',
    },
  });

  // Login as admin to get token
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminEmail, password: 'AdminPass123!', clientType: 'web' });

  ctx.adminToken = loginRes.body.data.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('BC-ADMIN-SPEC-REAUDIT-CONTRACT-NOTIFY: Contract Change Notifications', () => {
  describe('§5.1 / Source 6.1: Notification on discountRate change', () => {
    it('should send notification when discountRate is changed', async () => {
      // Arrange: clear any existing notifications for this partner
      await prisma.notification.deleteMany({
        where: { userId: ctx.partnerUser.id },
      });

      const initialDiscountRate = ctx.partner.discountRate;
      const newDiscountRate = 10; // Different from initial

      // Act: admin changes the discountRate
      const updateRes = await request(app)
        .put(`/api/partners/${ctx.partner.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          discountRate: newDiscountRate,
        });

      // Assert: update succeeds
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.data.discountRate).toBe(newDiscountRate);

      // Assert: notification was created for the partner
      const notifications = await prisma.notification.findMany({
        where: {
          userId: ctx.partnerUser.id,
          type: 'SYSTEM',
        },
      });

      expect(notifications.length).toBeGreaterThan(0);

      // Assert: notification contains the expected title and message
      const contractNotif = notifications.find(
        (n) => n.title?.includes('contract') || n.title?.includes('terms'),
      );
      expect(contractNotif).toBeDefined();
      expect(contractNotif?.title).toContain('contract terms');
      expect(contractNotif?.message).toContain('commission rate');
      expect(contractNotif?.message).toContain(ctx.partner.businessName);

      // Assert: notification does NOT contain raw percentage values (spec §11.3)
      expect(contractNotif?.message).not.toMatch(/\d+%/);
      expect(contractNotif?.data).toBeDefined();
      const data = (contractNotif?.data || {}) as Record<string, unknown>;
      expect(data.fieldChanged).toBe('commission rate');
    });

    it('should NOT send notification when discountRate does not change', async () => {
      // Arrange: clear any existing notifications
      await prisma.notification.deleteMany({
        where: { userId: ctx.partnerUser.id },
      });

      // Refetch partner to ensure we have the current discountRate from DB
      // (Test 1 changed it from 5 to 10, but ctx.partner still holds old value)
      const refreshedPartner = await prisma.partner.findUnique({
        where: { id: ctx.partner.id },
      });
      const currentDiscountRate = refreshedPartner?.discountRate ?? ctx.partner.discountRate;

      // Act: admin sends PUT with same discountRate (no-op)
      const updateRes = await request(app)
        .put(`/api/partners/${ctx.partner.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          discountRate: currentDiscountRate,
        });

      // Assert: update succeeds
      expect(updateRes.status).toBe(200);

      // Assert: no new notification created (or only pre-existing ones)
      const notifications = await prisma.notification.findMany({
        where: {
          userId: ctx.partnerUser.id,
          type: 'SYSTEM',
          createdAt: { gte: new Date(Date.now() - 60000) }, // Last 60 seconds
        },
      });

      // No contract change notification should be created for a no-op edit
      const contractNotifs = notifications.filter(
        (n) =>
          n.title?.includes('contract') ||
          n.title?.includes('terms') ||
          (n.data && typeof n.data === 'object' && 'fieldChanged' in (n.data as Record<string, unknown>)),
      );

      expect(contractNotifs.length).toBe(0);
    });

    it('should NOT send notification when other fields are changed but discountRate is not', async () => {
      // Arrange: clear any existing notifications
      await prisma.notification.deleteMany({
        where: { userId: ctx.partnerUser.id },
      });

      // Act: admin changes businessName but not discountRate
      const updateRes = await request(app)
        .put(`/api/partners/${ctx.partner.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          businessName: 'Updated Partner Business Name',
        });

      // Assert: update succeeds
      expect(updateRes.status).toBe(200);

      // Assert: no contract change notification sent
      const notifications = await prisma.notification.findMany({
        where: {
          userId: ctx.partnerUser.id,
          type: 'SYSTEM',
          createdAt: { gte: new Date(Date.now() - 60000) },
        },
      });

      const contractNotifs = notifications.filter(
        (n) =>
          n.title?.includes('contract') ||
          n.title?.includes('terms') ||
          (n.data && typeof n.data === 'object' && 'fieldChanged' in (n.data as Record<string, unknown>)),
      );

      expect(contractNotifs.length).toBe(0);
    });

    it('should include businessName in notification data (redacted values only)', async () => {
      // Arrange: update partner business name for this test
      const uniqueName = `Partner ${Date.now()}`;
      await prisma.partner.update({
        where: { id: ctx.partner.id },
        data: { businessName: uniqueName },
      });

      await prisma.notification.deleteMany({
        where: { userId: ctx.partnerUser.id },
      });

      // Act: admin changes discountRate
      const updateRes = await request(app)
        .put(`/api/partners/${ctx.partner.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({
          discountRate: 15,
        });

      expect(updateRes.status).toBe(200);

      // Assert: notification contains business name in message and data
      const notifications = await prisma.notification.findMany({
        where: {
          userId: ctx.partnerUser.id,
          type: 'SYSTEM',
        },
      });

      const contractNotif = notifications.find(
        (n) => n.message?.includes('commission rate'),
      );
      expect(contractNotif).toBeDefined();
      expect(contractNotif?.message).toContain(uniqueName);

      const data = (contractNotif?.data || {}) as Record<string, unknown>;
      expect(data.businessName).toBe(uniqueName);
    });
  });
});
