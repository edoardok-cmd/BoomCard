/**
 * Unit tests for EmailService.sendEmail — focuses on replyTo resolution.
 *
 * The fix under test (line 345 of email.service.ts):
 *   replyTo: options.replyTo || (dbReplyTo || undefined)
 *
 * Before the fix the expression was effectively `options.replyTo || dbReplyTo`,
 * which would pass an empty string to Resend when both values were absent.
 * Resend rejects an empty replyTo with a validation error, so the fix converts
 * it to `undefined` instead.
 */

const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

jest.mock('../../src/lib/prisma', () => ({ prisma: {} }));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockGetSystemSettingStr = jest.fn();
jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingStr: (...args: unknown[]) => mockGetSystemSettingStr(...args),
}));

import { EmailService } from '../../src/services/email.service';

const BASE_OPTS = {
  to: 'user@example.com',
  subject: 'Test subject',
  html: '<p>hello</p>',
};

function makeSystemSettingMock(replyToEmail: string) {
  return (key: string, fallback: string) => {
    if (key === 'from_email')      return Promise.resolve('noreply@boomcard.bg');
    if (key === 'sender_name')     return Promise.resolve('BoomCard');
    if (key === 'reply_to_email')  return Promise.resolve(replyToEmail);
    return Promise.resolve(fallback);
  };
}

describe('EmailService.sendEmail — replyTo resolution', () => {
  let service: EmailService;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(() => {
    // Force the service into production mode so the Resend client is actually called.
    process.env.RESEND_API_KEY = 'test-key';
    process.env.NODE_ENV = 'production';
    service = new EmailService();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.RESEND_API_KEY;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    // Default: DB reply_to_email is empty.
    mockGetSystemSettingStr.mockImplementation(makeSystemSettingMock(''));
  });

  it('uses options.replyTo when provided', async () => {
    await service.sendEmail({ ...BASE_OPTS, replyTo: 'support@boomcard.bg' });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'support@boomcard.bg' }),
    );
  });

  it('falls back to DB reply_to_email when options.replyTo is absent', async () => {
    mockGetSystemSettingStr.mockImplementation(makeSystemSettingMock('office@boomcard.bg'));
    await service.sendEmail(BASE_OPTS);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'office@boomcard.bg' }),
    );
  });

  it('passes undefined — not empty string — when both options.replyTo and DB value are absent', async () => {
    // This is the bug the fix addresses: passing '' would fail Resend validation.
    await service.sendEmail(BASE_OPTS);
    const sentArgs = mockSend.mock.calls[0][0] as Record<string, unknown>;
    expect(sentArgs.replyTo).toBeUndefined();
  });

  it('options.replyTo takes precedence over a non-empty DB value', async () => {
    mockGetSystemSettingStr.mockImplementation(makeSystemSettingMock('office@boomcard.bg'));
    await service.sendEmail({ ...BASE_OPTS, replyTo: 'custom@example.com' });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'custom@example.com' }),
    );
  });

  it('returns { success: true, id } on successful send', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_abc' }, error: null });
    const result = await service.sendEmail(BASE_OPTS);
    expect(result).toEqual({ success: true, id: 'msg_abc' });
  });

  it('returns { success: false } when Resend returns an error object', async () => {
    mockSend.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'invalid replyTo' } });
    const result = await service.sendEmail(BASE_OPTS);
    expect(result).toEqual({ success: false });
  });

  it('returns { success: false } when Resend throws', async () => {
    mockSend.mockRejectedValue(new Error('network failure'));
    const result = await service.sendEmail(BASE_OPTS);
    expect(result).toEqual({ success: false });
  });
});
