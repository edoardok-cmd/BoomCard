import { CardType, CardStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import QRCode from 'qrcode';
import { logger } from '../utils/logger';
import { subscriptionService } from './subscription.service';

export class CardService {
  /**
   * Create card for user
   */
  async createCard(params: {
    userId: string;
    cardNumber?: string;
    cardType?: CardType;
  }) {
    const { userId, cardNumber, cardType = 'LIGHT' } = params;

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
      include: {
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
    const tierOrder = ['LIGHT', 'BASIC', 'PREMIUM'];
    const currentIndex = tierOrder.indexOf(card.type);
    const newIndex = tierOrder.indexOf(newTier);

    if (newIndex <= currentIndex) {
      throw new Error('Can only upgrade to higher tier');
    }

    // Check subscription
    const subscription = await subscriptionService.getActiveSubscription(card.userId);

    if (newTier === 'BASIC' && subscription?.plan !== 'BASIC' && subscription?.plan !== 'PREMIUM') {
      throw new Error('Basic card requires Basic or Premium subscription');
    }

    if (newTier === 'PREMIUM' && subscription?.plan !== 'PREMIUM') {
      throw new Error('Premium card requires Premium subscription');
    }

    // Update card
    const updatedCard = await prisma.card.update({
      where: { id: cardId },
      data: {
        type: newTier,
      },
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
    });
  }

  /**
   * Get card benefits based on tier — reads from DB Plans table (source of truth).
   * CardType maps 1-to-1 to plan planCode (LIGHT / BASIC / PREMIUM).
   */
  async getCardBenefits(cardType: CardType) {
    const plan = await prisma.plan.findFirst({
      where: { planCode: cardType, isActive: true },
      select: { cashbackRate: true, stickerBonus: true, features: true, featuresBg: true },
    });

    const cashbackRate  = plan?.cashbackRate  ?? 0;
    const bonusCashback = plan?.stickerBonus  ?? 0;
    const features: string[]   = plan?.features   ? JSON.parse(plan.features)   : [];
    const featuresBg: string[] = plan?.featuresBg ? JSON.parse(plan.featuresBg) : [];

    return { cashbackRate, bonusCashback, features, featuresBg };
  }

  /**
   * Sync the user's card type to match their active subscription plan.
   *
   * Plan → CardType mapping:
   *   LIGHT   → LIGHT   (entry-level weekly plan)
   *   BASIC   → BASIC
   *   PREMIUM → PREMIUM
   *
   * Upgrades are always applied. Downgrades are only applied when
   * the target is LIGHT (subscription expired / cancelled) to prevent
   * accidental loss of benefits mid-period for tier swaps.
   *
   * Returns the (possibly updated) card, or null if the user has no card.
   */
  async syncCardTypeWithSubscription(userId: string, plan: string) {
    const planToCardType: Record<string, CardType> = {
      LIGHT:   CardType.LIGHT,
      BASIC:   CardType.BASIC,
      PREMIUM: CardType.PREMIUM,
    };

    const targetType = planToCardType[plan];
    if (!targetType) {
      logger.warn(`syncCardTypeWithSubscription: unknown plan "${plan}" for user ${userId}`);
      return null;
    }

    const card = await prisma.card.findFirst({ where: { userId } });
    if (!card) {
      logger.warn(`syncCardTypeWithSubscription: no card found for user ${userId}`);
      return null;
    }

    const tierOrder: CardType[] = [CardType.LIGHT, CardType.BASIC, CardType.PREMIUM];
    const currentIndex = tierOrder.indexOf(card.type);
    const targetIndex = tierOrder.indexOf(targetType);

    if (targetIndex === currentIndex) {
      return card;
    }

    // Allow downgrades only to LIGHT (subscription expired).
    // Block mid-tier downgrades (PREMIUM→BASIC) to prevent accidental benefit loss.
    if (targetIndex < currentIndex && targetType !== CardType.LIGHT) {
      return card;
    }

    const updatedCard = await prisma.card.update({
      where: { id: card.id },
      data: { type: targetType },
    });

    logger.info(`Synced card ${card.id} from ${card.type} → ${targetType} for user ${userId} (plan: ${plan})`);
    return updatedCard;
  }

  /**
   * Generate card number (format: BOOM-XXXX-XXXX-XXXX)
   */
  private generateCardNumber(): string {
    const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part3 = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BOOM-${part1}-${part2}-${part3}`;
  }

  /**
   * Validate card QR code
   */
  async validateCard(cardNumber: string) {
    const card = await prisma.card.findUnique({
      where: { cardNumber },
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
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
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
      totalCashbackEarned: totalCashback._sum.amount || 0,
      cardType: card.type,
      memberSince: card.createdAt,
    };
  }
}

export const cardService = new CardService();
