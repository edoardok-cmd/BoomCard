/**
 * card.service.ts unit tests
 *
 * Focuses on business-logic guards that are non-trivial:
 *   - createCard duplicate prevention
 *   - upgradeCardTier tier progression + subscription checks
 *   - validateCard status gate
 *   - getCardStatistics not-found guard + aggregate shape
 *   - syncCardTypeWithSubscription downgrade rules
 */

// ─── External module mocks ────────────────────────────────────────────────────

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(async () => 'data:image/png;base64,mock'),
}));

jest.mock('../../src/services/subscription.service', () => ({
  subscriptionService: {
    getActiveSubscription: jest.fn(async () => null),
  },
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockPrisma: any = {
  card: {
    findFirst: jest.fn(async () => null),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async (args) => ({ id: 'card-1', status: 'ACTIVE', createdAt: new Date(), ...args.data })),
    update: jest.fn(async (args) => ({ id: args.where.id, ...args.data })),
  },
  receipt: { count: jest.fn(async () => 0) },
  stickerScan: { count: jest.fn(async () => 0) },
  walletTransaction: { aggregate: jest.fn(async () => ({ _sum: { amount: null } })) },
  plan: { findFirst: jest.fn(async () => null) },
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

import { CardType } from '@prisma/client';
import { cardService } from '../../src/services/card.service';
import { subscriptionService } from '../../src/services/subscription.service';

const mockSubService = subscriptionService as jest.Mocked<typeof subscriptionService>;

beforeEach(() => jest.clearAllMocks());

// ─── createCard ───────────────────────────────────────────────────────────────

describe('cardService.createCard — duplicate guard', () => {
  it('throws when user already has a card', async () => {
    mockPrisma.card.findFirst.mockResolvedValueOnce({ id: 'existing-card' });
    await expect(cardService.createCard({ userId: 'u-1' })).rejects.toThrow('User already has a card');
    expect(mockPrisma.card.create).not.toHaveBeenCalled();
  });

  it('creates card when no existing card found', async () => {
    mockPrisma.card.findFirst.mockResolvedValueOnce(null);
    const result = await cardService.createCard({ userId: 'u-1', cardNumber: 'BOOM-TEST-1234' });
    expect(mockPrisma.card.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u-1', cardNumber: 'BOOM-TEST-1234' }) }),
    );
    expect(result).toBeDefined();
  });

  it('defaults cardType to PREMIUM_WEEKLY', async () => {
    mockPrisma.card.findFirst.mockResolvedValueOnce(null);
    await cardService.createCard({ userId: 'u-2' });
    expect(mockPrisma.card.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'PREMIUM_WEEKLY' }) }),
    );
  });
});

// ─── upgradeCardTier ──────────────────────────────────────────────────────────

describe('cardService.upgradeCardTier — guards', () => {
  it('throws when card not found', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce(null);
    await expect(cardService.upgradeCardTier('missing', CardType.BASIC)).rejects.toThrow('Card not found');
  });

  it('throws when trying to downgrade tier', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce({ id: 'c-1', type: CardType.PREMIUM, userId: 'u-1' });
    await expect(cardService.upgradeCardTier('c-1', CardType.BASIC)).rejects.toThrow('Can only upgrade to higher tier');
  });

  it('throws when trying to stay at the same tier', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce({ id: 'c-1', type: CardType.PREMIUM, userId: 'u-1' });
    await expect(cardService.upgradeCardTier('c-1', CardType.PREMIUM)).rejects.toThrow('Can only upgrade to higher tier');
  });

  it('throws when upgrading to BASIC without active BASIC/PREMIUM subscription', async () => {
    mockPrisma.card.findUnique.mockResolvedValue({ id: 'c-1', type: CardType.PREMIUM_WEEKLY, userId: 'u-1' });
    mockSubService.getActiveSubscription.mockResolvedValue(null as any);
    await expect(cardService.upgradeCardTier('c-1', CardType.BASIC))
      .rejects.toThrow('Basic card requires Basic or Premium subscription');
  });

  it('throws when upgrading to PREMIUM without PREMIUM subscription', async () => {
    mockPrisma.card.findUnique.mockResolvedValue({ id: 'c-1', type: CardType.BASIC, userId: 'u-1' });
    mockSubService.getActiveSubscription.mockResolvedValue({ plan: 'BASIC' } as any);
    await expect(cardService.upgradeCardTier('c-1', CardType.PREMIUM))
      .rejects.toThrow('Premium card requires Premium subscription');
  });

  it('upgrades to BASIC when subscription plan is BASIC', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce({ id: 'c-1', type: CardType.PREMIUM_WEEKLY, userId: 'u-1' });
    mockSubService.getActiveSubscription.mockResolvedValueOnce({ plan: 'BASIC' } as any);
    await cardService.upgradeCardTier('c-1', CardType.BASIC);
    expect(mockPrisma.card.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: { type: CardType.BASIC } });
  });

  it('upgrades to PREMIUM when subscription plan is PREMIUM', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce({ id: 'c-1', type: CardType.BASIC, userId: 'u-1' });
    mockSubService.getActiveSubscription.mockResolvedValueOnce({ plan: 'PREMIUM' } as any);
    await cardService.upgradeCardTier('c-1', CardType.PREMIUM);
    expect(mockPrisma.card.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: { type: CardType.PREMIUM } });
  });
});

// ─── validateCard ─────────────────────────────────────────────────────────────

