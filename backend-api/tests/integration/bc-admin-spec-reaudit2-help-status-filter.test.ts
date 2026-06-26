/**
 * Integration Tests: Admin Help Canonical Status Filter Fix (BC-ADMIN-SPEC-REAUDIT2-HELP-STATUS-FILTER-1)
 *
 * Spec §1.7 / §7.1 — M8 fix: The canonical Request Status enum is
 * New | In Progress | Waiting | Closed | Cancelled. The raw DB TicketStatus
 * super-set (NEW/OPEN/IN_REVIEW/WAITING/RESOLVED/CLOSED/REJECTED/CANCELLED) must
 * be transparently expanded when a caller filters by a canonical bucket name.
 *
 * Before this fix, filtering by status=Cancelled only returned CANCELLED tickets;
 * REJECTED tickets (which also display as "Cancelled") were silently excluded.
 *
 * TESTS:
 * 1. GET /api/admin/help?status=Cancelled returns REJECTED tickets
 * 2. GET /api/admin/help?status=CANCELLED (raw token) also returns REJECTED tickets (back-compat)
 * 3. GET /api/admin/help/mine?status=Cancelled returns REJECTED tickets owned by the caller
 * 4. GET /api/admin/help?status=Closed returns RESOLVED tickets
 * 5. GET /api/admin/help?status=In%20Progress returns IN_REVIEW tickets
 * 6. Response still includes both raw status and requestStatus fields
 * 7. GET /api/admin/help?status=New returns NEW tickets
 * 8. GET /api/admin/help?status=Waiting returns WAITING tickets
 * 9. GET /api/admin/help/mine?status=Closed returns RESOLVED tickets owned by caller
 * 10. GET /api/admin/help/mine?status=In%20Progress returns IN_REVIEW tickets owned by caller
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
    notifyPartnerRequestUpdate: jest.fn().mockResolvedValue(undefined),
  },
  NotificationService: jest.fn(),
}));

import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'TestPass999!';

async function hashPw() {
  return bcrypt.hash(PASSWORD, 10);
}

// ─── Shared cleanup state ─────────────────────────────────────────────────────

// Global safety-net: catches anything that slips through afterEach
const userIds: string[] = [];
const ticketIds: string[] = [];

// Per-test tracking — reset in beforeEach, deleted in afterEach
let currentTestTicketIds: string[] = [];
let currentTestUserIds: string[] = [];

afterAll(async () => {
  if (ticketIds.length) {
    await prisma.helpTicket.deleteMany({ where: { id: { in: ticketIds } } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function createSuperAdmin() {
  const suffix = uid();
  const hash = await hashPw();
  const user = await prisma.user.create({
    data: {
      email: `super-admin-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'SuperAdmin',
      role: 'SUPER_ADMIN',
      isVerified: true,
    },
  });
  userIds.push(user.id);
  currentTestUserIds.push(user.id);
  return user;
}

async function createAdmin() {
  const suffix = uid();
  const hash = await hashPw();
  const user = await prisma.user.create({
    data: {
      email: `admin-status-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'Admin',
      role: 'ADMIN',
      isVerified: true,
    },
  });
  userIds.push(user.id);
  currentTestUserIds.push(user.id);
  return user;
}

async function createTicketWithStatus(ownerId: string, status: string) {
  const ticket = await prisma.helpTicket.create({
    data: {
      subject: `Test ticket status=${status} ${uid()}`,
      body: `Test body for status ${status}`,
      category: 'TECHNICAL',
      priority: 'MEDIUM',
      requestType: 'SUPPORT',
      status: status as any,
      userId: ownerId,
      source: 'WEB',
    },
  });
  ticketIds.push(ticket.id);
  currentTestTicketIds.push(ticket.id);
  return ticket;
}

async function loginAs(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD });
  expect(res.body.data.accessToken).toBeDefined();
  return res.body.data.accessToken;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Admin Help Canonical Status Filter Fix (M8)', () => {
  let superAdmin: any;
  let superToken: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset per-test tracking arrays before creating any fixtures
    currentTestTicketIds = [];
    currentTestUserIds = [];
    superAdmin = await createSuperAdmin();

    // SUPER_ADMIN has implicit help.read.all access via hasFullAccess()
    superToken = await loginAs(superAdmin.email);
  });

  afterEach(async () => {
    // Delete tickets created in this test iteration first (FK order)
    if (currentTestTicketIds.length) {
      await prisma.helpTicket.deleteMany({ where: { id: { in: currentTestTicketIds } } });
    }
    if (currentTestUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: currentTestUserIds } } });
    }
  });

  // ─── Cancelled bucket: canonical name should return REJECTED + CANCELLED ───

  describe('status=Cancelled (canonical name)', () => {
    it('returns REJECTED tickets under GET /api/admin/help', async () => {
      const rejectedTicket = await createTicketWithStatus(superAdmin.id, 'REJECTED');
      const cancelledTicket = await createTicketWithStatus(superAdmin.id, 'CANCELLED');
      // Control: should NOT appear
      const openTicket = await createTicketWithStatus(superAdmin.id, 'OPEN');

      const res = await request(app)
        .get('/api/admin/help?status=Cancelled&limit=100')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(rejectedTicket.id)).toBe(true);
      expect(returnedIds.has(cancelledTicket.id)).toBe(true);
      expect(returnedIds.has(openTicket.id)).toBe(false);
    });

    it('returns REJECTED tickets under GET /api/admin/help/mine', async () => {
      const rejectedTicket = await createTicketWithStatus(superAdmin.id, 'REJECTED');
      const cancelledTicket = await createTicketWithStatus(superAdmin.id, 'CANCELLED');
      const openTicket = await createTicketWithStatus(superAdmin.id, 'OPEN');

      const res = await request(app)
        .get('/api/admin/help/mine?status=Cancelled')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(rejectedTicket.id)).toBe(true);
      expect(returnedIds.has(cancelledTicket.id)).toBe(true);
      expect(returnedIds.has(openTicket.id)).toBe(false);
    });
  });

  // ─── Cancelled bucket: raw token back-compat ───────────────────────────────

  describe('status=CANCELLED (raw enum token, back-compat)', () => {
    it('returns both CANCELLED and REJECTED tickets under GET /api/admin/help', async () => {
      const rejectedTicket = await createTicketWithStatus(superAdmin.id, 'REJECTED');
      const cancelledTicket = await createTicketWithStatus(superAdmin.id, 'CANCELLED');
      const openTicket = await createTicketWithStatus(superAdmin.id, 'OPEN');

      const res = await request(app)
        .get('/api/admin/help?status=CANCELLED&limit=100')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(rejectedTicket.id)).toBe(true);
      expect(returnedIds.has(cancelledTicket.id)).toBe(true);
      expect(returnedIds.has(openTicket.id)).toBe(false);
    });

    it('returns both CANCELLED and REJECTED tickets under GET /api/admin/help/mine', async () => {
      const rejectedTicket = await createTicketWithStatus(superAdmin.id, 'REJECTED');
      const cancelledTicket = await createTicketWithStatus(superAdmin.id, 'CANCELLED');
      const openTicket = await createTicketWithStatus(superAdmin.id, 'OPEN');

      const res = await request(app)
        .get('/api/admin/help/mine?status=CANCELLED')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(rejectedTicket.id)).toBe(true);
      expect(returnedIds.has(cancelledTicket.id)).toBe(true);
      expect(returnedIds.has(openTicket.id)).toBe(false);
    });
  });

  // ─── Closed bucket: canonical name should return RESOLVED + CLOSED ─────────

  describe('status=Closed (canonical name)', () => {
    it('returns RESOLVED tickets under GET /api/admin/help', async () => {
      const resolvedTicket = await createTicketWithStatus(superAdmin.id, 'RESOLVED');
      const closedTicket = await createTicketWithStatus(superAdmin.id, 'CLOSED');
      const openTicket = await createTicketWithStatus(superAdmin.id, 'OPEN');

      const res = await request(app)
        .get('/api/admin/help?status=Closed&limit=100')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(resolvedTicket.id)).toBe(true);
      expect(returnedIds.has(closedTicket.id)).toBe(true);
      expect(returnedIds.has(openTicket.id)).toBe(false);
    });
  });

  // ─── In Progress bucket: canonical name should return OPEN + IN_REVIEW ─────

  describe('status=In Progress (canonical name)', () => {
    it('returns IN_REVIEW tickets under GET /api/admin/help', async () => {
      const inReviewTicket = await createTicketWithStatus(superAdmin.id, 'IN_REVIEW');
      const openTicket = await createTicketWithStatus(superAdmin.id, 'OPEN');
      const closedTicket = await createTicketWithStatus(superAdmin.id, 'CLOSED');

      // LOW-2 fix: use %20 instead of raw space in URL
      const res = await request(app)
        .get('/api/admin/help?status=In%20Progress&limit=100')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(inReviewTicket.id)).toBe(true);
      expect(returnedIds.has(openTicket.id)).toBe(true);
      expect(returnedIds.has(closedTicket.id)).toBe(false);
    });
  });

  // ─── New bucket: canonical name should return NEW tickets ─────────────────

  describe('status=New (canonical name)', () => {
    it('returns NEW tickets under GET /api/admin/help and excludes OPEN', async () => {
      const newTicket = await createTicketWithStatus(superAdmin.id, 'NEW');
      const openTicket = await createTicketWithStatus(superAdmin.id, 'OPEN');

      const res = await request(app)
        .get('/api/admin/help?status=New&limit=100')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(newTicket.id)).toBe(true);
      expect(returnedIds.has(openTicket.id)).toBe(false);
    });
  });

  // ─── Waiting bucket: canonical name should return WAITING tickets ──────────

  describe('status=Waiting (canonical name)', () => {
    it('returns WAITING tickets under GET /api/admin/help and excludes OPEN', async () => {
      const waitingTicket = await createTicketWithStatus(superAdmin.id, 'WAITING');
      const openTicket = await createTicketWithStatus(superAdmin.id, 'OPEN');

      const res = await request(app)
        .get('/api/admin/help?status=Waiting&limit=100')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(waitingTicket.id)).toBe(true);
      expect(returnedIds.has(openTicket.id)).toBe(false);
    });
  });

  // ─── GET /mine: Closed and In Progress buckets ────────────────────────────

  describe('GET /mine status buckets (Closed and In Progress)', () => {
    it('returns RESOLVED tickets owned by caller under GET /api/admin/help/mine?status=Closed', async () => {
      const resolvedTicket = await createTicketWithStatus(superAdmin.id, 'RESOLVED');
      const openTicket = await createTicketWithStatus(superAdmin.id, 'OPEN');

      const res = await request(app)
        .get('/api/admin/help/mine?status=Closed')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(resolvedTicket.id)).toBe(true);
      expect(returnedIds.has(openTicket.id)).toBe(false);
    });

    it('returns IN_REVIEW tickets owned by caller under GET /api/admin/help/mine?status=In%20Progress', async () => {
      const inReviewTicket = await createTicketWithStatus(superAdmin.id, 'IN_REVIEW');
      const closedTicket = await createTicketWithStatus(superAdmin.id, 'CLOSED');

      const res = await request(app)
        .get('/api/admin/help/mine?status=In%20Progress')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(inReviewTicket.id)).toBe(true);
      expect(returnedIds.has(closedTicket.id)).toBe(false);
    });
  });

  // ─── Response shape: raw status + canonical requestStatus both present ──────

  describe('Response shape', () => {
    it('includes raw status and requestStatus on the returned ticket', async () => {
      // LOW-1 fix: assert on the specific ticket ID rather than every() over full DB state
      const createdTicket = await createTicketWithStatus(superAdmin.id, 'REJECTED');

      const res = await request(app)
        .get('/api/admin/help?status=Cancelled&limit=100')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(res.body.tickets.length).toBeGreaterThan(0);

      const found = res.body.tickets.find((t: any) => t.id === createdTicket.id);
      expect(found).toBeDefined();
      expect(found.status).toBe('REJECTED');
      expect(found.requestStatus).toBe('Cancelled');
    });
  });

  // ─── Scoping: /mine only returns the calling admin's tickets ──────────────

  describe('GET /mine scoping is preserved', () => {
    it('does NOT return a REJECTED ticket owned by another admin when filtering /mine', async () => {
      const otherAdmin = await createAdmin();
      const otherRejectedTicket = await createTicketWithStatus(otherAdmin.id, 'REJECTED');
      // Own REJECTED ticket for the superAdmin
      const ownRejectedTicket = await createTicketWithStatus(superAdmin.id, 'REJECTED');

      const res = await request(app)
        .get('/api/admin/help/mine?status=Cancelled')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const returnedIds = new Set(res.body.tickets.map((t: any) => t.id));
      expect(returnedIds.has(ownRejectedTicket.id)).toBe(true);
      // otherAdmin's ticket should not appear (not owner or assignee)
      expect(returnedIds.has(otherRejectedTicket.id)).toBe(false);
    });
  });
});
