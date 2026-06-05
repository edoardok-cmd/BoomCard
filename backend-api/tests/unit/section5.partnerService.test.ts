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

import { PartnerStatus } from '@prisma/client';
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

    expect(mockTx.partner.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { status: PartnerStatus.SUSPENDED },
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
});
