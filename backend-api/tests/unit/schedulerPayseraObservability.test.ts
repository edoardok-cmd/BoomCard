/**
 * BC-QA-031-FOLLOWUP-8 — scheduler-side observability for the Paysera
 * ss2/ss3 RSA-verification surface:
 *
 *   1. `checkPaymentFailureSpike` (item 4 / task-r1 F1): a total
 *      verification outage drives Transaction.COMPLETED to zero, which used
 *      to starve this job's own FAILED/COMPLETED sample and let "Below
 *      sample threshold — skipping" hide the outage entirely. It must now
 *      also alert on a nonzero AuditLog(action=PAYSERA_SIGNATURE_REJECTED)
 *      count in the window, independent of `total`.
 *   2. `checkPayseraKeyRotation` (item 2): a daily diff of the published
 *      Paysera key against the bundled one, alerting on mismatch without
 *      ever failing the job.
 *
 * Both are exercised directly (both functions are exported specifically for
 * this) against a mocked prisma + notification.service, so no real DB writes
 * or admin notifications happen.
 */

import fs from 'fs';
import path from 'path';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const transactionCountMock = jest.fn();
const auditLogFindFirstMock = jest.fn();

const prismaMock = {
  transaction: { count: (...args: unknown[]) => transactionCountMock(...args) },
  auditLog: { findFirst: (...args: unknown[]) => auditLogFindFirstMock(...args) },
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
  prisma: prismaMock,
}));

const notifyAdminOpsMock = jest.fn().mockResolvedValue(true);
const notifyAdminPaymentFailureSpikeMock = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyAdminOps: (...args: unknown[]) => notifyAdminOpsMock(...args),
    notifyAdminPaymentFailureSpike: (...args: unknown[]) => notifyAdminPaymentFailureSpikeMock(...args),
  },
}));

const axiosGetMock = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => axiosGetMock(...args) },
}));

import { checkPaymentFailureSpike, checkPayseraKeyRotation } from '../../src/jobs/scheduler';
import { PAYSERA_LIVE_PUBLIC_KEY_PEM } from '../../src/services/paysera-public-key';

describe('checkPaymentFailureSpike — RSA signature-rejection signal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notifyAdminOpsMock.mockResolvedValue(true);
    notifyAdminPaymentFailureSpikeMock.mockResolvedValue(undefined);
  });

  it('does nothing when there are no failures, no volume, and no signature rejections (pre-existing behaviour)', async () => {
    transactionCountMock.mockResolvedValue(0);
    auditLogFindFirstMock.mockResolvedValue(null);

    await checkPaymentFailureSpike();

    expect(notifyAdminOpsMock).not.toHaveBeenCalled();
    expect(notifyAdminPaymentFailureSpikeMock).not.toHaveBeenCalled();
  });

  it('alerts on a nonzero signature-rejection count even when total is far below the sample threshold', async () => {
    // FAILED=0, COMPLETED=0 — a total verification outage collapses both to
    // zero, which is exactly the case the old code silently skipped.
    transactionCountMock.mockResolvedValue(0);
    auditLogFindFirstMock.mockResolvedValue({ id: 'audit-1' });

    await checkPaymentFailureSpike();

    expect(notifyAdminOpsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        opsType: 'paysera_rsa_signature_rejection_spike',
        severity: 'critical',
      })
    );
    // The ordinary rate-based alert must NOT also fire — total is still below
    // the sample threshold, so that separate check is correctly skipped.
    expect(notifyAdminPaymentFailureSpikeMock).not.toHaveBeenCalled();
  });

  it('queries AuditLog scoped to the PAYSERA_SIGNATURE_REJECTED action and the failure-rate window', async () => {
    transactionCountMock.mockResolvedValue(0);
    auditLogFindFirstMock.mockResolvedValue(null);

    await checkPaymentFailureSpike();

    expect(auditLogFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: 'PAYSERA_SIGNATURE_REJECTED',
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      })
    );
  });

  it('still fires the ordinary rate-based alert when volume/rate cross their thresholds (regression)', async () => {
    // 8 FAILED + 2 COMPLETED = 10 total (meets MIN_SAMPLES), 80% failure rate
    // (over the 20% threshold).
    transactionCountMock.mockImplementation(async ({ where }: any) => {
      if (where.status === 'FAILED') return 8;
      if (where.status === 'COMPLETED') return 2;
      return 0;
    });
    auditLogFindFirstMock.mockResolvedValue(null);

    await checkPaymentFailureSpike();

    expect(notifyAdminPaymentFailureSpikeMock).toHaveBeenCalledWith(
      expect.objectContaining({ failures: 8, successes: 2 })
    );
    expect(notifyAdminOpsMock).not.toHaveBeenCalled();
  });

  it('fires BOTH signals when a signature rejection coincides with an ordinary rate spike', async () => {
    transactionCountMock.mockImplementation(async ({ where }: any) => {
      if (where.status === 'FAILED') return 8;
      if (where.status === 'COMPLETED') return 2;
      return 0;
    });
    auditLogFindFirstMock.mockResolvedValue({ id: 'audit-2' });

    await checkPaymentFailureSpike();

    expect(notifyAdminOpsMock).toHaveBeenCalledWith(
      expect.objectContaining({ opsType: 'paysera_rsa_signature_rejection_spike' })
    );
    expect(notifyAdminPaymentFailureSpikeMock).toHaveBeenCalled();
  });
});