describe('cardService.validateCard', () => {
  it('returns { valid: false } when card number not found', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce(null);
    const result = await cardService.validateCard('BOOM-XXXX');
    expect(result).toEqual({ valid: false, reason: 'Card not found' });
  });

  it('returns { valid: false } when card is SUSPENDED', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce({ id: 'c-1', status: 'SUSPENDED' });
    const result = await cardService.validateCard('BOOM-TEST');
    expect(result).toMatchObject({ valid: false });
    expect((result as any).reason).toContain('SUSPENDED');
  });

  it('returns { valid: true, card } when card is ACTIVE', async () => {
    const card = { id: 'c-1', status: 'ACTIVE', cardNumber: 'BOOM-OK' };
    mockPrisma.card.findUnique.mockResolvedValueOnce(card);
    const result = await cardService.validateCard('BOOM-OK');
    expect(result).toEqual({ valid: true, card });
  });
});

// ─── getCardStatistics ────────────────────────────────────────────────────────

describe('cardService.getCardStatistics', () => {
  it('throws when card not found', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce(null);
    await expect(cardService.getCardStatistics('ghost')).rejects.toThrow('Card not found');
  });

  it('returns zeroed stats when no transactions exist', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce({ id: 'c-1', userId: 'u-1', type: CardType.BASIC, createdAt: new Date() });
    mockPrisma.receipt.count.mockResolvedValueOnce(0);
    mockPrisma.stickerScan.count.mockResolvedValueOnce(0);
    mockPrisma.walletTransaction.aggregate.mockResolvedValueOnce({ _sum: { amount: null } });

    const stats = await cardService.getCardStatistics('c-1');
    expect(stats.receiptsScanned).toBe(0);
    expect(stats.stickersScanned).toBe(0);
    expect(stats.totalCashbackEarned).toBe(0);
  });

  it('returns real counts and cashback sum', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce({ id: 'c-1', userId: 'u-1', type: CardType.PREMIUM, createdAt: new Date() });
    mockPrisma.receipt.count.mockResolvedValueOnce(7);
    mockPrisma.stickerScan.count.mockResolvedValueOnce(12);
    mockPrisma.walletTransaction.aggregate.mockResolvedValueOnce({ _sum: { amount: 43.50 } });

    const stats = await cardService.getCardStatistics('c-1');
    expect(stats.receiptsScanned).toBe(7);
    expect(stats.stickersScanned).toBe(12);
    expect(stats.totalCashbackEarned).toBe(43.50);
    expect(stats.cardType).toBe(CardType.PREMIUM);
  });

  it('queries walletTransaction with CASHBACK_CREDIT type and COMPLETED status', async () => {
    mockPrisma.card.findUnique.mockResolvedValueOnce({ id: 'c-1', userId: 'u-42', type: CardType.BASIC, createdAt: new Date() });
    mockPrisma.receipt.count.mockResolvedValueOnce(0);
    mockPrisma.stickerScan.count.mockResolvedValueOnce(0);
    mockPrisma.walletTransaction.aggregate.mockResolvedValueOnce({ _sum: { amount: null } });

    await cardService.getCardStatistics('c-1');

    expect(mockPrisma.walletTransaction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'CASHBACK_CREDIT',
          status: 'COMPLETED',
        }),
      }),
    );
  });
});

// ─── syncCardTypeWithSubscription ─────────────────────────────────────────────

describe('cardService.syncCardTypeWithSubscription — downgrade rules', () => {
  it('returns null for unknown plan', async () => {
    const result = await cardService.syncCardTypeWithSubscription('u-1', 'UNKNOWN_PLAN');
    expect(result).toBeNull();
    expect(mockPrisma.card.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when user has no card', async () => {
    mockPrisma.card.findFirst.mockResolvedValueOnce(null);
    const result = await cardService.syncCardTypeWithSubscription('u-1', 'BASIC');
    expect(result).toBeNull();
  });

  it('returns card unchanged when target tier equals current tier', async () => {
    const card = { id: 'c-1', type: CardType.BASIC, cardNumber: 'BOOM-X', userId: 'u-1' };
    mockPrisma.card.findFirst.mockResolvedValueOnce(card);
    const result = await cardService.syncCardTypeWithSubscription('u-1', 'BASIC');
    expect(result).toEqual(card);
    expect(mockPrisma.card.update).not.toHaveBeenCalled();
  });

  it('applies upgrade from PREMIUM_WEEKLY → BASIC', async () => {
    const card = { id: 'c-1', type: CardType.PREMIUM_WEEKLY, cardNumber: 'BOOM-X', userId: 'u-1' };
    mockPrisma.card.findFirst.mockResolvedValueOnce(card);
    mockPrisma.card.update.mockResolvedValueOnce({ ...card, type: CardType.BASIC });
    await cardService.syncCardTypeWithSubscription('u-1', 'BASIC');
    expect(mockPrisma.card.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: CardType.BASIC }) }),
    );
  });

  it('applies downgrade PREMIUM → PREMIUM_WEEKLY (subscription expired)', async () => {
    const card = { id: 'c-1', type: CardType.PREMIUM, cardNumber: 'BOOM-X', userId: 'u-1' };
    mockPrisma.card.findFirst.mockResolvedValueOnce(card);
    mockPrisma.card.update.mockResolvedValueOnce({ ...card, type: CardType.PREMIUM_WEEKLY });
    await cardService.syncCardTypeWithSubscription('u-1', 'PREMIUM_WEEKLY');
    expect(mockPrisma.card.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: CardType.PREMIUM_WEEKLY }) }),
    );
  });

  it('blocks mid-tier downgrade PREMIUM → BASIC (prevents accidental benefit loss)', async () => {
    const card = { id: 'c-1', type: CardType.PREMIUM, cardNumber: 'BOOM-X', userId: 'u-1' };
    mockPrisma.card.findFirst.mockResolvedValueOnce(card);
    const result = await cardService.syncCardTypeWithSubscription('u-1', 'BASIC');
    expect(result).toEqual(card);
    expect(mockPrisma.card.update).not.toHaveBeenCalled();
  });
});
