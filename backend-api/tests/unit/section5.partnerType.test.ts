/**
 * §5 Partner Type Service unit tests
 *
 * Covers the business-logic guards in partnerTypeService that are not
 * derivable from a simple DB wrapper: discount-rate validation, existence
 * checks, partner-count block on delete, atomic plan-access replacement,
 * and the null-plan fallback in getRedeemableTypeIdsForPlan /
 * getVisibleTypeIdsForPlan.
 */

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma: any = {
  partnerType: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async (args) => ({ id: 'pt-1', ...args.data })),
    update: jest.fn(async (args) => ({ id: args.where.id, ...args.data })),
    delete: jest.fn(async () => ({})),
  },
  planTypeAccess: {
    findMany: jest.fn(async () => []),
    deleteMany: jest.fn(async () => ({ count: 0 })),
    createMany: jest.fn(async () => ({ count: 0 })),
  },
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

import { partnerTypeService } from '../../src/services/partnerType.service';
import { SubscriptionPlan } from '@prisma/client';

beforeEach(() => jest.clearAllMocks());

// ─── createType ───────────────────────────────────────────────────────────────

describe('partnerTypeService.createType — discount rate validation', () => {
  it('rejects maxDiscountRate < 0', async () => {
    await expect(partnerTypeService.createType({ name: 'X', maxDiscountRate: -1 }))
      .rejects.toThrow('maxDiscountRate must be between 0 and 100');
    expect(mockPrisma.partnerType.create).not.toHaveBeenCalled();
  });

  it('rejects maxDiscountRate > 100', async () => {
    await expect(partnerTypeService.createType({ name: 'X', maxDiscountRate: 101 }))
      .rejects.toThrow('maxDiscountRate must be between 0 and 100');
    expect(mockPrisma.partnerType.create).not.toHaveBeenCalled();
  });

  it('accepts boundary values 0 and 100', async () => {
    await expect(partnerTypeService.createType({ name: 'Zero', maxDiscountRate: 0 })).resolves.not.toThrow();
    await expect(partnerTypeService.createType({ name: 'Hundred', maxDiscountRate: 100 })).resolves.not.toThrow();
    expect(mockPrisma.partnerType.create).toHaveBeenCalledTimes(2);
  });

  it('creates with valid rate and passes all fields to prisma', async () => {
    const data = { name: 'Premium', nameBg: 'Премиум', maxDiscountRate: 25, isActive: true };
    await partnerTypeService.createType(data);
    expect(mockPrisma.partnerType.create).toHaveBeenCalledWith({ data });
  });
});

// ─── updateType ──────────────────────────────────────────────────────────────

describe('partnerTypeService.updateType — guards', () => {
  it('rejects maxDiscountRate < 0 before DB lookup', async () => {
    await expect(partnerTypeService.updateType('pt-1', { maxDiscountRate: -5 }))
      .rejects.toThrow('maxDiscountRate must be between 0 and 100');
    expect(mockPrisma.partnerType.findUnique).not.toHaveBeenCalled();
  });

  it('rejects maxDiscountRate > 100 before DB lookup', async () => {
    await expect(partnerTypeService.updateType('pt-1', { maxDiscountRate: 150 }))
      .rejects.toThrow('maxDiscountRate must be between 0 and 100');
  });

  it('throws Partner type not found when record missing', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce(null);
    await expect(partnerTypeService.updateType('missing', { name: 'New' }))
      .rejects.toThrow('Partner type not found');
    expect(mockPrisma.partnerType.update).not.toHaveBeenCalled();
  });

  it('updates when record exists', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce({ id: 'pt-1', name: 'Old' });
    await partnerTypeService.updateType('pt-1', { name: 'New' });
    expect(mockPrisma.partnerType.update).toHaveBeenCalledWith({ where: { id: 'pt-1' }, data: { name: 'New' } });
  });

  it('skips rate validation when maxDiscountRate is absent', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce({ id: 'pt-1', name: 'Old' });
    await partnerTypeService.updateType('pt-1', { name: 'Renamed' });
    expect(mockPrisma.partnerType.update).toHaveBeenCalled();
  });
});

// ─── deleteType ──────────────────────────────────────────────────────────────

describe('partnerTypeService.deleteType — guards', () => {
  it('throws when type does not exist', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce(null);
    await expect(partnerTypeService.deleteType('ghost')).rejects.toThrow('Partner type not found');
    expect(mockPrisma.partnerType.delete).not.toHaveBeenCalled();
  });

  it('blocks deletion when partners are assigned', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce({
      id: 'pt-1', name: 'Restaurants', _count: { partners: 3 },
    });
    await expect(partnerTypeService.deleteType('pt-1'))
      .rejects.toThrow(/Cannot delete.*Restaurants.*3 partner/);
    expect(mockPrisma.partnerType.delete).not.toHaveBeenCalled();
  });

  it('deletes when no partners are assigned', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce({
      id: 'pt-1', name: 'Empty', _count: { partners: 0 },
    });
    await partnerTypeService.deleteType('pt-1');
    expect(mockPrisma.partnerType.delete).toHaveBeenCalledWith({ where: { id: 'pt-1' } });
  });
});

// ─── setPlanAccess ────────────────────────────────────────────────────────────

