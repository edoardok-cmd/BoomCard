/**
 * Regression tests for the three audit-findings fixes from the §4 code review:
 *
 *   Fix 1 — rejectScan void guard: markVoided is now called for both PENDING
 *            and CLEARED cashback entries (previously CLEARED was silently skipped).
 *
 *   Fix 2 — PAUSED subscription label: Bulgarian label is "Спрян" per spec §4.2
 *            (previously "На пауза").
 *
 *   Fix 3 — retryAttempt reset: Paysera FAILED_PAYMENT transition now explicitly
 *            sets retryAttempt: 0, documenting the Stripe-only invariant.
 */

// ── Fix 1: rejectScan void guard ─────────────────────────────────────────────
//
// Mocks required by sticker.service.ts at module load time. Order matters —
// jest.mock calls are hoisted before imports.

jest.mock('../../src/lib/prisma', () => {
  const stickerScanDelegate = {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  };
  const walletTransactionDelegate = {
    findFirst: jest.fn(),
  };
  const subscriptionDelegate = {
    findFirst: jest.fn(),
  };
  const client = {
    stickerScan: stickerScanDelegate,
    walletTransaction: walletTransactionDelegate,
    subscription: subscriptionDelegate,
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/services/cashbackLifecycle.service', () => {
  const actual = jest.requireActual('../../src/services/cashbackLifecycle.service');
  return {
    // Keep the real named exports the service-under-test imports
    // (VOID_REASON_CATEGORIES, assertVoidReasonCategory) so normalizeVoidReason
    // exercises the real canonical list; only the service object is mocked.
    ...actual,
    cashbackLifecycleService: {
      markVoided: jest.fn(),
      recordRejectedAsVoided: jest.fn(),
      promotePendingToCleared: jest.fn(),
      expireOverdueCashback: jest.fn(),
      markVoidedBatch: jest.fn(),
    },
  };
});

// Stub out all other heavy deps so the module loads without a real DB/queue.
jest.mock('../../src/services/wallet.service', () => ({
  walletService: { credit: jest.fn(), requestPayout: jest.fn() },
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPaymentFailed: jest.fn(),
    notifySubscriptionPaused: jest.fn(),
    notifyCashbackVoided: jest.fn(),
    notifyReceiptRejected: jest.fn(),
  },
}));
jest.mock('../../src/services/fraudDetection.service', () => ({
  fraudDetectionService: {
    checkFraud: jest.fn(),
    calculateCashback: jest.fn(),
    runFraudChecks: jest.fn(),
  },
}));
jest.mock('../../src/services/ocr.service', () => ({
  recognizeReceiptImage: jest.fn(),
}));
jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: { uploadImage: jest.fn(), deleteImage: jest.fn() },
}));
jest.mock('../../src/services/partnerType.service', () => ({
  partnerTypeService: { getById: jest.fn() },
}));
jest.mock('../../src/queues/merchantVerification.queue', () => ({
  enqueueMerchantVerification: jest.fn(),
}));
jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingStr: jest.fn(async () => ''),
  getSystemSettingInt: jest.fn(async (_k: string, d: number) => d),
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn(), toString: jest.fn() }));

import prisma from '../../src/lib/prisma';
import { cashbackLifecycleService } from '../../src/services/cashbackLifecycle.service';

const pm = prisma as any;
const lifecycleMock = cashbackLifecycleService as any;

// Helper: build a minimal scan object that rejectScan's findUnique returns.
const makeScan = (id = 'scan-1') => ({
  id,
  userId: 'user-1',
  venueId: 'venue-1',
  cashbackAmount: 5,
  status: 'MANUAL_REVIEW',
});

// Helper: build a minimal cashback entry.
const makeEntry = (cashbackStatus: string) => ({
  id: 'wt-1',
  cashbackStatus,
});

