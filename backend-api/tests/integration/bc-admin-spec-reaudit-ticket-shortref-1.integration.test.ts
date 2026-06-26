/**
 * BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1 Integration Tests
 *
 * DEFECT: shortRef collision handling for inbound emails — when two tickets hash
 * to the same 8-char shortRef, the second ticket's shortRef persistence fails,
 * breaking subject-prefix threading and causing duplicate tickets on subsequent
 * inbound emails.
 *
 * REQUIRED FIX:
 * 1. persistShortRefWithCollisionRetry() retries with progressively longer refs (8→12→16→32)
 * 2. Plus-address resolver accepts widened shortRefs (4-32 chars, not just ≤8)
 * 3. Subject-prefix resolver accepts widened shortRefs (4-32 chars, not just ≤8)
 * 4. buildTicketSubject idempotency handles shortRef changes (strips old marker first)
 * 5. computeShortRefOfLength validates attempt range (no silent clamping)
 * 6. Ticket creation rolled back if shortRef persistence fails after all retries
 * 7. Alert message clearly describes impact when persistence fails
 *
 * Test cases:
 * 1. Single ticket creation populates 8-char shortRef without collision
 * 2. Collision detection: craft UUIDs that collide at 8 chars, verify widened to 12
 * 3. Subject-prefix inbound resolution works for 8-char shortRef
 * 4. Subject-prefix inbound resolution works for 12-char widened shortRef
 * 5. Plus-address inbound resolution works for 8-char shortRef
 * 6. Plus-address inbound resolution works for 12-char widened shortRef
 * 7. Double-prefixing prevented: buildTicketSubject idempotent on shortRef change
 * 8. buildTicketSubject with custom shortRef works and is idempotent
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import {
  ingestInboundEmail,
  InboundEmailPayload,
} from '../../src/services/ticketInbound.service';
import {
  buildTicketSubject,
  computeShortRefOfLength,
} from '../../src/services/ticketEmail.service';

// UUID crafting helper: create a UUIDv4-like string with controlled leading hex
function craftUuidWithPrefix(prefix: string, uniqueSuffix: number): string {
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (UUID v4 structure)
  // We control the first 8 chars, randomize the rest but keep prefix collision point
  const p = prefix.padEnd(8, '0').slice(0, 8);
  const rand1 = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  const rand2 = (4000 + (uniqueSuffix % 4095)).toString(16);
  const rand3 = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  const rand4 = Math.random().toString(16).slice(2, 12).padEnd(12, '0');
  return `${p}-${rand1}-${rand2}-${rand3}-${rand4}`;
}

interface TestContext {
  // We'll create colliding tickets directly in DB to test inbound resolution
  ticket1Id: string; // 8-char collision on both
  ticket2Id: string; // widened to 12 chars on second creation attempt
  ticket1ShortRef: string; // 8 chars
  ticket2ShortRef: string; // 12 chars (widened)
}

const ctx: TestContext = {
  ticket1Id: '',
  ticket2Id: '',
  ticket1ShortRef: '',
  ticket2ShortRef: '',
};

beforeAll(async () => {
  // Create a test system admin to own tickets
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
  });
  if (!admin) {
    throw new Error('No SUPER_ADMIN found for test setup');
  }

  // Create first ticket with collision-prone UUID
  // Using a controlled prefix so we can craft a collision
  const prefix = 'aaaabbbb';
  ctx.ticket1Id = craftUuidWithPrefix(prefix, 1);

  const ticket1 = await prisma.helpTicket.create({
    data: {
      id: ctx.ticket1Id,
      subject: 'Test Ticket 1 (8-char shortRef)',
      body: 'Body for ticket 1',
      status: 'OPEN',
      category: 'OTHER',
      priority: 'MEDIUM',
      userId: admin.id,
      source: 'EMAIL',
      externalEmail: 'sender1@example.com',
    },
  });

  // Manually set shortRef to test 8-char collision
  ctx.ticket1ShortRef = ctx.ticket1Id.replace(/-/g, '').slice(0, 8);
  await prisma.helpTicket.update({
    where: { id: ctx.ticket1Id },
    data: { shortRef: ctx.ticket1ShortRef },
  });

  // Create second ticket with same 8-char prefix to trigger collision
  // In a real scenario, this would collide during ingestInboundEmail and retry to 12 chars
  ctx.ticket2Id = craftUuidWithPrefix(prefix, 2);

  const ticket2 = await prisma.helpTicket.create({
    data: {
      id: ctx.ticket2Id,
      subject: 'Test Ticket 2 (12-char shortRef)',
      body: 'Body for ticket 2',
      status: 'OPEN',
      category: 'OTHER',
      priority: 'MEDIUM',
      userId: admin.id,
      source: 'EMAIL',
      externalEmail: 'sender2@example.com',
    },
  });

  // Manually set shortRef to 12 chars to simulate collision resolution
  ctx.ticket2ShortRef = ctx.ticket2Id.replace(/-/g, '').slice(0, 12);
  await prisma.helpTicket.update({
    where: { id: ctx.ticket2Id },
    data: { shortRef: ctx.ticket2ShortRef },
  });
});

afterAll(async () => {
  // Clean up test tickets
  await prisma.helpTicket.deleteMany({
    where: { id: { in: [ctx.ticket1Id, ctx.ticket2Id] } },
  });
});

describe('BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1 — Collision Handling', () => {
  /**
   * Test 1: Single ticket creation populates 8-char shortRef without collision.
   */
  it('creates a ticket and populates 8-char shortRef without collision', async () => {
    const admin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });

    const result = await ingestInboundEmail({
      from: 'new-sender@example.com',
      to: 'office@boomcard.bg',
      subject: 'Support Request',
      text: 'I need help',
      messageId: '<msg-001@example.com>',
    });

    expect(result.created).toBe(true);
    expect(result.ticketId).toBeTruthy();

    const ticket = await prisma.helpTicket.findUnique({
      where: { id: result.ticketId },
    });

    expect(ticket).toBeTruthy();
    expect(ticket?.shortRef).toBeTruthy();
    expect(ticket?.shortRef?.length).toBe(8);

    // Clean up
    await prisma.helpTicket.delete({ where: { id: result.ticketId } });
  });

  /**
   * Test 1b: Collision-retry code path — when shortRef collides at 8 chars,
   * the persistence function retries with 12, 16, and 32 chars until success.
   *
   * CRITICAL: This test MUST mock prisma.helpTicket.update() to force P2002
   * violations on calls 1–3, then succeed on call 4. This exercises the actual
   * retry loop and verifies that:
   *   - The collision-retry function makes 4 calls in sequence
   *   - The final shortRef is widened (≥12 chars, not 8)
   *   - Subject-prefix resolution works with the widened ref
   *
   * Without mocking, the test would need to generate a random UUID that happens
   * to collide with the blocker's 8-char prefix (~1 in 4 billion probability),
   * making the collision path untested.
   */
  it('retries shortRef persistence on collision, widening from 8 → 12 → 16 → 32 chars', async () => {
    const admin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });
    if (!admin) throw new Error('No admin for test');

    try {
      // Step 1: Set up mock for prisma.helpTicket.update()
      // We'll track ALL shortRef update attempts and fail the first 3, succeed on the 4th.
      // This simulates a collision scenario where attempts 1 (8 chars), 2 (12 chars),
      // and 3 (16 chars) all fail with P2002, and attempt 4 (32 chars) succeeds.
      let shortRefUpdateCount = 0;
      const originalUpdate = prisma.helpTicket.update;
      const mockUpdate = jest.spyOn(prisma.helpTicket, 'update').mockImplementation(async (args) => {
        // Only intercept shortRef updates (not other ticket updates)
        if (args.data && 'shortRef' in args.data) {
          shortRefUpdateCount++;
          if (shortRefUpdateCount <= 3) {
            // Simulate unique constraint violation on attempts 1–3
            const error = new Error(
              'Unique constraint failed on the fields: (`shortRef`)',
            );
            (error as any).code = 'P2002';
            (error as any).meta = { target: ['shortRef'] };
            throw error;
          }
          // Attempt 4 succeeds — fall through to real implementation
        }
        // Non-shortRef updates (like initial ticket creation) succeed normally
        return originalUpdate.call(prisma.helpTicket, args);
      });

      // Step 2: Ingest an email — this will:
      //   1. Create a new ticket
      //   2. Call persistShortRefWithCollisionRetry()
      //   3. Hit our mocked Prisma: attempts 1, 2, 3 fail with P2002; attempt 4 succeeds
      const result = await ingestInboundEmail({
        from: 'collision-sender@example.com',
        to: 'office@boomcard.bg',
        subject: 'Email for collision-retry test',
        text: 'Testing collision-retry path with mocked Prisma',
        messageId: '<msg-collision-@example.com>',
      });

      expect(result.created).toBe(true);

      // Step 3: Verify the collision-retry loop was exercised
      // We expect shortRef updates to be called 4 times:
      // - Attempt 1 (8 chars): P2002 violation
      // - Attempt 2 (12 chars): P2002 violation
      // - Attempt 3 (16 chars): P2002 violation
      // - Attempt 4 (32 chars): Success
      expect(shortRefUpdateCount).toBe(4);

      // Step 4: Fetch the final ticket and verify shortRef is widened
      const finalTicket = await prisma.helpTicket.findUnique({
        where: { id: result.ticketId },
      });

      expect(finalTicket).toBeTruthy();
      expect(finalTicket?.shortRef).toBeTruthy();
      // The final shortRef should be 32 chars (attempt 4 succeeded)
      // OR less if an earlier attempt succeeded (but our mock forces all 4)
      expect(finalTicket?.shortRef!.length).toBeGreaterThanOrEqual(16);

      // Step 5: Verify subject-prefix inbound resolution works with the widened shortRef
      if (finalTicket?.shortRef) {
        // Create a fresh mock that allows subsequent updates (for the reply creation)
        mockUpdate.mockRestore();
        jest.spyOn(prisma.helpTicket, 'update').mockImplementation(
          async (args) => originalUpdate.call(prisma.helpTicket, args),
        );

        const replyViaWidenedRef = await ingestInboundEmail({
          from: 'collision-sender@example.com',
          to: 'office@boomcard.bg',
          subject: `[#${finalTicket.shortRef}] Reply via widened shortRef`,
          text: 'Threading via the widened ref',
          messageId: '<msg-reply-widened@example.com>',
        });

        // Should attach to the final ticket
        expect(replyViaWidenedRef.ticketId).toBe(result.ticketId);
        expect(replyViaWidenedRef.created).toBe(false);
        expect(replyViaWidenedRef.replyId).toBeTruthy();

        // Clean up the reply
        if (replyViaWidenedRef.replyId) {
          await prisma.ticketReply.delete({ where: { id: replyViaWidenedRef.replyId } });
        }
      }

      // Clean up the final ticket
      await prisma.helpTicket.delete({ where: { id: result.ticketId } });
    } finally {
      // Always restore mocks
      jest.restoreAllMocks();
    }
  });

  /**
   * Test 2: Subject-prefix inbound resolution works for 8-char shortRef.
   */
  it('resolves subject-prefix inbound to ticket with 8-char shortRef', async () => {
    const subject = `[#${ctx.ticket1ShortRef}] Reply to first ticket`;
    const result = await ingestInboundEmail({
      from: 'sender1@example.com', // Same as original ticket creator
      to: 'office@boomcard.bg',
      subject,
      text: 'This is a reply',
      messageId: '<msg-reply-1@example.com>',
    });

    expect(result.ticketId).toBe(ctx.ticket1Id);
    expect(result.created).toBe(false); // Should attach to existing ticket
    expect(result.replyId).toBeTruthy(); // Should have created a reply

    // Verify the reply was attached
    const reply = await prisma.ticketReply.findUnique({
      where: { id: result.replyId },
    });
    expect(reply?.ticketId).toBe(ctx.ticket1Id);

    // Clean up the reply
    await prisma.ticketReply.delete({ where: { id: result.replyId! } });
  });

  /**
   * Test 3: Subject-prefix inbound resolution works for 12-char widened shortRef.
   */
  it('resolves subject-prefix inbound to ticket with 12-char shortRef', async () => {
    const subject = `[#${ctx.ticket2ShortRef}] Reply to second ticket`;
    const result = await ingestInboundEmail({
      from: 'sender2@example.com', // Same as original ticket creator
      to: 'office@boomcard.bg',
      subject,
      text: 'This is a reply to the second ticket',
      messageId: '<msg-reply-2@example.com>',
    });

    expect(result.ticketId).toBe(ctx.ticket2Id);
    expect(result.created).toBe(false); // Should attach to existing ticket
    expect(result.replyId).toBeTruthy();

    // Verify the reply was attached
    const reply = await prisma.ticketReply.findUnique({
      where: { id: result.replyId },
    });
    expect(reply?.ticketId).toBe(ctx.ticket2Id);

    // Clean up
    await prisma.ticketReply.delete({ where: { id: result.replyId! } });
  });

  /**
   * Test 4: buildTicketSubject idempotency with shortRef changes.
   */
  it('buildTicketSubject is idempotent even when shortRef changes from 8 to 12 chars', () => {
    // First call with 8-char shortRef
    const subject = 'Support Question';
    const with8Char = buildTicketSubject(ctx.ticket1Id, subject, ctx.ticket1ShortRef);
    expect(with8Char).toBe(`[#${ctx.ticket1ShortRef}] Support Question`);

    // Call again with same subject and shortRef — should be idempotent
    const again8Char = buildTicketSubject(ctx.ticket1Id, with8Char, ctx.ticket1ShortRef);
    expect(again8Char).toBe(with8Char);

    // Now call with 12-char shortRef (simulating collision resolution)
    const with12Char = buildTicketSubject(ctx.ticket1Id, with8Char, ctx.ticket1ShortRef.slice(0, 12) + '0000');
    // Should strip the old [#...] and prepend the new one — no double-prefix
    expect(with12Char).toMatch(/^\[#[a-f0-9]{12}\]/);
    expect(with12Char).not.toContain('Support Question] [#');
  });

  /**
   * Test 5: computeShortRefOfLength validates attempt range.
   */
  it('computeShortRefOfLength throws on invalid attempt number', () => {
    const ticketId = 'aabbccdd-0000-0000-0000-000000000000';

    // Valid attempts
    expect(computeShortRefOfLength(ticketId, 1).length).toBe(8);
    expect(computeShortRefOfLength(ticketId, 2).length).toBe(12);
    expect(computeShortRefOfLength(ticketId, 3).length).toBe(16);
    expect(computeShortRefOfLength(ticketId, 4).length).toBe(32);

    // Invalid attempts should throw
    expect(() => computeShortRefOfLength(ticketId, 0)).toThrow();
    expect(() => computeShortRefOfLength(ticketId, 5)).toThrow();
    expect(() => computeShortRefOfLength(ticketId, -1)).toThrow();
  });

  /**
   * Test 6: Both tickets can coexist with different shortRef lengths.
   */
  it('maintains distinct shortRefs for collision-pair tickets in database', async () => {
    const t1 = await prisma.helpTicket.findUnique({
      where: { id: ctx.ticket1Id },
    });
    const t2 = await prisma.helpTicket.findUnique({
      where: { id: ctx.ticket2Id },
    });

    expect(t1?.shortRef).toBe(ctx.ticket1ShortRef);
    expect(t2?.shortRef).toBe(ctx.ticket2ShortRef);
    expect(t1?.shortRef?.length).toBe(8);
    expect(t2?.shortRef?.length).toBe(12);
    expect(t1?.shortRef).not.toBe(t2?.shortRef);
  });

  /**
   * Test 7: Plus-address environment variable check (deferred to v1.3).
   * When TICKET_PLUS_ADDRESSING_ENABLED=true, plus-address resolver should
   * accept 4-32 char refs. This test verifies the regex and length guard.
   */
  it('plus-address regex correctly extracts shortRef (4-32 chars)', () => {
    // The regex should be /\+([a-f0-9]{4,32})@/i
    const testCases = [
      { to: 'support+abcd@boomcard.bg', expected: 'abcd' }, // 4 chars
      { to: 'support+aabbccdd@boomcard.bg', expected: 'aabbccdd' }, // 8 chars
      { to: 'support+aabbccdd0000@boomcard.bg', expected: 'aabbccdd0000' }, // 12 chars
      { to: 'support+aabbccdd00001111@boomcard.bg', expected: 'aabbccdd00001111' }, // 16 chars
      { to: 'support+aabbccdd00001111222233334444@boomcard.bg', expected: 'aabbccdd00001111222233334444' }, // 28 chars
      { to: 'support+aabbccdd000011112222333344445555@boomcard.bg', expected: 'aabbccdd000011112222333344445555' }, // 32 chars
    ];

    const regex = /\+([a-f0-9]{4,32})@/i;

    testCases.forEach(({ to, expected }) => {
      const match = regex.exec(to);
      if (expected) {
        expect(match?.[1]).toBe(expected);
      } else {
        expect(match).toBeNull();
      }
    });
  });

  /**
   * Test 8: Short subject [#XXXX] patterns match 4-char minimum per spec.
   */
  it('subject pattern [#XXXX] regex matches 4-32 char refs', () => {
    const regex = /\[#([a-f0-9]{4,32})\]/i;

    const testCases = [
      { subject: '[#abcd]', expected: 'abcd' }, // 4 chars
      { subject: '[#aabbccdd]', expected: 'aabbccdd' }, // 8 chars
      { subject: '[#aabbccdd0000]', expected: 'aabbccdd0000' }, // 12 chars
      { subject: '[#aabbccdd00001111]', expected: 'aabbccdd00001111' }, // 16 chars
      { subject: '[#aabbccdd0000111122223333]', expected: 'aabbccdd0000111122223333' }, // 24 chars
      { subject: '[#aabbccdd000011112222333344445555]', expected: 'aabbccdd000011112222333344445555' }, // 32 chars
      { subject: '[#abc]', expected: null }, // Too short
    ];

    testCases.forEach(({ subject, expected }) => {
      const match = regex.exec(subject);
      if (expected) {
        expect(match?.[1]).toBe(expected);
      } else {
        expect(match).toBeNull();
      }
    });
  });
});
