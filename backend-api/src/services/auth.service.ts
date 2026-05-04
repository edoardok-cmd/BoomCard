import bcrypt from 'bcrypt';
import crypto from 'crypto';
import * as otplib from 'otplib';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { cardService } from './card.service';
import { walletService } from './wallet.service';
import { PartnerStatus, Prisma, UserStatus } from '@prisma/client';
import { emailService } from './email.service';
import { notificationService } from './notification.service';
import { SECURITY_CONFIG } from '../config/security.config';
import { resolveUserPermissions } from './permission.service';
import { findInvalidCategoryEntry } from '../constants/categoryRegistry';

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
  /** @deprecated single-string subcategory; prefer businessSubcategories[] */
  businessSubcategory?: string;
  /** Slash-format subcategory ids, e.g. ["restaurants/curated", "restaurants/asian"]. */
  businessSubcategories?: string[];
  taxId?: string;
  website?: string;
  city?: string;
  address?: string;
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
  ip?: string;
  userAgent?: string;
  totpCode?: string;
}

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  // Effective permission keys — loaded from DB at token issuance for ADMIN
  // sub-roles so requirePermission() works without a per-request DB hit.
  // SUPER_ADMIN bypasses requirePermission unconditionally; USER/PARTNER never
  // call admin routes, so neither needs this field.
  permissions?: string[];
  // IDs of sibling accounts that share the same email+password. Present when
  // login matched more than one account on the chosen surface (web or mobile).
  // Used by /auth/switch-account to authorize switching without re-auth.
  ag?: string[];
  // Client surface the token was minted for. Stamped at login time and
  // preserved across refresh/switch so server-side surface filters
  // (mobile=USER-only) don't have to be re-derived from role.
  ct?: 'mobile' | 'web';
  // Impersonation claims — set only by AuthService.impersonate() when an
  // ADMIN/SUPER_ADMIN assumes a PARTNER session. `imp` flags the session,
  // `impBy` is the admin userId used by /auth/stop-impersonate to restore
  // the admin's own session without re-auth. `impAg` is the admin's own
  // `ag` at impersonation time, carried here so stop-impersonate can
  // rebuild the admin's sibling switcher without the admin's password.
  imp?: true;
  impBy?: string;
  impByRole?: string;
  impAg?: string[];
}

export interface ImpersonationClaims {
  impBy: string;
  impByRole: string;
  impAg?: string[];
}

