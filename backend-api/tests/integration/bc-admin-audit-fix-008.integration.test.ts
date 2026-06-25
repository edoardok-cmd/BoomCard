/**
 * BC-ADMIN-AUDIT-FIX-008 Integration Tests
 *
 * DEFECT A: Business-category edit endpoint missing
 * DEFECT B: Visibility toggle allowed on hidden partners
 *
 * Spec §3.5 — Active Partner Management editable fields should include "commission rate,
 * business category, visibility field"
 * Spec §8.1 rule 7 / Clash 9.1 — status overrides visibility; visibility is only meaningful
 * for ACTIVE partners
 *
 * Test cases:
 * 1. PATCH /:id/category endpoint exists and works for ADMIN
 * 2. Category update is logged in audit trail
 * 3. Visibility toggle rejected on non-ACTIVE partners (INACTIVE, SUSPENDED, ARCHIVED, PENDING)
 * 4. Visibility toggle accepted on ACTIVE partners
 * 5. Visibility update is logged in audit trail
 */

import { PrismaClient, PartnerStatus } from '@prisma/client';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/server';
import { prisma } from '../../src/lib/prisma';

const TEST_ADMIN_EMAIL = `admin-${Date.now()}@boomcard.bg`;
const TEST_ADMIN_PASSWORD = 'AdminPass123!';

interface TestContext {
  adminUser: any;
  adminToken: string;
  activePartner: any;
  inactivePartner: any;
  suspendedPartner: any;
}

const ctx: TestContext = {
  adminUser: null,
  adminToken: '',
  activePartner: null,
  inactivePartner: null,
  suspendedPartner: null,
};

beforeAll(async () => {
  // Create test admin user
  const passwordHash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 12);
  ctx.adminUser = await prisma.user.create({
    data: {
      email: TEST_ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      firstName: 'Test',
      lastName: 'Admin',
    },
  });

  // Login to get admin token
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD, clientType: 'web' });

  ctx.adminToken = loginRes.body.data.accessToken;

  // Create ACTIVE partner
  const activePartnerUser = await prisma.user.create({
    data: {
      email: `active-partner-${Date.now()}@boomcard.bg`,
      passwordHash,
      role: 'PARTNER',
      status: 'ACTIVE',
      emailVerified: true,
      firstName: 'Active',
      lastName: 'Partner',
    },
  });

  ctx.activePartner = await prisma.partner.create({
    data: {
      userId: activePartnerUser.id,
      businessName: 'Active Partner',
      category: 'restaurants',
      status: PartnerStatus.ACTIVE,
      verifiedAt: new Date(),
      isVisible: true,
    },
  });

  // Create INACTIVE partner
  const inactivePartnerUser = await prisma.user.create({
    data: {
      email: `inactive-partner-${Date.now()}@boomcard.bg`,
      passwordHash,
      role: 'PARTNER',
      status: 'ACTIVE',
      emailVerified: true,
      firstName: 'Inactive',
      lastName: 'Partner',
    },
  });

  ctx.inactivePartner = await prisma.partner.create({
    data: {
      userId: inactivePartnerUser.id,
      businessName: 'Inactive Partner',
      category: 'cafes',
      status: PartnerStatus.INACTIVE,
      verifiedAt: new Date(),
      isVisible: true,
    },
  });

  // Create SUSPENDED partner
  const suspendedPartnerUser = await prisma.user.create({
    data: {
      email: `suspended-partner-${Date.now()}@boomcard.bg`,
      passwordHash,
      role: 'PARTNER',
      status: 'ACTIVE',
      emailVerified: true,
      firstName: 'Suspended',
      lastName: 'Partner',
    },
  });

  ctx.suspendedPartner = await prisma.partner.create({
    data: {
      userId: suspendedPartnerUser.id,
      businessName: 'Suspended Partner',
      category: 'spa',
      status: PartnerStatus.SUSPENDED,
      verifiedAt: new Date(),
      isVisible: true,
    },
  });
});

