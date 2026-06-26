/**
 * Unit tests for ticketEmail.service.ts and audience-aware Reply-To.
 *
 * Covers:
 *   1. buildTicketHeaders() — must NOT emit a Reply-To header (spec §9.5 fix:
 *      Reply-To is resolved audience-aware by email.service.ts, not hardcoded here).
 *   2. buildTicketSubject() — idempotency and prefix format.
 *   3. newMessageId() — format and uniqueness.
 *   4. Audience propagation in partnerHelp ticket confirmation email
 *      (audience: 'partner' → partner_reply_to_email used).
 */

import {
  buildTicketHeaders,
  buildTicketSubject,
  newMessageId,
  computeShortRef,
  computeShortRefOfLength,
} from '../../src/services/ticketEmail.service';

// ─── buildTicketHeaders ───────────────────────────────────────────────────────

describe('buildTicketHeaders', () => {
  it('does NOT include a Reply-To header', () => {
    const { headers } = buildTicketHeaders({ ticketId: 'abc-123' });
    expect(headers['Reply-To']).toBeUndefined();
  });

  it('includes X-BoomCard-Ticket-ID and Message-ID', () => {
    const ticketId = 'test-ticket-uuid';
    const { headers, messageId } = buildTicketHeaders({ ticketId });
    expect(headers['X-BoomCard-Ticket-ID']).toBe(ticketId);
    expect(headers['Message-ID']).toBe(messageId);
    expect(messageId).toMatch(/^<ticket-test-ticket-uuid-[0-9a-f]+@mail\.boomcard\.bg>$/);
  });

  it('sets In-Reply-To and References when inReplyTo is provided', () => {
    const inReplyTo = '<prior-msg@mail.boomcard.bg>';
    const { headers } = buildTicketHeaders({ ticketId: 'tid', inReplyTo });
    expect(headers['In-Reply-To']).toBe(inReplyTo);
    expect(headers['References']).toBe(inReplyTo);
  });

  it('builds References chain from provided references array', () => {
    const refs = ['<msg-1@mail.boomcard.bg>', '<msg-2@mail.boomcard.bg>'];
    const { headers } = buildTicketHeaders({
      ticketId: 'tid',
      inReplyTo: refs[1],
      references: refs,
    });
    expect(headers['References']).toBe(refs.join(' '));
    expect(headers['In-Reply-To']).toBe(refs[1]);
  });

  it('omits In-Reply-To and References when inReplyTo is null', () => {
    const { headers } = buildTicketHeaders({ ticketId: 'tid', inReplyTo: null });
    expect(headers['In-Reply-To']).toBeUndefined();
    expect(headers['References']).toBeUndefined();
  });

  it('omits In-Reply-To and References when neither is provided', () => {
    const { headers } = buildTicketHeaders({ ticketId: 'tid' });
    expect(headers['In-Reply-To']).toBeUndefined();
    expect(headers['References']).toBeUndefined();
  });

  it('returns a unique messageId each call', () => {
    const { messageId: id1 } = buildTicketHeaders({ ticketId: 'tid' });
    const { messageId: id2 } = buildTicketHeaders({ ticketId: 'tid' });
    expect(id1).not.toBe(id2);
  });
});

// ─── buildTicketSubject ───────────────────────────────────────────────────────

describe('buildTicketSubject', () => {
  it('prepends the [#ref] marker to the subject', () => {
    const result = buildTicketSubject('aabbccdd-0000-0000-0000-000000000000', 'My Subject');
    expect(result).toMatch(/^\[#aabbccdd\] My Subject$/);
  });

  it('is idempotent — does not double-prefix if marker already present', () => {
    const first = buildTicketSubject('aabbccdd-0000-0000-0000-000000000000', 'My Subject');
    const second = buildTicketSubject('aabbccdd-0000-0000-0000-000000000000', first);
    expect(second).toBe(first);
  });

  it('uses the first 8 hex chars of the ticketId (stripping dashes)', () => {
    const result = buildTicketSubject('11223344-5566-7788-99aa-bbccddeeff00', 'Hi');
    expect(result).toContain('[#11223344]');
  });
});

// ─── newMessageId ─────────────────────────────────────────────────────────────

describe('newMessageId', () => {
  it('generates a valid RFC 5322 Message-ID format', () => {
    const id = newMessageId('ticket-uuid');
    expect(id).toMatch(/^<ticket-ticket-uuid-[0-9a-f]{16}@mail\.boomcard\.bg>$/);
  });

  it('uses a custom domain when provided', () => {
    const id = newMessageId('tid', 'custom.example.com');
    expect(id).toContain('@custom.example.com>');
  });

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newMessageId('tid')));
    expect(ids.size).toBe(20);
  });
});

