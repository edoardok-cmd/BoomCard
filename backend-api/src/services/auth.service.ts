import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { cardService } from './card.service';
import { walletService } from './wallet.service';
import { UserStatus } from '@prisma/client';
import { emailService } from './email.service';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  acceptTerms?: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  static async register(input: RegisterInput) {
    const { email, password, firstName, lastName, phone, acceptTerms } = input;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Record consent timestamps when terms are accepted
    const consentData = acceptTerms
      ? {
          termsAcceptedAt: new Date(),
          privacyAcceptedAt: new Date(),
          termsVersion: '2026-02-24',
        }
      : {};

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        phone,
        role: 'USER',
        status: UserStatus.PENDING_VERIFICATION,
        ...consentData,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    // Create loyalty account, card, and wallet for new user
    await Promise.all([
      prisma.loyaltyAccount.create({
        data: {
          userId: user.id,
          tier: 'BRONZE',
          points: 0,
          lifetimePoints: 0,
        },
      }),
      cardService.createCard({ userId: user.id, cardType: 'LIGHT' }),
      walletService.getOrCreateWallet(user.id),
    ]);

    logger.info(`Created user ${user.email} with card and wallet`);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      user,
      ...tokens,
    };
  }

  /**
   * Login user
   */
  static async login(input: LoginInput) {
    const { email, password } = input;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatar: true,
      },
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    // Check if user is active
    if (user.status === 'SUSPENDED') {
      throw new AppError('Account has been suspended', 403);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info(`User logged in: ${user.email}`);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Remove password hash from response
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      ...tokens,
    };
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as TokenPayload;

      // Check if refresh token exists in database
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              status: true,
            },
          },
        },
      });

      if (!storedToken) {
        throw new AppError('Invalid refresh token', 401);
      }

      // Check if token expired
      if (storedToken.expiresAt < new Date()) {
        // Delete expired token
        await prisma.refreshToken.delete({
          where: { id: storedToken.id },
        });
        throw new AppError('Refresh token expired', 401);
      }

      // Check if user is active
      if (storedToken.user.status === 'SUSPENDED') {
        throw new AppError('Account has been suspended', 403);
      }

      // Generate new tokens
      const tokens = await this.generateTokens(storedToken.user);

      // Delete old refresh token
      await prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      return tokens;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Invalid refresh token', 401);
    }
  }

  /**
   * Logout user (invalidate refresh token)
   */
  static async logout(refreshToken: string) {
    try {
      await prisma.refreshToken.delete({
        where: { token: refreshToken },
      });
      logger.info('User logged out');
    } catch (error) {
      // Token might not exist, which is fine
      logger.warn('Logout attempt with non-existent token');
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        loyaltyAccount: {
          select: {
            tier: true,
            points: true,
            lifetimePoints: true,
            cashbackBalance: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, data: Partial<RegisterInput>) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
      },
    });

    logger.info(`User profile updated: ${user.email}`);

    return user;
  }

  /**
   * Change password
   */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError('Current password is incorrect', 401);
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    logger.info(`Password changed for user: ${user.email}`);

    return { message: 'Password changed successfully' };
  }

  /**
   * Delete user account (GDPR Art. 17 - Right to Erasure)
   * Soft-delete: anonymize PII, set status INACTIVE, cancel subscriptions
   */
  static async deleteAccount(userId: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        firstName: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          select: { id: true, stripeSubscriptionId: true, payseraOrderId: true },
        },
        wallet: {
          select: { balance: true },
        },
        loyaltyAccount: {
          select: { cashbackBalance: true },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Password is incorrect', 401);
    }

    const anonymizedEmail = `deleted_${uuid()}@removed.local`;

    // Anonymize PII and set INACTIVE (30-day grace period before hard delete)
    await prisma.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmail,
        firstName: null,
        lastName: null,
        phone: null,
        avatar: null,
        status: 'INACTIVE',
        passwordHash: await bcrypt.hash(uuid(), 12), // Invalidate password
      },
    });

    // Cancel active subscriptions
    for (const sub of user.subscriptions) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'CANCELLED',
          canceledAt: new Date(),
          cancelAtPeriodEnd: true,
        },
      });
    }

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    // Check wallet balance for user notification
    const walletBalance = user.wallet?.balance || 0;
    const cashbackBalance = user.loyaltyAccount?.cashbackBalance || 0;
    const hasWalletFunds = walletBalance > 0 || cashbackBalance > 0;

    const walletNotice = hasWalletFunds
      ? `<p><strong>Wallet funds:</strong> You have a remaining balance of ${(walletBalance / 100).toFixed(2)} EUR (top-up) and ${(cashbackBalance / 100).toFixed(2)} EUR (cashback). Top-up funds can be refunded within 30 days by contacting <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>. Cashback balances are non-refundable per our Terms.</p>
         <p><strong>Средства в портфейла:</strong> Имате остатъчен баланс от ${(walletBalance / 100).toFixed(2)} EUR (депозит) и ${(cashbackBalance / 100).toFixed(2)} EUR (кешбек). Депозитните средства могат да бъдат възстановени в рамките на 30 дни, като се свържете с <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>. Кешбек балансите не подлежат на възстановяване съгласно Общите условия.</p>`
      : '';

    // Send confirmation email to original address
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: 'BoomCard Account Deleted / Акаунтът ви в BoomCard е изтрит',
        html: `
          <p>Your BoomCard account has been successfully deleted. Your personal data will be fully removed within 30 days.</p>
          <p>Вашият BoomCard акаунт беше успешно изтрит. Личните ви данни ще бъдат напълно премахнати в рамките на 30 дни.</p>
          ${walletNotice}
          <p>If you did not request this, contact us immediately at <a href="mailto:support@boomcard.bg">support@boomcard.bg</a></p>
        `,
      });
    } catch {
      logger.warn(`Could not send account deletion email to ${user.email}`);
    }

    logger.info(`Account deleted (anonymized) for user: ${user.email}`);

    const response: Record<string, any> = {
      message: 'Account deleted successfully. Data will be fully removed within 30 days.',
    };

    if (hasWalletFunds) {
      response.walletNotice = `You have remaining wallet funds (${(walletBalance / 100).toFixed(2)} EUR top-up, ${(cashbackBalance / 100).toFixed(2)} EUR cashback). Contact support@boomcard.bg within 30 days to request a refund for top-up funds.`;
    }

    return response;
  }

  /**
   * Export all user data (GDPR Art. 20 - Right to Data Portability)
   */
  static async exportUserData(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        loyaltyAccount: {
          include: {
            transactions: true,
            rewards: true,
            badges: { include: { badge: true } },
          },
        },
        transactions: true,
        receipts: true,
        subscriptions: true,
        wallet: { include: { transactions: true } },
        cards: true,
        stickerScans: true,
        reviews: true,
        bookings: true,
        favorites: true,
        notifications: true,
        pushTokens: { select: { platform: true, createdAt: true } },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Remove sensitive fields
    const { passwordHash, ...userData } = user;

    const exportData = {
      exportDate: new Date().toISOString(),
      exportVersion: '1.0',
      dataController: {
        name: 'BoomCard',
        email: 'privacy@boomcard.bg',
        address: 'Sofia, Bulgaria',
      },
      consentHistory: {
        termsAcceptedAt: (user as any).termsAcceptedAt || null,
        termsVersion: (user as any).termsVersion || null,
        privacyAcceptedAt: (user as any).privacyAcceptedAt || null,
        marketingConsent: (user as any).marketingConsent || false,
        marketingConsentAt: (user as any).marketingConsentAt || null,
      },
      userData,
    };

    logger.info(`Data export generated for user: ${user.email}`);

    return exportData;
  }

  /**
   * Record user consent (GDPR audit trail)
   */
  static async recordConsent(
    userId: string,
    type: 'terms' | 'privacy' | 'marketing',
    version?: string,
    granted: boolean = true
  ) {
    const data: Record<string, any> = {};

    if (type === 'terms') {
      data.termsAcceptedAt = new Date();
      if (version) data.termsVersion = version;
    } else if (type === 'privacy') {
      data.privacyAcceptedAt = new Date();
    } else if (type === 'marketing') {
      data.marketingConsent = granted;
      data.marketingConsentAt = new Date();
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        termsAcceptedAt: true,
        privacyAcceptedAt: true,
        termsVersion: true,
        marketingConsent: true,
        marketingConsentAt: true,
      },
    });

    logger.info(`Consent recorded: ${type} for user ${userId}`);

    return user;
  }

  /**
   * Generate JWT access and refresh tokens
   */
  private static async generateTokens(user: {
    id: string;
    email: string;
    role: string;
  }): Promise<AuthTokens> {
    const payload: TokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    // Generate access token (jti ensures uniqueness even within same second)
    const accessToken = jwt.sign({ ...payload, jti: uuid() }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    } as any);

    // Generate refresh token
    const refreshTokenString = jwt.sign({ ...payload, jti: uuid() }, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
    } as any);

    // Calculate expiration date for refresh token
    const expiresAt = new Date();
    const daysMatch = JWT_REFRESH_EXPIRES_IN.match(/(\d+)d/);
    if (daysMatch) {
      expiresAt.setDate(expiresAt.getDate() + parseInt(daysMatch[1]));
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7); // Default 7 days
    }

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        token: refreshTokenString,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenString,
      expiresIn: JWT_EXPIRES_IN,
    };
  }
}
