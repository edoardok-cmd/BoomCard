/**
 * §18 — Sticker Scanning Flow
 *
 * §18.1 Sticker Lifecycle
 *   - generateSticker() creates sticker with PENDING status
 *   - generateSticker() QR payload contains all required fields (type, venueId, locationId, stickerId, version='1.0')
 *   - generateSticker() throws when a sticker for that locationId already exists
 *   - activateSticker() transitions PENDING → ACTIVE (stamps activatedAt + printedAt)
 *   - activateSticker() transitions PROCESSING → ACTIVE (stamps activatedAt; printedAt already set)
 *   - activateSticker() throws for invalid source states (REPLACED, INACTIVE, ACTIVE)
 *   - markStickerProcessing() transitions PENDING → PROCESSING (stamps printedAt)
 *   - markStickerProcessing() throws when sticker is not in PENDING state
 *
 * §18.2 User Scanning (Session field validation — early guards before DB round-trips)
 *   - createSession() rejects when payloadVenueId is missing
 *   - createSession() rejects when QR version major < 1 (e.g. '0.9')
 *   - createSession() rejects when QR version is non-numeric (e.g. 'alpha')
 */

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma: any = {
  sticker: {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async () => null),
    update: jest.fn(async () => null),
  },
  stickerLocation: {
    findUnique: jest.fn(async () => null),
  },
  venue: {
    findUnique: jest.fn(async () => null),
  },
  // Spec §1.3 / §8.2 — assertSubscriptionAllowsScanning() reads user_account_status
  // before the venueId/version pre-DB guards. The scanning subscriber is ACTIVE here so
  // the early-validation tests still reach the guards they assert on.
  user: {
    findUnique: jest.fn(async () => ({ status: 'ACTIVE' })),
  },
  subscription: {
    findFirst: jest.fn(async () => null),
  },
  card: {
    findFirst: jest.fn(async () => null),
    findUnique: jest.fn(async () => null),
  },
  partner: {
    findFirst: jest.fn(async () => null),
  },
  stickerScan: {
    create: jest.fn(async () => null),
  },
  $transaction: jest.fn(async (fn: any) => {
    if (typeof fn === 'function') return fn(mockPrisma);
    return Promise.all(fn);
  }),
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingInt: jest.fn(async (_key: string, fallback: number) => fallback),
  getSystemSettingStr: jest.fn(async (_key: string, fallback: string) => fallback),
  getSystemSettingFloat: jest.fn(async (_key: string, fallback: number) => fallback),
  invalidateSystemSettingCache: jest.fn(),
}));

// writeAudit is best-effort and non-fatal — mock it to avoid side effects
jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => {}),
}));

