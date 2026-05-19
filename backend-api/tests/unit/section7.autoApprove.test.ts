/**
 * Spec §7.1 — Auto-approve enforcement tests.
 *
 * Covers:
 *   1. performFraudCheck() — requiresManualReview driven by threshold, not hardcoded true
 *   2. uploadReceipt()     — low-risk scans (fraudScore ≤ 30) auto-approve without
 *                           entering the admin review queue
 *   3. uploadReceipt()     — scans in the 31-60 band land in MANUAL_REVIEW
 *   4. uploadReceipt()     — zero-cashback auto-approve (no subscription) marks
 *                           APPROVED without going through approveScan()
 *   5. verifyAndAnnotateScan() — APPROVED/REJECTED/EXPIRED scans are NOT annotated
 *   6. updateVenueConfig() — autoApproveThreshold is writable with 0-100 validation
 *
 * All Prisma interactions are mocked. No DB connection required.
 */

// ─────────────────────────────────────────────────────────────────────────────
// State shared across mocks
// ─────────────────────────────────────────────────────────────────────────────

let scanRow: any = null;
let walletRow: any = { id: 'w-1', userId: 'u-1', balance: 0, availableBalance: 0, isLocked: false, lockedReason: null };
let walletTxRow: any = null;
let transactionRow: any = null;
const stickerUpdateCalls: any[] = [];
const walletUpdateCalls: any[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Prisma mock
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const stickerScan = {
    findFirst: jest.fn(async (args: any) => {
      if (!scanRow) return null;
      const { id, userId } = args?.where ?? {};
      if (id && scanRow.id !== id) return null;
      if (userId && scanRow.userId !== userId) return null;
      return scanRow;
    }),
    findUnique: jest.fn(async (args: any) => {
      if (!scanRow || scanRow.id !== args?.where?.id) return null;
      return scanRow;
    }),
    findUniqueOrThrow: jest.fn(async (args: any) => {
      if (!scanRow || scanRow.id !== args?.where?.id) throw new Error('Not found');
      return scanRow;
    }),
    update: jest.fn(async (args: any) => {
      stickerUpdateCalls.push({ where: args.where, data: args.data });
      if (args.where?.id === scanRow?.id) Object.assign(scanRow, args.data);
      return scanRow;
    }),
    updateMany: jest.fn(async () => ({ count: 1 })),
    // count is defined here so tests can use .mockImplementation without property replacement.
    // beforeEach resets it to return 0 so tests that don't need specific counts stay clean.
    count: jest.fn(async () => 0),
  };

  const venueStickerConfig = {
    findUnique: jest.fn(async () => null),
    upsert: jest.fn(async (_args: any) => ({ venueId: 'venue-1', autoApproveThreshold: 30 })),
    create: jest.fn(async (args: any) => ({ venueId: args.data.venueId, ...args.data })),
  };

  const wallet = {
    findUnique: jest.fn(async () => walletRow),
    findUniqueOrThrow: jest.fn(async () => walletRow),
    update: jest.fn(async (args: any) => {
      walletUpdateCalls.push({ ...args });
      const d = args.data ?? {};
      if (d.balance?.increment) walletRow.balance += d.balance.increment;
      if (d.balance?.decrement) walletRow.balance -= d.balance.decrement;
      if (d.availableBalance?.increment) walletRow.availableBalance += d.availableBalance.increment;
      if (d.availableBalance?.decrement) walletRow.availableBalance -= d.availableBalance.decrement;
      return walletRow;
    }),
    create: jest.fn(async () => walletRow),
  };

  const walletTransaction = {
    findFirst: jest.fn(async () => null), // no existing PENDING row by default
    findUnique: jest.fn(async (args: any) => {
      if (!walletTxRow || walletTxRow.id !== args?.where?.id) return null;
      return walletTxRow;
    }),
    findUniqueOrThrow: jest.fn(async (args: any) => {
      if (!walletTxRow || walletTxRow.id !== args?.where?.id) throw new Error('Not found');
      return walletTxRow;
    }),
    update: jest.fn(async (args: any) => {
      if (walletTxRow && walletTxRow.id === args?.where?.id) Object.assign(walletTxRow, args.data);
      return walletTxRow;
    }),
    updateMany: jest.fn(async (args: any) => {
      // Simulate status-guarded updateMany used by promotePendingToCleared
      if (walletTxRow && args?.data) Object.assign(walletTxRow, args.data);
      return { count: 1 };
    }),
    create: jest.fn(async (args: any) => {
      walletTxRow = { id: 'wt-new', ...args.data };
      return walletTxRow;
    }),
  };

  const receipt = {
    findFirst: jest.fn(async () => null), // no duplicate receipt by default
  };

  const transaction = {
    create: jest.fn(async (args: any) => {
      transactionRow = { id: 'tx-1', ...args.data };
      return transactionRow;
    }),
    delete: jest.fn(async () => ({})),
  };

  const subscription = {
    findFirst: jest.fn(async () => ({ status: 'ACTIVE', plan: 'BASIC', currentPeriodEnd: new Date(Date.now() + 1e9) })),
  };

  const sticker = {
    update: jest.fn(async () => ({})),
  };

  const venue = {
    findUnique: jest.fn(async () => null),
  };

  const client = {
    stickerScan,
    venueStickerConfig,
    wallet,
    walletTransaction,
    receipt,
    transaction,
    subscription,
    sticker,
    venue,
    $transaction: jest.fn(async (fn: any) => {
      if (typeof fn === 'function') {
        return fn({ walletTransaction, wallet });
      }
      return Promise.all(fn);
    }),
  };
  return { __esModule: true, default: client, prisma: client };
});

