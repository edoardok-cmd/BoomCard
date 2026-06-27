/**
 * §5.3 / §5.4 Partner Service unit tests
 *
 * Pins the two exported symbols:
 *   - isPartnerOperationallyActive — "ACTIVE + verifiedAt IS NOT NULL"
 *   - partnerService.setPartnerStatus — atomic status transition + audit row
 */

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockTx: any = {
  partner: {
    findUnique: jest.fn(async () => null),
    update: jest.fn(async () => ({})),
  },
  partnerStatusChange: {
    create: jest.fn(async () => ({})),
  },
  activationLink: {
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
  sticker: {
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
};

const mockPrisma: any = {
  $transaction: jest.fn(async (fn) => fn(mockTx)),
  // setPartnerStatus() reads the partner (post-commit) to fire the §9.1/Clash 6.6
  // status-change notification. Returning null leaves notifyPartnerStatusChange unfired,
  // which is correct for these tests (they assert the DB transition + audit row, not
  // the notification). syncQrCodesForPartner's sticker.updateMany is non-fatal (retry+catch).
  partner: {
    findUnique: jest.fn(async () => null),
  },
  sticker: {
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

const mockNotificationService: any = {
  notifyPartnerStatusChange: jest.fn(async () => undefined),
};

jest.mock('../../src/services/notification.service', () => ({
  notificationService: mockNotificationService,
}));

jest.mock('../../src/utils/detach', () => ({
  detach: (promise: Promise<unknown>, errorHandler: any) => {
    // For testing, execute synchronously and call error handler if it fails
    promise.catch((err: unknown) => errorHandler?.(err));
  },
}));

import { PartnerStatus, PartnerRequestStatus } from '@prisma/client';
import { isPartnerOperationallyActive, partnerService } from '../../src/services/partner.service';

beforeEach(() => jest.clearAllMocks());

// ─── isPartnerOperationallyActive ─────────────────────────────────────────────

describe('isPartnerOperationallyActive', () => {
  it('returns true when ACTIVE and verifiedAt is set', () => {
    expect(isPartnerOperationallyActive({ status: 'ACTIVE', verifiedAt: new Date() })).toBe(true);
  });

  it('returns false when status is ACTIVE but verifiedAt is null', () => {
    expect(isPartnerOperationallyActive({ status: 'ACTIVE', verifiedAt: null })).toBe(false);
  });

  it('returns false when status is SUSPENDED with a verifiedAt', () => {
    expect(isPartnerOperationallyActive({ status: 'SUSPENDED', verifiedAt: new Date() })).toBe(false);
  });

  it('returns false when status is INACTIVE', () => {
    expect(isPartnerOperationallyActive({ status: 'INACTIVE', verifiedAt: new Date() })).toBe(false);
  });

  it('returns false when status is ARCHIVED', () => {
    expect(isPartnerOperationallyActive({ status: 'ARCHIVED', verifiedAt: new Date() })).toBe(false);
  });

  it('returns false when status is PENDING', () => {
    expect(isPartnerOperationallyActive({ status: 'PENDING', verifiedAt: new Date() })).toBe(false);
  });
});

// ─── setPartnerStatus ─────────────────────────────────────────────────────────

describe('partnerService.setPartnerStatus', () => {
  it('throws when partner is not found', async () => {
    mockTx.partner.findUnique.mockResolvedValueOnce(null);
    await expect(
      partnerService.setPartnerStatus({ partnerId: 'ghost', toStatus: PartnerStatus.SUSPENDED }),
    ).rejects.toThrow('Partner ghost not found');
    expect(mockTx.partner.update).not.toHaveBeenCalled();
  });

  it('throws when partner is already in the target status', async () => {
    mockTx.partner.findUnique.mockResolvedValueOnce({ id: 'p-1', status: PartnerStatus.SUSPENDED });
    await expect(
      partnerService.setPartnerStatus({ partnerId: 'p-1', toStatus: PartnerStatus.SUSPENDED }),
    ).rejects.toThrow('already in SUSPENDED state');
    expect(mockTx.partner.update).not.toHaveBeenCalled();
  });

  it('updates partner status and writes a PartnerStatusChange row', async () => {
    mockTx.partner.findUnique.mockResolvedValueOnce({ id: 'p-1', status: PartnerStatus.ACTIVE });
    const result = await partnerService.setPartnerStatus({
      partnerId: 'p-1',
      toStatus: PartnerStatus.SUSPENDED,
      reason: 'Fraud investigation',
      changedById: 'admin-1',
    });

    // M3 (§1.4): SUSPENDED now also stamps the canonical Inactive sub_type marker
    // (ADMIN_SUSPENSION = Спрян) into statusReason, with the free-text reason
    // appended after the marker.
    expect(mockTx.partner.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { status: PartnerStatus.SUSPENDED, statusReason: 'ADMIN_SUSPENSION: Fraud investigation' },
    });
    expect(mockTx.partnerStatusChange.create).toHaveBeenCalledWith({
      data: {
        partnerId: 'p-1',
        fromStatus: PartnerStatus.ACTIVE,
        toStatus: PartnerStatus.SUSPENDED,
        reason: 'Fraud investigation',
        changedById: 'admin-1',
      },
    });
    expect(result).toEqual({
      partnerId: 'p-1',
      fromStatus: PartnerStatus.ACTIVE,
      toStatus: PartnerStatus.SUSPENDED,
    });
  });

  it('trims whitespace from reason and stores null for blank reason', async () => {
    mockTx.partner.findUnique.mockResolvedValueOnce({ id: 'p-2', status: PartnerStatus.INACTIVE });
    await partnerService.setPartnerStatus({
      partnerId: 'p-2',
      toStatus: PartnerStatus.ACTIVE,
      reason: '   ',
    });

    expect(mockTx.partnerStatusChange.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: null }) }),
    );
  });

  it('stores null changedById when not supplied', async () => {
    mockTx.partner.findUnique.mockResolvedValueOnce({ id: 'p-3', status: PartnerStatus.ACTIVE });
    await partnerService.setPartnerStatus({ partnerId: 'p-3', toStatus: PartnerStatus.ARCHIVED });

    expect(mockTx.partnerStatusChange.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ changedById: null }) }),
    );
  });

  it('returns the correct fromStatus and toStatus in the result', async () => {
    mockTx.partner.findUnique.mockResolvedValueOnce({ id: 'p-4', status: PartnerStatus.SUSPENDED });
    const result = await partnerService.setPartnerStatus({
      partnerId: 'p-4',
      toStatus: PartnerStatus.ACTIVE,
    });
    expect(result.fromStatus).toBe(PartnerStatus.SUSPENDED);
    expect(result.toStatus).toBe(PartnerStatus.ACTIVE);
  });

  it('converts ARCHIVED→ACTIVE reactivation to PENDING status + ONBOARDING requestStatus + null verifiedAt', async () => {
    // Spec §1.7 / §2.4 / §12 rule 5: reactivating an ARCHIVED partner requires
    // re-entry into the onboarding pipeline. The partner should NOT jump directly
    // to ACTIVE; instead they should go to PENDING and be re-approved.
    mockTx.partner.findUnique.mockResolvedValueOnce({ id: 'p-archived', status: PartnerStatus.ARCHIVED });
    mockTx.activationLink.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTx.sticker.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await partnerService.setPartnerStatus({
      partnerId: 'p-archived',
      toStatus: PartnerStatus.ACTIVE, // Admin requests ACTIVE
      reason: 'Reactivating archived partner',
      changedById: 'admin-1',
    });

    // The partner record should be updated with status=PENDING (not ACTIVE)
    // and requestStatus=ONBOARDING, verifiedAt=null to re-enter the approval pipeline
    expect(mockTx.partner.update).toHaveBeenCalledWith({
      where: { id: 'p-archived' },
      data: {
        status: PartnerStatus.PENDING, // Not ACTIVE — enters onboarding pipeline
        statusReason: null, // Leaving ARCHIVED clears the marker
        requestStatus: PartnerRequestStatus.ONBOARDING,
        verifiedAt: null,
      },
    });

    // PartnerStatusChange records the semantic transition intent (ARCHIVED → ACTIVE)
    // HOWEVER, the function return value must match what was actually written to the DB.
    // Since ARCHIVED→ACTIVE reactivation writes status=PENDING, the return must be PENDING
    // to avoid audit trail inconsistencies (the endpoint uses change.toStatus in the audit log).
    expect(mockTx.partnerStatusChange.create).toHaveBeenCalledWith({
      data: {
        partnerId: 'p-archived',
        fromStatus: PartnerStatus.ARCHIVED,
        toStatus: PartnerStatus.ACTIVE, // Semantic intent recorded in history
        reason: 'Reactivating archived partner',
        changedById: 'admin-1',
      },
    });

    // Return value reflects actual DB state written (PENDING, not the requested ACTIVE)
    expect(result).toEqual({
      partnerId: 'p-archived',
      fromStatus: PartnerStatus.ARCHIVED,
      toStatus: PartnerStatus.PENDING, // Actual status written to DB
    });
  });

  it('sends notification with correct canonicalized status when ARCHIVED→ACTIVE reactivation occurs', async () => {
    // r2i F2: The notification must reflect the actual DB state (PENDING), not the request (ACTIVE).
    // This verifies that the notification parameter toStatus uses result.toStatus, not the input toStatus.
    mockTx.partner.findUnique.mockResolvedValueOnce({ id: 'p-archived', status: PartnerStatus.ARCHIVED });
    mockTx.activationLink.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTx.sticker.updateMany.mockResolvedValueOnce({ count: 0 });

    // Mock the post-transaction partner lookup for the notification
    mockPrisma.partner.findUnique.mockResolvedValueOnce({
      id: 'p-archived',
      userId: 'user-123',
      businessName: 'Test Business',
    });

    await partnerService.setPartnerStatus({
      partnerId: 'p-archived',
      toStatus: PartnerStatus.ACTIVE, // Request ACTIVE
      reason: 'Reactivating archived partner',
      changedById: 'admin-1',
    });

    // The notification should be called with the canonicalized actual DB status (PENDING → INACTIVE),
    // not the requested status (ACTIVE). This ensures partners receive accurate information about
    // their account state.
    expect(mockNotificationService.notifyPartnerStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerUserId: 'user-123',
        businessName: 'Test Business',
        toStatus: 'INACTIVE', // PENDING canonicalizes to INACTIVE
        fromStatus: 'ARCHIVED', // ARCHIVED canonicalizes to ARCHIVED
      })
    );
  });

  it('sends notification with correct status for normal ACTIVE→SUSPENDED transition', async () => {
    mockTx.partner.findUnique.mockResolvedValueOnce({ id: 'p-1', status: PartnerStatus.ACTIVE });
    mockTx.activationLink.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTx.sticker.updateMany.mockResolvedValueOnce({ count: 0 });

    // Mock the post-transaction partner lookup for the notification
    mockPrisma.partner.findUnique.mockResolvedValueOnce({
      id: 'p-1',
      userId: 'user-456',
      businessName: 'Another Business',
    });

    await partnerService.setPartnerStatus({
      partnerId: 'p-1',
      toStatus: PartnerStatus.SUSPENDED,
      reason: 'Policy violation',
      changedById: 'admin-2',
    });

    // For normal transitions (not ARCHIVED→ACTIVE), the notification receives the actual status
    // and its canonicalization: SUSPENDED → INACTIVE
    expect(mockNotificationService.notifyPartnerStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerUserId: 'user-456',
        businessName: 'Another Business',
        toStatus: 'INACTIVE', // SUSPENDED canonicalizes to INACTIVE
        fromStatus: 'ACTIVE', // ACTIVE canonicalizes to ACTIVE
      })
    );
  });
});
