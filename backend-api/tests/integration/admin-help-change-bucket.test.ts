/**
 * Integration Tests: Admin Help CHANGE Bucket Fragmentation Fix (BC-ADMIN-SPEC-REAUDIT-HELP-CHANGE-BUCKET-1)
 *
 * Spec §1.7 / Clash 8.2: The canonical Request Type enum is Support | Dispute | Change | Other.
 * The three *_CHANGE sub-types (DATA_CHANGE, LOCATION_CHANGE, CONTRACT_CHANGE) are implementation
 * extensions but currently leak past the canonical filter. This test verifies the fix:
 *
 * TESTS:
 * 1. Creating tickets with all *_CHANGE sub-types works
 * 2. Filtering GET /api/admin/help by canonical CHANGE returns all *_CHANGE sub-types
 * 3. Filtering GET /api/admin/help/mine by canonical CHANGE returns all *_CHANGE sub-types
 * 4. Response includes both raw requestType and canonicalRequestType
 * 5. Direct requestType filter still works for specific sub-types (DATA_CHANGE, etc.)
 */

jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: {
    sendEmail: jest.fn().mockResolvedValue({ success: true }),
  },
  EmailService: jest.fn(),
}));

jest.mock('../../src/services/notification.service', () => ({
  __esModule: true,
  notificationService: {
    notifyAdminOps: jest.fn().mockResolvedValue(undefined),
  },
  NotificationService: jest.fn(),
}));

import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { genTestPhone } from '../helpers/test-utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'TestPass999!';

async function hashPw() {
  return bcrypt.hash(PASSWORD, 10);
}

// ─── Shared cleanup state ─────────────────────────────────────────────────────

const userIds: string[] = [];
const ticketIds: string[] = [];