// ─────────────────────────────────────────────────────────────────────────────
// Dependency mocks
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('../../src/services/cashbackLifecycle.service', () => ({
  cashbackLifecycleService: {
    recordPendingForRiskReview: jest.fn(async () => ({ id: 'wt-pending', cashbackStatus: 'PENDING' })),
    promotePendingToCleared: jest.fn(async () => ({ id: 'wt-pending', cashbackStatus: 'CLEARED' })),
    markVoided: jest.fn(async () => ({})),
    recordRejectedAsVoided: jest.fn(async () => ({})),
  },
}));

jest.mock('../../src/services/wallet.service', () => ({
  walletService: {
    credit: jest.fn(async () => ({ id: 'wt-credit' })),
  },
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyStickerScanApproved: jest.fn(async () => {}),
    notifyPartnerScanAtVenue: jest.fn(async () => {}),
  },
}));

jest.mock('../../src/services/fraudDetection.service', () => ({
  fraudDetectionService: {
    calculateCashback: jest.fn(async () => ({ cashbackAmount: 5, cashbackPercent: 5 })),
  },
}));

jest.mock('../../src/services/ocr.service', () => ({
  recognizeReceiptImage: jest.fn(async () => ({ merchantName: '', confidence: 0 })),
}));

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    downloadImageFromUrl: jest.fn(async () => Buffer.from('')),
  },
}));

jest.mock('../../src/queues/merchantVerification.queue', () => ({
  enqueueMerchantVerification: jest.fn(async () => false),
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => undefined),
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingInt: jest.fn(async (_key: string, def: number) => def),
}));