afterAll(async () => {
  // Cleanup
  if (ctx.activePartner) {
    await prisma.partner.delete({ where: { id: ctx.activePartner.id } }).catch(() => {});
  }
  if (ctx.inactivePartner) {
    await prisma.partner.delete({ where: { id: ctx.inactivePartner.id } }).catch(() => {});
  }
  if (ctx.suspendedPartner) {
    await prisma.partner.delete({ where: { id: ctx.suspendedPartner.id } }).catch(() => {});
  }
  if (ctx.adminUser) {
    await prisma.user.deleteMany({
      where: { email: { in: [TEST_ADMIN_EMAIL] } },
    }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('BC-ADMIN-AUDIT-FIX-008: Business Category Edit & Visibility Toggle', () => {
  describe('DEFECT A: Business Category Edit Endpoint', () => {
    it('PATCH /:id/category should update category for ACTIVE partner with valid main category', async () => {
      // Act — use valid main category from registry
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/category`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ category: 'accommodation' });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.partner.category).toBe('accommodation');

      // Verify in DB
      const updated = await prisma.partner.findUnique({
        where: { id: ctx.activePartner.id },
      });
      expect(updated?.category).toBe('accommodation');
    });

    it('PATCH /:id/category should update category for ACTIVE partner with valid subcategory', async () => {
      // Act — use valid subcategory from registry
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/category`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ category: 'accommodation/hotels' });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.partner.category).toBe('accommodation/hotels');

      // Verify in DB
      const updated = await prisma.partner.findUnique({
        where: { id: ctx.activePartner.id },
      });
      expect(updated?.category).toBe('accommodation/hotels');
    });

    it('PATCH /:id/category should reject empty category', async () => {
      // Act
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/category`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ category: '' });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('category');
    });

    it('PATCH /:id/category should reject missing category', async () => {
      // Act
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/category`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({});

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('category');
    });

    it('PATCH /:id/category should return 404 for nonexistent partner', async () => {
      // Act
      const res = await request(app)
        .patch('/api/admin/partners/nonexistent-id/category')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ category: 'restaurants' });

      // Assert
      expect(res.status).toBe(404);
    });

    it('PATCH /:id/category should reject invalid category', async () => {
      // Act — use invalid category not in registry
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/category`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ category: 'invalid-category-xyz' });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid category');
      expect(res.body.error).toContain('invalid-category-xyz');

      // Verify category was NOT changed
      const unchanged = await prisma.partner.findUnique({
        where: { id: ctx.activePartner.id },
      });
      expect(unchanged?.category).toBe('accommodation/hotels'); // Previous value from prior test
    });

    it('PATCH /:id/category should log audit entry', async () => {
      // Act — use valid category
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/category`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ category: 'cafes' });

      expect(res.status).toBe(200);

      // Verify audit log entry exists
      const auditEntries = await prisma.auditLog.findMany({
        where: {
          objectId: ctx.activePartner.id,
          action: 'partner.category.update',
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      expect(auditEntries.length).toBeGreaterThan(0);
      const entry = auditEntries[0];
      expect(entry.action).toBe('partner.category.update');
      expect(entry.before).toEqual({ category: 'accommodation/hotels' }); // Previous value from prior test
      expect(entry.after).toEqual({ category: 'cafes' });
    });
  });

  describe('DEFECT B: Visibility Toggle Status Guard', () => {
    it('PATCH /:id/visibility should work for ACTIVE partner', async () => {
      // Act
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/visibility`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ isVisible: false });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.partner.isVisible).toBe(false);
      expect(res.body.partner.status).toBe(PartnerStatus.ACTIVE);

      // Verify in DB
      const updated = await prisma.partner.findUnique({
        where: { id: ctx.activePartner.id },
      });
      expect(updated?.isVisible).toBe(false);
    });

    it('PATCH /:id/visibility should toggle back to true for ACTIVE partner', async () => {
      // Ensure it's ACTIVE first
      await prisma.partner.update({
        where: { id: ctx.activePartner.id },
        data: { status: PartnerStatus.ACTIVE },
      });

      // Act
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/visibility`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ isVisible: true });

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.partner.isVisible).toBe(true);
    });

    it('PATCH /:id/visibility should reject INACTIVE partner', async () => {
      // Act
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.inactivePartner.id}/visibility`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ isVisible: false });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ACTIVE');
      expect(res.body.error).toContain('Inactive');
      expect(res.body.currentStatus).toBe(PartnerStatus.INACTIVE);

      // Verify isVisible was NOT changed
      const unchanged = await prisma.partner.findUnique({
        where: { id: ctx.inactivePartner.id },
      });
      expect(unchanged?.isVisible).toBe(true);
    });

    it('PATCH /:id/visibility should reject SUSPENDED partner', async () => {
      // Act
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.suspendedPartner.id}/visibility`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ isVisible: false });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ACTIVE');
      expect(res.body.error).toContain('Suspended');
      expect(res.body.currentStatus).toBe(PartnerStatus.SUSPENDED);

      // Verify isVisible was NOT changed
      const unchanged = await prisma.partner.findUnique({
        where: { id: ctx.suspendedPartner.id },
      });
      expect(unchanged?.isVisible).toBe(true);
    });

    it('PATCH /:id/visibility should log audit entry', async () => {
      // Ensure ACTIVE status
      await prisma.partner.update({
        where: { id: ctx.activePartner.id },
        data: { status: PartnerStatus.ACTIVE, isVisible: true },
      });

      // Act
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/visibility`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ isVisible: false });

      expect(res.status).toBe(200);

      // Verify audit log entry exists
      const auditEntries = await prisma.auditLog.findMany({
        where: {
          objectId: ctx.activePartner.id,
          action: 'partner.visibility.update',
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      expect(auditEntries.length).toBeGreaterThan(0);
      const entry = auditEntries[0];
      expect(entry.action).toBe('partner.visibility.update');
      expect(entry.before).toEqual({ isVisible: true });
      expect(entry.after).toEqual({ isVisible: false });
    });

    it('PATCH /:id/visibility should reject with missing isVisible', async () => {
      // Act
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/visibility`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({});

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('isVisible');
    });

    it('PATCH /:id/visibility should reject with non-boolean isVisible', async () => {
      // Act
      const res = await request(app)
        .patch(`/api/admin/partners/${ctx.activePartner.id}/visibility`)
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ isVisible: 'true' });

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('isVisible');
    });
  });
});
