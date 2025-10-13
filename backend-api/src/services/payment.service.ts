import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

// Initialize Stripe
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16',
});

export interface CreatePaymentIntentInput {
  amount: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface CreateTransactionInput {
  userId: string;
  partnerId?: string;
  offerId?: string;
  bookingId?: string;
  type: string;
  amount: number;
  currency?: string;
  description?: string;
  metadata?: any;
}

export class PaymentService {
  /**
   * Create a Stripe Payment Intent
   */
  static async createPaymentIntent(
    userId: string,
    input: CreatePaymentIntentInput
  ) {
    const { amount, currency = 'BGN', description, metadata } = input;

    try {
      // Create payment intent in Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        description,
        metadata: {
          userId,
          ...metadata,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      logger.info(`Payment intent created: ${paymentIntent.id}`);

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        status: paymentIntent.status,
      };
    } catch (error: any) {
      logger.error(`Stripe error: ${error.message}`);
      throw new AppError(`Failed to create payment intent: ${error.message}`, 500);
    }
  }

  /**
   * Confirm a payment intent
   */
  static async confirmPaymentIntent(paymentIntentId: string, paymentMethodId: string) {
    try {
      const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });

      logger.info(`Payment intent confirmed: ${paymentIntent.id}`);

      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
      };
    } catch (error: any) {
      logger.error(`Stripe confirmation error: ${error.message}`);
      throw new AppError(`Failed to confirm payment: ${error.message}`, 500);
    }
  }

  /**
   * Create a transaction record in database
   */
  static async createTransaction(input: CreateTransactionInput) {
    const {
      userId,
      partnerId,
      offerId,
      bookingId,
      type,
      amount,
      currency = 'BGN',
      description,
      metadata,
    } = input;

    // Calculate loyalty points (1 BGN = 10 points)
    const loyaltyPoints = Math.floor(amount * 10);

    // Calculate cashback (2% for regular users, more for higher tiers)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        loyaltyAccount: true,
      },
    });

    let cashbackPercent = 0.02; // 2% default
    if (user?.loyaltyAccount) {
      switch (user.loyaltyAccount.tier) {
        case 'SILVER':
          cashbackPercent = 0.03;
          break;
        case 'GOLD':
          cashbackPercent = 0.05;
          break;
        case 'PLATINUM':
          cashbackPercent = 0.07;
          break;
        case 'DIAMOND':
          cashbackPercent = 0.10;
          break;
      }
    }

    const cashbackAmount = amount * cashbackPercent;

    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        partnerId,
        offerId,
        bookingId,
        type: type as any,
        status: 'PENDING',
        amount,
        currency,
        paymentMethod: 'CARD',
        description,
        metadata: JSON.stringify(metadata),
        loyaltyPoints,
        cashbackAmount,
        netAmount: amount - cashbackAmount,
      },
    });

    logger.info(`Transaction created: ${transaction.id}`);

    return transaction;
  }

  /**
   * Complete a transaction (after successful payment)
   */
  static async completeTransaction(
    transactionId: string,
    stripePaymentId: string
  ) {
    const transaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'COMPLETED',
        stripePaymentId,
        completedAt: new Date(),
      },
      include: {
        user: {
          include: {
            loyaltyAccount: true,
          },
        },
      },
    });

    // Award loyalty points
    if (transaction.loyaltyPoints && transaction.user.loyaltyAccount) {
      await prisma.loyaltyAccount.update({
        where: { id: transaction.user.loyaltyAccount.id },
        data: {
          points: {
            increment: transaction.loyaltyPoints,
          },
          lifetimePoints: {
            increment: transaction.loyaltyPoints,
          },
        },
      });

      // Create loyalty transaction record
      await prisma.loyaltyTransaction.create({
        data: {
          accountId: transaction.user.loyaltyAccount.id,
          type: 'EARNED',
          points: transaction.loyaltyPoints,
          description: `Earned ${transaction.loyaltyPoints} points from transaction`,
          metadata: JSON.stringify({ transactionId: transaction.id }),
        },
      });

      logger.info(
        `Awarded ${transaction.loyaltyPoints} points to user ${transaction.userId}`
      );
    }

    // Add cashback to balance
    if (transaction.cashbackAmount && transaction.user.loyaltyAccount) {
      await prisma.loyaltyAccount.update({
        where: { id: transaction.user.loyaltyAccount.id },
        data: {
          cashbackBalance: {
            increment: transaction.cashbackAmount,
          },
        },
      });

      logger.info(
        `Added ${transaction.cashbackAmount} BGN cashback to user ${transaction.userId}`
      );
    }

    logger.info(`Transaction completed: ${transaction.id}`);

    return transaction;
  }

  /**
   * Get user transactions
   */
  static async getUserTransactions(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      type?: string;
    } = {}
  ) {
    const { page = 1, limit = 20, status, type } = options;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status) where.status = status;
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          partner: {
            select: {
              id: true,
              businessName: true,
              logo: true,
            },
          },
          offer: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get transaction statistics
   */
  static async getTransactionStatistics(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [monthlyTotal, yearlyTotal, lifetimeTotal, transactionCount] =
      await Promise.all([
        prisma.transaction.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: startOfMonth },
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
            createdAt: { gte: startOfYear },
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            userId,
            status: 'COMPLETED',
          },
          _sum: { amount: true },
        }),
        prisma.transaction.count({
          where: { userId, status: 'COMPLETED' },
        }),
      ]);

    return {
      monthly: monthlyTotal._sum.amount || 0,
      yearly: yearlyTotal._sum.amount || 0,
      lifetime: lifetimeTotal._sum.amount || 0,
      transactionCount,
    };
  }

  /**
   * Create a refund
   */
  static async createRefund(
    transactionId: string,
    amount?: number,
    reason?: string
  ) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        user: {
          include: {
            loyaltyAccount: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    if (transaction.status !== 'COMPLETED') {
      throw new AppError('Only completed transactions can be refunded', 400);
    }

    if (!transaction.stripePaymentId) {
      throw new AppError('No Stripe payment ID found for this transaction', 400);
    }

    try {
      // Create refund in Stripe
      const refund = await stripe.refunds.create({
        payment_intent: transaction.paymentIntentId || '',
        amount: amount ? Math.round(amount * 100) : undefined,
        reason: reason as any,
      });

      // Update transaction
      const refundedAmount = amount || transaction.amount;
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: amount && amount < transaction.amount ? 'COMPLETED' : 'REFUNDED',
          refundedAmount,
          refundedAt: new Date(),
        },
      });

      // Deduct loyalty points
      if (transaction.loyaltyPoints && transaction.user.loyaltyAccount) {
        const pointsToDeduct = Math.floor(
          (transaction.loyaltyPoints * refundedAmount) / transaction.amount
        );

        await prisma.loyaltyAccount.update({
          where: { id: transaction.user.loyaltyAccount.id },
          data: {
            points: {
              decrement: pointsToDeduct,
            },
          },
        });

        await prisma.loyaltyTransaction.create({
          data: {
            accountId: transaction.user.loyaltyAccount.id,
            type: 'ADJUSTED',
            points: -pointsToDeduct,
            description: `Refund adjustment for transaction ${transactionId}`,
            metadata: JSON.stringify({ transactionId, refundId: refund.id }),
          },
        });
      }

      logger.info(`Refund created: ${refund.id} for transaction ${transactionId}`);

      return {
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
      };
    } catch (error: any) {
      logger.error(`Stripe refund error: ${error.message}`);
      throw new AppError(`Failed to create refund: ${error.message}`, 500);
    }
  }

  /**
   * Add payment method to customer
   */
  static async addPaymentMethod(userId: string, paymentMethodId: string) {
    try {
      // Get or create Stripe customer
      let user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Attach payment method to customer
      const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
        customer: user.email, // In production, use actual Stripe customer ID
      });

      logger.info(`Payment method added: ${paymentMethod.id}`);

      return {
        id: paymentMethod.id,
        type: paymentMethod.type,
        card: paymentMethod.card
          ? {
              brand: paymentMethod.card.brand,
              last4: paymentMethod.card.last4,
              expMonth: paymentMethod.card.exp_month,
              expYear: paymentMethod.card.exp_year,
            }
          : null,
      };
    } catch (error: any) {
      logger.error(`Stripe payment method error: ${error.message}`);
      throw new AppError(`Failed to add payment method: ${error.message}`, 500);
    }
  }
}
