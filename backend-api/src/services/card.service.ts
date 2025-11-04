import { PrismaClient, CardType, CardStatus } from '@prisma/client';
import QRCode from 'qrcode';
import { logger } from '../utils/logger';
import { subscriptionService } from './subscription.service';

const prisma = new PrismaClient();

export class CardService {
  /**
   * Create card for user
   */
  async createCard(params: {
    userId: string;
    cardNumber?: string;
    cardType?: CardType;
  }) {
    const { userId, cardNumber, cardType = 'STANDARD' } = params;

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
    const tierOrder = ['STANDARD', 'PREMIUM', 'PLATINUM'];
    const currentIndex = tierOrder.indexOf(card.type);
    const newIndex = tierOrder.indexOf(newTier);

    if (newIndex <= currentIndex) {
      throw new Error('Can only upgrade to higher tier');
    }

    // Check subscription
    const subscription = await subscriptionService.getActiveSubscription(card.userId);

    if (newTier === 'PREMIUM' && subscription?.plan !== 'PREMIUM' && subscription?.plan !== 'PLATINUM') {
      throw new Error('Premium card requires Premium or Platinum subscription');
    }

    if (newTier === 'PLATINUM' && subscription?.plan !== 'PLATINUM') {
      throw new Error('Platinum card requires Platinum subscription');
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
   * Get card benefits based on tier
   */
  getCardBenefits(cardType: CardType) {
    const benefits = {
      STANDARD: {
        cashbackRate: 0.05,
        bonusCashback: 0,
        features: [
          '5% cashback on receipts',
          'Standard QR code',
          'Basic rewards',
        ],
      },
      PREMIUM: {
        cashbackRate: 0.07,
        bonusCashback: 0.02,
        features: [
          '7% cashback on receipts',
          '+2% bonus on sticker scans',
          'Premium QR code design',
          'Priority support',
          'Advanced analytics',
        ],
      },
      PLATINUM: {
        cashbackRate: 0.10,
        bonusCashback: 0.05,
        features: [
          '10% cashback on receipts',
          '+5% bonus on sticker scans',
          'Platinum QR code design',
          'VIP support',
          'Premium analytics',
          'Exclusive offers',
        ],
      },
    };

    return benefits[cardType];
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
      // TODO: Update this when wallet transactions are implemented
      Promise.resolve({ _sum: { amount: 0 } }),
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
