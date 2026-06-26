/**
 * BC-ADMIN-SPEC-REAUDIT2-BOUNCE-SHORTREF-WIDTH-1 Integration Tests
 *
 * DEFECT (LOW): In the bounce-association path of ingestInboundEmail(), the
 * shortRef length guard was:
 *
 *   if (!relatedTicketId && ref.length <= 8)
 *
 * The canonical resolver (resolveTicket) uses:
 *
 *   if (ref.length >= 4 && ref.length <= 32)
 *
 * computeShortRefOfLength() widens shortRefs to 12/16/32 chars on collision.
 * SUBJECT_REF_RE matches {4,32}. A bounce whose subject carries a 12/16-char
 * widened shortRef therefore failed to resolve relatedTicketId; the bounce row
 * was written with ticketId=null and the per-ticket multi-bounce counter /
 * assignee-alert branch (~line 516-534) never fired.
 *
 * FIX: Changed the bounce-path guard to:
 *
 *   if (!relatedTicketId && ref.length >= 4 && ref.length <= 32)
 *
 * Test cases:
 * 1. Bounce with 8-char shortRef associates to ticket (baseline)
 * 2. Bounce with 12-char widened shortRef associates to ticket (bug fix)
 * 3. Bounce with a 3-char ref (too short for SUBJECT_REF_RE) → ticketId null
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { prisma } from '../../src/lib/prisma';
import { ingestInboundEmail } from '../../src/services/ticketInbound.service';
import { emailService } from '../../src/services/email.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique message-id for each test run to avoid unique-constraint
 *  collisions when tests run in the same DB session. */
function uniqueMessageId(label: string): string {
  return `<bounce-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid>`;
}

// ---------------------------------------------------------------------------
// Shared setup / teardown state
// ---------------------------------------------------------------------------

interface TestTicket {
  id: string;
  shortRef: string;
  externalEmail: string;
}

const created: {
  ticketIds: string[];
  bounceIds: string[];
} = { ticketIds: [], bounceIds: [] };

/** Create a HelpTicket row directly in the DB with a manually-assigned
 *  shortRef, bypassing the ingest path so we can control the ref length. */
