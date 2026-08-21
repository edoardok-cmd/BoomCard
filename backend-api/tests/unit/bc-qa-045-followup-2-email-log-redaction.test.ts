/**
 * BC-QA-045-FOLLOWUP-2 (item 5) — EmailService.sendEmail must not log a raw
 * recipient address in the "delivery disabled" branch.
 *
 * That branch runs whenever `this.enabled` is false — i.e. whenever
 * RESEND_API_KEY is absent OR NODE_ENV !== 'production' — so it is the LIVE
 * code path in dev/test/staging, not a production-only fallback. Logging
 * `options.to` verbatim there wrote every email recipient (including e.g. an
 * erased user's pre-erasure address on the account-deletion confirmation
 * email — see auth.service.ts:deleteAccount) to logs outside production.
 *
 * Fix: mask the recipient (first local-part character + domain) before
 * logging, mirroring the existing phone-masking convention
 * (verify.service.ts: `***${phoneNumber.slice(-4)}`).
 */

const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

jest.mock('../../src/lib/prisma', () => ({ prisma: {} }));

const mockLoggerInfo = jest.fn();
jest.mock('../../src/utils/logger', () => ({
  logger: { info: (...args: unknown[]) => mockLoggerInfo(...args), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingStr: jest.fn((_key: string, fallback: string) => Promise.resolve(fallback)),
}));

import { EmailService } from '../../src/services/email.service';

describe('EmailService.sendEmail — disabled-delivery branch redacts the recipient in logs', () => {
  let service: EmailService;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalApiKey = process.env.RESEND_API_KEY;

  beforeAll(() => {
    // Force `this.enabled` to false via NODE_ENV, matching the dev/test/staging
    // case this bug actually affects (the guard is apiKey-present AND
    // NODE_ENV==='production' — leaving NODE_ENV as 'test' here is itself part
    // of what makes this branch live outside production).
    process.env.RESEND_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    service = new EmailService();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RESEND_API_KEY = originalApiKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not log the raw recipient address for a single `to`', async () => {
    const rawEmail = 'erased-user-secret@example.com';
    await service.sendEmail({ to: rawEmail, subject: 'Account deletion confirmed', html: '<p>bye</p>' });

    expect(mockSend).not.toHaveBeenCalled(); // confirms we actually hit the disabled branch
    const allLoggedText = mockLoggerInfo.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allLoggedText).not.toContain(rawEmail);
    expect(allLoggedText).not.toContain('erased-user-secret');
  });

  it('logs a masked form that keeps the domain but not the full local part', async () => {
    const rawEmail = 'erased-user-secret@example.com';
    await service.sendEmail({ to: rawEmail, subject: 'Account deletion confirmed', html: '<p>bye</p>' });

    const allLoggedText = mockLoggerInfo.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allLoggedText).toContain('e***@example.com');
  });

  it('masks every address when `to` is an array, and none of them appear raw', async () => {
    const rawEmails = ['first-secret@example.com', 'second-secret@example.org'];
    await service.sendEmail({ to: rawEmails, subject: 'Batch notice', html: '<p>hi</p>' });

    const allLoggedText = mockLoggerInfo.mock.calls.map((c) => String(c[0])).join('\n');
    for (const raw of rawEmails) {
      expect(allLoggedText).not.toContain(raw);
    }
    expect(allLoggedText).toContain('f***@example.com');
    expect(allLoggedText).toContain('s***@example.org');
  });
});