describe('Fix 1 — rejectScan void guard', () => {
  let stickerService: any;

  beforeAll(async () => {
    // Import after mocks are wired so the module sees the mocked deps.
    const mod = await import('../../src/services/sticker.service');
    stickerService = mod.stickerService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pm.stickerScan.findUnique.mockResolvedValue(makeScan());
    // updateMany count > 0 → scan was successfully flipped to REJECTED.
    pm.stickerScan.updateMany.mockResolvedValue({ count: 1 });
    pm.stickerScan.findUniqueOrThrow.mockResolvedValue({
      ...makeScan(),
      status: 'REJECTED',
    });
    pm.subscription.findFirst.mockResolvedValue(null);
    lifecycleMock.markVoided.mockResolvedValue(undefined);
    lifecycleMock.recordRejectedAsVoided.mockResolvedValue(undefined);
  });

  // rejectScan signature: (scanId, reason, actorUserId)
  it('calls markVoided when cashback entry is PENDING (unchanged behaviour)', async () => {
    pm.walletTransaction.findFirst.mockResolvedValue(makeEntry('PENDING'));

    await stickerService.rejectScan('scan-1', 'fake receipt', 'admin-1');

    expect(lifecycleMock.markVoided).toHaveBeenCalledTimes(1);
    // F-008: free-text reason is now normalized to a controlled category prefix.
    expect(lifecycleMock.markVoided).toHaveBeenCalledWith(
      expect.objectContaining({ walletTransactionId: 'wt-1', reason: 'OTHER: fake receipt', actorUserId: 'admin-1' }),
    );
    expect(lifecycleMock.recordRejectedAsVoided).not.toHaveBeenCalled();
  });

  it('calls markVoided when cashback entry is CLEARED (fix: was previously silently skipped)', async () => {
    pm.walletTransaction.findFirst.mockResolvedValue(makeEntry('CLEARED'));

    await stickerService.rejectScan('scan-1', 'duplicate receipt', 'admin-1');

    expect(lifecycleMock.markVoided).toHaveBeenCalledTimes(1);
    // F-008: free-text reason is now normalized to a controlled category prefix.
    expect(lifecycleMock.markVoided).toHaveBeenCalledWith(
      expect.objectContaining({ walletTransactionId: 'wt-1', reason: 'OTHER: duplicate receipt', actorUserId: 'admin-1' }),
    );
    expect(lifecycleMock.recordRejectedAsVoided).not.toHaveBeenCalled();
  });

  it('calls markVoided when cashback entry is VOIDED (no-op inside markVoided — idempotent)', async () => {
    pm.walletTransaction.findFirst.mockResolvedValue(makeEntry('VOIDED'));

    await stickerService.rejectScan('scan-1', 'already rejected', 'admin-1');

    expect(lifecycleMock.markVoided).toHaveBeenCalledTimes(1);
    expect(lifecycleMock.recordRejectedAsVoided).not.toHaveBeenCalled();
  });

  it('calls recordRejectedAsVoided when no cashback entry exists (ghost path)', async () => {
    pm.walletTransaction.findFirst.mockResolvedValue(null);

    await stickerService.rejectScan('scan-1', 'no receipt', 'admin-1');

    expect(lifecycleMock.recordRejectedAsVoided).toHaveBeenCalledTimes(1);
    expect(lifecycleMock.markVoided).not.toHaveBeenCalled();
  });

  // F-008 / §2.2 + §8.1 rule 6 regression — the latent silent void-drop:
  // markVoided now enforces a controlled void-reason vocabulary
  // (assertVoidReasonCategory). The admin reject path used to pass free-text
  // ("Rejected by admin" / arbitrary notes), which made markVoided throw, and
  // the catch swallowed every non-LOCKED/PAID error — so the wallet entry was
  // NEVER voided despite success:true. sticker.service must now normalize the
  // reason to carry a controlled category before it reaches markVoided.
  const VOID_CATEGORIES = ['DUPLICATE', 'FRAUD', 'SYSTEM_ERROR', 'ADMIN_CORRECTION', 'PARTNER_DISPUTE', 'OTHER'];
  const startsWithCategory = (reason: string) =>
    VOID_CATEGORIES.includes(reason.split(':')[0].trim().toUpperCase());

  it('passes a category-prefixed reason to markVoided for a PENDING entry (no silent drop)', async () => {
    pm.walletTransaction.findFirst.mockResolvedValue(makeEntry('PENDING'));

    // Free-text reason from the route ("Rejected by admin") — previously dropped.
    await stickerService.rejectScan('scan-1', 'Rejected by admin', 'admin-1');

    expect(lifecycleMock.markVoided).toHaveBeenCalledTimes(1);
    const arg = lifecycleMock.markVoided.mock.calls[0][0];
    expect(startsWithCategory(arg.reason)).toBe(true);
    expect(arg.reason).toBe('OTHER: Rejected by admin');
  });

  it('passes a category-prefixed reason to recordRejectedAsVoided (ghost path)', async () => {
    pm.walletTransaction.findFirst.mockResolvedValue(null);

    await stickerService.rejectScan('scan-1', 'no receipt found', 'admin-1');

    expect(lifecycleMock.recordRejectedAsVoided).toHaveBeenCalledTimes(1);
    const arg = lifecycleMock.recordRejectedAsVoided.mock.calls[0][0];
    expect(startsWithCategory(arg.reason)).toBe(true);
    expect(arg.reason).toBe('OTHER: no receipt found');
  });

  it('preserves an already-controlled category prefix supplied by the caller', async () => {
    pm.walletTransaction.findFirst.mockResolvedValue(makeEntry('CLEARED'));

    await stickerService.rejectScan('scan-1', 'DUPLICATE: same receipt twice', 'admin-1');

    const arg = lifecycleMock.markVoided.mock.calls[0][0];
    expect(arg.reason).toBe('DUPLICATE: same receipt twice');
  });

  it('the normalized reason actually passes the real assertVoidReasonCategory gate (proves it is not swallowed)', async () => {
    // Use the REAL validator (the mocked lifecycle service replaces the methods
    // but the named export of the gate is independent). Import directly.
    const { assertVoidReasonCategory } = jest.requireActual(
      '../../src/services/cashbackLifecycle.service',
    );
    pm.walletTransaction.findFirst.mockResolvedValue(makeEntry('PENDING'));

    await stickerService.rejectScan('scan-1', 'totally free text note', 'admin-1');
    const reason = lifecycleMock.markVoided.mock.calls[0][0].reason;

    // Before the fix this would throw "Invalid voidedReason category" and the
    // catch would swallow it → void silently dropped.
    expect(() => assertVoidReasonCategory(reason)).not.toThrow();
  });

  it('throws when the scan is already APPROVED (updateMany returns count=0)', async () => {
    pm.stickerScan.updateMany.mockResolvedValue({ count: 0 });
    pm.walletTransaction.findFirst.mockResolvedValue(null);

    await expect(
      stickerService.rejectScan('scan-1', 'too late', 'admin-1'),
    ).rejects.toThrow('already been approved');
  });
});