// ─── Audience-aware Reply-To: email.service integration ──────────────────────
//
// These tests verify that when the email service is called with
// audience='partner', it picks up partner_reply_to_email (office@boomcard.bg)
// instead of the subscriber default reply_to_email (support@boomcard.bg).
// We mock getSystemSettingStr to return fixture values per key.

const resendSendCalls: any[] = [];

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(async (args: any) => {
        resendSendCalls.push(args);
        return { data: { id: 'resend-id' }, error: null };
      }),
    },
  })),
}));

const systemSettings: Record<string, string> = {};
jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingStr: jest.fn(async (key: string, fallback: string) => {
    return systemSettings[key] ?? fallback;
  }),
  getSystemSettingInt: jest.fn(async (_key: string, fallback: number) => fallback),
  invalidateSystemSettingCache: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Force EmailService into "enabled" mode so sendEmail actually calls Resend.
// EmailService.enabled = !!RESEND_API_KEY && NODE_ENV === 'production'.
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.NODE_ENV = 'production';

// Import AFTER mocks and env are set up
import { EmailService } from '../../src/services/email.service';

beforeEach(() => {
  resendSendCalls.length = 0;
  Object.keys(systemSettings).forEach((k) => delete systemSettings[k]);
  jest.clearAllMocks();
});

describe('EmailService audience-aware Reply-To', () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService();
  });

  it('uses partner_reply_to_email when audience=partner', async () => {
    systemSettings['partner_reply_to_email'] = 'office@boomcard.bg';
    systemSettings['from_email'] = 'noreply@boomcard.bg';
    systemSettings['sender_name'] = 'BoomCard';

    await service.sendEmail({
      to: 'partner@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      audience: 'partner',
    });

    expect(resendSendCalls).toHaveLength(1);
    expect(resendSendCalls[0].replyTo).toBe('office@boomcard.bg');
  });

  it('uses reply_to_email when audience is omitted (subscriber default)', async () => {
    systemSettings['reply_to_email'] = 'support@boomcard.bg';
    systemSettings['from_email'] = 'noreply@boomcard.bg';
    systemSettings['sender_name'] = 'BoomCard';

    await service.sendEmail({
      to: 'subscriber@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(resendSendCalls).toHaveLength(1);
    expect(resendSendCalls[0].replyTo).toBe('support@boomcard.bg');
  });

  it('explicit options.replyTo takes precedence over DB setting', async () => {
    systemSettings['reply_to_email'] = 'support@boomcard.bg';
    systemSettings['from_email'] = 'noreply@boomcard.bg';
    systemSettings['sender_name'] = 'BoomCard';

    await service.sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      replyTo: 'custom@boomcard.bg',
    });

    expect(resendSendCalls[0].replyTo).toBe('custom@boomcard.bg');
  });

  it('omits replyTo header when DB returns empty string and no explicit replyTo', async () => {
    systemSettings['reply_to_email'] = '';
    systemSettings['from_email'] = 'noreply@boomcard.bg';
    systemSettings['sender_name'] = 'BoomCard';

    await service.sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(resendSendCalls[0].replyTo).toBeUndefined();
  });

  it('falls back to office_email when partner_reply_to_email is absent', async () => {
    // partner_reply_to_email not set; service must chain to office_email per spec §9.5
    systemSettings['office_email'] = 'office@boomcard.bg';
    systemSettings['from_email'] = 'noreply@boomcard.bg';
    systemSettings['sender_name'] = 'BoomCard';
    // partner_reply_to_email deliberately absent from systemSettings

    await service.sendEmail({
      to: 'partner@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      audience: 'partner',
    });

    expect(resendSendCalls).toHaveLength(1);
    expect(resendSendCalls[0].replyTo).toBe('office@boomcard.bg');
  });

  it('falls back to office_email when partner_reply_to_email is empty string', async () => {
    systemSettings['partner_reply_to_email'] = '';
    systemSettings['office_email'] = 'office@boomcard.bg';
    systemSettings['from_email'] = 'noreply@boomcard.bg';
    systemSettings['sender_name'] = 'BoomCard';

    await service.sendEmail({
      to: 'partner@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      audience: 'partner',
    });

    expect(resendSendCalls).toHaveLength(1);
    expect(resendSendCalls[0].replyTo).toBe('office@boomcard.bg');
  });

  it('ticket headers from buildTicketHeaders do NOT override Reply-To set by email service', async () => {
    systemSettings['partner_reply_to_email'] = 'office@boomcard.bg';
    systemSettings['from_email'] = 'noreply@boomcard.bg';
    systemSettings['sender_name'] = 'BoomCard';

    const { headers } = buildTicketHeaders({ ticketId: 'tid-001' });
    // Confirm no Reply-To in headers
    expect(headers['Reply-To']).toBeUndefined();

    await service.sendEmail({
      to: 'partner@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      headers,
      audience: 'partner',
    });

    // The email should use partner_reply_to_email, not any header override
    expect(resendSendCalls[0].replyTo).toBe('office@boomcard.bg');
    // The raw headers object passed to Resend must not contain a Reply-To key
    const rawHeaders = resendSendCalls[0].headers ?? {};
    expect(rawHeaders['Reply-To']).toBeUndefined();
  });
});

