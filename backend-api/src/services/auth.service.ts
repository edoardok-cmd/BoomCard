import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { cardService } from './card.service';
import { walletService } from './wallet.service';
import { PartnerStatus, Prisma, UserStatus } from '@prisma/client';
import { emailService } from './email.service';
import { SECURITY_CONFIG } from '../config/security.config';

// Translate a Prisma P2002 (unique violation) on the (email, role) index
// into a user-facing 409. Two concurrent register POSTs with the same
// email+role can both pass the findFirst guard above and reach the
// create — the DB-level unique is the authoritative backstop.
function isEmailRoleUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  const target = err.meta?.target;
  const fields = Array.isArray(target)
    ? target
    : typeof target === 'string'
      ? [target]
      : [];
  return fields.includes('email') || fields.includes('User_email_role_key');
}

const TERMS_VERSION = process.env.TERMS_VERSION || '2026-02-24';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET environment variables are required');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface BusinessInfo {
  businessName: string;
  businessNameBg?: string;
  businessCategory: string;
  taxId?: string;
  website?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  acceptTerms?: boolean;
  accountType?: 'user' | 'partner';
  businessInfo?: BusinessInfo;
}

export interface LoginInput {
  email: string;
  password: string;
  clientType?: 'mobile' | 'web';
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
   * Register a new user or partner.
   *
   * Email is intentionally non-unique so a person may hold both a customer
   * (USER) and a partner (PARTNER) account on the same address. We DO,
   * however, refuse a second account with the same email AND the same role,
   * because login disambiguation would become a coin-flip.
   */
  static async register(input: RegisterInput) {
    const { email, password, firstName, lastName, phone, acceptTerms, accountType, businessInfo } = input;
    const isPartner = accountType === 'partner';

    if (isPartner && !businessInfo) {
      throw new AppError('businessInfo is required for partner accounts', 400);
    }

    const targetRole: 'USER' | 'PARTNER' = isPartner ? 'PARTNER' : 'USER';
    const normalizedEmail = email.toLowerCase();

    // Block same-email + same-role duplicates. Cross-role coexistence
    // (USER + PARTNER on the same email) is still allowed by design.
    const sameRoleExisting = await prisma.user.findFirst({
      where: { email: normalizedEmail, role: targetRole },
      select: { id: true },
    });
    if (sameRoleExisting) {
      throw new AppError(
        isPartner
          ? 'A partner account with this email already exists'
          : 'An account with this email already exists',
        409
      );
    }

    // Sanitize phone: convert empty string to null
    const sanitizedPhone = phone && phone.trim() !== '' ? phone.trim() : null;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Record consent timestamps when terms are accepted
    const consentData = acceptTerms
      ? {
          termsAcceptedAt: new Date(),
          privacyAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
        }
      : {};

    const userSelect = {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
    } as const;

    // Partner registration: create User (role=PARTNER) and Partner (status=PENDING)
    // atomically so we never end up with an orphan partner-role user.
    if (isPartner) {
      const info = businessInfo!;
      let user;
      try {
        user = await prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email: normalizedEmail,
              passwordHash,
              firstName: firstName?.trim() || undefined,
              lastName: lastName?.trim() || undefined,
              phone: sanitizedPhone,
              role: 'PARTNER',
              status: UserStatus.PENDING_VERIFICATION,
              ...consentData,
            },
            select: userSelect,
          });

          const primaryCategory = info.businessCategory.trim();
          await tx.partner.create({
            data: {
              userId: created.id,
              businessName: info.businessName.trim(),
              businessNameBg: info.businessNameBg?.trim() || null,
              category: primaryCategory,
              categories: [primaryCategory],
              status: PartnerStatus.PENDING,
              email: normalizedEmail,
              phone: sanitizedPhone,
              website: info.website?.trim() || null,
            },
          });