describe('partnerTypeService.setPlanAccess — atomic replace', () => {
  it('throws when partner type does not exist', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce(null);
    await expect(partnerTypeService.setPlanAccess('ghost', [])).rejects.toThrow('Partner type not found');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes old rules and creates new ones inside a transaction', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce({ id: 'pt-1', name: 'Cafe' });
    const rules = [
      { plan: SubscriptionPlan.BASIC, canView: true, canRedeem: true },
      { plan: SubscriptionPlan.PREMIUM_WEEKLY, canView: true, canRedeem: true },
    ];
    await partnerTypeService.setPlanAccess('pt-1', rules);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const txOps = mockPrisma.$transaction.mock.calls[0][0];
    expect(Array.isArray(txOps)).toBe(true);
    expect(txOps.length).toBe(2);
  });

  it('passes the correct data shape to createMany', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce({ id: 'pt-2', name: 'Hotel' });
    const rules = [{ plan: SubscriptionPlan.BASIC, canView: false, canRedeem: true }];
    await partnerTypeService.setPlanAccess('pt-2', rules);

    expect(mockPrisma.planTypeAccess.createMany).toHaveBeenCalledWith({
      data: [{ partnerTypeId: 'pt-2', plan: SubscriptionPlan.BASIC, canView: false, canRedeem: true }],
    });
  });
});

// ─── getRedeemableTypeIdsForPlan ──────────────────────────────────────────────

describe('partnerTypeService.getRedeemableTypeIdsForPlan — null-plan fallback', () => {
  it('uses PREMIUM_WEEKLY as proxy when plan is null', async () => {
    mockPrisma.planTypeAccess.findMany.mockResolvedValueOnce([
      { partnerTypeId: 'pt-a' },
      { partnerTypeId: 'pt-b' },
    ]);
    const result = await partnerTypeService.getRedeemableTypeIdsForPlan(null);

    expect(mockPrisma.planTypeAccess.findMany).toHaveBeenCalledWith({
      where: { plan: SubscriptionPlan.PREMIUM_WEEKLY, canRedeem: true },
      select: { partnerTypeId: true },
    });
    expect(result).toEqual(['pt-a', 'pt-b']);
  });

  it('uses the supplied plan directly when non-null', async () => {
    mockPrisma.planTypeAccess.findMany.mockResolvedValueOnce([{ partnerTypeId: 'pt-c' }]);
    const result = await partnerTypeService.getRedeemableTypeIdsForPlan(SubscriptionPlan.BASIC);

    expect(mockPrisma.planTypeAccess.findMany).toHaveBeenCalledWith({
      where: { plan: SubscriptionPlan.BASIC, canRedeem: true },
      select: { partnerTypeId: true },
    });
    expect(result).toEqual(['pt-c']);
  });

  it('returns empty array when no matching access rows', async () => {
    mockPrisma.planTypeAccess.findMany.mockResolvedValueOnce([]);
    const result = await partnerTypeService.getRedeemableTypeIdsForPlan(SubscriptionPlan.PREMIUM_WEEKLY);
    expect(result).toEqual([]);
  });
});

// ─── getVisibleTypeIdsForPlan ─────────────────────────────────────────────────

describe('partnerTypeService.getVisibleTypeIdsForPlan — null shortcut', () => {
  it('returns null when all active types are visible (no filter needed)', async () => {
    // 2 active types, 2 visible rows → no filter
    mockPrisma.partnerType.findMany.mockResolvedValueOnce([{ id: 'pt-1' }, { id: 'pt-2' }]);
    mockPrisma.planTypeAccess.findMany.mockResolvedValueOnce([
      { partnerTypeId: 'pt-1' }, { partnerTypeId: 'pt-2' },
    ]);
    const result = await partnerTypeService.getVisibleTypeIdsForPlan(SubscriptionPlan.PREMIUM_WEEKLY);
    expect(result).toBeNull();
  });

  it('returns filtered IDs when only some types are visible', async () => {
    // 3 active types, only 1 visible for BASIC
    mockPrisma.partnerType.findMany.mockResolvedValueOnce([{ id: 'pt-1' }, { id: 'pt-2' }, { id: 'pt-3' }]);
    mockPrisma.planTypeAccess.findMany.mockResolvedValueOnce([{ partnerTypeId: 'pt-1' }]);
    const result = await partnerTypeService.getVisibleTypeIdsForPlan(SubscriptionPlan.BASIC);
    expect(result).toEqual(['pt-1']);
  });

  it('uses PREMIUM_WEEKLY when plan is null', async () => {
    mockPrisma.partnerType.findMany.mockResolvedValueOnce([{ id: 'pt-1' }]);
    mockPrisma.planTypeAccess.findMany.mockResolvedValueOnce([{ partnerTypeId: 'pt-1' }]);
    await partnerTypeService.getVisibleTypeIdsForPlan(null);

    expect(mockPrisma.planTypeAccess.findMany).toHaveBeenCalledWith({
      where: { plan: SubscriptionPlan.PREMIUM_WEEKLY, canView: true },
      select: { partnerTypeId: true },
    });
  });

  it('returns empty array when no types are visible and array < allTypes length', async () => {
    mockPrisma.partnerType.findMany.mockResolvedValueOnce([{ id: 'pt-1' }, { id: 'pt-2' }]);
    mockPrisma.planTypeAccess.findMany.mockResolvedValueOnce([]);
    const result = await partnerTypeService.getVisibleTypeIdsForPlan(SubscriptionPlan.BASIC);
    expect(result).toEqual([]);
  });
});

// ─── getMaxDiscountForType ────────────────────────────────────────────────────

describe('partnerTypeService.getMaxDiscountForType', () => {
  it('throws when type does not exist', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce(null);
    await expect(partnerTypeService.getMaxDiscountForType('ghost')).rejects.toThrow('Partner type not found');
  });

  it('returns the maxDiscountRate from the DB row', async () => {
    mockPrisma.partnerType.findUnique.mockResolvedValueOnce({ maxDiscountRate: 20 });
    const rate = await partnerTypeService.getMaxDiscountForType('pt-1');
    expect(rate).toBe(20);
    expect(mockPrisma.partnerType.findUnique).toHaveBeenCalledWith({
      where: { id: 'pt-1' },
      select: { maxDiscountRate: true },
    });
  });
});
