/**
 * Integration Tests: Contact Form → Help Ticket Creation (BC-REAUDIT-CONTACT-HELPREQ-1)
 *
 * Spec §3.8 / §1.7 / Clash 8.1: "Website form → Creates a unified Help Request"
 * "Form submissions create Partner Applications only when submitted via the
 * partner onboarding form. All other inbound forms and emails create Help Requests."
 *
 * TESTS:
 * 1. POST /contact creates a HelpTicket visible in admin queue with [#XXXX] ref
 * 2. Submitter receives auto-reply with ticket reference
 * 3. Auto-reply threads correctly via X-BoomCard-Request-ID header
 * 4. Admin notification email is sent (includes ticket ID)
 * 5. Multiple submissions create separate tickets (no duplicates)
 */

// ─── Hoist mocks before any import resolves the real modules ──────────────────

jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: {
    sendEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPartnerApprovalEmail: jest.fn().mockResolvedValue(undefined),
    sendPartnerStatusChangeEmail: jest.fn().mockResolvedValue(undefined),
    sendPartnerContractChangeEmail: jest.fn().mockResolvedValue(undefined),
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
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { emailService } from '../../src/services/email.service';

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
  // Clean up in dependency order. Replies cascade-delete with tickets.
  if (ticketIds.length) {
    await prisma.helpTicket.deleteMany({ where: { id: { in: ticketIds } } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function createAdmin() {
  const suffix = uid();
  const hash = await hashPw();
  const user = await prisma.user.create({
    data: {
      email: `admin-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'Test',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
  userIds.push(user.id);
  return user;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /contact form → Help Ticket creation', () => {
  it('creates a HelpTicket visible in admin queue with [#XXXX] short reference', async () => {
    // Ensure we have an admin to own the ticket
    await createAdmin();

    const submitterEmail = `contact-form-user-${uid()}@example.com`;
    const res = await request(app)
      .post('/contact')
      .send({
        name: 'John Doe',
        email: submitterEmail,
        message: 'I have a question about my account',
        language: 'en',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify the ticket was created
    const ticket = await prisma.helpTicket.findFirst({
      where: { externalEmail: submitterEmail.toLowerCase() },
    });

    expect(ticket).toBeDefined();
    expect(ticket).toMatchObject({
      subject: expect.stringContaining('Inquiry from John Doe'),
      body: 'I have a question about my account',
      status: 'OPEN',
      category: 'OTHER',
      priority: 'MEDIUM',
      source: 'WEB',
      externalEmail: submitterEmail.toLowerCase(),
    });

    // Verify shortRef exists (Gap 8 fix)
    expect(ticket?.shortRef).toBeDefined();
    expect(ticket?.shortRef?.length).toBeLessThanOrEqual(8);

    ticketIds.push(ticket!.id);
  });

  it('sends auto-reply to submitter with ticket reference', async () => {
    // Ensure we have an admin to own the ticket
    await createAdmin();

    const submitterEmail = `contact-reply-${uid()}@example.com`;
    const res = await request(app)
      .post('/contact')
      .send({
        name: 'Jane Smith',
        email: submitterEmail,
        message: 'Please help with my issue',
        language: 'bg',
      });

    expect(res.status).toBe(200);

    // Verify auto-reply was sent
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: submitterEmail,
        subject: expect.stringMatching(/\[#[a-f0-9]+\]/i), // Contains [#XXXX] ref
        headers: expect.objectContaining({
          'X-BoomCard-Request-ID': expect.any(String),
          'X-BoomCard-Ticket-ID': expect.any(String),
          'Message-ID': expect.any(String),
        }),
      })
    );

    // Verify the ticketReply was created for threading
    const ticket = await prisma.helpTicket.findFirst({
      where: { externalEmail: submitterEmail.toLowerCase() },
    });
    const reply = await prisma.ticketReply.findFirst({
      where: { ticketId: ticket!.id },
    });

    expect(reply).toBeDefined();
    expect(reply?.isAutoReply).toBe(true);
    expect(reply?.messageId).toBeDefined();

    ticketIds.push(ticket!.id);
  });

  it('auto-reply has correct X-BoomCard-Request-ID and Message-ID headers for threading', async () => {
    // Ensure we have an admin to own the ticket
    await createAdmin();

    const submitterEmail = `contact-threading-${uid()}@example.com`;
    await request(app)
      .post('/contact')
      .send({
        name: 'Test User',
        email: submitterEmail,
        message: 'Test message',
        language: 'en',
      });

    // Get the call to emailService.sendEmail that sent the auto-reply
    const calls = (emailService.sendEmail as jest.Mock).mock.calls;
    const autoReplyCall = calls.find((call: any[]) =>
      call[0]?.to === submitterEmail && call[0]?.headers?.['X-BoomCard-Request-ID']
    );

    expect(autoReplyCall).toBeDefined();
    const headers = autoReplyCall[0].headers;

    // X-BoomCard-Request-ID should be a UUID
    expect(headers['X-BoomCard-Request-ID']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // Message-ID should be a proper RFC 5322 Message-ID
    expect(headers['Message-ID']).toMatch(/^<ticket-[^>]+@mail\.boomcard\.bg>$/);

    // Verify the subject has the short ref
    expect(autoReplyCall[0].subject).toMatch(/\[#[a-f0-9]{4,8}\]/i);

    const ticket = await prisma.helpTicket.findFirst({
      where: { externalEmail: submitterEmail.toLowerCase() },
    });
    ticketIds.push(ticket!.id);
  });

  it('sends admin notification email with ticket ID', async () => {
    // Ensure we have an admin to own the ticket
    await createAdmin();

    const submitterEmail = `contact-admin-notify-${uid()}@example.com`;
    await request(app)
      .post('/contact')
      .send({
        name: 'Admin Notify Test',
        email: submitterEmail,
        message: 'Test message for admin notification',
        language: 'en',
      });

    // Get the HelpTicket created
    const ticket = await prisma.helpTicket.findFirst({
      where: { externalEmail: submitterEmail.toLowerCase() },
    });

    // Find the admin notification call (should include the ticket ID)
    const calls = (emailService.sendEmail as jest.Mock).mock.calls;
    const adminNotifyCall = calls.find((call: any[]) =>
      call[0]?.text?.includes(ticket!.id)
    );

    expect(adminNotifyCall).toBeDefined();
    expect(adminNotifyCall[0].html).toContain(`Ticket ID: ${ticket!.id}`);
    expect(adminNotifyCall[0].text).toContain(`Ticket ID: ${ticket!.id}`);

    ticketIds.push(ticket!.id);
  });

  it('creates separate tickets for multiple form submissions', async () => {
    // Ensure we have an admin to own the tickets
    await createAdmin();

    const submitterEmail1 = `contact-multi-1-${uid()}@example.com`;
    const submitterEmail2 = `contact-multi-2-${uid()}@example.com`;

    // Submit two contact forms
    const res1 = await request(app)
      .post('/contact')
      .send({
        name: 'User One',
        email: submitterEmail1,
        message: 'First message',
        language: 'en',
      });

    const res2 = await request(app)
      .post('/contact')
      .send({
        name: 'User Two',
        email: submitterEmail2,
        message: 'Second message',
        language: 'en',
      });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Verify two separate tickets were created
    const ticket1 = await prisma.helpTicket.findFirst({
      where: { externalEmail: submitterEmail1.toLowerCase() },
    });
    const ticket2 = await prisma.helpTicket.findFirst({
      where: { externalEmail: submitterEmail2.toLowerCase() },
    });

    expect(ticket1).toBeDefined();
    expect(ticket2).toBeDefined();
    expect(ticket1!.id).not.toBe(ticket2!.id);
    expect(ticket1!.body).toBe('First message');
    expect(ticket2!.body).toBe('Second message');

    ticketIds.push(ticket1!.id, ticket2!.id);
  });

  it('infers request type from subject and message', async () => {
    // Ensure we have an admin to own the ticket
    await createAdmin();

    // Test DISPUTE classification
    const disputeEmail = `contact-dispute-${uid()}@example.com`;
    await request(app)
      .post('/contact')
      .send({
        name: 'Dispute User',
        email: disputeEmail,
        message: 'I did not receive my cashback',
        language: 'en',
      });

    const disputeTicket = await prisma.helpTicket.findFirst({
      where: { externalEmail: disputeEmail.toLowerCase() },
    });
    expect(disputeTicket?.requestType).toBe('DISPUTE');

    // Test CHANGE classification
    const changeEmail = `contact-change-${uid()}@example.com`;
    await request(app)
      .post('/contact')
      .send({
        name: 'Change User',
        email: changeEmail,
        message: 'I need to change my bank account details',
        language: 'en',
      });

    const changeTicket = await prisma.helpTicket.findFirst({
      where: { externalEmail: changeEmail.toLowerCase() },
    });
    expect(changeTicket?.requestType).toBe('CHANGE');

    // Test SUPPORT (default) classification
    const supportEmail = `contact-support-${uid()}@example.com`;
    await request(app)
      .post('/contact')
      .send({
        name: 'Support User',
        email: supportEmail,
        message: 'How do I use this feature?',
        language: 'en',
      });

    const supportTicket = await prisma.helpTicket.findFirst({
      where: { externalEmail: supportEmail.toLowerCase() },
    });
    expect(supportTicket?.requestType).toBe('SUPPORT');

    ticketIds.push(
      disputeTicket!.id,
      changeTicket!.id,
      supportTicket!.id
    );
  });

  it('validates required fields', async () => {
    // Missing name
    const res1 = await request(app)
      .post('/contact')
      .send({
        email: 'test@example.com',
        message: 'message',
        language: 'en',
      });
    expect(res1.status).toBe(400);
    expect(res1.body.success).toBe(false);

    // Missing email
    const res2 = await request(app)
      .post('/contact')
      .send({
        name: 'Test',
        message: 'message',
        language: 'en',
      });
    expect(res2.status).toBe(400);
    expect(res2.body.success).toBe(false);

    // Missing message
    const res3 = await request(app)
      .post('/contact')
      .send({
        name: 'Test',
        email: 'test@example.com',
        language: 'en',
      });
    expect(res3.status).toBe(400);
    expect(res3.body.success).toBe(false);
  });

  it('validates email format', async () => {
    const res = await request(app)
      .post('/contact')
      .send({
        name: 'Test',
        email: 'not-an-email',
        message: 'message',
        language: 'en',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('respects field length limits', async () => {
    const res = await request(app)
      .post('/contact')
      .send({
        name: 'x'.repeat(150), // MAX_NAME = 120
        email: 'test@example.com',
        message: 'message',
        language: 'en',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('auto-reply Message-ID can be used by external mail clients for threading', async () => {
    // Ensure we have an admin to own the ticket
    const admin = await createAdmin();

    const submitterEmail = `contact-external-thread-${uid()}@example.com`;
    await request(app)
      .post('/contact')
      .send({
        name: 'External Threader',
        email: submitterEmail,
        message: 'Test message for threading',
        language: 'en',
      });

    // Get the ticket created
    const ticket = await prisma.helpTicket.findFirst({
      where: { externalEmail: submitterEmail.toLowerCase() },
    });

    // Get the auto-reply that was created
    const autoReply = await prisma.ticketReply.findFirst({
      where: { ticketId: ticket!.id, isAutoReply: true },
    });

    expect(autoReply).toBeDefined();
    expect(autoReply?.messageId).toBeDefined();

    // Simulate an external mail client replying to the auto-reply
    // The inbound parser would use the messageId to resolve the ticket
    const replyViaMessageId = await prisma.ticketReply.findFirst({
      where: { messageId: autoReply!.messageId },
    });

    expect(replyViaMessageId).toBeDefined();
    expect(replyViaMessageId?.ticketId).toBe(ticket!.id);

    ticketIds.push(ticket!.id);
  });
});