// ── Fix 2 — PAUSED subscription label ────────────────────────────────────────
// Covered by partner-dashboard/src/utils/planLabels.test.ts (vitest).
// Cannot be imported here — planLabels.ts is a frontend-only module.

// ── Fix 3 — retryAttempt reset in Paysera renewal job ────────────────────────
//
// The Paysera renewal job must include retryAttempt: 0 in the FAILED_PAYMENT
// update to enforce the "Stripe-only counter" invariant.

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendSubscriptionExpiredEmail: jest.fn(), sendExpiryNotice: jest.fn() },
}));

describe('Fix 3 — Paysera FAILED_PAYMENT transition sets retryAttempt: 0', () => {
  const subUpdateMock = jest.fn();
  const subFindManyMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Override the prisma mock for this suite.
    pm.stickerScan.findUnique.mockResolvedValue(null);

    // Wire subscription delegate directly on the shared prisma mock.
    pm.subscription = {
      findMany: subFindManyMock,
      update: subUpdateMock,
      findFirst: jest.fn().mockResolvedValue(null),
    };
    pm.$transaction = jest.fn(async (fn: any) => fn(pm));

    // Silence notification side-effects.
    lifecycleMock.markVoided.mockResolvedValue(undefined);
  });

  it('includes retryAttempt: 0 in the FAILED_PAYMENT subscription update', async () => {
    const now = new Date();
    const expiredSub = {
      id: 'sub-paysera-1',
      userId: 'user-1',
      status: 'ACTIVE',
      plan: 'BASIC',
      autoRenewal: true,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodEnd: new Date(now.getTime() - 1000), // already expired
      stripeSubscriptionId: null,
      metadata: null,
      user: { id: 'user-1', email: 'u@test.com', firstName: 'Test', preferredLanguage: 'en' },
      planDetails: { displayName: 'Basic', displayNameBg: 'Basic', priceMonthlyEur: 500, priceWeeklyEur: null, priceYearlyEur: null },
    };

    // Step 1 (expired PAUSED subs) → empty.
    // Step 1b (expired ACTIVE with autoRenewal=true) → our sub.
    // Step 2 (expired ACTIVE with autoRenewal=false) → empty.
    subFindManyMock
      .mockResolvedValueOnce([])        // step 1: PAUSED past grace
      .mockResolvedValueOnce([expiredSub]) // step 1b: ACTIVE autoRenewal=true
      .mockResolvedValueOnce([]);       // step 2: ACTIVE autoRenewal=false

    subUpdateMock.mockResolvedValue({ ...expiredSub, status: 'FAILED_PAYMENT' });
    // syncCardTypeWithSubscription used inside the expired-PAUSED loop — not
    // hit here since step 1 returns empty, but the card.service import must
    // not blow up.
    const notifyMock = jest.fn().mockResolvedValue(undefined);
    pm.subscription.findFirst = jest.fn().mockResolvedValue(null);

    // Patch notificationService on the already-imported mock object.
    const { notificationService } = await import('../../src/services/notification.service');
    (notificationService.notifyPaymentFailed as jest.Mock).mockResolvedValue(undefined);

    const cardMod = { cardService: { syncCardTypeWithSubscription: jest.fn().mockResolvedValue(undefined) } };
    jest.doMock('../../src/services/card.service', () => cardMod);

    const { processPayseraRenewals } = await import('../../src/jobs/paysera-renewal');
    await processPayseraRenewals();

    // Verify the subscription.update call for FAILED_PAYMENT includes retryAttempt: 0.
    expect(subUpdateMock).toHaveBeenCalled();
    const failedPaymentCall = subUpdateMock.mock.calls.find(
      (call: any[]) => call[0]?.data?.status === 'FAILED_PAYMENT',
    );
    expect(failedPaymentCall).toBeDefined();
    expect(failedPaymentCall![0].data).toMatchObject({
      status: 'FAILED_PAYMENT',
      retryAttempt: 0,
    });
  });
});
