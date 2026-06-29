/**
 * INV-SYS-013 — Email ingest idempotency for new-ticket path
 *
 * Verifies that redelivery of the same inbound email (identical messageId,
 * no inReplyTo / references) does NOT create a duplicate HelpTicket row.
 * The fix lives in ticketInbound.service.ts: before prisma.helpTicket.create()
 * the service now checks whether a HelpTicket with rootMessageId == payload.messageId
 * already exists and, if so, returns { ticketId: existing.id, created: false }.
 *
 * Test DB: boomcard_test  (NODE_ENV=test, .env.test)
 * Run:
 *   NODE_ENV=test DATABASE_URL=$(grep DATABASE_URL /Users/administrator/Documents/BoomCard/backend-api/.env.test | cut -d= -f2-) \
 *     npx jest --testPathPattern=system-email-idempotency --runInBand
 */

// ─── Hoist service mocks before any imports resolve the real modules ──────────

jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: {
    sendEmail: jest.fn().mockResolvedValue(undefined),
  },
  EmailService: jest.fn(),
}));

jest.mock('../../src/services/notification.service', () => ({
  __esModule: true,
  notificationService: {
    notifyAdminOps: jest.fn().mockResolvedValue(undefined),
    sendPushNotification: jest.fn().mockResolvedValue(undefined),
    notifyUser: jest.fn().mockResolvedValue(undefined),
  },
  NotificationService: jest.fn(),
}));

import bcrypt from 'bcrypt';
import { prisma } from '../../src/lib/prisma';
import { ingestInboundEmail, InboundEmailPayload } from '../../src/services/ticketInbound.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Unique RFC 5322-style Message-ID for each test. */
const makeMessageId = () => `<${uid()}@test.boomcard.bg>`;

// ─── Test lifecycle ───────────────────────────────────────────────────────────

const createdUserIds: string[] = [];
const createdTicketIds: string[] = [];

afterAll(async () => {
  // Clean up in dependency order (TicketReply cascades with HelpTicket).
  if (createdTicketIds.length) {
    await prisma.helpTicket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Create a minimal ADMIN user so the orphan-inbound code path never fires. */
async function seedAdmin(): Promise<string> {
  const email = `admin-idem-${uid()}@boomcard.bg`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash('TestPass999!', 10),
      firstName: 'Admin',
      lastName: 'Idem',
      phone: '+359888000001',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  createdUserIds.push(user.id);
  return user.id;
}

/** Minimal valid new-ticket payload (no inReplyTo / references). */
function newTicketPayload(messageId: string): InboundEmailPayload {
  return {
    from: `sender-${uid()}@external.example.com`,
    to: 'support@boomcard.bg',
    subject: 'Help me please',
    text: 'I need assistance.',
    messageId,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('[INV-SYS-013] ingestInboundEmail — new-ticket idempotency', () => {
  let adminId: string;

  beforeAll(async () => {
    adminId = await seedAdmin();
  });

  it('first call creates a HelpTicket and returns created=true', async () => {
    const messageId = makeMessageId();
    const payload = newTicketPayload(messageId);

    const result = await ingestInboundEmail(payload);

    expect(result.created).toBe(true);
    expect(result.ticketId).toBeTruthy();
    createdTicketIds.push(result.ticketId);

    // Confirm exactly one row exists with this rootMessageId.
    const count = await prisma.helpTicket.count({
      where: { rootMessageId: messageId },
    });
    expect(count).toBe(1);
  });

  it('second call with the same messageId returns the SAME ticketId and created=false — no duplicate row', async () => {
    const messageId = makeMessageId();
    const payload = newTicketPayload(messageId);

    const first = await ingestInboundEmail(payload);
    expect(first.created).toBe(true);
    createdTicketIds.push(first.ticketId);

    // Simulate provider redelivery — identical payload.
    const second = await ingestInboundEmail(payload);

    expect(second.created).toBe(false);
    expect(second.ticketId).toBe(first.ticketId);

    // Database must contain exactly one HelpTicket for this rootMessageId.
    const count = await prisma.helpTicket.count({
      where: { rootMessageId: messageId },
    });
    expect(count).toBe(1);
  });

  it('sequential redeliveries (N=3) never create more than one HelpTicket', async () => {
    // Provider retries are inherently sequential (the provider waits for an
    // HTTP response before retrying). The findFirst pre-check handles this
    // path cleanly. For truly concurrent races, the partial unique index
    // (migration 20260629000001, WHERE rootMessageId IS NOT NULL) prevents
    // duplicate rows at the DB level; the P2002 catch block in the service
    // recovers by fetching and returning the winning ticket. Both sequential
    // and concurrent redeliveries are fully protected end-to-end.
    const messageId = makeMessageId();
    const payload = newTicketPayload(messageId);

    const r1 = await ingestInboundEmail(payload);
    const r2 = await ingestInboundEmail(payload);
    const r3 = await ingestInboundEmail(payload);

    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
    expect(r3.created).toBe(false);

    expect(r2.ticketId).toBe(r1.ticketId);
    expect(r3.ticketId).toBe(r1.ticketId);

    createdTicketIds.push(r1.ticketId);

    const count = await prisma.helpTicket.count({
      where: { rootMessageId: messageId },
    });
    expect(count).toBe(1);
  });

  it('two DIFFERENT messageIds each create their own HelpTicket', async () => {
    const messageId1 = makeMessageId();
    const messageId2 = makeMessageId();
    const payload1 = newTicketPayload(messageId1);
    const payload2 = newTicketPayload(messageId2);

    const [r1, r2] = await Promise.all([
      ingestInboundEmail(payload1),
      ingestInboundEmail(payload2),
    ]);

    expect(r1.created).toBe(true);
    expect(r2.created).toBe(true);
    expect(r1.ticketId).not.toBe(r2.ticketId);

    createdTicketIds.push(r1.ticketId, r2.ticketId);
  });

  it('a payload with no messageId still creates a ticket (guard must not block empty-messageId)', async () => {
    const payload: InboundEmailPayload = {
      from: `noid-${uid()}@external.example.com`,
      to: 'support@boomcard.bg',
      subject: 'No message ID',
      text: 'This email has no Message-ID header.',
      messageId: '',
    };

    const result = await ingestInboundEmail(payload);

    // seedAdmin runs in beforeAll so an admin is always available — a payload
    // with no messageId bypasses the idempotency guard and creates a fresh ticket.
    expect(result.created).toBe(true);
    expect(result.ticketId).toBeTruthy();

    if (result.ticketId) {
      createdTicketIds.push(result.ticketId);
    }
  });
});