// Services used inside stickerService
jest.mock('../../src/services/walletService', () => ({}), { virtual: true });
jest.mock('../../src/services/wallet.service', () => ({
  walletService: { credit: jest.fn(async () => ({})) },
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyAdminOps: jest.fn(), sendNotification: jest.fn() },
}));
jest.mock('../../src/services/partnerType.service', () => ({
  partnerTypeService: { getRedeemableTypeIdsForPlan: jest.fn(async () => []) },
}));
jest.mock('../../src/services/fraudDetection.service', () => ({
  fraudDetectionService: { calculateCashback: jest.fn(async () => ({ cashbackAmount: 0, cashbackPercent: 0 })) },
}));
jest.mock('../../src/services/ocr.service', () => ({
  recognizeReceiptImage: jest.fn(async () => ({ text: '', confidence: 0 })),
}));
jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: { uploadImage: jest.fn(async () => 'https://cdn.example.com/img.jpg') },
}));
jest.mock('../../src/queues/merchantVerification.queue', () => ({
  enqueueMerchantVerification: jest.fn(async () => {}),
}));
jest.mock('../../src/services/cashbackLifecycle.service', () => ({
  cashbackLifecycleService: {},
}));
jest.mock('../../src/services/partner.service', () => ({
  isPartnerOperationallyActive: jest.fn(() => true),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { stickerService } from '../../src/services/sticker.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VENUE_ID = 'venue-uuid-1234';
const LOCATION_ID = 'loc-uuid-5678';

/** A minimal location fixture as returned by prisma.stickerLocation.findUnique */
function makeLocation(overrides: Partial<any> = {}) {
  return {
    id: LOCATION_ID,
    venueId: VENUE_ID,
    name: 'Table 4',
    locationType: 'TABLE',
    locationNumber: 'MASA04',
    isActive: true,
    venue: { id: VENUE_ID, name: 'Test Cafe' },
    ...overrides,
  };
}

/** A minimal venue fixture — used by getVenueCode (venue.findUnique) */
const mockVenue = {
  id: VENUE_ID,
  name: 'Test Cafe',
  latitude: 42.6977,
  longitude: 23.3219,
  stickerConfig: { gpsRadiusMeters: 100 },
};

/** Expected sticker ID derived from venue UUID prefix + locationNumber */
const EXPECTED_STICKER_ID = `${VENUE_ID.replace(/-/g, '').substring(0, 8).toUpperCase()}-MASA04`;

function makePendingSticker(overrides: Partial<any> = {}) {
  return {
    id: 'sticker-db-id-1',
    stickerId: EXPECTED_STICKER_ID,
    venueId: VENUE_ID,
    locationId: LOCATION_ID,
    qrCode: JSON.stringify({
      type: 'BOOM_STICKER',
      venueId: VENUE_ID,
      locationId: LOCATION_ID,
      stickerId: EXPECTED_STICKER_ID,
      locationType: 'TABLE',
      version: '1.0',
    }),
    status: 'PENDING',
    activatedAt: null,
    printedAt: null,
    venue: mockVenue,
    location: makeLocation(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.venue.findUnique.mockResolvedValue(mockVenue);
  mockPrisma.stickerLocation.findUnique.mockResolvedValue(makeLocation());
  mockPrisma.sticker.findUnique.mockResolvedValue(null); // no pre-existing sticker
  mockPrisma.sticker.create.mockImplementation(async (args: any) => ({
    id: 'sticker-db-id-1',
    ...args.data,
    venue: mockVenue,
    location: makeLocation(),
  }));
  mockPrisma.sticker.update.mockImplementation(async (args: any) => ({
    ...makePendingSticker(),
    ...args.data,
  }));
  // Spec §1.3/§8.2: assertSubscriptionAllowsScanning() now requires an active
  // subscription before reaching the createSession pre-DB guards. Default to an
  // ACTIVE sub so the venueId/version validation tests exercise the guards they
  // assert on. The §18.1 sticker-lifecycle tests do not call createSession, so
  // this default is inert for them.
  mockPrisma.subscription.findFirst.mockResolvedValue({
    status: 'ACTIVE',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  mockPrisma.user.findUnique.mockResolvedValue({ status: 'ACTIVE' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §18.1 — Sticker Lifecycle: generateSticker()
// ═══════════════════════════════════════════════════════════════════════════════

describe('§18.1 generateSticker() — status and QR payload', () => {
  it('creates sticker with status PENDING', async () => {
    await stickerService.generateSticker(LOCATION_ID);

    const createCall = mockPrisma.sticker.create.mock.calls[0][0];
    expect(createCall.data.status).toBe('PENDING');
  });

  it('QR payload contains type="BOOM_STICKER"', async () => {
    await stickerService.generateSticker(LOCATION_ID);

    const createCall = mockPrisma.sticker.create.mock.calls[0][0];
    const payload = JSON.parse(createCall.data.qrCode);
    expect(payload.type).toBe('BOOM_STICKER');
  });

  it('QR payload venueId matches the location venueId', async () => {
    await stickerService.generateSticker(LOCATION_ID);

    const createCall = mockPrisma.sticker.create.mock.calls[0][0];
    const payload = JSON.parse(createCall.data.qrCode);
    expect(payload.venueId).toBe(VENUE_ID);
  });

  it('QR payload contains locationId, stickerId, and version="1.0"', async () => {
    await stickerService.generateSticker(LOCATION_ID);

    const createCall = mockPrisma.sticker.create.mock.calls[0][0];
    const payload = JSON.parse(createCall.data.qrCode);
    expect(payload.locationId).toBe(LOCATION_ID);
    expect(payload.stickerId).toBe(EXPECTED_STICKER_ID);
    expect(payload.version).toBe('1.0');
  });

  it('throws when a sticker with the same ID already exists', async () => {
    // Pre-existing sticker for the same location
    mockPrisma.sticker.findUnique.mockResolvedValueOnce(makePendingSticker());

    await expect(stickerService.generateSticker(LOCATION_ID)).rejects.toThrow(
      new RegExp(`already exists`, 'i'),
    );
    // Sticker.create should NOT be called
    expect(mockPrisma.sticker.create).not.toHaveBeenCalled();
  });

  it('throws when location is not found', async () => {
    mockPrisma.stickerLocation.findUnique.mockResolvedValueOnce(null);

    await expect(stickerService.generateSticker('nonexistent-loc')).rejects.toThrow(
      /location not found/i,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §18.1 — Sticker Lifecycle: activateSticker()
// ═══════════════════════════════════════════════════════════════════════════════

describe('§18.1 activateSticker() — state transitions', () => {
  it('PENDING → ACTIVE: sets status=ACTIVE, activatedAt, and printedAt', async () => {
    mockPrisma.sticker.findUnique.mockResolvedValueOnce(
      makePendingSticker({ status: 'PENDING' }),
    );

    await stickerService.activateSticker(EXPECTED_STICKER_ID);

    const updateCall = mockPrisma.sticker.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('ACTIVE');
    expect(updateCall.data.activatedAt).toBeInstanceOf(Date);
    // From PENDING: printedAt should be set
    expect(updateCall.data.printedAt).toBeInstanceOf(Date);
  });

  it('PROCESSING → ACTIVE: sets status=ACTIVE and activatedAt; printedAt NOT overwritten', async () => {
    const existingPrintedAt = new Date('2026-01-01T10:00:00Z');
    mockPrisma.sticker.findUnique.mockResolvedValueOnce(
      makePendingSticker({ status: 'PROCESSING', printedAt: existingPrintedAt }),
    );

    await stickerService.activateSticker(EXPECTED_STICKER_ID);

    const updateCall = mockPrisma.sticker.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('ACTIVE');
    expect(updateCall.data.activatedAt).toBeInstanceOf(Date);
    // From PROCESSING: printedAt was already set — should be undefined (not overwritten)
    expect(updateCall.data.printedAt).toBeUndefined();
  });

  it('throws when sticker is already ACTIVE', async () => {
    mockPrisma.sticker.findUnique.mockResolvedValueOnce(
      makePendingSticker({ status: 'ACTIVE', activatedAt: new Date() }),
    );

    await expect(stickerService.activateSticker(EXPECTED_STICKER_ID)).rejects.toThrow(
      /cannot be activated from ACTIVE/i,
    );
  });

  it('throws when sticker is REPLACED', async () => {
    mockPrisma.sticker.findUnique.mockResolvedValueOnce(
      makePendingSticker({ status: 'REPLACED' }),
    );

    await expect(stickerService.activateSticker(EXPECTED_STICKER_ID)).rejects.toThrow(
      /cannot be activated from REPLACED/i,
    );
  });

  it('throws when sticker is INACTIVE', async () => {
    mockPrisma.sticker.findUnique.mockResolvedValueOnce(
      makePendingSticker({ status: 'INACTIVE' }),
    );

    await expect(stickerService.activateSticker(EXPECTED_STICKER_ID)).rejects.toThrow(
      /cannot be activated from INACTIVE/i,
    );
  });

  it('throws when sticker is not found', async () => {
    mockPrisma.sticker.findUnique.mockResolvedValueOnce(null);

    await expect(stickerService.activateSticker('NONEXISTENT')).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §18.1 — Sticker Lifecycle: markStickerProcessing()
// ═══════════════════════════════════════════════════════════════════════════════

describe('§18.1 markStickerProcessing() — state transitions', () => {
  it('PENDING → PROCESSING: sets status=PROCESSING and printedAt', async () => {
    mockPrisma.sticker.findUnique.mockResolvedValueOnce({
      id: 'sticker-db-id-1',
      status: 'PENDING',
    });

    await stickerService.markStickerProcessing(EXPECTED_STICKER_ID);

    const updateCall = mockPrisma.sticker.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('PROCESSING');
    expect(updateCall.data.printedAt).toBeInstanceOf(Date);
  });

  it('throws when sticker is not in PENDING state', async () => {
    for (const badStatus of ['ACTIVE', 'PROCESSING', 'REPLACED', 'INACTIVE']) {
      jest.clearAllMocks();
      mockPrisma.sticker.findUnique.mockResolvedValueOnce({
        id: 'sticker-db-id-1',
        status: badStatus,
      });
      mockPrisma.sticker.update.mockResolvedValue(makePendingSticker());

      await expect(
        stickerService.markStickerProcessing(EXPECTED_STICKER_ID),
      ).rejects.toThrow(/must be in PENDING state/i);
    }
  });

  it('throws when sticker not found', async () => {
    mockPrisma.sticker.findUnique.mockResolvedValueOnce(null);

    await expect(stickerService.markStickerProcessing('GHOST-STICKER')).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §18.2 — User Scanning: createSession() field validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('§18.2 createSession() — early field validation (pre-DB guards)', () => {
  // Minimal session data; the error under test fires before any DB lookup.
  const baseSessionData = {
    userId: 'u-1',
    stickerId: EXPECTED_STICKER_ID,
    latitude: 42.6977,
    longitude: 23.3219,
    ipAddress: '1.2.3.4',
    userAgent: 'TestAgent/1.0',
    payloadVenueId: VENUE_ID,
    payloadVersion: '1.0',
  };

  it('rejects immediately when payloadVenueId is missing', async () => {
    const data = { ...baseSessionData, payloadVenueId: undefined as any };

    await expect(stickerService.createSession(data)).rejects.toThrow(
      /missing venueId/i,
    );
    // assertSubscriptionAllowsScanning runs before the venueId check —
    // sticker.findUnique (the sticker DB lookup) must NOT be called
    expect(mockPrisma.sticker.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when QR version major is 0 (e.g. "0.9")', async () => {
    const data = { ...baseSessionData, payloadVersion: '0.9' };

    await expect(stickerService.createSession(data)).rejects.toThrow(
      /version is outdated/i,
    );
    expect(mockPrisma.sticker.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when QR version is non-numeric (e.g. "alpha")', async () => {
    const data = { ...baseSessionData, payloadVersion: 'alpha' };

    await expect(stickerService.createSession(data)).rejects.toThrow(
      /version is outdated/i,
    );
    expect(mockPrisma.sticker.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when QR version string is empty', async () => {
    const data = { ...baseSessionData, payloadVersion: '' };

    await expect(stickerService.createSession(data)).rejects.toThrow(
      /version is outdated/i,
    );
    expect(mockPrisma.sticker.findUnique).not.toHaveBeenCalled();
  });

  it('accepts version "1.0" — proceeds past early validation to sticker lookup', async () => {
    // Version '1.0' is valid — the active-subscription gate (default ACTIVE sub) passes,
    // then sticker.findUnique returns null → throws 'Invalid sticker code'
    mockPrisma.sticker.findUnique.mockResolvedValueOnce(null);

    await expect(stickerService.createSession(baseSessionData)).rejects.toThrow(
      /invalid sticker code/i,
    );
    // Confirm execution did reach the sticker DB lookup (version check passed)
    expect(mockPrisma.sticker.findUnique).toHaveBeenCalled();
  });

  it('accepts version "2.5" (major >= 1) — proceeds past early validation', async () => {
    mockPrisma.sticker.findUnique.mockResolvedValueOnce(null);

    await expect(
      stickerService.createSession({ ...baseSessionData, payloadVersion: '2.5' }),
    ).rejects.toThrow(/invalid sticker code/i);

    expect(mockPrisma.sticker.findUnique).toHaveBeenCalled();
  });
});
