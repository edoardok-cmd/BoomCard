/**
 * Unit tests for the partner activation helper (spec §5.2 v1.1).
 *
 * The interesting behaviour now lives in activationLink.service.consume
 * (consume + verifiedAt stamp + optional password set, atomically). This
 * test mocks that service and verifies the high-level helper does the
 * right delegation and URL-building.
 */

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {},
  prisma: {},
}));

const issueMock = jest.fn();
const resendMock = jest.fn();
const consumeMock = jest.fn();
const markEmailMock = jest.fn();
jest.mock('../../src/services/activationLink.service', () => ({
  activationLinkService: {
    issue: issueMock,
    resend: resendMock,
    consume: consumeMock,
    markEmail: markEmailMock,
  },
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: jest.fn(async () => ({ success: true })) },
}));

import {
  issueActivationLink,
  consumeActivationToken,
  stampEmailOutcome,
} from '../../src/services/partnerActivation.service';

describe('partnerActivation.service', () => {
  beforeEach(() => {
    issueMock.mockReset();
    resendMock.mockReset();
    consumeMock.mockReset();
    markEmailMock.mockReset();
  });

  it('issueActivationLink (initial) delegates to activationLinkService.issue with INITIAL reason', async () => {
    const expiresAt = new Date('2030-01-01');
    issueMock.mockResolvedValue({ token: 'tok-abc', expiresAt, id: 'link-1', reason: 'INITIAL' });

    const result = await issueActivationLink({ partnerId: 'p1', adminId: 'admin-1', reason: 'initial' });

    expect(issueMock).toHaveBeenCalledWith({ partnerId: 'p1', createdById: 'admin-1', reason: 'INITIAL' });
    expect(resendMock).not.toHaveBeenCalled();
    expect(result.token).toBe('tok-abc');
    expect(result.url).toContain('/partner/activate?token=tok-abc');
    expect(result.linkId).toBe('link-1');
    expect(result.expiresAt).toBe(expiresAt);
  });

  it('issueActivationLink (resend) delegates to activationLinkService.resend', async () => {
    const expiresAt = new Date('2030-01-01');
    resendMock.mockResolvedValue({ token: 'tok-resend', expiresAt, id: 'link-2', reason: 'RESEND' });

    const result = await issueActivationLink({ partnerId: 'p1', adminId: 'admin-1', reason: 'resend' });

    expect(resendMock).toHaveBeenCalledWith({ partnerId: 'p1', actorId: 'admin-1' });
    expect(issueMock).not.toHaveBeenCalled();
    expect(result.linkId).toBe('link-2');
  });

  it('consumeActivationToken returns partner identity without password by default', async () => {
    consumeMock.mockResolvedValue({
      partner: { id: 'p1', businessName: 'Acme', userId: 'u1', verifiedAt: new Date() },
    });

    const result = await consumeActivationToken('tok-abc');

    expect(consumeMock).toHaveBeenCalledWith('tok-abc', {});
    expect(result).toEqual({ partnerId: 'p1', businessName: 'Acme', userId: 'u1' });
  });

  it('consumeActivationToken forwards password option to the service', async () => {
    consumeMock.mockResolvedValue({
      partner: { id: 'p1', businessName: 'Acme', userId: 'u1', verifiedAt: new Date() },
    });

    await consumeActivationToken('tok-abc', { password: 'hunter2!' });

    expect(consumeMock).toHaveBeenCalledWith('tok-abc', { password: 'hunter2!' });
  });

  it('consumeActivationToken propagates errors from the consume service', async () => {
    consumeMock.mockRejectedValue(new Error('Activation link has expired'));

    await expect(consumeActivationToken('expired')).rejects.toThrow('Activation link has expired');
  });

  it('stampEmailOutcome forwards to activationLinkService.markEmail', async () => {
    markEmailMock.mockResolvedValue(undefined);
    await stampEmailOutcome('link-1', { sent: true });
    expect(markEmailMock).toHaveBeenCalledWith('link-1', { sent: true });

    await stampEmailOutcome('link-1', { sent: false, error: 'SMTP timeout' });
    expect(markEmailMock).toHaveBeenLastCalledWith('link-1', { sent: false, error: 'SMTP timeout' });
  });
});