afterAll(async () => {
  if (ticketIds.length) {
    await prisma.helpTicket.deleteMany({ where: { id: { in: ticketIds } } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function createAdmin() {
  const suffix = uid();
  const hash = await hashPw();
  const user = await prisma.user.create({
    data: {
      email: `admin-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      phone: genTestPhone(),
    },
  });
  userIds.push(user.id);
  return user;
}

async function createTicketWithType(adminId: string, requestType: string) {
  const ticket = await prisma.helpTicket.create({
    data: {
      subject: `Test ${requestType}`,
      body: `Test body for ${requestType}`,
      category: 'TECHNICAL',
      priority: 'MEDIUM',
      requestType: requestType as any,
      status: 'OPEN',
      userId: adminId,
      source: 'WEB',
    },
  });
  ticketIds.push(ticket.id);
  return ticket;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Admin Help CHANGE Bucket Fragmentation Fix', () => {
  let adminUser: any;
  let token: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    adminUser = await createAdmin();

    // Authenticate as the admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: PASSWORD, clientType: 'web' });

    // Login response envelope is { success, message, data: { accessToken, ... } }
    // (src/routes/auth.routes.ts POST /login) — .body.token does not exist
    // (BC-QA-042).
    token = loginRes.body.data?.accessToken;
    expect(token).toBeDefined();
  });

  describe('Canonical CHANGE filter includes all *_CHANGE sub-types', () => {
    it('should return CHANGE, DATA_CHANGE, LOCATION_CHANGE, and CONTRACT_CHANGE when filtered by CHANGE', async () => {
      // Create tickets with all CHANGE variants
      const changeTicket = await createTicketWithType(adminUser.id, 'CHANGE');
      const dataChangeTicket = await createTicketWithType(adminUser.id, 'DATA_CHANGE');
      const locationChangeTicket = await createTicketWithType(adminUser.id, 'LOCATION_CHANGE');
      const contractChangeTicket = await createTicketWithType(adminUser.id, 'CONTRACT_CHANGE');

      // Query /api/admin/help/mine with CHANGE filter
      const res = await request(app)
        .get('/api/admin/help/mine?requestType=CHANGE')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.tickets).toBeInstanceOf(Array);
      expect(res.body.tickets.length).toBeGreaterThanOrEqual(4);

      // Verify all four variants are returned
      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(changeTicket.id)).toBe(true);
      expect(returnedIds.has(dataChangeTicket.id)).toBe(true);
      expect(returnedIds.has(locationChangeTicket.id)).toBe(true);
      expect(returnedIds.has(contractChangeTicket.id)).toBe(true);
    });

    it('should return both raw requestType and canonicalRequestType in responses', async () => {
      const dataChangeTicket = await createTicketWithType(adminUser.id, 'DATA_CHANGE');

      // Query the specific ticket
      const res = await request(app)
        .get(`/api/admin/help/${dataChangeTicket.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const { ticket } = res.body;
      expect(ticket.requestType).toBe('DATA_CHANGE'); // raw enum
      expect(ticket.canonicalRequestType).toBe('Change'); // canonical
    });

    it('should support filtering by specific *_CHANGE sub-types directly', async () => {
      const dataChangeTicket = await createTicketWithType(adminUser.id, 'DATA_CHANGE');
      const locationChangeTicket = await createTicketWithType(adminUser.id, 'LOCATION_CHANGE');
      const contractChangeTicket = await createTicketWithType(adminUser.id, 'CONTRACT_CHANGE');

      // Filter by DATA_CHANGE specifically
      const dataRes = await request(app)
        .get('/api/admin/help/mine?requestType=DATA_CHANGE')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const dataReturnedIds = new Set(dataRes.body.tickets.map((t: any) => t.id));
      expect(dataReturnedIds.has(dataChangeTicket.id)).toBe(true);
      expect(dataReturnedIds.has(locationChangeTicket.id)).toBe(false);
      expect(dataReturnedIds.has(contractChangeTicket.id)).toBe(false);
    });

    it('should work on GET /api/admin/help (full list, not just mine)', async () => {
      // Create an admin with help.read.all permission. createAdmin() already
      // mints a role: 'SUPER_ADMIN' user, which requirePermission() bypasses
      // unconditionally (src/middleware/auth.middleware.ts), so no separate
      // permission grant is needed. The permission was previously (wrongly)
      // seeded via `prisma.admin.upsert(...)` against a Prisma model
      // (`Admin`) that does not exist in the schema — permissions/roles are
      // now modeled via AdminRole/UserAdminRole and
      // Permission/UserPermissionOverride, not a single `admin` table
      // (BC-QA-042).
      const superAdmin = await createAdmin();

      // Authenticate as super admin
      const superAdminRes = await request(app)
        .post('/api/auth/login')
        .send({ email: superAdmin.email, password: PASSWORD, clientType: 'web' });

      const superToken = superAdminRes.body.data?.accessToken;

      // Create tickets with different admins
      const changeTicket = await createTicketWithType(adminUser.id, 'CHANGE');
      const dataChangeTicket = await createTicketWithType(adminUser.id, 'DATA_CHANGE');
      const locationChangeTicket = await createTicketWithType(adminUser.id, 'LOCATION_CHANGE');
      const contractChangeTicket = await createTicketWithType(adminUser.id, 'CONTRACT_CHANGE');

      // Query with full list endpoint
      const res = await request(app)
        .get('/api/admin/help?requestType=CHANGE&limit=100')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(res.body.tickets).toBeInstanceOf(Array);

      // Verify all four variants are returned
      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(changeTicket.id)).toBe(true);
      expect(returnedIds.has(dataChangeTicket.id)).toBe(true);
      expect(returnedIds.has(locationChangeTicket.id)).toBe(true);
      expect(returnedIds.has(contractChangeTicket.id)).toBe(true);
    });

    it('should return canonicalRequestType for all tickets in list response', async () => {
      const changeTicket = await createTicketWithType(adminUser.id, 'CHANGE');
      const dataChangeTicket = await createTicketWithType(adminUser.id, 'DATA_CHANGE');

      const res = await request(app)
        .get('/api/admin/help/mine')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const allTickets = res.body.tickets;
      expect(allTickets.length).toBeGreaterThan(0);

      // Verify all tickets have both fields
      allTickets.forEach((ticket: any) => {
        expect(ticket).toHaveProperty('requestType');
        expect(ticket).toHaveProperty('canonicalRequestType');
        expect(
          ['Support', 'Dispute', 'Change', 'Other'].includes(ticket.canonicalRequestType),
        ).toBe(true);
      });
    });
  });

  describe('Other request types still work correctly', () => {
    it('should filter SUPPORT tickets correctly', async () => {
      const supportTicket = await createTicketWithType(adminUser.id, 'SUPPORT');
      const disputeTicket = await createTicketWithType(adminUser.id, 'DISPUTE');

      const res = await request(app)
        .get('/api/admin/help/mine?requestType=SUPPORT')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(supportTicket.id)).toBe(true);
      expect(returnedIds.has(disputeTicket.id)).toBe(false);
    });

    it('should return canonical types for non-CHANGE types', async () => {
      const supportTicket = await createTicketWithType(adminUser.id, 'SUPPORT');
      const disputeTicket = await createTicketWithType(adminUser.id, 'DISPUTE');
      const otherTicket = await createTicketWithType(adminUser.id, 'OTHER');

      const res = await request(app)
        .get('/api/admin/help/mine')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const ticketMap = new Map<string, any>(res.body.tickets.map((t: any): [string, any] => [t.id, t]));

      const support = ticketMap.get(supportTicket.id);
      expect(support.canonicalRequestType).toBe('Support');

      const dispute = ticketMap.get(disputeTicket.id);
      expect(dispute.canonicalRequestType).toBe('Dispute');

      const other = ticketMap.get(otherTicket.id);
      expect(other.canonicalRequestType).toBe('Other');
    });
  });
});
