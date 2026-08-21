import { CardType, CardStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import QRCode from 'qrcode';
import { logger } from '../utils/logger';
import { subscriptionService } from './subscription.service';
import { safeParseJsonArray } from '../utils/json';

// Safe field allowlist for user-facing card serializers — excludes qrCode (spec §4.3/§11.3).
const CARD_USER_FIELDS = {
  id: true,
  userId: true,
  cardNumber: true,
  type: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

export class CardService {
  /**
   * Create card for user
   */
  async createCard(params: {
    userId: string;
    cardNumber?: string;
    cardType?: CardType;
  }) {
    const { userId, cardNumber, cardType = 'PREMIUM_WEEKLY' } = params;

    // Check if user already has a card
    const existingCard = await prisma.card.findFirst({
      where: { userId },
    });

    if (existingCard) {
      throw new Error('User already has a card');
    }

    // Generate card number if not provided
    const generatedCardNumber = cardNumber || this.generateCardNumber();

    // Generate QR code
    const qrCodeData = JSON.stringify({
      cardNumber: generatedCardNumber,
      userId,
      type: cardType,
      issuedAt: new Date().toISOString(),
    });

    const qrCodeUrl = await QRCode.toDataURL(qrCodeData, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
    });

    // Create card
    const card = await prisma.card.create({
      data: {
        userId,
        cardNumber: generatedCardNumber,
        type: cardType,
        status: 'ACTIVE',
        qrCode: qrCodeUrl,
      },
      select: CARD_USER_FIELDS,
    });

    logger.info(`Created ${cardType} card for user ${userId}`);

    return card;
  }

  /**
   * Get user's card
   */
  async getUserCard(userId: string) {
    return prisma.card.findFirst({
      where: { userId },
      select: {
        ...CARD_USER_FIELDS,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Upgrade card tier
   */
  async upgradeCardTier(cardId: string, newTier: CardType) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      throw new Error('Card not found');
    }

    // Check tier progression
    const tierOrder = ['PREMIUM_WEEKLY', 'BASIC', 'PREMIUM'];
    const currentIndex = tierOrder.indexOf(card.type);
    const newIndex = tierOrder.indexOf(newTier);

    if (newIndex <= currentIndex) {
      throw new Error('Can only upgrade to higher tier');
    }

    // Check subscription
    const subscription = await subscriptionService.getActiveSubscription(card.userId);

    if (newTier === 'BASIC' && subscription?.plan !== 'BASIC' && (subscription?.plan as string) !== 'PREMIUM' && (subscription?.plan as string) !== 'PREMIUM_MONTHLY') {
      throw new Error('Basic card requires Basic or Premium subscription');
    }

    if (newTier === 'PREMIUM' && (subscription?.plan as string) !== 'PREMIUM' && (subscription?.plan as string) !== 'PREMIUM_MONTHLY') {
      throw new Error('Premium card requires Premium subscription');
    }

    // Update card
    const updatedCard = await prisma.card.update({
      where: { id: cardId },
      data: {
        type: newTier,
      },
      select: CARD_USER_FIELDS,
    });

    logger.info(`Upgraded card ${cardId} from ${card.type} to ${newTier}`);

    return updatedCard;
  }

  /**
   * Deactivate card
   */
  async deactivateCard(cardId: string, reason?: string) {
    const card = await prisma.card.update({
      where: { id: cardId },
      data: {
        status: 'SUSPENDED',
      },
      select: CARD_USER_FIELDS,
    });

    logger.warn(`Deactivated card ${cardId}: ${reason}`);

    return card;
  }

  /**
   * Activate card
   */
  async activateCard(cardId: string) {
    return prisma.card.update({
      where: { id: cardId },
      data: {
        status: 'ACTIVE',
      },
      select: CARD_USER_FIELDS,
    });
  }

  /**
   * Get card benefits based on tier — reads from DB Plans table (source of truth).
   * CardType maps 1-to-1 to plan planCode (PREMIUM_WEEKLY / BASIC / PREMIUM).
   */
  async getCardBenefits(cardType: CardType) {
    const plan = await prisma.plan.findFirst({
      where: { planCode: cardType, isActive: true },
      select: { cashbackRate: true, stickerBonus: true, features: true, featuresBg: true },
    });

    const cashbackRate  = plan?.cashbackRate  ?? 0;
    const bonusCashback = plan?.stickerBonus  ?? 0;
    const features: string[]   = safeParseJsonArray(plan?.features) as string[];
    const featuresBg: string[] = safeParseJsonArray(plan?.featuresBg) as string[];

    return { cashbackRate, bonusCashback, features, featuresBg };
  }

  /**
   * Sync the user's card type to match their active subscription plan.
   *
   * Plan → CardType mapping:
   *   PREMIUM_WEEKLY → PREMIUM_WEEKLY  (entry-level weekly plan)
   *   BASIC          → BASIC
   *   PREMIUM        → PREMIUM
   *
   * Upgrades are always applied. Downgrades are only applied when
   * the target is PREMIUM_WEEKLY (subscription expired / cancelled) to prevent
   * accidental loss of benefits mid-period for tier swaps.
   *
   * Returns the (possibly updated) card, or null if the user has no card.
   */
  async syncCardTypeWithSubscription(userId: string, plan: string) {
    const planToCardType: Record<string, CardType> = {
      PREMIUM_WEEKLY: CardType.PREMIUM_WEEKLY,
      BASIC:          CardType.BASIC,
      PREMIUM:        CardType.PREMIUM,
    };

    const targetType = planToCardType[plan];
    if (!targetType) {
      logger.warn(`syncCardTypeWithSubscription: unknown plan "${plan}" for user ${userId}`);
      return null;
    }

    const card = await prisma.card.findFirst({ where: { userId }, select: CARD_USER_FIELDS });
    if (!card) {
      logger.warn(`syncCardTypeWithSubscription: no card found for user ${userId}`);
      return null;
    }

    const tierOrder: CardType[] = [CardType.PREMIUM_WEEKLY, CardType.BASIC, CardType.PREMIUM];
    const currentIndex = tierOrder.indexOf(card.type);
    const targetIndex = tierOrder.indexOf(targetType);

    if (targetIndex === currentIndex) {
      return card;
    }

    // Allow downgrades only to PREMIUM_WEEKLY (subscription expired).
    // Block mid-tier downgrades (PREMIUM→BASIC) to prevent accidental benefit loss.
    if (targetIndex < currentIndex && targetType !== CardType.PREMIUM_WEEKLY) {
      return card;
    }

    const qrCodeData = JSON.stringify({ cardNumber: card.cardNumber, type: targetType, issuedAt: new Date().toISOString() });
    const qrCodeUrl = await QRCode.toDataURL(qrCodeData, { errorCorrectionLevel: 'H', width: 300, margin: 2 });

    const updatedCard = await prisma.card.update({
      where: { id: card.id },
      data: { type: targetType, qrCode: qrCodeUrl },
      select: CARD_USER_FIELDS,
    });

    logger.info(`Synced card ${card.id} from ${card.type} → ${targetType} for user ${userId} (plan: ${plan})`);
    return updatedCard;
  }

  /**
   * Generate card number (format: BOOM-XXXX-XXXX-XXXX)
   */
  private generateCardNumber(): string {
    const cryptoMod = require('crypto');
    const randomPart = () => cryptoMod.randomBytes(4).readUInt32BE(0).toString(36).substring(0, 4).toUpperCase().padStart(4, '0');
    const part1 = randomPart();
    const part2 = randomPart();
    const part3 = randomPart();
    return `BOOM-${part1}-${part2}-${part3}`;
  }

  /**
   * Validate card QR code
   */
  async validateCard(cardNumber: string) {
    const card = await prisma.card.findUnique({
      where: { cardNumber },
      select: CARD_USER_FIELDS,
    });

    if (!card) {
      return { valid: false, reason: 'Card not found' };
    }

    if (card.status !== 'ACTIVE') {
      return { valid: false, reason: `Card is ${card.status}` };
    }

    return { valid: true, card };
  }

  /**
   * Get card statistics
   */
  async getCardStatistics(cardId: string) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      throw new Error('Card not found');
    }

    const [receiptsCount, stickersCount, totalCashback] = await Promise.all([
      prisma.receipt.count({
        where: {
          userId: card.userId,
          status: 'APPROVED',
        },
      }),
      prisma.stickerScan.count({
        where: {
          userId: card.userId,
          status: 'APPROVED',
        },
      }),
      // Grouped by currency (BC-QA-031-FOLLOWUP-1 impl-r4 F12): the cashback figure
      // on a card-stats response is money, so a legacy non-BGN row must be excluded
      // rather than folded in at face value. Cashback rows are written by
      // walletService.credit(), which omits `currency`, so for a clean database the
      // BGN subtotal is the only one present.
      prisma.walletTransaction.groupBy({
        by: ['currency'],
        _sum: { amount: true },
        _count: { _all: true },
        where: {
          wallet: { userId: card.userId },
          type: 'CASHBACK_CREDIT',
          status: 'COMPLETED',
        },
      }),
    ]);

    return {
      receiptsScanned: receiptsCount,
      stickersScanned: stickersCount,
      /**
       * PER-CURRENCY SUBTOTALS IN THE STORAGE UNIT — not a converted total, and
       * deliberately not named `totalCashbackEarned` (BC-QA-031-FOLLOWUP-1
       * task-r2 F14).
       *
       * This service used to return a `totalCashbackEarned` scalar in raw BGN
       * with a comment claiming "`bgnToEur` is applied by the response
       * boundary, as before". That was false: `cards.routes.ts` did
       * `res.json(stats)` and imported nothing from `utils/currency`, so the
       * BGN magnitude reached the wire and `MyCardScreen`/`DashboardScreen`
       * rendered it through `formatEurAmount` as `€100.00` where the truth was
       * `€51.13` — a 95.6% overstatement on a user-facing banner.
       *
       * Handing the ROUTE the subtotals rather than a scalar is the pattern
       * `src/utils/currency.ts` documents: services operate in the storage unit,
       * the route boundary converts. It also removes the trap that caused this —
       * there is no longer any field on this object whose name implies a
       * currency it is not denominated in.
       */
      cashbackByCurrency: totalCashback.map((g) => ({
        currency: g.currency,
        amount: g._sum.amount,
        count: g._count._all,
      })),
      cardType: card.type,
      memberSince: card.createdAt,
    };
  }
}

export const cardService = new CardService();