describe('checkPayseraKeyRotation', () => {
  const FIXTURES_DIR = path.join(__dirname, 'fixtures');
  // A genuinely different, real, valid, self-signed X.509 certificate — not
  // Paysera's — reused from the myPOS test fixtures (see
  // mypos.service.test.ts's own comment on how it was generated). Standing in
  // for "Paysera published a new key" without needing a second openssl-
  // generated fixture of our own.
  const rotatedCertPem = fs.readFileSync(
    path.join(FIXTURES_DIR, 'mypos-test-self-signed-cert.pem'),
    'utf8'
  );

  beforeEach(() => {
    jest.clearAllMocks();
    notifyAdminOpsMock.mockResolvedValue(true);
  });

  it('does not alert when the published key matches the bundled certificate', async () => {
    axiosGetMock.mockResolvedValue({ data: PAYSERA_LIVE_PUBLIC_KEY_PEM });

    await checkPayseraKeyRotation();

    expect(notifyAdminOpsMock).not.toHaveBeenCalled();
  });

  it('alerts with both fingerprints when the published key does not match the bundled certificate', async () => {
    axiosGetMock.mockResolvedValue({ data: rotatedCertPem });

    await checkPayseraKeyRotation();

    expect(notifyAdminOpsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        opsType: 'paysera_key_rotation_detected',
        severity: 'critical',
        fields: expect.arrayContaining([
          expect.objectContaining({ label: expect.stringContaining('Bundled') }),
          expect.objectContaining({ label: expect.stringContaining('Published') }),
        ]),
      })
    );
  });

  it('does not alert (and does not throw) when the fetch fails', async () => {
    axiosGetMock.mockRejectedValue(new Error('network blip'));

    await expect(checkPayseraKeyRotation()).resolves.toBeUndefined();
    expect(notifyAdminOpsMock).not.toHaveBeenCalled();
  });

  it('does not alert (and does not throw) when the published body is not a parseable certificate', async () => {
    axiosGetMock.mockResolvedValue({ data: 'this-is-not-a-pem' });

    await expect(checkPayseraKeyRotation()).resolves.toBeUndefined();
    expect(notifyAdminOpsMock).not.toHaveBeenCalled();
  });

  it('fetches the documented Paysera public-key URL', async () => {
    axiosGetMock.mockResolvedValue({ data: PAYSERA_LIVE_PUBLIC_KEY_PEM });

    await checkPayseraKeyRotation();

    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://www.paysera.com/download/public.key',
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });
});