async function createTicketWithShortRef(shortRef: string, externalEmail: string): Promise<TestTicket> {
  const admin = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!admin) throw new Error('No admin user found — seed the test DB before running this suite.');

  // We cannot pass an explicit `id` unless the schema allows it. Use create
  // without id (Prisma assigns one) then capture it.
  const ticket = await prisma.helpTicket.create({
    data: {
      subject: `Bounce shortRef test ticket [${shortRef}]`,
      body: 'Integration test fixture',
      status: 'OPEN',
      category: 'OTHER',
      priority: 'MEDIUM',
      userId: admin.id,
      source: 'EMAIL',
      externalEmail,
      shortRef,
    },
  });

  created.ticketIds.push(ticket.id);
  return { id: ticket.id, shortRef, externalEmail };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('BC-ADMIN-SPEC-REAUDIT2-BOUNCE-SHORTREF-WIDTH-1 — bounce shortRef width fix', () => {
  afterEach(async () => {
    // Clean up bounce rows first (FK → ticket), then tickets.
    if (created.bounceIds.length) {
      await prisma.inboundBounce.deleteMany({
        where: { id: { in: created.bounceIds } },
      });
      created.bounceIds.length = 0;
    }
    if (created.ticketIds.length) {
      // TicketReply rows may exist; delete them first to satisfy FK.
      await prisma.ticketReply.deleteMany({
        where: { ticketId: { in: created.ticketIds } },
      });
      await prisma.helpTicket.deleteMany({
        where: { id: { in: created.ticketIds } },
      });
      created.ticketIds.length = 0;
    }
  });

  // -------------------------------------------------------------------------
  // Test 1 — 8-char shortRef (baseline: must still work after the fix)
  // -------------------------------------------------------------------------
  it('Test 1: bounce with 8-char shortRef associates to ticket (baseline)', async () => {
    // Use a hex prefix unlikely to collide with real data.
    const shortRef = 'deaf1234'; // 8 hex chars
    const externalEmail = 'customer-8char@test.invalid';

    const ticket = await createTicketWithShortRef(shortRef, externalEmail);

    // Craft a DSN/bounce payload. isBounce() fires on BOUNCE_SUBJECT_RE:
    //   /delivery (status|failure)|undeliverable|mailer[- ]daemon/i
    const bouncePayload = {
      from: 'mailer-daemon@mail.example.com',
      to: 'support@boomcard.bg',
      subject: `[#${shortRef}] Delivery Status Notification`,
      text: 'Your message could not be delivered.',
      messageId: uniqueMessageId('test1-8char'),
    };

    const result = await ingestInboundEmail(bouncePayload);

    // Bounce path returns { ticketId: '', created: false }
    expect(result.created).toBe(false);

    // Find the InboundBounce row written for this messageId.
    const bounce = await prisma.inboundBounce.findFirst({
      where: { messageId: bouncePayload.messageId },
      orderBy: { createdAt: 'desc' },
    });

    expect(bounce).not.toBeNull();
    // Track for cleanup.
    if (bounce) created.bounceIds.push(bounce.id);

    // Core assertion: ticketId must be populated — the bounce associated.
    expect(bounce?.ticketId).toBe(ticket.id);
  });

  // -------------------------------------------------------------------------
  // Test 2 — 12-char widened shortRef (the actual bug fix)
  // -------------------------------------------------------------------------
  it('Test 2: bounce with 12-char widened shortRef associates to ticket (was NULL before fix)', async () => {
    // Simulate a ticket whose shortRef was widened to 12 chars due to a
    // collision at 8 chars (computeShortRefOfLength attempt=2 → 12 chars).
    const shortRef = 'cafe0123dead'; // 12 hex chars
    const externalEmail = 'customer-12char@test.invalid';

    const ticket = await createTicketWithShortRef(shortRef, externalEmail);

    const bouncePayload = {
      from: 'postmaster@mail.example.com',
      to: 'support@boomcard.bg',
      subject: `[#${shortRef}] Delivery Status Notification`,
      text: 'This address does not exist.',
      messageId: uniqueMessageId('test2-12char'),
    };

    const result = await ingestInboundEmail(bouncePayload);

    expect(result.created).toBe(false);

    const bounce = await prisma.inboundBounce.findFirst({
      where: { messageId: bouncePayload.messageId },
      orderBy: { createdAt: 'desc' },
    });

    expect(bounce).not.toBeNull();
    if (bounce) created.bounceIds.push(bounce.id);

    // Before the fix, ref.length (12) > 8 → the shortRef lookup was skipped →
    // bounce.ticketId was null. After the fix it must be the ticket's id.
    expect(bounce?.ticketId).toBe(ticket.id);
  });

  // -------------------------------------------------------------------------
  // Test 3 — ref that is 3 chars (below SUBJECT_REF_RE minimum of 4)
  // -------------------------------------------------------------------------
  it('Test 3: bounce subject with sub-4-char ref produces no ticket association (ticketId null)', async () => {
    // The regex SUBJECT_REF_RE = /\[#([a-f0-9]{4,32})\]/i won't match a 3-char
    // ref, so subjectMatch will be null and relatedTicketId stays null.
    // We still need a ticket in the DB to be sure the service isn't matching
    // by some other means (e.g. fromEmail → externalEmail).
    const shortRef = 'abcd1234'; // valid 8-char ref, but we'll send a different (3-char) one
    const externalEmail = 'customer-short-ref@test.invalid';
    await createTicketWithShortRef(shortRef, externalEmail);

    const bouncePayload = {
      // Use a from address that doesn't match any ticket's externalEmail.
      from: 'mailer-daemon@unrelated.invalid',
      to: 'support@boomcard.bg',
      // 3-char ref — SUBJECT_REF_RE requires {4,32}, so this won't match.
      subject: '[#abc] Delivery Status Notification',
      text: 'Undeliverable.',
      messageId: uniqueMessageId('test3-3char'),
    };

    await ingestInboundEmail(bouncePayload);

    const bounce = await prisma.inboundBounce.findFirst({
      where: { messageId: bouncePayload.messageId },
      orderBy: { createdAt: 'desc' },
    });

    expect(bounce).not.toBeNull();
    if (bounce) created.bounceIds.push(bounce.id);

    // No valid ref → ticketId must be null.
    expect(bounce?.ticketId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 4 — 3-bounce threshold flips alerted=true via widened shortRef
  // -------------------------------------------------------------------------
  it('Test 4: 3+ bounces via 12-char widened shortRef flip alerted=true for all ticket bounce rows', async () => {
    const shortRef = 'beef0099aabb'; // 12-char widened shortRef
    const externalEmail = 'customer-alert-test@test.invalid';

    // Find an admin with an email so the assignee-alert branch can fire.
    const assignee = await prisma.user.findFirst({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, email: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });
    if (!assignee) throw new Error('No admin with email found — seed the test DB first.');

    // Create ticket with assignee set so the assignee-alert branch is reachable.
    const admin = await prisma.user.findFirst({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) throw new Error('No admin user found.');

    const ticket = await prisma.helpTicket.create({
      data: {
        subject: `Bounce alert threshold test [${shortRef}]`,
        body: 'Integration test fixture',
        status: 'OPEN',
        category: 'OTHER',
        priority: 'MEDIUM',
        userId: admin.id,
        assigneeId: assignee.id,
        source: 'EMAIL',
        externalEmail,
        shortRef,
      },
    });
    created.ticketIds.push(ticket.id);

    // Pre-seed 2 unalerted bounce rows so the 3rd (from ingestInboundEmail) hits the threshold.
    const pre1 = await prisma.inboundBounce.create({
      data: { fromEmail: 'mailer-daemon@pre.invalid', ticketId: ticket.id, alerted: false },
    });
    const pre2 = await prisma.inboundBounce.create({
      data: { fromEmail: 'mailer-daemon@pre.invalid', ticketId: ticket.id, alerted: false },
    });
    created.bounceIds.push(pre1.id, pre2.id);

    // Spy on emailService.sendEmail to verify assignee-alert dispatch without
    // actually sending email. The spy captures calls and resolves silently.
    const sendEmailSpy = jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined as any);

    // Ingest a 3rd bounce carrying the 12-char widened shortRef.
    const bouncePayload = {
      from: 'mailer-daemon@mail.example.com',
      to: 'support@boomcard.bg',
      subject: `[#${shortRef}] Delivery Status Notification`,
      text: 'Your message could not be delivered.',
      messageId: uniqueMessageId('test4-alert-threshold'),
    };

    await ingestInboundEmail(bouncePayload);

    // Assert assignee email was dispatched to the assignee's address.
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: assignee.email }),
    );
    sendEmailSpy.mockRestore();

    // Track the new bounce row for cleanup.
    const newBounce = await prisma.inboundBounce.findFirst({
      where: { messageId: bouncePayload.messageId },
      orderBy: { createdAt: 'desc' },
    });
    expect(newBounce).not.toBeNull();
    if (newBounce) created.bounceIds.push(newBounce.id);

    // Core assertion: the 3rd bounce associated to the ticket via 12-char shortRef.
    expect(newBounce?.ticketId).toBe(ticket.id);

    // Core assertion: all 3 bounce rows for this ticket must now have alerted=true.
    const remaining = await prisma.inboundBounce.findMany({
      where: { ticketId: ticket.id, alerted: false },
    });
    expect(remaining).toHaveLength(0);

    const alertedRows = await prisma.inboundBounce.findMany({
      where: { ticketId: ticket.id, alerted: true },
    });
    expect(alertedRows.length).toBeGreaterThanOrEqual(3);
  });
});