// ─── BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1: Collision resolution ──────────

describe('computeShortRef and computeShortRefOfLength', () => {
  it('computeShortRef returns 8-char hex prefix (UUID sans dashes)', () => {
    const ticketId = 'aabbccdd-eeff-0011-2233-445566778899';
    const result = computeShortRef(ticketId);
    expect(result).toBe('aabbccdd');
    expect(result.length).toBe(8);
  });

  it('computeShortRef is deterministic for the same UUID', () => {
    const ticketId = 'aabbccdd-eeff-0011-2233-445566778899';
    const r1 = computeShortRef(ticketId);
    const r2 = computeShortRef(ticketId);
    expect(r1).toBe(r2);
  });

  it('computeShortRefOfLength(id, 1) returns 8 chars', () => {
    const id = '12345678-90ab-cdef-0123-456789abcdef';
    expect(computeShortRefOfLength(id, 1)).toBe('12345678');
    expect(computeShortRefOfLength(id, 1).length).toBe(8);
  });

  it('computeShortRefOfLength(id, 2) returns 12 chars', () => {
    const id = '12345678-90ab-cdef-0123-456789abcdef';
    expect(computeShortRefOfLength(id, 2)).toBe('1234567890ab');
    expect(computeShortRefOfLength(id, 2).length).toBe(12);
  });

  it('computeShortRefOfLength(id, 3) returns 16 chars', () => {
    const id = '12345678-90ab-cdef-0123-456789abcdef';
    expect(computeShortRefOfLength(id, 3)).toBe('1234567890abcdef');
    expect(computeShortRefOfLength(id, 3).length).toBe(16);
  });

  it('computeShortRefOfLength(id, 4) returns 32 chars (full UUID sans dashes)', () => {
    const id = '12345678-90ab-cdef-0123-456789abcdef';
    const result = computeShortRefOfLength(id, 4);
    expect(result).toBe('1234567890abcdef0123456789abcdef');
    expect(result.length).toBe(32);
  });

  it('computeShortRefOfLength clamps out-of-range attempts to valid range', () => {
    const id = '12345678-90ab-cdef-0123-456789abcdef';
    // attempt=0 should clamp to attempt=1 (8 chars)
    expect(computeShortRefOfLength(id, 0).length).toBe(8);
    // attempt=100 should clamp to attempt=4 (32 chars)
    expect(computeShortRefOfLength(id, 100).length).toBe(32);
  });

  it('buildTicketSubject accepts optional shortRef parameter', () => {
    const ticketId = 'aabbccdd-0000-0000-0000-000000000000';
    // Without shortRef, uses 8-char default
    const withoutShortRef = buildTicketSubject(ticketId, 'Test');
    expect(withoutShortRef).toContain('[#aabbccdd]');
    // With explicit 12-char shortRef (from collision resolution)
    const withShortRef = buildTicketSubject(ticketId, 'Test', 'aabbccdd0000');
    expect(withShortRef).toContain('[#aabbccdd0000]');
  });

  it('buildTicketSubject with custom shortRef is idempotent', () => {
    const ticketId = 'aabbccdd-0000-0000-0000-000000000000';
    const shortRef = 'aabbccdd0000';
    const first = buildTicketSubject(ticketId, 'Test', shortRef);
    const second = buildTicketSubject(ticketId, first, shortRef);
    expect(second).toBe(first);
    expect(first).toContain('[#aabbccdd0000]');
  });

  it('progression of shortRef attempts ensures uniqueness', () => {
    const id = '99999999-ffff-eeee-dddd-ccccbbbbaaaa';
    const refs = [1, 2, 3, 4].map((attempt) => computeShortRefOfLength(id, attempt));
    // Each successive attempt is longer
    expect(refs[0].length).toBe(8);
    expect(refs[1].length).toBe(12);
    expect(refs[2].length).toBe(16);
    expect(refs[3].length).toBe(32);
    // Each is a prefix of the next
    expect(refs[1].startsWith(refs[0])).toBe(true);
    expect(refs[2].startsWith(refs[1])).toBe(true);
    expect(refs[3].startsWith(refs[2])).toBe(true);
  });
});