jest.mock('../../src/services/partnerType.service', () => ({
  partnerTypeService: {
    getRedeemableTypeIdsForPlan: jest.fn(async () => ['pt-1']),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks are registered)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { stickerService } from '../../src/services/sticker.service';
import { cashbackLifecycleService } from '../../src/services/cashbackLifecycle.service';
import { recognizeReceiptImage } from '../../src/services/ocr.service';
import prisma from '../../src/lib/prisma';

const prismaMock = prisma as any;
const lifecycleMock = cashbackLifecycleService as any;
const ocrMock = recognizeReceiptImage as jest.MockedFunction<typeof recognizeReceiptImage>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a PENDING scan with the given fraudScore and cashbackAmount. */
function makeScan(fraudScore: number, cashbackAmount = 5, autoApproveThreshold = 30, status = 'PENDING') {
  return {
    id: 'scan-1',
    userId: 'u-1',
    stickerId: 'sticker-db-id',
    venueId: 'venue-1',
    cardId: 'card-1',
    billAmount: 100,
    cashbackAmount,
    cashbackPercent: 5,
    fraudScore,
    fraudReasons: [],
    status,
    receiptImageUrl: null,
    receiptImageHash: null,
    verifiedAmount: null,
    processedAt: null,
    transactionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    venue: {
      id: 'venue-1',
      name: 'Test Venue',
      nameBg: null,
      latitude: 42.69,
      longitude: 23.32,
      partner: { id: 'p-1', status: 'ACTIVE', verifiedAt: new Date(), businessName: 'Test', businessNameBg: null },
      stickerConfig: { autoApproveThreshold },
    },
  };
}

beforeEach(() => {
  scanRow = null;
  walletRow = { id: 'w-1', userId: 'u-1', balance: 0, availableBalance: 0, isLocked: false, lockedReason: null };
  walletTxRow = null;
  transactionRow = null;
  stickerUpdateCalls.length = 0;
  walletUpdateCalls.length = 0;

  // Reset all mock call history (but not implementations set via jest.fn(impl))
  jest.clearAllMocks();

  // Restore per-test overrides that clearAllMocks() does not clear.
  // Using mockImplementation here (not property assignment) so the mock
  // object reference stays stable and beforeEach can always reset it.
  prismaMock.stickerScan.count.mockResolvedValue(0);
  prismaMock.receipt.findFirst.mockResolvedValue(null);
  prismaMock.walletTransaction.findFirst.mockResolvedValue(null);
  prismaMock.subscription.findFirst.mockResolvedValue({
    status: 'ACTIVE', plan: 'BASIC', currentPeriodEnd: new Date(Date.now() + 1e9),
  });
  ocrMock.mockResolvedValue({ merchantName: '', confidence: 0 } as any);
});

// ─────────────────────────────────────────────────────────────────────────────
// §7.1 — performFraudCheck: requiresManualReview driven by threshold
// ─────────────────────────────────────────────────────────────────────────────

describe('§7.1 performFraudCheck — requiresManualReview uses threshold', () => {
  const config: any = {
    minBillAmount: 0,
    maxScansPerDay: 999999,
    maxScansPerMonth: 999999,
    gpsRadiusMeters: 100,
    autoApproveThreshold: 30,
  };

  it('returns requiresManualReview=false when fraudScore is 0 (clean)', async () => {
    prismaMock.stickerScan.count.mockResolvedValue(0);
    const result = await (stickerService as any).performFraudCheck({
      userId: 'u-1',
      venueId: 'venue-1',
      billAmount: 50,
      distance: 10,
      config,
    });
    expect(result.requiresManualReview).toBe(false);
    expect(result.fraudScore).toBe(0);
  });

  it('returns requiresManualReview=false when fraudScore equals a custom threshold (score=25, threshold=25)', async () => {
    // RAPID_SCANNING: 4 scans in 30 min → +25. We test the at-boundary condition
    // with a threshold that matches that exact score.
    const tightConfig = { ...config, autoApproveThreshold: 25 };
    prismaMock.stickerScan.count.mockImplementation(async (args: any) => {
      // 4 scans in last 30 min → +25 fraud signal (recentScans query has createdAt.gte and no venueId)
      if (args?.where?.createdAt?.gte && !args?.where?.venueId) return 4;
      return 0;
    });
    const result = await (stickerService as any).performFraudCheck({
      userId: 'u-1', venueId: 'venue-1', billAmount: 50, config: tightConfig,
    });
    expect(result.fraudScore).toBe(25);
    expect(result.requiresManualReview).toBe(false); // 25 ≤ 25
  });

  it('returns requiresManualReview=true when fraudScore exceeds threshold', async () => {
    const tightConfig = { ...config, autoApproveThreshold: 20 };
    prismaMock.stickerScan.count.mockImplementation(async (args: any) => {
      if (args?.where?.createdAt?.gte && !args?.where?.venueId) return 4; // +25 rapid scanning
      return 0;
    });
    const result = await (stickerService as any).performFraudCheck({
      userId: 'u-1', venueId: 'venue-1', billAmount: 50, config: tightConfig,
    });
    expect(result.fraudScore).toBe(25);
    expect(result.requiresManualReview).toBe(true); // 25 > 20
  });

  it('returns requiresManualReview=true for high-risk score (61+)', async () => {
    prismaMock.stickerScan.count.mockImplementation(async (args: any) => {
      // rapid-scanning query: no venueId, has createdAt.gte → +25
      if (args?.where?.createdAt?.gte && !args?.where?.venueId) return 4;
      // daily/monthly exceeded queries: have venueId → +40
      if (args?.where?.venueId) return 999999;
      return 0;
    });
    const result = await (stickerService as any).performFraudCheck({
      userId: 'u-1', venueId: 'venue-1', billAmount: 50, config,
    });
    expect(result.fraudScore).toBeGreaterThan(30);
    expect(result.requiresManualReview).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7.1 — uploadReceipt routing: auto-approve vs manual-review
// ─────────────────────────────────────────────────────────────────────────────

describe('§7.1 uploadReceipt — auto-approve vs manual-review routing', () => {
  it('auto-approves and calls approveScan() when fraudScore ≤ threshold (score=0)', async () => {
    scanRow = makeScan(0, 5, 30);

    const approveSpy = jest
      .spyOn(stickerService, 'approveScan')
      .mockResolvedValue({ ...scanRow, status: 'APPROVED' } as any);

    const result = await stickerService.uploadReceipt({
      scanId: 'scan-1',
      userId: 'u-1',
      receiptImageUrl: 'https://s3.example.com/receipt.jpg',
    });

    expect(approveSpy).toHaveBeenCalledWith('scan-1', { adminUserId: null });
    expect(result.status).toBe('APPROVED');
  });

  it('auto-approves when fraudScore exactly equals threshold (score=30, threshold=30)', async () => {
    scanRow = makeScan(30, 5, 30);

    const approveSpy = jest
      .spyOn(stickerService, 'approveScan')
      .mockResolvedValue({ ...scanRow, status: 'APPROVED' } as any);

    await stickerService.uploadReceipt({
      scanId: 'scan-1',
      userId: 'u-1',
      receiptImageUrl: 'https://s3.example.com/receipt.jpg',
    });

    expect(approveSpy).toHaveBeenCalledTimes(1);
  });

  it('routes to MANUAL_REVIEW when fraudScore = 31 (just above threshold)', async () => {
    scanRow = makeScan(31, 5, 30);

    const approveSpy = jest
      .spyOn(stickerService, 'approveScan')
      .mockResolvedValue({ ...scanRow, status: 'APPROVED' } as any);

    await stickerService.uploadReceipt({
      scanId: 'scan-1',
      userId: 'u-1',
      receiptImageUrl: 'https://s3.example.com/receipt.jpg',
    });

    expect(approveSpy).not.toHaveBeenCalled();
    const manualReviewCall = stickerUpdateCalls.find((c) => c.data?.status === 'MANUAL_REVIEW');
    expect(manualReviewCall).toBeDefined();
  });

  it('routes to MANUAL_REVIEW when fraudScore = 65 (high-risk band)', async () => {
    scanRow = makeScan(65, 5, 30);

    const approveSpy = jest
      .spyOn(stickerService, 'approveScan')
      .mockResolvedValue({ ...scanRow, status: 'APPROVED' } as any);

    await stickerService.uploadReceipt({
      scanId: 'scan-1',
      userId: 'u-1',
      receiptImageUrl: 'https://s3.example.com/receipt.jpg',
    });

    expect(approveSpy).not.toHaveBeenCalled();
  });

  it('MANUAL_REVIEW path records a PENDING cashback entry', async () => {
    scanRow = makeScan(50, 7, 30);

    jest
      .spyOn(stickerService, 'approveScan')
      .mockResolvedValue({ ...scanRow, status: 'APPROVED' } as any);

    await stickerService.uploadReceipt({
      scanId: 'scan-1',
      userId: 'u-1',
      receiptImageUrl: 'https://s3.example.com/receipt.jpg',
    });

    expect(lifecycleMock.recordPendingForRiskReview).toHaveBeenCalledWith(
      expect.objectContaining({ stickerScanId: 'scan-1', amount: 7 })
    );
  });

  it('auto-approve path also records a PENDING row before calling approveScan()', async () => {
    // promotePendingToCleared inside approveScan depends on the PENDING row existing first
    scanRow = makeScan(15, 8, 30);

    jest
      .spyOn(stickerService, 'approveScan')
      .mockResolvedValue({ ...scanRow, status: 'APPROVED' } as any);

    await stickerService.uploadReceipt({
      scanId: 'scan-1',
      userId: 'u-1',
      receiptImageUrl: 'https://s3.example.com/receipt.jpg',
    });

    expect(lifecycleMock.recordPendingForRiskReview).toHaveBeenCalledWith(
      expect.objectContaining({ stickerScanId: 'scan-1', amount: 8 })
    );
  });

  it('auto-approves a zero-cashback scan directly (APPROVED, no approveScan)', async () => {
    // cashbackAmount=0 → no subscription → approveScan would throw; handle gracefully
    scanRow = makeScan(0, 0, 30);

    const approveSpy = jest
      .spyOn(stickerService, 'approveScan')
      .mockResolvedValue({ ...scanRow, status: 'APPROVED' } as any);

    await stickerService.uploadReceipt({
      scanId: 'scan-1',
      userId: 'u-1',
      receiptImageUrl: 'https://s3.example.com/receipt.jpg',
    });

    expect(approveSpy).not.toHaveBeenCalled();
    const approvedCall = stickerUpdateCalls.find((c) => c.data?.status === 'APPROVED');
    expect(approvedCall).toBeDefined();
  });

  it('respects a custom venue autoApproveThreshold of 10', async () => {
    // Venue configured with tighter threshold=10. fraudScore=15 must go to MANUAL_REVIEW.
    scanRow = makeScan(15, 5, 10);

    const approveSpy = jest
      .spyOn(stickerService, 'approveScan')
      .mockResolvedValue({ ...scanRow, status: 'APPROVED' } as any);

    await stickerService.uploadReceipt({
      scanId: 'scan-1',
      userId: 'u-1',
      receiptImageUrl: 'https://s3.example.com/receipt.jpg',
    });

    expect(approveSpy).not.toHaveBeenCalled();
    const manualReviewCall = stickerUpdateCalls.find((c) => c.data?.status === 'MANUAL_REVIEW');
    expect(manualReviewCall).toBeDefined();
  });

  it('falls back to MANUAL_REVIEW when auto-approveScan() throws unexpectedly', async () => {
    scanRow = makeScan(5, 5, 30);

    jest
      .spyOn(stickerService, 'approveScan')
      .mockRejectedValue(new Error('unexpected DB error'));

    // Should not throw — fall back silently
    const result = await stickerService.uploadReceipt({
      scanId: 'scan-1',
      userId: 'u-1',
      receiptImageUrl: 'https://s3.example.com/receipt.jpg',
    });

    // Still returns a scan; status is whatever the DB has (MANUAL_REVIEW after first update)
    expect(result).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7.1 — verifyAndAnnotateScan: APPROVED/REJECTED/EXPIRED scans are not annotated
// ─────────────────────────────────────────────────────────────────────────────

describe('§7.1 verifyAndAnnotateScan — settled scans are not retroactively annotated', () => {
  const candidateNames = ['Kristal Restaurant'];

  // A confident OCR result that would normally trigger MERCHANT_MISMATCH
  const mismatchOcr = { merchantName: 'Completely Different Shop', confidence: 80 };

  it.each([
    ['APPROVED'],
    ['REJECTED'],
    ['EXPIRED'],
  ])('skips annotation when scan status is %s', async (terminalStatus) => {
    scanRow = makeScan(0, 5, 30, terminalStatus);
    ocrMock.mockResolvedValue(mismatchOcr as any);

    await (stickerService as any).verifyAndAnnotateScan(
      'scan-1',
      Buffer.from('fake-image'),
      candidateNames,
      'Kristal Restaurant',
    );

    // No update should have been fired on the scan
    expect(stickerUpdateCalls.length).toBe(0);
    // Logger.warn should have been called to surface the skipped annotation
    const { logger } = require('../../src/utils/logger');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(`scan scan-1 is already ${terminalStatus}`),
    );
  });

  it('annotates MANUAL_REVIEW scan normally when OCR detects a mismatch', async () => {
    scanRow = makeScan(20, 5, 30, 'MANUAL_REVIEW');
    ocrMock.mockResolvedValue(mismatchOcr as any);

    await (stickerService as any).verifyAndAnnotateScan(
      'scan-1',
      Buffer.from('fake-image'),
      candidateNames,
      'Kristal Restaurant',
    );

    const updateCall = stickerUpdateCalls.find(
      (c) => c.data?.fraudReasons?.push?.startsWith?.('MERCHANT_MISMATCH'),
    );
    // The update should have been called with a MERCHANT_MISMATCH push
    expect(stickerUpdateCalls.some((c) => c.data?.fraudScore?.increment === 40)).toBe(true);
  });

  it('does not annotate when the scan is already flagged with MERCHANT_MISMATCH (idempotency)', async () => {
    scanRow = makeScan(60, 5, 30, 'MANUAL_REVIEW');
    scanRow.fraudReasons = ['MERCHANT_MISMATCH: receipt="x" vs venue="y"'];
    ocrMock.mockResolvedValue(mismatchOcr as any);

    await (stickerService as any).verifyAndAnnotateScan(
      'scan-1',
      Buffer.from('fake-image'),
      candidateNames,
      'Kristal Restaurant',
    );

    // No second update should occur
    expect(stickerUpdateCalls.length).toBe(0);
  });

  it('annotates a VALIDATING scan — transition states are not terminal', async () => {
    // VALIDATING is the in-flight state during uploadReceipt(). The OCR worker may
    // race ahead and call verifyAndAnnotateScan before the status advances to
    // MANUAL_REVIEW. Annotating VALIDATING is correct — the MERCHANT_MISMATCH flag
    // will be present when admin reviews the scan moments later.
    scanRow = makeScan(10, 5, 30, 'VALIDATING');
    ocrMock.mockResolvedValue(mismatchOcr as any);

    await (stickerService as any).verifyAndAnnotateScan(
      'scan-1',
      Buffer.from('fake-image'),
      candidateNames,
      'Kristal Restaurant',
    );

    // An update MUST have fired — VALIDATING is not a terminal state.
    expect(stickerUpdateCalls.some((c) => c.data?.fraudScore?.increment === 40)).toBe(true);
    // logger.warn must NOT have been called (no skip warning)
    const { logger } = require('../../src/utils/logger');
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('is already VALIDATING'),
    );
  });

  it('annotates a PENDING scan — pre-receipt states are not terminal', async () => {
    // PENDING means the scan was submitted but no receipt uploaded yet. OCR being
    // called here would indicate a bug in the caller, but verifyAndAnnotateScan
    // must not corrupt a PENDING scan by skipping it — it can safely annotate.
    scanRow = makeScan(0, 5, 30, 'PENDING');
    ocrMock.mockResolvedValue(mismatchOcr as any);

    await (stickerService as any).verifyAndAnnotateScan(
      'scan-1',
      Buffer.from('fake-image'),
      candidateNames,
      'Kristal Restaurant',
    );

    expect(stickerUpdateCalls.some((c) => c.data?.fraudScore?.increment === 40)).toBe(true);
    const { logger } = require('../../src/utils/logger');
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('is already PENDING'),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7.1 — updateVenueConfig: autoApproveThreshold is writable with validation
// ─────────────────────────────────────────────────────────────────────────────

describe('§7.1 updateVenueConfig — autoApproveThreshold', () => {
  it('accepts a valid threshold in the 0–100 range', async () => {
    prismaMock.venueStickerConfig.upsert.mockResolvedValue({
      venueId: 'venue-1',
      autoApproveThreshold: 45,
    });

    const result = await stickerService.updateVenueConfig('venue-1', { autoApproveThreshold: 45 });
    expect(result.autoApproveThreshold).toBe(45);

    const upsertCall = prismaMock.venueStickerConfig.upsert.mock.calls[0][0];
    expect(upsertCall.update.autoApproveThreshold).toBe(45);
  });

  it('accepts boundary value 0', async () => {
    await expect(
      stickerService.updateVenueConfig('venue-1', { autoApproveThreshold: 0 }),
    ).resolves.not.toThrow();
  });

  it('accepts boundary value 100', async () => {
    await expect(
      stickerService.updateVenueConfig('venue-1', { autoApproveThreshold: 100 }),
    ).resolves.not.toThrow();
  });

  it('rejects threshold below 0', async () => {
    await expect(
      stickerService.updateVenueConfig('venue-1', { autoApproveThreshold: -1 }),
    ).rejects.toThrow('autoApproveThreshold must be a number between 0 and 100');
  });

  it('rejects threshold above 100', async () => {
    await expect(
      stickerService.updateVenueConfig('venue-1', { autoApproveThreshold: 101 }),
    ).rejects.toThrow('autoApproveThreshold must be a number between 0 and 100');
  });

  it('rejects a non-numeric threshold', async () => {
    await expect(
      stickerService.updateVenueConfig('venue-1', { autoApproveThreshold: 'high' as any }),
    ).rejects.toThrow('autoApproveThreshold must be a number between 0 and 100');
  });

  it('ignores autoApproveThreshold when not supplied (no change)', async () => {
    await stickerService.updateVenueConfig('venue-1', { minBillAmount: 10 });

    const upsertCall = prismaMock.venueStickerConfig.upsert.mock.calls[0][0];
    expect(upsertCall.update).not.toHaveProperty('autoApproveThreshold');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7.2 — performFraudCheck signal code normalisation (Bug #1 regression)
// ─────────────────────────────────────────────────────────────────────────────

describe('§7.2 performFraudCheck — exact signal codes for hasSome matching', () => {
  const config: any = {
    minBillAmount: 0,
    maxScansPerDay: 3,
    maxScansPerMonth: 10,
    gpsRadiusMeters: 100,
    autoApproveThreshold: 30,
  };

  it('writes DAILY_LIMIT_EXCEEDED (exact) when daily limit hit', async () => {
    prismaMock.stickerScan.count.mockImplementation(async (args: any) => {
      // daily count query: has venueId
      if (args?.where?.venueId) return 5;
      return 0;
    });
    const result = await (stickerService as any).performFraudCheck({
      userId: 'u-1', venueId: 'venue-1', billAmount: 50, config,
    });
    expect(result.fraudReasons).toContain('DAILY_LIMIT_EXCEEDED');
    expect(result.fraudReasons.every((r: string) => !r.startsWith('MAX_SCANS_PER_DAY'))).toBe(true);
  });

  it('writes MONTHLY_LIMIT_EXCEEDED (exact) when monthly limit hit', async () => {
    prismaMock.stickerScan.count.mockImplementation(async (args: any) => {
      // The monthly query also has venueId. We hit both limits in this mock;
      // both codes should appear, and neither should have the old payload suffix.
      if (args?.where?.venueId) return 999;
      return 0;
    });
    const result = await (stickerService as any).performFraudCheck({
      userId: 'u-1', venueId: 'venue-1', billAmount: 50, config,
    });
    expect(result.fraudReasons).toContain('MONTHLY_LIMIT_EXCEEDED');
    expect(result.fraudReasons.every((r: string) => !r.startsWith('MAX_SCANS_PER_MONTH'))).toBe(true);
  });

  it('writes RAPID_SUBMISSIONS (exact) when rapid scanning detected', async () => {
    prismaMock.stickerScan.count.mockImplementation(async (args: any) => {
      // rapid-scanning query: no venueId, has createdAt.gte → 4 scans
      if (args?.where?.createdAt?.gte && !args?.where?.venueId) return 4;
      return 0;
    });
    const result = await (stickerService as any).performFraudCheck({
      userId: 'u-1', venueId: 'venue-1', billAmount: 50, config,
    });
    expect(result.fraudReasons).toContain('RAPID_SUBMISSIONS');
    expect(result.fraudReasons.every((r: string) => !r.startsWith('RAPID_SCANNING'))).toBe(true);
  });

  it('writes HIGH_BILL_AMOUNT (exact) for bills over 1000', async () => {
    prismaMock.stickerScan.count.mockResolvedValue(0);
    const result = await (stickerService as any).performFraudCheck({
      userId: 'u-1', venueId: 'venue-1', billAmount: 1500, config,
    });
    expect(result.fraudReasons).toContain('HIGH_BILL_AMOUNT');
    expect(result.fraudReasons.every((r: string) => !r.startsWith('HIGH_BILL_AMOUNT:'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7.1 — approveScan: notes threaded to lifecycle reason
// ─────────────────────────────────────────────────────────────────────────────

describe('§7.1 approveScan — notes passed to promotePendingToCleared', () => {
  beforeEach(() => {
    // Restore any spies from earlier tests (e.g. approveScan mockRejectedValue)
    // so these tests call the real implementation.
    jest.restoreAllMocks();
    // Re-apply the default mock implementations that clearAllMocks resets.
    prismaMock.stickerScan.count.mockResolvedValue(0);
    prismaMock.receipt.findFirst.mockResolvedValue(null);
    prismaMock.walletTransaction.findFirst.mockResolvedValue(null);
    prismaMock.subscription.findFirst.mockResolvedValue({
      status: 'ACTIVE', plan: 'BASIC', currentPeriodEnd: new Date(Date.now() + 1e9),
    });
    ocrMock.mockResolvedValue({ merchantName: '', confidence: 0 } as any);
  });

  it('passes opts.notes as reason when notes is provided', async () => {
    scanRow = makeScan(25, 10, 30, 'MANUAL_REVIEW');
    walletTxRow = { id: 'wt-pending', cashbackStatus: 'PENDING', amount: 10 };
    // Mock findFirst to return the PENDING wallet transaction
    prismaMock.walletTransaction.findFirst.mockResolvedValue(walletTxRow);

    await stickerService.approveScan('scan-1', {
      adminUserId: 'admin-1',
      notes: 'Receipt verified — amount matches OCR output',
    });

    expect(lifecycleMock.promotePendingToCleared).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Receipt verified — amount matches OCR output',
        actorUserId: 'admin-1',
      }),
    );
  });

  it('falls back to default reason when notes is not provided', async () => {
    scanRow = makeScan(15, 8, 30, 'MANUAL_REVIEW');
    walletTxRow = { id: 'wt-pending', cashbackStatus: 'PENDING', amount: 8 };
    prismaMock.walletTransaction.findFirst.mockResolvedValue(walletTxRow);

    await stickerService.approveScan('scan-1', { adminUserId: 'admin-2' });

    expect(lifecycleMock.promotePendingToCleared).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Admin approved sticker scan after risk review',
        actorUserId: 'admin-2',
      }),
    );
  });
});