export interface SwitchableAccount {
  id: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  businessName: string | null;
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
      let result: { user: typeof userSelect extends object ? any : never; partnerId: string };
      try {
        result = await prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              email: normalizedEmail,
              passwordHash,
              firstName: firstName?.trim() || undefined,
              lastName: lastName?.trim() || undefined,
              phone: sanitizedPhone,
              role: 'PARTNER',
              status: UserStatus.PENDING_VERIFICATION,
              emailVerificationToken: crypto.randomBytes(32).toString('hex'),
              emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
              ...consentData,
            },
            select: { ...userSelect, emailVerificationToken: true },
          });

          const primaryCategory = info.businessCategory.trim();
          const rawSubs: string[] = Array.isArray(info.businessSubcategories)
            ? info.businessSubcategories
            : info.businessSubcategory?.trim()
              ? [info.businessSubcategory.trim()]
              : [];
          const subcategoriesList = Array.from(
            new Set(rawSubs.map(s => s.trim()).filter(Boolean)),
          );
          const invalid = findInvalidCategoryEntry(primaryCategory, [
            primaryCategory,
            ...subcategoriesList,
          ]);
          if (invalid) {
            throw new AppError(`Invalid category value: ${invalid}`, 400);
          }
          const categoriesList = [primaryCategory, ...subcategoriesList];
          const partner = await tx.partner.create({
            data: {
              userId: created.id,
              businessName: info.businessName.trim(),
              businessNameBg: info.businessNameBg?.trim() || null,
              category: primaryCategory,
              categories: categoriesList,
              status: PartnerStatus.PENDING,
              email: normalizedEmail,
              phone: sanitizedPhone,
              website: info.website?.trim() || null,
              city: info.city?.trim() || null,
              address: info.address?.trim() || null,
            },
            select: { id: true },
          });

          return { user: created, partnerId: partner.id };
        });
      } catch (err) {
        if (isEmailRoleUniqueViolation(err)) {
          throw new AppError('A partner account with this email already exists', 409);
        }
        throw err;
      }

      const user = result.user;
      logger.info(`Partner application received: ${user.email} (user ${user.id}, partner ${result.partnerId})`);

      // Fire-and-forget emails — don't block the response on delivery
      const apiBase = process.env.API_URL || 'https://boomcard-api.fly.dev';
      const verificationUrl = `${apiBase}/api/auth/verify-email?token=${user.emailVerificationToken}`;
      emailService.sendPartnerEmailVerification(user.email, {
        firstName: user.firstName || user.email.split('@')[0],
        businessName: info.businessName.trim(),
        verificationUrl,
      }).catch((err) => logger.error('Failed to send partner email verification:', err));

      emailService.sendPartnerApplicationAdminNotification({
        applicantName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
        applicantEmail: user.email,
        businessName: info.businessName.trim(),
        businessCategory: info.businessCategory.trim(),
        partnerId: result.partnerId,
      }).catch((err) => logger.error('Failed to send admin application notification:', err));

      // Fan out to the unified admin-ops channel (in-app + email on critical) in
      // addition to the legacy email above. Both can coexist; the ops channel is
      // what admins filter in the dashboard bell.
      notificationService.notifyAdminPartnerSignup({
        partnerId: result.partnerId,
        businessName: info.businessName.trim(),
        email: user.email,
        category: info.businessCategory.trim(),
      }).catch((err) => logger.error('Failed to post admin-ops partner signup:', err));

      // Welcome notification for the partner themselves — they see it the first
      // time they log in after email verification. Safe to fire here: the user
      // row exists and the partner is in PENDING status awaiting admin review.
      notificationService.notifyPartnerWelcome({
        partnerUserId: user.id,
        businessName: info.businessName.trim(),
        isBulkImport: false,
      }).catch((err) => logger.error('Failed to send partner welcome:', err));

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

    // NOTE: Welcome email is intentionally NOT sent here.
    // It must be sent after payment, from the complete-profile route (POST /api/auth/complete-profile).
    // Sending it at registration would reach users who have not yet paid.

    const tokens = await this.generateTokens(user);
    return { user, ...tokens };
  }

  /**
   * Verify a partner's email address via the token sent on registration.
   * Sets emailVerified=true and clears the token.
   */
  static async verifyEmail(token: string) {
    const user = await prisma.user.findUnique({
      where: { emailVerificationToken: token },
      select: { id: true, email: true, emailVerificationExpiry: true, emailVerified: true },
    });

    if (!user) {
      throw new AppError('Invalid or expired verification link', 400);
    }
    if (user.emailVerified) {
      return { alreadyVerified: true };
    }
    if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
      throw new AppError('Verification link has expired. Please contact office@boomcard.bg', 400);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    logger.info(`Email verified for user ${user.email}`);
    return { alreadyVerified: false };
  }

  /**
   * Login user
   */
  static async login(input: LoginInput) {
    const { email, password, clientType, ip, userAgent, totpCode } = input;

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
        emailVerified: true,
        totpSecret: true,
        totpEnabledAt: true,
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
      prisma.loginHistory.createMany({
        data: candidates.map((c) => ({ userId: c.id, ip, userAgent, success: false, failReason: 'bad_password' })),
      }).catch((err) => logger.error('loginHistory.createMany failed', { err }));
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
      prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'suspended' } }).catch((err) => logger.error('loginHistory.create failed', { err }));
      throw new AppError('Account has been suspended', 403);
    }

    if (user.role === 'PARTNER') {
      if (!user.emailVerified) {
        prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'email_unverified' } }).catch((err) => logger.error('loginHistory.create failed', { err }));
        throw new AppError('Please verify your email address before logging in. Check your inbox for the verification link.', 403);
      }
      if (user.status === 'PENDING_VERIFICATION') {
        prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'pending_verification' } }).catch((err) => logger.error('loginHistory.create failed', { err }));
        throw new AppError('Your partner application is under review. You will be notified by email once approved.', 403);
      }
    }

    // The mobile app is for customers (role=USER) only. Block partner/admin roles
    // so they can't sign in as a regular user. Return the same 401 as a bad
    // password so role/existence can't be enumerated from error shape.
    if (clientType === 'mobile' && user.role !== 'USER') {
      logger.warn(`Mobile login rejected for non-USER role: ${user.email} (role=${user.role})`);
      prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'role_mismatch' } }).catch((err) => logger.error('loginHistory.create failed', { err }));
      throw new AppError('Invalid email or password', 401);
    }

    // TOTP enforcement — only admins/partners can have 2FA enabled, but the
    // check is intentionally unconditional on role so it works if we ever
    // extend 2FA to other roles without touching this path.
    if (user.totpEnabledAt) {
      if (!totpCode) {
        prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'totp_required' } }).catch((err) => logger.error('loginHistory.create failed', { err }));
        throw new AppError('Two-factor authentication required', 403);
      }
      const result = otplib.verifySync({ token: totpCode, secret: user.totpSecret! });
      if (!result.valid) {
        prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'totp_invalid' } }).catch((err) => logger.error('loginHistory.create failed', { err }));
        throw new AppError('Invalid two-factor authentication code', 401);
      }
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: true } }).catch((err) => logger.error('loginHistory.create failed', { err }));
    logger.info(`User logged in: ${user.email}`);

    // Compute the sibling-account group eligible for switching on this
    // surface. Web clients may switch between PARTNER/ADMIN/SUPER_ADMIN;
    // mobile is USER-only so there's no cross-surface switching.
    const eligible = matches.filter((m) =>
      clientType === 'mobile' ? m.role === 'USER' : m.role !== 'USER'
    );
    const accountGroup = eligible.length > 1 ? eligible.map((m) => m.id) : undefined;

    const tokens = await this.generateTokens(user, clientType, accountGroup, undefined, { ip, userAgent });

    // Expose sibling accounts so the client can render a switcher. Only
    // included when there's more than one — avoids an extra DB hit and a
    // useless UI entry on the common single-account login.
    //
    // Route through getSwitchableAccounts (not fetchSwitchableAccounts) so
    // the surface filter is applied in one authoritative place — keeps the
    // login response consistent with what /switchable-accounts and
    // /switch-account will return on the same session.
    let switchableAccounts: SwitchableAccount[] | undefined;
    if (accountGroup) {
      switchableAccounts = await this.getSwitchableAccounts(accountGroup, clientType);
    }

    // Remove password hash from response
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      ...tokens,
      ...(switchableAccounts ? { switchableAccounts } : {}),
    };
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string, meta?: { ip?: string; userAgent?: string }) {
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
      // above keeps applying across rotations. Also preserve accountGroup so
      // the switch-account capability survives refresh.
      const clientType =
        storedToken.clientType === 'mobile' || storedToken.clientType === 'web'
          ? (storedToken.clientType as 'mobile' | 'web')
          : undefined;
      const ag =
        storedToken.accountGroup && storedToken.accountGroup.length > 0
          ? storedToken.accountGroup
          : undefined;
      // Carry impersonation claims across the rotation. Without this, the
      // `imp/impBy/impByRole/impAg` fields are dropped on first refresh
      // (~15m in), which (a) severs the audit trail — further actions look
      // like a normal partner session — and (b) strands the admin in the
      // partner account because /auth/stop-impersonate requires `imp:true`.
      // The JWT signature has already been verified above, so decoded
      // claims are trustworthy.
      const impersonation: ImpersonationClaims | undefined =
        decoded.imp && decoded.impBy && decoded.impByRole
          ? {
              impBy: decoded.impBy,
              impByRole: decoded.impByRole,
              impAg: decoded.impAg,
            }
          : undefined;
      const tokens = await this.generateTokens(storedToken.user, clientType, ag, impersonation, meta);

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
        city: true,
        country: true,
        preferredLanguage: true,
        marketingConsent: true,
        marketingConsentEmail: true,
        marketingConsentPhone: true,
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
    const preferredLanguage = (data as any).preferredLanguage;
    if (preferredLanguage === 'bg' || preferredLanguage === 'en') sanitizedData.preferredLanguage = preferredLanguage;
    const city = (data as any).city;
    if (city !== undefined) sanitizedData.city = city && city.trim() !== '' ? city.trim() : null;
    const country = (data as any).country;
    if (country !== undefined) sanitizedData.country = country && country.trim() !== '' ? country.trim() : null;

    const user = await prisma.user.update({
      where: { id: userId },
      data: sanitizedData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        city: true,
        country: true,
        avatar: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    logger.info(`User profile updated: ${user.email}`);

    return user;
  }

  static async requestEmailChange(userId: string, newEmail: string) {
    const normalized = newEmail.toLowerCase().trim();

    // Check new email not already taken by a different active user
    const existing = await prisma.user.findFirst({ where: { email: normalized, deletedAt: null } });
    if (existing && existing.id !== userId) {
      throw new AppError('Email already in use', 409);
    }

    // Per-user cooldown: allow at most one request per 5 minutes.
    // pendingEmailExpiry is set to now+1h on each request, so if it is still
    // more than 55 min away the previous request was made less than 5 min ago.
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { pendingEmailExpiry: true },
    });
    const COOLDOWN_MS = 5 * 60 * 1000;
    const TOKEN_TTL_MS = 60 * 60 * 1000;
    if (
      current?.pendingEmailExpiry &&
      current.pendingEmailExpiry.getTime() > Date.now() + TOKEN_TTL_MS - COOLDOWN_MS
    ) {
      throw new AppError('Please wait 5 minutes before requesting another code', 429);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + TOKEN_TTL_MS);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { pendingEmail: normalized, pendingEmailToken: token, pendingEmailExpiry: expiry },
      select: { email: true, firstName: true, preferredLanguage: true },
    });

    const lang = user.preferredLanguage === 'en' ? 'en' : 'bg';
    const subject = lang === 'bg' ? 'Потвърди новия си имейл — BOOM Card' : 'Confirm your new email — BOOM Card';
    const bodyHtml = lang === 'bg'
      ? `<p>Здравей ${user.firstName ?? ''},</p><p>Поискано е смяна на имейл адреса за профила ти в BOOM Card.</p><p>Кодът за потвърждение е: <strong>${token.slice(0, 6).toUpperCase()}</strong></p><p>Кодът е валиден 1 час. Ако не си поискал(а) тази промяна, игнорирай имейла.</p>`
      : `<p>Hi ${user.firstName ?? ''},</p><p>An email address change was requested for your BOOM Card account.</p><p>Your confirmation code: <strong>${token.slice(0, 6).toUpperCase()}</strong></p><p>Valid for 1 hour. If you did not request this, ignore this email.</p>`;

    await emailService.sendEmail({ to: normalized, subject, html: bodyHtml, text: bodyHtml.replace(/<[^>]+>/g, '') });

    return { sent: true };
  }

  static async confirmEmailChange(userId: string, code: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, pendingEmail: true, pendingEmailToken: true, pendingEmailExpiry: true },
    });

    if (!user || !user.pendingEmailToken || !user.pendingEmail || !user.pendingEmailExpiry) {
      throw new AppError('No pending email change', 400);
    }
    if (user.pendingEmailExpiry < new Date()) {
      throw new AppError('Email change code expired', 400);
    }
    // Code matches first 6 chars of token (uppercased)
    if (user.pendingEmailToken.slice(0, 6).toUpperCase() !== code.trim().toUpperCase()) {
      throw new AppError('Invalid confirmation code', 400);
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new AppError('Incorrect password', 401);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { email: user.pendingEmail, pendingEmail: null, pendingEmailToken: null, pendingEmailExpiry: null },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, city: true, country: true, avatar: true, role: true, status: true },
    });

    logger.info(`Email changed for user ${userId} → ${updated.email}`);
    return updated;
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

    // Update password. Stamp passwordChangedAt so switchAccount can refuse
    // sibling-pivot attempts from access tokens issued before this rotation
    // (access tokens are not individually revocable — see switchAccount).
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash, passwordChangedAt: new Date() },
    });

    // Invalidate all refresh tokens for this user AND any sibling session
    // whose accountGroup claim still lists this user as a switch target —
    // otherwise a sibling session could switchAccount into this now-rotated
    // account without knowing the new password.
    await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { userId },
          { accountGroup: { has: userId } },
        ],
      },
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

    // Anonymize PII and soft-delete (DELETED + deletedAt for GDPR erasure audit trail).
    // Background jobs filter status !== 'ACTIVE' so DELETED users are excluded from all
    // automated emails and processing without requiring a hard delete.
    await prisma.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmail,
        firstName: null,
        lastName: null,
        phone: null,
        avatar: null,
        status: 'DELETED',
        deletedAt: new Date(),
        passwordHash: await bcrypt.hash(uuid(), 12), // Invalidate password
        // Stamp so any sibling session's access token (still valid for its
        // 15-min TTL) can't pivot into this now-deleted account.
        passwordChangedAt: new Date(),
        // Revoke all marketing consent on deletion so no communication path survives
        marketingConsent: false,
        marketingConsentEmail: false,
        marketingConsentPhone: false,
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

    // Invalidate all refresh tokens for this user AND any sibling session
    // whose accountGroup still lists this deleted user as a switch target.
    await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { userId },
          { accountGroup: { has: userId } },
        ],
      },
    });

    // Deactivate push tokens — user row is soft-deleted so the onDelete: Cascade
    // on PushToken won't fire; mark isActive=false so no further push notifications are sent.
    await prisma.pushToken.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    // Check wallet balance for user notification
    const walletBalance = user.wallet?.balance || 0;
    const cashbackBalance = user.loyaltyAccount?.cashbackBalance || 0;
    const hasWalletFunds = walletBalance > 0 || cashbackBalance > 0;

    const walletNotice = hasWalletFunds
      ? `<p><strong>Wallet funds:</strong> You have a remaining balance of ${(walletBalance / 100).toFixed(2)} EUR (top-up) and ${(cashbackBalance / 100).toFixed(2)} EUR (cashback). Top-up funds can be refunded within 30 days by contacting <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>. Cashback balances are non-refundable per our Terms.</p>
         <p><strong>Средства в портфейла:</strong> Имате остатъчен баланс от ${(walletBalance / 100).toFixed(2)} EUR (депозит) и ${(cashbackBalance / 100).toFixed(2)} EUR (кешбек). Депозитните средства могат да бъдат възстановени в рамките на 30 дни, като се свържете с <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>. Кешбек балансите не подлежат на възстановяване съгласно Общите условия.</p>`
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
          <p>If you did not request this, contact us immediately at <a href="mailto:office@boomcard.bg">office@boomcard.bg</a></p>
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
      response.walletNotice = `You have remaining wallet funds (${(walletBalance / 100).toFixed(2)} EUR top-up, ${(cashbackBalance / 100).toFixed(2)} EUR cashback). Contact office@boomcard.bg within 30 days to request a refund for top-up funds.`;
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
        marketingConsentEmail: (user as any).marketingConsentEmail || false,
        marketingConsentEmailAt: (user as any).marketingConsentEmailAt || null,
        marketingConsentPhone: (user as any).marketingConsentPhone || false,
        marketingConsentPhoneAt: (user as any).marketingConsentPhoneAt || null,
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
    type: 'terms' | 'privacy' | 'marketing' | 'email_marketing' | 'phone_marketing',
    version?: string,
    granted: boolean = true
  ) {
    const now = new Date();
    const data: Record<string, any> = {};

    if (type === 'terms') {
      data.termsAcceptedAt = now;
      if (version) data.termsVersion = version;
    } else if (type === 'privacy') {
      data.privacyAcceptedAt = now;
    } else if (type === 'email_marketing') {
      data.marketingConsentEmail = granted;
      data.marketingConsentEmailAt = now;
    } else if (type === 'phone_marketing') {
      data.marketingConsentPhone = granted;
      data.marketingConsentPhoneAt = now;
    } else if (type === 'marketing') {
      // Legacy: maps to both channels for one release cycle
      data.marketingConsent = granted;
      data.marketingConsentAt = now;
      data.marketingConsentEmail = granted;
      data.marketingConsentEmailAt = now;
      data.marketingConsentPhone = granted;
      data.marketingConsentPhoneAt = now;
    }

    // Re-derive the legacy combined `marketingConsent` flag whenever a
    // per-channel toggle changes, so any consumer still reading the legacy
    // field doesn't drift out of sync with the per-channel values.
    if (type === 'email_marketing' || type === 'phone_marketing') {
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { marketingConsentEmail: true, marketingConsentPhone: true },
      });
      const nextEmail = type === 'email_marketing' ? granted : !!current?.marketingConsentEmail;
      const nextPhone = type === 'phone_marketing' ? granted : !!current?.marketingConsentPhone;
      data.marketingConsent = nextEmail || nextPhone;
      data.marketingConsentAt = now;
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
        marketingConsentEmail: true,
        marketingConsentEmailAt: true,
        marketingConsentPhone: true,
        marketingConsentPhoneAt: true,
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
        language: (user as any).preferredLanguage === 'en' ? 'en' : 'bg',
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
        // Same reason as changePassword: close the sibling-pivot window
        // for access tokens minted before this reset.
        passwordChangedAt: new Date(),
      },
    });

    // Invalidate all refresh tokens for this user AND any sibling session
    // whose accountGroup claim still lists this user — see changePassword
    // for rationale.
    await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { userId: user.id },
          { accountGroup: { has: user.id } },
        ],
      },
    });

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
    clientType?: 'mobile' | 'web',
    accountGroup?: string[],
    impersonation?: ImpersonationClaims,
    meta?: { ip?: string; userAgent?: string }
  ): Promise<AuthTokens> {
    // Embed permission keys for ADMIN sub-roles so requirePermission() can
    // evaluate them from the JWT without a DB hit on every request.
    // SUPER_ADMIN bypasses requirePermission unconditionally — no query needed.
    // USER/PARTNER never call admin routes — no query needed.
    let permissions: string[] | undefined;
    if (user.role === 'ADMIN') {
      const perms = await resolveUserPermissions(user.id);
      if (perms.length > 0) {
        permissions = perms;
      } else {
        logger.warn(`[auth] ADMIN ${user.id} (${user.email}) has no assigned sub-roles — requirePermission() will deny all requests`);
      }
    }

    const payload: TokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(permissions ? { permissions } : {}),
      ...(accountGroup && accountGroup.length > 1 ? { ag: accountGroup } : {}),
      ...(clientType ? { ct: clientType } : {}),
      ...(impersonation
        ? {
            imp: true as const,
            impBy: impersonation.impBy,
            impByRole: impersonation.impByRole,
            ...(impersonation.impAg && impersonation.impAg.length > 1
              ? { impAg: impersonation.impAg }
              : {}),
          }
        : {}),
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

    // Store refresh token in database with clientType + accountGroup so
    // surface rules (mobile = USER only) and the switch-account capability
    // both survive rotation.
    await prisma.refreshToken.create({
      data: {
        token: refreshTokenString,
        userId: user.id,
        clientType: clientType ?? null,
        ip: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        accountGroup: accountGroup ?? [],
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenString,
      expiresIn: JWT_EXPIRES_IN,
    };
  }

  /**
   * Hydrate a list of account IDs into the UI-friendly shape used by the
   * account switcher. Caller is responsible for authorizing which IDs the
   * current session is allowed to see.
   */
  private static async fetchSwitchableAccounts(accountIds: string[]): Promise<SwitchableAccount[]> {
    if (accountIds.length === 0) return [];

    // Exclude SUSPENDED/INACTIVE: listing them in the switcher only lets the
    // user click a row that then 403s in switchAccount — hide them instead.
    const users = await prisma.user.findMany({
      where: {
        id: { in: accountIds },
        status: { notIn: ['SUSPENDED', 'INACTIVE'] },
      },
      select: {
        id: true,
        role: true,
        firstName: true,
        lastName: true,
        avatar: true,
        partner: { select: { businessName: true } },
      },
    });

    // Preserve caller-requested order so the primary account stays first
    // in the switcher.
    const byId = new Map(users.map((u) => [u.id, u]));
    return accountIds
      .map((id) => byId.get(id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u))
      .map((u) => ({
        id: u.id,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
        avatar: u.avatar,
        businessName: u.partner?.businessName ?? null,
      }));
  }

  /**
   * Return the list of sibling accounts the current session may switch to.
   *
   * The `accountGroup` claim was computed at login time from the bcrypt
   * match set, so every ID in it has already been authenticated with the
   * same password. We still refilter by surface (mobile = USER only) to
   * stop a leaked web token from discovering USER siblings.
   */
  static async getSwitchableAccounts(
    accountGroup: string[] | undefined,
    clientType: 'mobile' | 'web' | undefined
  ): Promise<SwitchableAccount[]> {
    if (!accountGroup || accountGroup.length < 2) return [];

    const accounts = await this.fetchSwitchableAccounts(accountGroup);
    return accounts.filter((a) =>
      clientType === 'mobile' ? a.role === 'USER' : a.role !== 'USER'
    );
  }

  /**
   * Switch the current session to one of the sibling accounts from the
   * current access token's `ag` claim. Issues a fresh token pair for the
   * target account (carrying the same group so switching back works), and
   * revokes the caller's refresh token so we don't accumulate orphans.
   */
  static async switchAccount(input: {
    currentUserId: string;
    accountGroup: string[] | undefined;
    clientType: 'mobile' | 'web' | undefined;
    targetAccountId: string;
    currentRefreshToken?: string;
    // iat (seconds since epoch) of the access token authorizing this call.
    // Used to detect password rotation on the target that happened after the
    // caller's token was minted — see the passwordChangedAt check below.
    tokenIssuedAt?: number;
  }) {
    const { currentUserId, accountGroup, clientType, targetAccountId, currentRefreshToken, tokenIssuedAt } = input;

    if (!accountGroup || accountGroup.length < 2) {
      throw new AppError('This session has no switchable accounts', 400);
    }
    if (!accountGroup.includes(targetAccountId)) {
      throw new AppError('Target account is not in this session', 403);
    }
    if (targetAccountId === currentUserId) {
      throw new AppError('Already signed in to this account', 400);
    }

    const [target, caller] = await Promise.all([
      prisma.user.findUnique({
        where: { id: targetAccountId },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          avatar: true,
          passwordChangedAt: true,
        },
      }),
      // Caller's own passwordChangedAt so we can also refuse pivots from a
      // stale access token minted before the CALLER's own password rotated.
      // Covers the incident-response flow where an admin rotates A's password
      // because A is suspected compromised: any leaked access token for A
      // must not be usable to hop to B within the 15-min TTL.
      prisma.user.findUnique({
        where: { id: currentUserId },
        select: { passwordChangedAt: true },
      }),
    ]);

    if (!target) {
      throw new AppError('Target account no longer exists', 404);
    }

    if (target.status === 'SUSPENDED' || target.status === 'INACTIVE') {
      throw new AppError('Target account is not available', 403);
    }

    // Close the sibling-pivot window. Access tokens are not individually
    // revocable; if EITHER the target or the caller rotated their password
    // after this access token was minted, the shared-password bond is stale
    // and we must force re-authentication. Checking both sides closes the
    // asymmetry where a leaked caller-token could still pivot even after
    // the caller's own credentials were rotated in response to a breach.
    // The 1-second grace is a clock-skew cushion (iat is seconds, Date.now
    // is ms; jwt.sign can emit iat floored from a ms clock drift ahead of
    // the subsequent DB write).
    if (typeof tokenIssuedAt === 'number') {
      const graceMs = (tokenIssuedAt + 1) * 1000;
      if (target.passwordChangedAt && target.passwordChangedAt.getTime() > graceMs) {
        throw new AppError(
          'Target account credentials have changed — please sign in again',
          401
        );
      }
      if (caller?.passwordChangedAt && caller.passwordChangedAt.getTime() > graceMs) {
        throw new AppError(
          'Your credentials have changed — please sign in again',
          401
        );
      }
    }

    // Enforce surface rules on the target too — a web-issued group should
    // only ever contain non-USER IDs, but guard anyway in case of drift.
    if (clientType === 'mobile' && target.role !== 'USER') {
      throw new AppError('Cannot switch to this account on mobile', 403);
    }
    if (clientType === 'web' && target.role === 'USER') {
      throw new AppError('Cannot switch to a customer account on web', 403);
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { lastLoginAt: new Date() },
    });

    // Rotate: revoke caller's refresh token (if provided) and issue a fresh
    // pair for the target. The new pair carries the same accountGroup, so
    // the user can switch back (or to another sibling) without re-auth.
    //
    // Scoped to userId so a body-supplied token string can only delete a
    // refresh token belonging to the authenticated caller — otherwise any
    // authed user could nuke an arbitrary token by passing its string.
    if (currentRefreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: currentRefreshToken, userId: currentUserId },
      });
    }

    const tokens = await this.generateTokens(target, clientType, accountGroup);

    const { passwordHash, ...targetWithoutPassword } = target;
    const switchableAccounts = await this.fetchSwitchableAccounts(accountGroup);
    const filtered = switchableAccounts.filter((a) =>
      clientType === 'mobile' ? a.role === 'USER' : a.role !== 'USER'
    );

    logger.info(
      `Account switched: user ${currentUserId} -> ${target.id} (${target.email}, role=${target.role})`
    );

    return {
      user: targetWithoutPassword,
      ...tokens,
      switchableAccounts: filtered,
    };
  }

  /**
   * Admin-initiated impersonation of a PARTNER account.
   *
   * Unlike switchAccount (which uses the login-time bcrypt-match `accountGroup`
   * to authorize sibling pivots), impersonation grants an ADMIN/SUPER_ADMIN a
   * PARTNER session based purely on the admin's role. The returned token is
   * stamped with `imp:true` + `impBy:<adminId>` so downstream code can tell
   * it's an impersonation and /auth/stop-impersonate knows who to restore.
   *
   * The impersonation token does NOT carry any accountGroup — a caller
   * holding the partner-token must not be able to pivot further via
   * /switch-account. Returning to admin is only possible via
   * stopImpersonate(), which requires `impBy` in the current token.
   */
  static async impersonate(input: {
    adminId: string;
    adminRole: string;
    adminAccountGroup?: string[];
    targetPartnerUserId: string;
    clientType: 'mobile' | 'web' | undefined;
    tokenIssuedAt?: number;
    // Admin's current refresh token. Revoked here so the pre-impersonation
    // admin session can't be silently replayed from a leaked refresh token
    // after the admin has already opened an impersonation session. Scoped
    // to (token, userId=adminId) so a body-supplied string can only delete
    // rows belonging to the authenticated caller — same invariant as
    // switchAccount.
    currentAdminRefreshToken?: string;
  }) {
    const { adminId, adminRole, adminAccountGroup, targetPartnerUserId, clientType, tokenIssuedAt, currentAdminRefreshToken } = input;

    if (clientType === 'mobile') {
      throw new AppError('Impersonation is not available on mobile', 403);
    }
    if (adminRole !== 'ADMIN' && adminRole !== 'SUPER_ADMIN') {
      throw new AppError('Not authorized', 403);
    }
    if (!targetPartnerUserId) {
      throw new AppError('targetPartnerUserId is required', 400);
    }
    if (targetPartnerUserId === adminId) {
      throw new AppError('Cannot impersonate yourself', 400);
    }

    const [target, admin] = await Promise.all([
      prisma.user.findUnique({
        where: { id: targetPartnerUserId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          avatar: true,
          passwordChangedAt: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: adminId },
        select: { id: true, role: true, status: true, passwordChangedAt: true },
      }),
    ]);

    if (!target) throw new AppError('Target partner not found', 404);
    if (target.role !== 'PARTNER') {
      throw new AppError('Target is not a partner', 400);
    }
    if (target.status !== 'ACTIVE') {
      throw new AppError('Target partner is not active', 403);
    }
    if (!admin) throw new AppError('Admin account not found', 404);
    if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') {
      throw new AppError('Not authorized', 403);
    }
    if (admin.status !== 'ACTIVE') {
      throw new AppError('Admin account is not active', 403);
    }

    // Mirror switchAccount's password-rotation guard — if the admin rotated
    // their own password after this access token was minted, force re-auth.
    // We do NOT guard on target.passwordChangedAt here: the admin never
    // entered the partner's password to begin with, so a rotation on the
    // partner side doesn't invalidate an admin action.
    if (typeof tokenIssuedAt === 'number') {
      const graceMs = (tokenIssuedAt + 1) * 1000;
      if (admin.passwordChangedAt && admin.passwordChangedAt.getTime() > graceMs) {
        throw new AppError(
          'Your credentials have changed — please sign in again',
          401
        );
      }
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { lastLoginAt: new Date() },
    });

    // Revoke the admin's pre-impersonation refresh token so a stolen copy of
    // it can't be replayed to silently resurrect the admin session alongside
    // the impersonation session. Stop-impersonate mints a fresh admin pair
    // on exit, so nothing else depends on this row.
    if (currentAdminRefreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: currentAdminRefreshToken, userId: admin.id },
      });
    }

    // No accountGroup passed — impersonation tokens are single-purpose; we
    // don't want a captured impersonation token to enable pivots to other
    // siblings via /switch-account. Stop-impersonate is the only way back.
    const tokens = await this.generateTokens(
      { id: target.id, email: target.email, role: target.role },
      'web',
      undefined,
      {
        impBy: admin.id,
        impByRole: admin.role,
        ...(adminAccountGroup && adminAccountGroup.length > 1 ? { impAg: adminAccountGroup } : {}),
      },
    );

    const startedAt = new Date().toISOString();
    logger.warn('Admin impersonation started', {
      adminId: admin.id,
      adminRole: admin.role,
      targetUserId: target.id,
      targetEmail: target.email,
      targetRole: target.role,
      startedAt,
    });

    const { passwordChangedAt: _pwc, ...targetUser } = target;
    return {
      user: targetUser,
      ...tokens,
      impersonation: { adminId: admin.id, adminRole: admin.role, startedAt },
    };
  }

  /**
   * End an impersonation session. The caller's access token must carry
   * `imp:true` + `impBy:<adminId>`; we use those claims to locate the admin,
   * verify they're still ADMIN/ACTIVE (defense against role demotion while
   * impersonating), and issue a fresh admin token pair.
   */
  static async stopImpersonate(input: {
    currentUserId: string;
    impersonatedBy: string | undefined;
    impersonatedByAg: string[] | undefined;
    isImpersonation: boolean;
    clientType: 'mobile' | 'web' | undefined;
    currentRefreshToken?: string;
  }) {
    const { currentUserId, impersonatedBy, impersonatedByAg, isImpersonation, clientType, currentRefreshToken } = input;

    if (!isImpersonation || !impersonatedBy) {
      throw new AppError('Not an impersonation session', 400);
    }

    const admin = await prisma.user.findUnique({
      where: { id: impersonatedBy },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatar: true,
      },
    });

    if (!admin) throw new AppError('Admin account no longer exists', 404);
    if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') {
      throw new AppError('Your admin privileges have changed — please sign in again', 401);
    }
    if (admin.status !== 'ACTIVE') {
      throw new AppError('Admin account is not active', 403);
    }

    // Revoke the current (impersonation) refresh token. Scope to the
    // impersonation userId so a body-supplied token string can only delete
    // a row belonging to the authenticated caller — same invariant as
    // switchAccount.
    if (currentRefreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: currentRefreshToken, userId: currentUserId },
      });
    }

    // Restore the admin's original accountGroup from the `impAg` claim we
    // stamped at impersonate() time. We can't reconstruct it from scratch
    // here without the admin's password (bcrypt matching happens at login),
    // so the impersonation token carries it forward.
    const accountGroup =
      impersonatedByAg && impersonatedByAg.length > 1 ? impersonatedByAg : undefined;

    const tokens = await this.generateTokens(
      { id: admin.id, email: admin.email, role: admin.role },
      clientType,
      accountGroup,
    );

    let switchableAccounts: SwitchableAccount[] | undefined;
    if (accountGroup) {
      switchableAccounts = await this.getSwitchableAccounts(accountGroup, clientType);
    }

    logger.warn('Admin impersonation ended', {
      adminId: admin.id,
      adminRole: admin.role,
      impersonatedUserId: currentUserId,
      endedAt: new Date().toISOString(),
    });

    return {
      user: admin,
      ...tokens,
      ...(switchableAccounts ? { switchableAccounts } : {}),
    };
  }

  static async createSession(user: { id: string; email: string; role: string }): Promise<AuthTokens> {
    return AuthService.generateTokens(user);
  }
}