          return created;
        });
      } catch (err) {
        if (isEmailRoleUniqueViolation(err)) {
          throw new AppError('A partner account with this email already exists', 409);
        }
        throw err;
      }

      logger.info(`Partner application received: ${user.email} (user ${user.id})`);

      // Do NOT issue tokens. Partner accounts are PENDING_VERIFICATION and the
      // dashboard has no useful state for them yet (GET /partners/:id filters on
      // status=ACTIVE). Auto-logging them in sends them to a broken dashboard.
      // The frontend should redirect to a "pending review" screen.
      return { user, pendingVerification: true as const };
    }

    // Regular customer registration
    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          firstName: firstName?.trim() || undefined,
          lastName: lastName?.trim() || undefined,
          phone: sanitizedPhone,
          role: 'USER',
          status: UserStatus.PENDING_VERIFICATION,
          ...consentData,
        },
        select: userSelect,
      });
    } catch (err) {
      if (isEmailRoleUniqueViolation(err)) {
        throw new AppError('An account with this email already exists', 409);
      }
      throw err;
    }

    // Create loyalty account, card, and wallet for new customer
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

    // Send welcome email (non-fatal)
    emailService.sendWelcomeEmail(user.email, {
      customerName: user.firstName || user.email.split('@')[0],
      email: user.email,
      dashboardUrl: process.env.APP_URL || 'https://mobile.boomcard.bg',
    }).catch((err) => {
      logger.error('Failed to send welcome email:', err);
    });

    const tokens = await this.generateTokens(user);
    return { user, ...tokens };
  }

  /**
   * Login user
   */
  static async login(input: LoginInput) {
    const { email, password, clientType } = input;

    // Email is no longer unique — multiple accounts (user vs partner) may share
    // the same email. Disambiguate by matching the submitted password against
    // each candidate. Prefer the account whose role fits the requesting client.
    const candidates = await prisma.user.findMany({
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
      // Stable ordering so password-disambiguation picks the same row
      // across replicas/pods if more than one candidate matches.
      orderBy: { createdAt: 'asc' },
    });

    if (candidates.length === 0) {
      throw new AppError('Invalid email or password', 401);
    }

    const matches: typeof candidates = [];
    for (const candidate of candidates) {
      if (await bcrypt.compare(password, candidate.passwordHash)) {
        matches.push(candidate);
      }
    }

    if (matches.length === 0) {
      throw new AppError('Invalid email or password', 401);
    }

    // Prefer the account whose role matches the client surface:
    //   mobile → USER (customer app)
    //   web    → non-USER (partner/admin dashboard)
    const preferred = matches.find((m) =>
      clientType === 'mobile' ? m.role === 'USER' : m.role !== 'USER'
    );
    const user = preferred ?? matches[0];

    // Check if user is active
    if (user.status === 'SUSPENDED') {
      throw new AppError('Account has been suspended', 403);
    }

    // The mobile app is for customers (role=USER) only. Block partner/admin roles
    // so they can't sign in as a regular user. Return the same 401 as a bad
    // password so role/existence can't be enumerated from error shape.
    if (clientType === 'mobile' && user.role !== 'USER') {
      logger.warn(`Mobile login rejected for non-USER role: ${user.email} (role=${user.role})`);
      throw new AppError('Invalid email or password', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info(`User logged in: ${user.email}`);

    // Generate tokens (stamp clientType so refresh-time checks can enforce
    // mobile=USER-only even if role changes or a leaked token is replayed).
    const tokens = await this.generateTokens(user, clientType);

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

      // Mobile surface is customer-only. Reject refresh if this token was
      // issued to the mobile app but the bound user is not a customer (USER).
      // Covers: role changed after issuance, or leaked mobile token replayed.
      if (
        storedToken.clientType === 'mobile' &&
        storedToken.user.role !== 'USER'
      ) {
        logger.warn(
          `Mobile refresh rejected for non-USER role: ${storedToken.user.email} (role=${storedToken.user.role})`
        );
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
        throw new AppError('Invalid refresh token', 401);
      }

      // Generate new tokens, preserving the original clientType so the guard
      // above keeps applying across rotations.
      const clientType =
        storedToken.clientType === 'mobile' || storedToken.clientType === 'web'
          ? (storedToken.clientType as 'mobile' | 'web')
          : undefined;
      const tokens = await this.generateTokens(storedToken.user, clientType);

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
    // Sanitize: trim names, convert empty phone to null
    const sanitizedData: Record<string, any> = {};
    if (data.firstName !== undefined) sanitizedData.firstName = data.firstName?.trim() || undefined;
    if (data.lastName !== undefined) sanitizedData.lastName = data.lastName?.trim() || undefined;
    if (data.phone !== undefined) sanitizedData.phone = data.phone && data.phone.trim() !== '' ? data.phone.trim() : null;

    const user = await prisma.user.update({
      where: { id: userId },
      data: sanitizedData,
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
   * Update user avatar URL
   */
  static async updateAvatar(userId: string, avatarUrl: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
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
  }

  /**
   * Remove user avatar
   */
  static async removeAvatar(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { avatar: null },
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
   * Forgot password — generate OTP and send email
   */
  static async forgotPassword(email: string) {
    // Email is not unique — multiple accounts (user/partner) may share it.
    // Issue a separate OTP per matching account so reset links don't collide.
    // Always return success to prevent email enumeration.
    const users = await prisma.user.findMany({
      where: { email: email.toLowerCase() },
      orderBy: { createdAt: 'asc' },
      include: { partner: { select: { businessName: true } } },
    });

    const multipleAccounts = users.length > 1;

    for (const user of users) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
      const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
      const expires = new Date(Date.now() + SECURITY_CONFIG.SECURITY.OTP_EXPIRY_MS);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: hashedOtp,
          passwordResetExpires: expires,
        },
      });

      // When the same email backs more than one account, label each email so
      // the recipient can tell which OTP belongs to which account.
      const accountLabel = !multipleAccounts
        ? undefined
        : user.role === 'PARTNER'
          ? `Partner account${user.partner?.businessName ? ` — ${user.partner.businessName}` : ''}`
          : user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
            ? 'Admin account'
            : 'Customer account';

      const emailResult = await emailService.sendPasswordResetEmail({
        customerName: user.firstName || user.email,
        email: user.email,
        otp,
        accountLabel,
      });

      if (!emailResult.success) {
        logger.error(`Failed to send password reset email to ${user.email}`);
      } else {
        logger.info(`Password reset OTP sent to ${user.email} (account ${user.id})`);
      }
    }

    return { message: 'If an account with that email exists, a reset code has been sent.' };
  }

  /**
   * Reset password using OTP
   */
  static async resetPassword(email: string, otp: string, newPassword: string) {
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        passwordResetToken: hashedOtp,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new AppError('Invalid or expired reset code', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    logger.info(`Password reset successful for ${user.email}`);

    return { message: 'Password reset successful' };
  }

  /**
   * Generate JWT access and refresh tokens
   */
  private static async generateTokens(
    user: {
      id: string;
      email: string;
      role: string;
    },
    clientType?: 'mobile' | 'web'
  ): Promise<AuthTokens> {
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

    // Store refresh token in database with clientType so refresh-time checks
    // can enforce role/surface rules (mobile = USER only).
    await prisma.refreshToken.create({
      data: {
        token: refreshTokenString,
        userId: user.id,
        clientType: clientType ?? null,
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
