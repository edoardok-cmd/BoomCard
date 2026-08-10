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
import { PartnerRequestStatus, PartnerStatus, Prisma, UserStatus } from '@prisma/client';
import { emailService } from './email.service';
import { notificationService } from './notification.service';
import { SECURITY_CONFIG } from '../config/security.config';
import { resolveUserPermissions } from './permission.service';
import { writeAudit } from '../middleware/audit.middleware';
import { findInvalidCategoryEntry } from '../constants/categoryRegistry';
import { parseVenueCountBucket } from './partnerVenueCountBucket.helper';
import { detach, detachImmediate } from '../utils/detach';
import { isCurrencyTransitionWindowOpen, toDualCurrency } from '../utils/currencyDisplay';

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

// Map the raw Partner status enum to the canonical TITLE-CASE values the
// frontend PartnerStatusRoute gate and spec §1.1 use. Kept consistent with
// partners.routes.toCanonicalPartnerStatus: ACTIVE → Active; ARCHIVED and
// REJECTED (closed/terminated states) → Archived; all other internal sub-states
// (PAUSED / SUSPENDED / PENDING / INACTIVE / …) → Inactive (read-only).
function mapPartnerCanonicalStatus(status: string): 'Active' | 'Inactive' | 'Archived' {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'ARCHIVED' || status === 'REJECTED') return 'Archived';
  return 'Inactive';
}

const TERMS_VERSION = process.env.TERMS_VERSION || '2026-02-24';

// Audit-pass [4.3]: per-email throttle for the public verification-resend
// endpoint. The route uses authRateLimiter which is per-IP — an attacker on
// a clean IP can still iterate addresses. This cap is in-process (single-node
// safe; for clustered deploys replace with Redis SETEX). 60s mirrors the
// usual user expectation of "I clicked resend; wait a minute before retrying".
// TODO(cluster): before enabling PM2 cluster mode or multiple Fly.io machines,
// replace verificationResendCache with a Redis SETEX/SETNX keyed by email.
// Without it, an attacker rotating workers can send N emails per 60s.
const VERIFICATION_RESEND_WINDOW_MS = 60_000;
const verificationResendCache = new Map<string, number>();
function verificationResendIsAllowed(email: string): boolean {
  const now = Date.now();
  const last = verificationResendCache.get(email);
  if (last == null) return true;
  if (now - last >= VERIFICATION_RESEND_WINDOW_MS) return true;
  return false;
}
function markVerificationResendAttempt(email: string): void {
  const now = Date.now();
  verificationResendCache.set(email, now);
  // Cheap GC: when the map grows past 10k entries, drop anything older than
  // the window. Bounded by visit frequency, so amortized O(1) per call.
  if (verificationResendCache.size > 10_000) {
    for (const [k, v] of verificationResendCache) {
      if (now - v >= VERIFICATION_RESEND_WINDOW_MS) verificationResendCache.delete(k);
    }
  }
}

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
  /**
   * BC-PARTNER-FU1 — primary venue geolocation collected on RegisterPartnerPage
   * (map pin / address geocode). REQUIRED for partner self-registration so the
   * venue created for the applicant is redeemable (offer redemption fails closed
   * without coords). Must be finite, lat∈[-90,90], lng∈[-180,180].
   */
  latitude?: number;
  longitude?: number;
  /** Spec §5.1 v1.1 — declared venue count bucket: "1" | "2-5" | "6-10" | "11+" */
  requestObjectCount?: string;
  /** Spec §2.3 — Ниво на участие: "basic" | "active" | "growth" (required for partners). */
  participationLevel?: string;
  /** Spec §2.3 — free-text additional notes (optional). */
  additionalInfo?: string;
  /**
   * Spec §2.3 — partner opt-in for marketing communications. Single general
   * consent collected on RegisterPartnerPage; persisted to User.marketingConsent
   * (+ marketingConsentAt). Optional/undefined defaults to no consent.
   */
  marketingConsent?: boolean;
}

// Spec §5.1 v1.1 — whitelist of allowed venue-count buckets. Must stay in sync
// with the public form (RegisterPartnerPage.tsx) and the admin filter dropdown.
export const ALLOWED_REQUEST_OBJECT_COUNTS = ['1', '2-5', '6-10', '11+'] as const;
export type RequestObjectCount = typeof ALLOWED_REQUEST_OBJECT_COUNTS[number];

export interface RegisterInput {
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  acceptTerms?: boolean;
  /** Spec §2.3 — separate required Privacy Policy consent for partner applications. */
  acceptPrivacy?: boolean;
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
  // Spec §1.5 — admin read-only flag. Stamped when admin account status is INACTIVE.
  // Inactive admins can log in but cannot approve, reassign, or modify records.
  // Enforced in requirePermission() by blocking any write-suffix permission key.
  aro?: true;
  // JWT issued-at timestamp (seconds since epoch). Used to validate token age.
  iat?: number;
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
    const { email, password, firstName, lastName, phone, acceptTerms, acceptPrivacy, accountType, businessInfo } = input;
    const isPartner = accountType === 'partner';

    if (isPartner && !businessInfo) {
      throw new AppError('businessInfo is required for partner accounts', 400);
    }

    // Spec §2.3 — partner applications carry two separate required consents
    // (Terms + Privacy Policy) and a required participation level. The
    // auth.validator layer already enforces these for the HTTP path; re-check
    // here so the service stays safe for any non-HTTP caller.
    if (isPartner) {
      if (acceptPrivacy !== true) {
        throw new AppError('You must accept the Privacy Policy to register as a partner', 400);
      }
      if (acceptTerms !== true) {
        throw new AppError('You must accept the Terms of Service to register as a partner', 400);
      }
      const level = businessInfo?.participationLevel;
      if (!level || !['basic', 'active', 'growth'].includes(level)) {
        throw new AppError('participationLevel must be one of: basic, active, growth', 400);
      }
    }

    // Spec §5.1 v1.1 — if requestObjectCount is provided, it must be one of the
    // four whitelisted bucket values. Empty/undefined is tolerated here so the
    // server stays backwards-compatible with older callers; the public form now
    // enforces presence client-side.
    if (
      isPartner &&
      businessInfo?.requestObjectCount !== undefined &&
      businessInfo.requestObjectCount !== null &&
      businessInfo.requestObjectCount !== '' &&
      !(ALLOWED_REQUEST_OBJECT_COUNTS as readonly string[]).includes(businessInfo.requestObjectCount)
    ) {
      throw new AppError(
        `requestObjectCount must be one of: ${ALLOWED_REQUEST_OBJECT_COUNTS.join(', ')}`,
        400,
      );
    }

    // BC-PARTNER-FU1 — partner self-registration creates the applicant's primary
    // venue below, and EVERY venue-creation path must enforce valid geolocation
    // (offer redemption fails closed without coords). Validate here (same rules
    // as POST /api/partners and POST /api/venues) so invalid/missing coords are
    // rejected with a clear 400 BEFORE any DB write — never silently discarded.
    let venueLat = 0;
    let venueLng = 0;
    if (isPartner) {
      const info = businessInfo!;
      const latNum = Number(info.latitude);
      const lngNum = Number(info.longitude);
      if (
        info.latitude == null || info.longitude == null ||
        !Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
        latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180
      ) {
        throw new AppError(
          'Venue geolocation is required: provide a valid latitude (-90..90) and longitude (-180..180).',
          400,
        );
      }
      // A venue also requires a non-empty address + city (Venue.address/city are
      // non-null). The applicant form collects both; enforce so we never attempt
      // a venue.create that the DB would reject.
      if (!info.address?.trim() || !info.city?.trim()) {
        throw new AppError('Business address and city are required to create your venue.', 400);
      }
      venueLat = latNum;
      venueLng = lngNum;
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
      // BC-QA-029 — stable `code` alongside the existing raw message so the
      // partner-dashboard's BC-QA-004 error-code map can localize this without
      // parsing English text. Message/status are unchanged; `code` is additive
      // (see AppError's `details` param, same convention as TWO_FACTOR_REQUIRED
      // etc. below in login()).
      throw new AppError(
        isPartner
          ? 'A partner account with this email already exists'
          : 'An account with this email already exists',
        409,
        { code: isPartner ? 'AUTH_PARTNER_ACCOUNT_EXISTS' : 'AUTH_EMAIL_ALREADY_REGISTERED' }
      );
    }

    // Sanitize phone: convert empty string to null
    const sanitizedPhone = phone && phone.trim() !== '' ? phone.trim() : null;

    // Partners never submit a password at application time — they set one later
    // via the activation link. Generate a random unusable hash so the column is
    // non-null; mustChangePassword=true ensures the activation route enforces a
    // real password before the partner can log in.
    const passwordHash = isPartner
      ? await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12)
      : await bcrypt.hash(password!, 12);

    // Record consent timestamps. Terms and Privacy are two INDEPENDENT consents
    // (spec §2.3): a partner may accept Privacy without accepting Terms in the
    // same request, so each timestamp is gated on its own flag rather than both
    // being driven by acceptTerms. termsVersion is stamped only alongside an
    // actual terms acceptance.
    const consentData: {
      termsAcceptedAt?: Date;
      privacyAcceptedAt?: Date;
      termsVersion?: string;
    } = {};
    if (acceptTerms) {
      consentData.termsAcceptedAt = new Date();
      consentData.termsVersion = TERMS_VERSION;
    }
    if (acceptPrivacy) {
      consentData.privacyAcceptedAt = new Date();
    }

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
              mustChangePassword: true,
              firstName: firstName?.trim() || undefined,
              lastName: lastName?.trim() || undefined,
              phone: sanitizedPhone,
              role: 'PARTNER',
              status: UserStatus.PENDING_VERIFICATION,
              emailVerificationToken: crypto.randomBytes(32).toString('hex'),
              emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
              ...consentData,
              // Spec §2.3 — persist the partner's marketing opt-in collected on
              // RegisterPartnerPage (businessInfo.marketingConsent). Was previously
              // dropped silently. Stamp marketingConsentAt only when opted in.
              ...(info.marketingConsent === true
                ? { marketingConsent: true, marketingConsentAt: new Date() }
                : {}),
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
              // Spec §2.4 — self-registered applications must enter the same
              // request-pipeline as admin-created ones (adminPartners.routes
              // initialises requestStatus=NEW for PENDING partners). Without this
              // the row has requestStatus=null and the 24h internal-SLA escalation
              // query (scheduler escalateOverduePartnerSla, filters `not: null`)
              // silently skips it. NEW is the canonical pipeline entry state.
              requestStatus: PartnerRequestStatus.NEW,
              email: normalizedEmail,
              phone: sanitizedPhone,
              website: info.website?.trim() || null,
              city: info.city?.trim() || null,
              address: info.address?.trim() || null,
              // Spec §5.1 v1.1 — declared number of venues at application time.
              requestObjectCount: parseVenueCountBucket(info.requestObjectCount),
              // Spec §2.3 — partner-application fields collected on RegisterPartnerPage.
              participationLevel: info.participationLevel?.trim() || null,
              acceptPrivacy: acceptPrivacy === true,
              additionalInfo: info.additionalInfo?.trim() || null,
            },
            select: { id: true },
          });

          // BC-PARTNER-FU1 — create the applicant's primary venue in the SAME
          // transaction with the validated coordinates collected on the register
          // form. Previously the FE-submitted latitude/longitude were silently
          // discarded and no venue existed for self-registered partners, leaving
          // offer redemption (which requires geo) impossible. Coords were already
          // validated above (present, finite, in-range) before any DB write.
          await tx.venue.create({
            data: {
              partnerId: partner.id,
              name: info.businessName.trim(),
              address: info.address!.trim(),
              city: info.city!.trim(),
              phone: sanitizedPhone,
              latitude: venueLat,
              longitude: venueLng,
            },
            select: { id: true },
          });

          return { user: created, partnerId: partner.id };
        });
      } catch (err) {
        if (isEmailRoleUniqueViolation(err)) {
          // BC-QA-029 — same duplicate-partner scenario as the pre-check above,
          // reached via the unique-constraint race instead. Same code.
          throw new AppError('A partner account with this email already exists', 409, { code: 'AUTH_PARTNER_ACCOUNT_EXISTS' });
        }
        throw err;
      }

      const user = result.user;
      logger.info(`Partner application received: ${user.email} (user ${user.id}, partner ${result.partnerId})`);

      // Fire-and-forget emails — don't block the response on delivery
      const frontendBase = process.env.FRONTEND_URL || 'https://boomcard.bg';
      const verificationUrl = `${frontendBase}/verify-email?token=${user.emailVerificationToken}`;
      detach(emailService.sendPartnerEmailVerification(user.email, {
        firstName: user.firstName || user.email.split('@')[0],
        businessName: info.businessName.trim(),
        verificationUrl,
      }), (err) => logger.error('Failed to send partner email verification:', err));

      // Spec §5.1 v1.1 — "до 2 работни дни" external promise email. Sent in
      // addition to the email-verification message above so the applicant
      // has the SLA copy as a standalone, on-record reply.
      detach(emailService.sendPartnerApplicationAck(user.email, {
        firstName: user.firstName || user.email.split('@')[0],
        businessName: info.businessName.trim(),
      }), (err) => logger.error('Failed to send partner application ack:', err));

      detach(emailService.sendPartnerApplicationAdminNotification({
        applicantName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
        applicantEmail: user.email,
        businessName: info.businessName.trim(),
        businessCategory: info.businessCategory.trim(),
        partnerId: result.partnerId,
      }), (err) => logger.error('Failed to send admin application notification:', err));

      // Fan out to the unified admin-ops channel (in-app + email on critical) in
      // addition to the legacy email above. Both can coexist; the ops channel is
      // what admins filter in the dashboard bell.
      detach(notificationService.notifyAdminPartnerSignup({
        partnerId: result.partnerId,
        businessName: info.businessName.trim(),
        email: user.email,
        category: info.businessCategory.trim(),
      }), (err) => logger.error('Failed to post admin-ops partner signup:', err));

      // Welcome notification for the partner themselves — they see it the first
      // time they log in after email verification. Safe to fire here: the user
      // row exists and the partner is in PENDING status awaiting admin review.
      detach(notificationService.notifyPartnerWelcome({
        partnerUserId: user.id,
        businessName: info.businessName.trim(),
        isBulkImport: false,
      }), (err) => logger.error('Failed to send partner welcome:', err));

      // Do NOT issue tokens. Partner accounts are PENDING_VERIFICATION and the
      // dashboard has no useful state for them yet (GET /partners/:id filters on
      // status=ACTIVE). Auto-logging them in sends them to a broken dashboard.
      // The frontend should redirect to a "pending review" screen.
      //
      // SECURITY: emailVerificationToken was selected internally only to build
      // the verification URL above. Strip it from the response so the raw token
      // never leaks to the API caller (it would let anyone verify the email
      // without access to the inbox).
      const { emailVerificationToken: _evt, ...safeUser } = user;
      return { user: safeUser, pendingVerification: true as const };
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
        // BC-QA-029 — same duplicate-email scenario as the pre-check above,
        // reached via the unique-constraint race instead. Same code.
        throw new AppError('An account with this email already exists', 409, { code: 'AUTH_EMAIL_ALREADY_REGISTERED' });
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
      cardService.createCard({ userId: user.id, cardType: 'PREMIUM_WEEKLY' }),
      walletService.getOrCreateWallet(user.id),
    ]);

    logger.info(`Created user ${user.email} with card and wallet`);

    // NOTE: Welcome email is intentionally NOT sent here.
    // It must be sent after payment, from the complete-profile route (POST /api/auth/complete-profile).
    // Sending it at registration would reach users who have not yet paid.

    // F-005 ENFORCEMENT (BC-USER-SPEC-GAP-001 F-005 / BC-USER-SPEC-FIX-005-CODE):
    // The spec §2 sequence (Account Creation → Plan Selection → Payment →
    // Active subscription → full operational access) is enforced WITHOUT changing
    // the token shape, so the deployed Expo mobile client (boomcard-mobile) keeps
    // working. Two layers enforce it:
    //   1. This register-issued JWT is INERT for operational use: the user is created
    //      with status=PENDING_VERIFICATION, and the authenticate middleware
    //      (auth.middleware.ts) 401s PENDING_VERIFICATION / PENDING_PAYMENT users on
    //      every authenticated request. The token only becomes usable once the
    //      payment-gated complete-profile flow flips the account to ACTIVE.
    //   2. The reusable requireActiveSubscription gate (auth.middleware.ts) blocks
    //      USER operational/write endpoints (QR session/scan/receipt-upload) until an
    //      Active (or Cancelled-within-paid-period) subscription exists, returning a
    //      typed 402 SUBSCRIPTION_REQUIRED that directs the user to complete plan
    //      selection + payment. Payout is independently subscription-gated in
    //      walletService.requestPayout (402 SUBSCRIPTION_INACTIVE).
    // The onboarding/payment endpoints (this register, plan selection, checkout,
    // complete-profile) remain reachable so the flow still works end to end.
    const tokens = await this.generateTokens(user);
    return { user, ...tokens };
  }

  /**
   * Public, unauthenticated email-verification request (spec §9.5).
   *
   * Self-service resend by email — needed because login is blocked until
   * `emailVerified=true`, so the user can't authenticate to call the
   * authenticated variant. Always returns success (no user-enumeration via
   * response shape); per-account rate limiting is enforced upstream.
   *
   * Email may map to multiple accounts (User/Partner can share an address);
   * we resend for every unverified match.
   */
  static async requestEmailVerificationByEmail(email: string): Promise<{ ok: true }> {
    const normalized = email.toLowerCase().trim();

    // Audit-pass [4.3]: per-email throttle on top of the per-IP route limiter.
    // Without this, an attacker iterates addresses from a clean IP. 60s window.
    if (!verificationResendIsAllowed(normalized)) {
      return { ok: true };
    }
    markVerificationResendAttempt(normalized);

    // Audit-pass [4.1]: fire-and-forget the mail work. Doing findMany +
    // per-user mint + sendEmail synchronously made response time scale with
    // "N real matches", a timing oracle for account enumeration.
    // detachImmediate runs this body on a real macrotask (identical to the
    // prior bare setImmediate) but registers the resulting promise so the test
    // harness can deterministically await it. The body's own try/catch swallows
    // every error, so the onError below is an unreachable safety net and the
    // production scheduling/behaviour is unchanged.
    detachImmediate(async () => {
      try {
        const matches = await prisma.user.findMany({
          where: { email: normalized },
          select: { id: true, email: true, firstName: true, emailVerified: true, role: true },
        });
        const unverified = matches.filter((m) => !m.emailVerified);
        for (const u of unverified) {
          try {
            await AuthService.issueAndSendVerification(u);
            // Spec §10.4 — log public email verification requests.
            await prisma.linkResendLog.create({
              data: { linkType: 'EMAIL_VERIFICATION', subjectId: u.id, actorId: null },
            }).catch((err: unknown) => logger.error(`[requestEmailVerificationByEmail] linkResendLog failed for ${u.id}:`, err));
            detach(writeAudit({
              actorUserId: null,
              action: 'auth.email-verification.request',
              objectType: 'user',
              objectId: u.id,
              after: { selfService: true, publicEndpoint: true },
            }), (err: unknown) => logger.error(`[requestEmailVerificationByEmail] writeAudit failed for ${u.id}:`, err));
          } catch (err) {
            logger.error(`[auth.requestEmailVerificationByEmail] failed for ${u.id}:`, err);
          }
        }
      } catch (err) {
        logger.error(`[auth.requestEmailVerificationByEmail] async work failed:`, err);
      }
    }, (err) => logger.error('[auth.requestEmailVerificationByEmail] detached body failed:', err));

    return { ok: true };
  }

  /**
   * Internal helper: mint a fresh 24h verification token for a user and email
   * the link. Centralised so authenticated + public resend paths share logic.
   *
   * Audit-pass [4.2]: branch on role so non-partner users receive a plain
   * BoomCard verification email rather than the partner-application copy
   * (which renders "BOOM Card partner network with <strong></strong>" when
   * businessName is empty, and promises a 24h application review that
   * doesn't apply to plain users).
   */
  private static async issueAndSendVerification(user: {
    id: string;
    email: string;
    firstName: string | null;
    role: string;
  }) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + SECURITY_CONFIG.SECURITY.EMAIL_VERIFICATION_EXPIRY);
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: token, emailVerificationExpiry: expiry },
    });

    const frontendBase = process.env.FRONTEND_URL || 'https://boomcard.bg';
    const verificationUrl = `${frontendBase}/verify-email?token=${token}`;
    const firstName = user.firstName || user.email.split('@')[0];

    if (user.role === 'PARTNER') {
      // Partner-application template. Fetch businessName best-effort so the
      // template doesn't render "<strong></strong>".
      let businessName = '';
      try {
        const partner = await prisma.partner.findUnique({
          where: { userId: user.id },
          select: { businessName: true },
        });
        if (partner?.businessName) businessName = partner.businessName;
      } catch (err) {
        logger.error(`[auth.issueAndSendVerification] businessName lookup failed for ${user.id}:`, err);
      }
      await emailService.sendPartnerEmailVerification(user.email, {
        firstName,
        businessName,
        verificationUrl,
      });
    } else {
      // USER / ADMIN / SUPER_ADMIN — plain user-facing template.
      await emailService.sendUserEmailVerification(user.email, {
        firstName,
        verificationUrl,
      });
    }
  }

  /**
   * Self-service resend of the email verification link (spec §9.5).
   * Issues a fresh 24h token; the new value overwrites the previous, which
   * implicitly invalidates the old link (single token column). Safe to call
   * for already-verified accounts — returns alreadyVerified=true.
   */
  static async resendEmailVerification(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, emailVerified: true, role: true },
    });
    if (!user) throw new AppError('User not found', 404);
    if (user.emailVerified) return { alreadyVerified: true };
    detach(this.issueAndSendVerification(user), (err) =>
      logger.error('Failed to resend email verification:', err));
    // Spec §10.4 — log self-service email verification resends to LinkResendLog and AuditLog.
    detach(prisma.linkResendLog.create({
      data: { linkType: 'EMAIL_VERIFICATION', subjectId: userId, actorId: userId },
    }), (err: unknown) => logger.error('[resendEmailVerification] linkResendLog.create failed', err));
    detach(writeAudit({
      actorUserId: userId,
      action: 'auth.email-verification.resend',
      objectType: 'user',
      objectId: userId,
      after: { selfService: true },
    }), (err: unknown) => logger.error('[resendEmailVerification] writeAudit failed', err));
    return { alreadyVerified: false };
  }

  /**
   * Verify a partner's email address via the token sent on registration.
   * Sets emailVerified=true and clears the token.
   */
  static async verifyEmail(token: string) {
    const user = await prisma.user.findUnique({
      where: { emailVerificationToken: token },
      select: {
        id: true,
        email: true,
        emailVerificationExpiry: true,
        emailVerified: true,
        role: true,
        firstName: true,
        lastName: true,
        avatar: true,
        mustChangePassword: true,
        totpEnabledAt: true,
        status: true,
      },
    });

    if (!user) {
      // BC-QA-029 — no user matches the registration-verification token (either
      // it was never valid or was already consumed/rotated).
      throw new AppError('Invalid or expired verification link', 400, { code: 'AUTH_REGISTRATION_TOKEN_INVALID' });
    }

    const blockedStatuses = ['SUSPENDED', 'ARCHIVED', 'DELETED'];
    if (blockedStatuses.includes(user.status as string)) {
      throw new AppError('Account is not eligible for activation', 403);
    }

    if (user.emailVerified) {
      return {
        alreadyVerified: true,
        userId: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        mustChangePassword: user.mustChangePassword,
        totpEnabled: user.totpEnabledAt !== null,
      };
    }
    if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
      // BC-QA-029 — token matched a real user but the registration-verification
      // window elapsed. Distinct from the "no matching user" branch above.
      throw new AppError('Verification link has expired. Please contact office@boomcard.bg', 400, { code: 'AUTH_REGISTRATION_TOKEN_EXPIRED' });
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
    return {
      alreadyVerified: false,
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      mustChangePassword: user.mustChangePassword,
      totpEnabled: user.totpEnabledAt !== null,
    };
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
        totpRecoveryCodes: true,
        mustChangePassword: true,
      },
      // Stable ordering so password-disambiguation picks the same row
      // across replicas/pods if more than one candidate matches.
      orderBy: { createdAt: 'asc' },
    });

    if (candidates.length === 0) {
      // BC-QA-029 — stable code for every "wrong email/password/role-mismatch"
      // branch below (login() intentionally returns the identical message +
      // code for all three so a caller can't distinguish "no such account" from
      // "wrong password" from "customer app, non-customer role" by error shape).
      throw new AppError('Invalid email or password', 401, { code: 'AUTH_INVALID_CREDENTIALS' });
    }

    const matches: typeof candidates = [];
    for (const candidate of candidates) {
      if (await bcrypt.compare(password, candidate.passwordHash)) {
        matches.push(candidate);
      }
    }

    if (matches.length === 0) {
      detach(prisma.loginHistory.createMany({
        data: candidates.map((c) => ({ userId: c.id, ip, userAgent, success: false, failReason: 'bad_password' })),
      }), (err) => logger.error('loginHistory.createMany failed', { err }));
      // BC-QA-029 — stable code for every "wrong email/password/role-mismatch"
      // branch below (login() intentionally returns the identical message +
      // code for all three so a caller can't distinguish "no such account" from
      // "wrong password" from "customer app, non-customer role" by error shape).
      throw new AppError('Invalid email or password', 401, { code: 'AUTH_INVALID_CREDENTIALS' });
    }

    // Prefer the account whose role matches the client surface:
    //   mobile → USER (customer app)
    //   web    → non-USER (partner/admin dashboard)
    const preferred = matches.find((m) =>
      clientType === 'mobile' ? m.role === 'USER' : m.role !== 'USER'
    );
    const user = preferred ?? matches[0];

    // Spec §1.5 — Admin account status enforcement:
    //   ACTIVE   → full login and operational rights.
    //   INACTIVE → login allowed, but operational rights limited to read-only.
    //              (JWT carries `adminReadOnly: true` claim; enforced in requirePermission).
    //   SUSPENDED/ARCHIVED → no login (maps to spec's Archived state for admins).
    //
    // NOTE: `INACTIVE` maps to spec §1.5 "Inactive admin" (login allowed, read-only).
    // `SUSPENDED` maps to spec §1.5 "Archived admin" (no login). `ARCHIVED` is the
    // dedicated enum value added in schema migration BC-SCHEMA-1.
    if (user.status === UserStatus.DELETED || user.status === UserStatus.SUSPENDED || user.status === UserStatus.ARCHIVED) {
      const failReason = user.status === UserStatus.DELETED ? 'deleted' : user.status === UserStatus.ARCHIVED ? 'archived' : 'suspended';
      const message = user.status === UserStatus.DELETED ? 'This account has been deleted' : user.status === UserStatus.ARCHIVED ? 'Account has been archived' : 'Account has been suspended';
      const code = user.status === UserStatus.DELETED ? 'ACCOUNT_DELETED' : user.status === UserStatus.ARCHIVED ? 'ACCOUNT_ARCHIVED' : 'ACCOUNT_SUSPENDED';
      detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason } }), (err) => logger.error('loginHistory.create failed', { err }));
      throw new AppError(message, 403, { code });
    }

    // Set by the PARTNER block below when status is SUSPENDED/PAUSED; included
    // in the login response so the frontend can show a warning banner.
    let partnerRestriction: 'SUSPENDED' | null = null;

    // Canonical partner status (Active|Inactive|Archived) for the login response.
    // /auth/me exposes this via getUserById; surfacing it here too means the FE
    // PartnerStatusRoute gate has a defined status immediately after login instead
    // of undefined until the next /auth/me. Same mapping as getUserById.
    let partnerAccountStatus: 'Active' | 'Inactive' | 'Archived' | undefined;

    if (user.role === 'PARTNER') {
      if (!user.emailVerified) {
        detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'email_unverified' } }), (err) => logger.error('loginHistory.create failed', { err }));
        throw new AppError('Please verify your email address before logging in. Check your inbox for the verification link.', 403, { code: 'EMAIL_UNVERIFIED' });
      }
      if (user.status === 'PENDING_VERIFICATION') {
        detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'pending_verification' } }), (err) => logger.error('loginHistory.create failed', { err }));
        throw new AppError('Your partner application is under review. You will be notified by email once approved.', 403, { code: 'PARTNER_PENDING_REVIEW' });
      }

      // Spec §5.3 v1.1 — Partner status matrix gates login.
      //
      //   ACTIVE    + verifiedAt → full login
      //   INACTIVE  + verifiedAt → login permitted (read-only enforced downstream)
      //   SUSPENDED/PAUSED + verifiedAt → login permitted with restriction flag
      //                                   (read-only enforced downstream;
      //                                    transaction-view + support retained per spec)
      //   ACTIVE/INACTIVE/SUSPENDED + verifiedAt=null → block: awaiting activation
      //   ARCHIVED                     → block: account archived (no operational access)
      //   PENDING                      → block: pipeline not finished
      //   REJECTED                     → block: rejected
      //
      // verifiedAt-null block runs FIRST so a suspended-before-activation partner
      // sees "check your email" (the only path forward). Partners reach ARCHIVED
      // only through /partner-status which requires prior ACTIVE status, so the
      // "archived without ever activating" cohort is empirically empty.
      const partner = await prisma.partner.findUnique({
        where: { userId: user.id },
        select: { id: true, status: true, verifiedAt: true },
      });
      // Compute canonical status for the login payload. Statuses that throw below
      // (ARCHIVED/REJECTED/awaiting-activation) never reach the return, so this is
      // only meaningfully read for ACTIVE / INACTIVE / SUSPENDED / PAUSED partners.
      if (partner) {
        partnerAccountStatus = mapPartnerCanonicalStatus(partner.status);
      }
      // Guard: a User with role=PARTNER must have a matching Partner row.
      // If the row is missing (partial registration failure, migration artifact,
      // manual DB edit) every subsequent optional-chaining guard silently no-ops
      // and login would proceed for an unvalidated account. Block it explicitly.
      if (!partner) {
        detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'partner_not_found' } }), (err) => logger.error('loginHistory.create failed', { err }));
        throw new AppError('Partner account configuration is incomplete. Please contact support.', 403, { code: 'PARTNER_NOT_FOUND' });
      }
      // Block login for any partner who has never activated (regardless of status).
      // ARCHIVED and REJECTED are excluded from the verifiedAt-null path because
      // they have explicit blocks below, but in practice verifiedAt is always null
      // for pre-activation records of those statuses too.
      const BLOCKED_WITHOUT_VERIFIED_AT = new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PAUSED', 'PENDING']);
      if (partner && !partner.verifiedAt && BLOCKED_WITHOUT_VERIFIED_AT.has(partner.status)) {
        // Check if an unconsumed activation link exists for this partner.
        // This differentiates between "never issued" and "issued but not yet consumed".
        const unconsumedLink = await prisma.activationLink.findFirst({
          where: {
            partnerId: partner.id,
            consumedAt: null,
            invalidatedAt: null,
          },
        });

        detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'awaiting_activation' } }), (err) => logger.error('loginHistory.create failed', { err }));

        const errorMessage = unconsumedLink
          ? 'Активационния линк е изпратен до вашия имейл. Моля проверете спама или го потърсете отново.'
          : 'Вашият партньорски акаунт очаква активиране. Моля проверете имейла си за активационен линк.';
        throw new AppError(errorMessage, 403, { code: 'PARTNER_AWAITING_ACTIVATION' });
      }
      if (partner?.status === 'ARCHIVED') {
        detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'partner_archived' } }), (err) => logger.error('loginHistory.create failed', { err }));
        throw new AppError('Вашият партньорски акаунт е архивиран и достъпът е прекратен.', 403, { code: 'PARTNER_ARCHIVED' });
      }
      if (partner?.status === 'REJECTED') {
        detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'partner_rejected' } }), (err) => logger.error('loginHistory.create failed', { err }));
        throw new AppError('Вашата кандидатура за партньорство е отказана.', 403, { code: 'PARTNER_REJECTED' });
      }
      // SUSPENDED/PAUSED with verifiedAt set: login allowed with restriction.
      // The read-only gate in partnerStatus.middleware blocks write ops;
      // support-ticket routes intentionally do not mount that middleware so the
      // partner retains transaction-view and support access per §5.3 matrix.
      if (partner?.status === 'SUSPENDED' || partner?.status === 'PAUSED') {
        partnerRestriction = 'SUSPENDED'; // signals limited access to the client
        // fall through to token issuance — restriction flag attached at return
      }
      // INACTIVE / ACTIVE with verifiedAt set: login permitted (read-only
      // operational mode for INACTIVE per spec). The read-only enforcement
      // happens downstream — partner can view transactions but cannot
      // generate new QR activity / new transactions.
    }

    // The mobile app is for customers (role=USER) only. Block partner/admin roles
    // so they can't sign in as a regular user. Return the same 401 as a bad
    // password so role/existence can't be enumerated from error shape.
    if (clientType === 'mobile' && user.role !== 'USER') {
      logger.warn(`Mobile login rejected for non-USER role: ${user.email} (role=${user.role})`);
      detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'role_mismatch' } }), (err) => logger.error('loginHistory.create failed', { err }));
      // BC-QA-029 — stable code for every "wrong email/password/role-mismatch"
      // branch below (login() intentionally returns the identical message +
      // code for all three so a caller can't distinguish "no such account" from
      // "wrong password" from "customer app, non-customer role" by error shape).
      throw new AppError('Invalid email or password', 401, { code: 'AUTH_INVALID_CREDENTIALS' });
    }

    // TOTP enforcement — only admins/partners can have 2FA enabled, but the
    // check is intentionally unconditional on role so it works if we ever
    // extend 2FA to other roles without touching this path.
    let recoveryCodeLogin = false;
    if (user.totpEnabledAt) {
      if (!totpCode) {
        detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'totp_required' } }), (err) => logger.error('loginHistory.create failed', { err }));
        // 403 (not 401) is intentional here: the password was already verified so
        // the user's identity is partially established. 403 signals "you are who you
        // say you are, but you must satisfy an additional account-security requirement
        // (2FA) before access is granted" — distinct from 401 which means "we don't
        // know who you are yet." The `code: 'TWO_FACTOR_REQUIRED'` extra field lets
        // the client detect this specific case and show a TOTP-entry step rather than
        // a generic "wrong credentials" message.
        throw new AppError('Two-factor authentication required', 403, { code: 'TWO_FACTOR_REQUIRED' });
      }
      // The same `totpCode` field accepts EITHER a 6-digit TOTP code OR a one-time
      // backup recovery code. We cannot reliably route on shape (the recovery-code
      // alphabet can produce all-digit codes too), so we always try TOTP first (the
      // common path) and only fall back to recovery-code verification when TOTP fails.
      // A valid recovery code is CONSUMED (its hash is removed) so it can never be reused.
      // Only attempt TOTP verification for a plausibly-TOTP-shaped input. In this
      // otplib version verifySync THROWS a TokenLengthError on a non-6-digit token,
      // so passing an 11-char recovery code straight in would crash (500) instead of
      // falling through to the recovery-code path below. Gating on /^\d{6}$/ both
      // avoids relying on exceptions for control flow and skips a needless crypto op
      // for obvious recovery codes, while a wrong 6-digit TOTP still yields valid:false.
      const totpValid = /^\d{6}$/.test(totpCode) && otplib.verifySync({ token: totpCode, secret: user.totpSecret! }).valid;
      if (!totpValid) {
        // Normalise the same way the codes were hashed at generation time:
        // uppercase, strip any non-alphanumerics (e.g. the display dash).
        const candidate = totpCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
        let matchedRecoveryHash: string | null = null;
        for (const hash of user.totpRecoveryCodes) {
          if (await bcrypt.compare(candidate, hash)) {
            matchedRecoveryHash = hash;
            break;
          }
        }
        if (!matchedRecoveryHash) {
          detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'totp_invalid' } }), (err) => logger.error('loginHistory.create failed', { err }));
          throw new AppError('Invalid two-factor authentication code', 403, { code: 'TWO_FACTOR_INVALID' });
        }
        // Consume the used recovery code ATOMICALLY with a RELATIVE, in-place array
        // element removal performed by Postgres on the LIVE row value — not a full-array
        // `set:` from a stale in-memory snapshot. `array_remove` strips exactly this one
        // hash from whatever the row currently holds, so a concurrent consume of a
        // DIFFERENT code cannot be silently restored: each consumer only ever removes its
        // own element, never overwrites the array. The `= ANY(...)` guard makes the write
        // a no-op (affected rows = 0) once another request has already consumed THIS code,
        // enforcing strict single-use. (Table `User` / column `totpRecoveryCodes` are
        // unmapped PascalCase Prisma identifiers, hence the double quotes.)
        const consumedCount = await prisma.$executeRaw`
          UPDATE "User"
             SET "totpRecoveryCodes" = array_remove("totpRecoveryCodes", ${matchedRecoveryHash})
           WHERE id = ${user.id}
             AND ${matchedRecoveryHash} = ANY("totpRecoveryCodes")
        `;
        const remaining = user.totpRecoveryCodes.filter((h) => h !== matchedRecoveryHash);
        if (consumedCount === 0) {
          // A concurrent request already consumed this exact code → not a valid
          // single-use login. Treat it like any other invalid 2FA attempt.
          detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: false, failReason: 'totp_invalid' } }), (err) => logger.error('loginHistory.create failed', { err }));
          throw new AppError('Invalid two-factor authentication code', 403, { code: 'TWO_FACTOR_INVALID' });
        }
        // Distinct login-history marker so a recovery-code login is auditable
        // separately from a normal TOTP login. This is the SINGLE success row for
        // this login — the generic success row below is skipped via this flag.
        recoveryCodeLogin = true;
        detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: true, failReason: 'totp_recovery_code_used' } }), (err) => logger.error('loginHistory.create failed', { err }));
        logger.warn(`2FA recovery code used for login: ${user.email} (${remaining.length} codes remaining)`);
      }
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // For a recovery-code login the distinct success row above is the one and only
    // success record — don't double-write a generic success row.
    if (!recoveryCodeLogin) {
      detach(prisma.loginHistory.create({ data: { userId: user.id, ip, userAgent, success: true } }), (err) => logger.error('loginHistory.create failed', { err }));
    }
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

    // Normalize and strip fields that must not reach the client.
    // totpEnabledAt / totpSecret are internal; expose only the boolean.
    const { passwordHash, totpEnabledAt, totpSecret, totpRecoveryCodes, ...userWithoutPassword } = user;

    return {
      user: {
        ...userWithoutPassword,
        twoFactorEnabled: totpEnabledAt !== null,
        // Surface canonical partner status (Active|Inactive|Archived) for PARTNER
        // accounts so the FE gate has a defined value right after login, matching
        // the shape /auth/me (getUserById) returns.
        ...(partnerAccountStatus ? { partner_account_status: partnerAccountStatus } : {}),
      },
      ...tokens,
      ...(switchableAccounts ? { switchableAccounts } : {}),
      // Spec §5.3: SUSPENDED partners log in with limited (read-only) access.
      // Frontend uses this to show a warning banner on the dashboard.
      ...(partnerRestriction ? { partnerRestriction } : {}),
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
      if (
        storedToken.user.status === UserStatus.DELETED ||
        (storedToken.user.status as string) === 'SUSPENDED' ||
        storedToken.user.status === 'ARCHIVED'
      ) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
        throw new AppError(
          storedToken.user.status === UserStatus.DELETED
            ? 'This account has been deleted'
            : storedToken.user.status === 'ARCHIVED'
              ? 'Account has been archived'
              : 'Account has been suspended',
          403,
        );
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

      // Part 4 impersonation invariants — re-check the ACTING admin's live
      // status on token refresh, mirroring the per-request middleware check
      // (auth.middleware.ts ~79-106). If the acting admin has been decommissioned
      // since impersonation started, do NOT re-mint privileged impersonation tokens.
      // This closes the gap where a self-renewing refresh token could extend an
      // impersonation session past the point when the admin lost access.
      let impersonation: ImpersonationClaims | undefined;
      if (decoded.imp === true && decoded.impBy && decoded.impByRole) {
        const actor = await prisma.user.findUnique({
          where: { id: decoded.impBy },
          select: { status: true, role: true, rolesUpdatedAt: true },
        }).catch(() => null);

        const actorStatus = actor?.status as string | undefined;
        const actorOk =
          !!actor &&
          (actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN') &&
          // ALLOWLIST: only ACTIVE acting admins — identical to the per-request
          // middleware gate at auth.middleware.ts ~92.
          actorStatus === 'ACTIVE' &&
          // rolesUpdatedAt bump after token issuance invalidates the impersonation.
          // Mirror the middleware check (ms vs iat*1000) so units match exactly.
          !(
            actor.rolesUpdatedAt &&
            actor.rolesUpdatedAt.getTime() > (decoded.iat as number) * 1000
          );

        if (!actorOk) {
          // Acting admin has lost access. Reject refresh without carrying
          // impersonation forward — force the operator back to clean admin login.
          await prisma.refreshToken.delete({ where: { id: storedToken.id } });
          throw new AppError('Impersonation session ended — acting admin access revoked', 401);
        }

        // Acting admin still has valid access — safe to carry impersonation forward
        impersonation = {
          impBy: decoded.impBy,
          impByRole: decoded.impByRole,
          ...(decoded.impAg && decoded.impAg.length > 0 ? { impAg: decoded.impAg } : {}),
        };
      }

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
        totpEnabledAt: true,
        mustChangePassword: true,
        phoneVerified: true,
        phoneVerifiedAt: true,
        loyaltyAccount: {
          select: {
            tier: true,
            points: true,
            lifetimePoints: true,
            cashbackBalance: true,
          },
        },
        // FIX #4 / spec §1.1 — surface the Partner row status so the frontend
        // PartnerStatusRoute gate (Active / Inactive / Archived) can fire. Only
        // populated for PARTNER accounts; null otherwise.
        partner: {
          select: { status: true },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const { totpEnabledAt, partner, ...rest } = user;

    // FIX #4 — map the raw PartnerStatus enum to the canonical TITLE-CASE values
    // PartnerStatusRoute.tsx and spec §1.1 use. Mapping is kept consistent with
    // partners.routes.toCanonicalPartnerStatus: ACTIVE → Active; ARCHIVED and
    // REJECTED → Archived (both are closed/terminated states); everything else
    // (PAUSED / SUSPENDED / PENDING / INACTIVE / …) collapses to 'Inactive' so the
    // gate treats it as non-operational.
    let partner_account_status: 'Active' | 'Inactive' | 'Archived' | undefined;
    if (rest.role === 'PARTNER' && partner) {
      partner_account_status = mapPartnerCanonicalStatus(partner.status);
    }

    const showDualCurrency = await isCurrencyTransitionWindowOpen();

    return {
      ...rest,
      loyaltyAccount: rest.loyaltyAccount
        ? {
            ...rest.loyaltyAccount,
            cashbackBalance: toDualCurrency(rest.loyaltyAccount.cashbackBalance, showDualCurrency),
          }
        : rest.loyaltyAccount,
      twoFactorEnabled: totpEnabledAt !== null,
      ...(partner_account_status ? { partner_account_status } : {}),
    };
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
    // Allow callers to atomically reset phone-verified state in the same write.
    if ((data as any).phoneVerified !== undefined) sanitizedData.phoneVerified = (data as any).phoneVerified;
    if ((data as any).phoneVerifiedAt !== undefined) sanitizedData.phoneVerifiedAt = (data as any).phoneVerifiedAt;

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
        phoneVerified: true,
        phoneVerifiedAt: true,
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
      // BC-QA-029 — per-user cooldown / rate-limit rejection. This is the only
      // 429-status auth.service.ts throw that reaches an authenticated caller
      // directly (login-attempt throttling is enforced upstream by the
      // per-IP/per-account authRateLimiter middleware, outside this file).
      throw new AppError('Please wait 5 minutes before requesting another code', 429, { code: 'AUTH_TOO_MANY_ATTEMPTS' });
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

    // Spec §13.5 step 4 — re-check the new email for uniqueness at confirm time.
    // requestEmailChange validated this, but another account could have claimed the
    // address in the interval. Explicit pre-check inside the confirm step, plus a
    // P2002 catch on the update as a backstop for the residual race window.
    const collision = await prisma.user.findFirst({
      where: { email: user.pendingEmail, deletedAt: null, NOT: { id: userId } },
      select: { id: true },
    });
    if (collision) {
      throw new AppError('Email already in use', 409);
    }

    let updated;
    try {
      updated = await prisma.user.update({
        where: { id: userId },
        data: { email: user.pendingEmail, pendingEmail: null, pendingEmailToken: null, pendingEmailExpiry: null },
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, city: true, country: true, avatar: true, role: true, status: true },
      });
    } catch (err) {
      // Backstop for the race between the pre-check above and the write.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('Email already in use', 409);
      }
      throw err;
    }

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
    // Clear mustChangePassword so the admin panel gate lifts after first change.
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash, passwordChangedAt: new Date(), mustChangePassword: false },
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
   * Soft-delete: anonymize PII, set status DELETED, cancel subscriptions
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
          where: { status: { in: ['ACTIVE', 'TRIALING', 'PAUSED'] } },
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
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        iban: true,
        address: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        emailVerified: true,
        preferredLanguage: true,
        marketingConsent: true,
        marketingConsentEmail: true,
        marketingConsentPhone: true,
        marketingConsentAt: true,
        marketingConsentEmailAt: true,
        marketingConsentPhoneAt: true,
        termsAcceptedAt: true,
        termsVersion: true,
        privacyAcceptedAt: true,
        subscriptions: {
          select: {
            id: true,
            plan: true,
            status: true,
            createdAt: true,
            currentPeriodEnd: true,
          },
        },
        receipts: {
          select: {
            id: true,
            createdAt: true,
            status: true,
            totalAmount: true,
          },
        },
        stickerScans: {
          select: {
            id: true,
            createdAt: true,
          },
        },
        reviews: {
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
          },
        },
        bookings: true,
        favorites: true,
        notifications: {
          select: {
            id: true,
            title: true,
            message: true,
            isRead: true,
            createdAt: true,
          },
        },
        pushTokens: { select: { platform: true, createdAt: true } },
        cards: {
          select: {
            id: true,
            type: true,
            cardNumber: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // F-003: Wallet.payoutIban is the authoritative IBAN source per spec.
    // User.iban is a legacy field that may be out of sync. Fetch wallet IBAN
    // separately and prefer it in the export. User.iban is included for completeness
    // but labelled as legacy so downstream consumers know which to trust.
    const [wallet, windowOpen] = await Promise.all([
      prisma.wallet.findUnique({
        where: { userId },
        select: { payoutIban: true, payoutBeneficiaryName: true },
      }).catch(() => null),
      isCurrencyTransitionWindowOpen(),
    ]);

    const userData = {
      ...user,
      receipts: user.receipts.map(r => ({
        ...r,
        totalAmount: r.totalAmount != null ? toDualCurrency(Number(r.totalAmount), windowOpen) : null,
      })),
    };

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
      // F-003: payoutIban is the authoritative bank account (from Wallet.payoutIban).
      // User.iban is a legacy field retained for backward compatibility but should not be
      // used for payout operations. Always prefer Wallet.payoutIban for financial operations.
      payoutAccount: {
        iban: wallet?.payoutIban ?? null,            // authoritative — Wallet.payoutIban
        beneficiaryName: wallet?.payoutBeneficiaryName ?? null,
        legacyIban: (user as any).iban ?? null,      // legacy — User.iban (may be stale)
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
    const users = await prisma.user.findMany({
      where: { email: email.toLowerCase() },
      orderBy: { createdAt: 'asc' },
      include: { partner: { select: { businessName: true } } },
    });

    const multipleAccounts = users.length > 1;

    for (const user of users) {
      // SUSPENDED: do not issue OTPs for suspended accounts — silently skip.
      // DELETED: guarded explicitly below. The soft-delete Prisma extension also
      //          excludes deletedAt != null rows from findMany, but it keys on
      //          deletedAt, NOT status — so the explicit status check is required to
      //          stay safe if a row ever has status=DELETED without deletedAt set.
      // ARCHIVED is intentionally allowed — it is the reactivation path per spec §14.
      // Step 1: user resets password (allowed when ARCHIVED). Step 2: admin sets status
      // to ACTIVE. Login stays blocked until step 2.
      if ((user.status as string) === 'SUSPENDED' || (user.status as string) === 'DELETED') {
        continue;
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
      const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
      // Spec §9.5: per-role validity. Admin tightened to 1h, partner/user 24h.
      // Each new OTP overwrites the previous, which implicitly invalidates older
      // codes (single column + later expires wins on lookup).
      const expiryMs =
        user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
          ? SECURITY_CONFIG.SECURITY.PASSWORD_RESET_EXPIRY_ADMIN_MS
          : user.role === 'PARTNER'
            ? SECURITY_CONFIG.SECURITY.PASSWORD_RESET_EXPIRY_PARTNER_MS
            : SECURITY_CONFIG.SECURITY.PASSWORD_RESET_EXPIRY_USER_MS;
      const expiryHours = Math.round(expiryMs / (60 * 60 * 1000));
      const expiryLabel =
        expiryHours === 1
          ? { en: '1 hour', bg: '1 час' }
          : { en: `${expiryHours} hours`, bg: `${expiryHours} часа` };
      const expires = new Date(Date.now() + expiryMs);

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
        expiryLabel,
      });

      if (!emailResult.success) {
        logger.error(`Failed to send password reset email to ${user.email}`);
      } else {
        logger.info(`Password reset OTP sent to ${user.email} (account ${user.id})`);
      }

      // Spec §10.4 — log every password reset request to LinkResendLog + AuditLog, not
      // just admin accounts. The reset-abuse alert/suspension below applies to all roles.
      await prisma.linkResendLog.create({
        data: { linkType: 'PASSWORD_RESET', subjectId: user.id, actorId: user.id },
      }).catch((err: unknown) => logger.error('[forgotPassword] linkResendLog.create failed', err));
      detach(writeAudit({
        actorUserId: user.id,
        action: 'auth.password-reset.request',
        objectType: 'user',
        objectId: user.id,
        after: { selfService: true },
      }), (err: unknown) => logger.error('[forgotPassword] writeAudit failed', err));

      // Spec §19 rule 12 — password reset rate-limit for ALL accounts:
      //   Alert at 3 resets in 24h → notify all SUPER_ADMINs.
      //   Account suspension pending Super Admin review at 5 resets in 24h.
      {
        const ALERT_WINDOW_HOURS = 24;
        const ALERT_THRESHOLD      = 3;  // fire alert email once at exactly 3
        const SUSPENSION_THRESHOLD = 5;  // suspend account at 5
        const windowStart = new Date(Date.now() - ALERT_WINDOW_HOURS * 60 * 60 * 1000);
        const recentCount = await prisma.linkResendLog.count({
          where: {
            linkType: 'PASSWORD_RESET',
            subjectId: user.id,
            createdAt: { gte: windowStart },
          },
        }).catch(() => 0);

        // Spec §19 rule 12 — fire the SA alert email ONCE, at exactly the
        // threshold (3). L1 fix: the prior `>= ALERT_THRESHOLD` re-fired on
        // every subsequent reset (3,4,5+), spamming Super Admins. The spec
        // intent (and the comment on ALERT_THRESHOLD) is a single alert.
        //
        // L1 (round 2) — silent-gap analysis: under a rare concurrent
        // double-increment two requests could both skip the exact boundary at
        // 3, so this Tier-1 alert may not fire. That gap is CLOSED downstream,
        // not here: the Tier-3 suspension path below (recentCount >= 5) fires
        // the SAME `sendAdminPasswordResetAlert` email + an in-app
        // notifyAdminOps to all active Super Admins UNCONDITIONALLY — it runs
        // whether the suspension is applied or skipped by the last-SA guard.
        // Therefore at least one Super-Admin alert is GUARANTEED before/at
        // suspension for any account that crosses the abuse threshold, even if
        // the exact `=== 3` edge is missed. We deliberately keep `=== 3`
        // one-shot here (rather than a band like `=== 3 || === 4`, which would
        // re-spam) because the suspension-path alert is the robust floor. The
        // only behaviour the `=== 3` edge-miss changes is the *timing* of the
        // first alert (at suspension instead of at 3), not whether an SA is
        // alerted at all.
        if (recentCount === ALERT_THRESHOLD) {
          const superAdmins = await prisma.user.findMany({
            where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
            select: { email: true },
          }).catch(() => [] as { email: string }[]);

          if (superAdmins.length > 0) {
            detach(emailService.sendAdminPasswordResetAlert({
              targetEmail: user.email,
              targetName:  `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
              resetCount:  recentCount,
              windowHours: ALERT_WINDOW_HOURS,
              recipientEmails: superAdmins.map((a) => a.email),
            }), (err: unknown) => logger.error('[forgotPassword] alert email failed', err));
          }
        }

        // Spec §19 atomic rule #12 — suspend account at 5 resets in 24h, pending
        // Super Admin review. The rule lives in the USER domain and carries no role
        // exception, so it applies to USER / PARTNER accounts as well as ADMIN /
        // SUPER_ADMIN (the audit H3 corrected the prior admin-only scoping).
        // Only suspend once (when the count first reaches the threshold) to avoid
        // redundant DB writes.
        //
        // NOTE: this branch is reached from the PUBLIC /auth/forgot-password
        // endpoint. The unauthenticated-DoS surface (an attacker spamming resets to
        // disable an account) is mitigated by the per-IP authRateLimiter in front of
        // this route plus the Tier-1 super-admin alert fired above at >= 3, which
        // surfaces the abuse for Super Admin review. Suspension transitions status to
        // SUSPENDED (pending Super Admin review). M1 fix: previously this set INACTIVE,
        // but per spec §1.1 an Inactive account still permits login — which defeats the
        // lockout. SUSPENDED blocks login (treated as no-login, equivalent to Archived
        // for access purposes), so it is the correct abuse-lockout status.
        if (recentCount >= SUSPENSION_THRESHOLD && user.status === 'ACTIVE') {
          // M2 — last-active-SUPER_ADMIN guard. The manual admin status route
          // (adminAdmins.routes.ts) refuses to deactivate the last active
          // SUPER_ADMIN (409). This automated lockout must honour the same
          // invariant, or an attacker spamming the sole super-admin's
          // forgot-password could suspend the last SA and require DB
          // intervention to recover. We mirror the manual route's exact
          // definition of "active SUPER_ADMIN": role === SUPER_ADMIN AND
          // status === ACTIVE, excluding this user. If suspending would leave
          // zero, SKIP the suspension — but still fire the SA alert below so the
          // abuse remains visible.
          let suspensionBlockedByLastSAGuard = false;
          if (user.role === 'SUPER_ADMIN') {
            const activeSuperAdmins = await prisma.user.count({
              where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: user.id } },
            }).catch(() => 0); // fail-closed: on count failure, assume NO other active SA → guard trips → suspension SKIPPED
            if (activeSuperAdmins === 0) {
              suspensionBlockedByLastSAGuard = true;
            }
          }

          if (!suspensionBlockedByLastSAGuard) {
            await prisma.user.update({
              where: { id: user.id },
              data: { status: 'SUSPENDED' },
            }).catch((err: unknown) => logger.error('[forgotPassword] suspension update failed', err));

            detach(writeAudit({
              actorUserId: null,
              action: 'auth.password-reset.suspension',
              objectType: 'user',
              objectId: user.id,
              after: {
                reason: `Spec Part 9 Tier 3: ${recentCount} password resets within ${ALERT_WINDOW_HOURS}h — account suspended pending Super Admin review`,
                resetCount: recentCount,
                windowHours: ALERT_WINDOW_HOURS,
              },
            }), (err: unknown) => logger.error('[forgotPassword] suspension audit failed', err));
          } else {
            // M2 — suspension skipped to preserve the last active SUPER_ADMIN.
            // Record the skip so the abuse + the non-action are auditable.
            detach(writeAudit({
              actorUserId: null,
              action: 'auth.password-reset.suspension-skipped',
              objectType: 'user',
              objectId: user.id,
              after: {
                reason: `Spec Part 9 Tier 3 suspension SKIPPED: target is the last active SUPER_ADMIN (${recentCount} password resets within ${ALERT_WINDOW_HOURS}h). Account left ACTIVE to avoid lockout; flagged for Super Admin review.`,
                resetCount: recentCount,
                windowHours: ALERT_WINDOW_HOURS,
              },
            }), (err: unknown) => logger.error('[forgotPassword] suspension-skipped audit failed', err));
          }

          // Notify all SUPER_ADMINs (separate from the alert email). This fires
          // whether or not the suspension was applied — when skipped by the
          // last-SA guard the abuse must still be surfaced for manual review.
          const superAdmins = await prisma.user.findMany({
            where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
            select: { email: true, id: true },
          }).catch(() => [] as { email: string; id: string }[]);

          // LOW-1 — skip-path alert dedupe. When the last-SA guard SKIPS the
          // suspension the account stays ACTIVE, so it crosses `recentCount >= 5`
          // on EVERY subsequent forgot-password request inside the 24h window and
          // would re-fire the SA alert email + in-app notification each time
          // (re-introducing the alert-spam class L1's `=== 3` one-shot prevents).
          // The actual-suspension branch is naturally one-shot (status flips to
          // SUSPENDED, so the `user.status === 'ACTIVE'` guard above stops re-entry),
          // so dedupe is only needed on the skip path. We use a DISTINCT opsType
          // for the skip case and pass `cooldownHours` to notifyAdminOps (which
          // already supports opsType-scoped cooldown — see notification.service.ts),
          // and gate the parallel email on the same prior-notification check so the
          // first skip alert fires but in-window repeats are suppressed for both
          // channels consistently.
          const SKIP_OPS_TYPE = 'account_suspension_password_reset_skipped';
          let suppressSkipAlert = false;
          if (suspensionBlockedByLastSAGuard) {
            const since = new Date(Date.now() - ALERT_WINDOW_HOURS * 60 * 60 * 1000);
            const priorSkipNotice = await prisma.notification.findFirst({
              where: {
                createdAt: { gte: since },
                OR: [
                  { data: { contains: `"opsType":"${SKIP_OPS_TYPE}",` } },
                  { data: { contains: `"opsType":"${SKIP_OPS_TYPE}"}` } },
                ],
              },
              select: { id: true },
            }).catch(() => null);
            suppressSkipAlert = priorSkipNotice !== null;
          }

          if (superAdmins.length > 0 && !suppressSkipAlert) {
            detach(emailService.sendAdminPasswordResetAlert({
              targetEmail: user.email,
              targetName:  `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
              resetCount:  recentCount,
              windowHours: ALERT_WINDOW_HOURS,
              recipientEmails: superAdmins.map((a) => a.email),
            }), (err: unknown) => logger.error('[forgotPassword] suspension alert email failed', err));

            // F-002: In-app notification to Super Admins. M2: message reflects
            // whether the account was actually suspended or the suspension was
            // skipped to protect the last active SUPER_ADMIN. LOW-1: skip-path
            // uses a distinct opsType + cooldownHours so repeated skip alerts in
            // the window are deduped (consistent with the email gate above).
            detach(notificationService.notifyAdminOps({
              opsType: suspensionBlockedByLastSAGuard
                ? SKIP_OPS_TYPE
                : 'account_suspension_password_reset',
              ...(suspensionBlockedByLastSAGuard ? { cooldownHours: ALERT_WINDOW_HOURS } : {}),
              title: suspensionBlockedByLastSAGuard
                ? 'Password-reset abuse on last SUPER_ADMIN (suspension skipped)'
                : 'Account suspended: excessive password resets',
              message: suspensionBlockedByLastSAGuard
                ? `Account ${user.email} hit ${recentCount} password reset requests in ${ALERT_WINDOW_HOURS}h (Spec Part 9 Tier 3) but auto-suspension was SKIPPED because it is the last active SUPER_ADMIN. Manual Super Admin review required.`
                : `Account ${user.email} was automatically suspended after ${recentCount} password reset requests in ${ALERT_WINDOW_HOURS}h (Spec Part 9 Tier 3). Pending Super Admin review.`,
              severity: 'warning',
              fields: [
                { label: 'Account', value: user.email },
                { label: 'Reset count', value: String(recentCount) },
                { label: 'Window', value: `${ALERT_WINDOW_HOURS}h` },
              ],
            }), (err: unknown) => logger.error('[forgotPassword] admin in-app suspension notification failed', err));
          }

          logger.warn(
            `[forgotPassword] Account ${user.id} (${user.email}, role ${user.role}) ` +
            `${suspensionBlockedByLastSAGuard ? 'suspension SKIPPED (last active SUPER_ADMIN)' : 'suspended'} after ` +
            `${recentCount} password resets in ${ALERT_WINDOW_HOURS}h — Spec §19 rule #12`
          );
        }
      }
    }

    // PendingSubscription users: paid but haven't completed registration yet.
    // Only checked when NO User row of any kind exists for this email — active
    // OR deleted. The soft-delete extension on prisma.user.findMany already
    // excludes DELETED rows from `users`, so we run a separate bypass query
    // to count them (the extension is skipped when the caller provides an
    // explicit deletedAt filter — see src/lib/prisma.ts:34).
    // Also, /complete-profile rejects if a User row exists for the email, so a
    // PAID PendingSubscription for a known email would fail at completion anyway.
    // M1: guard findMany so a transient DB error falls through to the generic
    // success return rather than leaking a 500 that breaks enumeration-safety.

    // Count DELETED users for this email. prisma.user.count is NOT intercepted
    // by the soft-delete $extends hook (which only wraps findMany/findFirst/
    // findUnique — see src/lib/prisma.ts:38-52), so it sees all rows natively.
    // The explicit deletedAt: { not: null } filter scopes the result to
    // soft-deleted rows only.
    const deletedUserCount = await prisma.user.count({
      where: { email: email.toLowerCase(), deletedAt: { not: null } },
    }).catch(() => 1); // fail-safe: assume a deleted user exists if the query errors
                       // so we conservatively skip the PendingSubscription path

    // Only check PendingSubscription when NO User row of any kind exists for this email.
    let pendingFound = false;
    if (users.length === 0 && deletedUserCount === 0) {
      const pendingRows = await prisma.pendingSubscription.findMany({
        where: {
          email: email.toLowerCase(),
          status: 'PAID',
          expiresAt: { gt: new Date() }, // exclude rows that have been logically purged
        },
        include: { plan: { select: { displayName: true, displayNameBg: true } } },
      }).catch((err: unknown) => {
        logger.error('[forgotPassword] pendingSubscription.findMany failed', err);
        return [] as never[];
      });

      if (pendingRows.length > 0) {
        pendingFound = true;
      }

      for (const pending of pendingRows) {
        // Refresh the registration token — the original 30-min window may have expired.
        // M1: wrap the entire loop body in try/catch so any error (token write,
        // plan access, email dispatch) is caught per-row and does not propagate
        // to the caller — preserving the anti-enumeration guarantee.
        try {
          const freshToken = crypto.randomBytes(32).toString('hex');
          await prisma.pendingSubscription.update({
            where: { id: pending.id },
            data: {
              token: freshToken,
              tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
            },
          });

          const frontendBase = process.env.FRONTEND_URL || 'https://boomcard.bg';
          const lang: 'bg' | 'en' = pending.language === 'en' ? 'en' : 'bg';
          detach(emailService.sendCompleteProfileEmail(pending.email, {
            planName: pending.plan.displayName,
            planNameBg: pending.plan.displayNameBg ?? undefined,
            completeProfileUrl: `${frontendBase}/complete-profile?token=${freshToken}`,
            language: lang,
          }), (err: unknown) => logger.error('[forgotPassword] complete-profile resend failed', err));

          // Write a LinkResendLog entry so IP-level rate limiting has a supporting
          // record; no per-subscription threshold is enforced (no User to suspend).
          await prisma.linkResendLog.create({
            data: { linkType: 'PASSWORD_RESET', subjectId: pending.id, actorId: null },
          }).catch((err: unknown) => logger.error('[forgotPassword] linkResendLog.create (pending) failed', err));

          // L2: audit trail for each pending-subscription token refresh.
          detach(writeAudit({
            actorUserId: null,
            action: 'auth.pending-subscription.registration-resent',
            objectType: 'PendingSubscription',
            objectId: pending.id,
            after: { email: pending.email, selfService: true },
          }), (err: unknown) => logger.error('[forgotPassword] writeAudit (pending) failed', err));

          logger.info(`[forgotPassword] PendingSubscription ${pending.id}: resent complete-profile email`);
        } catch (err: unknown) {
          logger.error(`[forgotPassword] PendingSubscription ${pending.id} processing failed`, err);
          continue;
        }
      }
    }

    // Return 404 when the email is genuinely unknown: no User row (active or
    // deleted) and no active PendingSubscription. When deletedUserCount > 0 we
    // stay silent to avoid revealing that a soft-deleted account existed.
    if (users.length === 0 && deletedUserCount === 0 && !pendingFound) {
      throw new AppError('No account found with that email address.', 404);
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
    let adminReadOnly = false; // Spec §1.5 — true when admin status is INACTIVE
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      // Spec §1.5: check admin status to set read-only flag for INACTIVE admins.
      // We do one DB query here (shared with permission resolution for ADMIN role).
      const freshAdmin = await prisma.user.findUnique({
        where: { id: user.id },
        select: { status: true },
      }).catch(() => null);
      if (freshAdmin?.status === 'INACTIVE') {
        // Spec §1.5: Inactive admin — login allowed, operational rights limited to read-only.
        // Embed `aro: true` (admin read-only) in the JWT; enforced in requirePermission().
        adminReadOnly = true;
      }
    }
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
      // Spec §1.5: flag inactive admins as read-only so requirePermission() can block writes
      ...(adminReadOnly ? { aro: true as const } : {}),
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

    // Exclude SUSPENDED/INACTIVE/ARCHIVED/DELETED: listing them in the switcher
    // only lets the user click a row that then 403s in switchAccount — hide them instead.
    const users = await prisma.user.findMany({
      where: {
        id: { in: accountIds },
        status: { notIn: ['INACTIVE', 'SUSPENDED', 'ARCHIVED', 'DELETED'] as any },
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
        businessName: (u as any).partner?.businessName ?? null,
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
          mustChangePassword: true,
          totpEnabledAt: true,
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

    if (
      target.status === UserStatus.SUSPENDED ||
      target.status === UserStatus.INACTIVE ||
      target.status === UserStatus.ARCHIVED ||
      target.status === UserStatus.DELETED
    ) {
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

    const { passwordHash, totpEnabledAt, ...targetWithoutPassword } = target;
    const switchableAccounts = await this.fetchSwitchableAccounts(accountGroup);
    const filtered = switchableAccounts.filter((a) =>
      clientType === 'mobile' ? a.role === 'USER' : a.role !== 'USER'
    );

    logger.info(
      `Account switched: user ${currentUserId} -> ${target.id} (${target.email}, role=${target.role})`
    );

    return {
      user: { ...targetWithoutPassword, twoFactorEnabled: totpEnabledAt !== null },
      ...tokens,
      switchableAccounts: filtered,
    };
  }

  /**
   * Admin-initiated impersonation of a PARTNER or USER account.
   *
   * Role gating is derived from the *resolved* target role, never from a
   * client-supplied hint:
   *   - target is PARTNER -> caller must be ADMIN or SUPER_ADMIN
   *   - target is USER    -> caller must be SUPER_ADMIN only
   * Any other target role is refused.
   *
   * Unlike switchAccount (which uses the login-time bcrypt-match `accountGroup`
   * to authorize sibling pivots), impersonation grants the session based purely
   * on the admin's role. The returned token is
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
    // Generic impersonation target — may resolve to a PARTNER or a USER.
    // (The route accepts the legacy `targetPartnerUserId` body field and maps
    // it to this same parameter; role gating is derived from the resolved
    // target role below, not from which field the client sent.)
    targetUserId: string;
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
    const { adminId, adminRole, adminAccountGroup, targetUserId, clientType, tokenIssuedAt, currentAdminRefreshToken } = input;

    if (clientType === 'mobile') {
      throw new AppError('Impersonation is not available on mobile', 403);
    }
    if (adminRole !== 'ADMIN' && adminRole !== 'SUPER_ADMIN') {
      throw new AppError('Not authorized', 403);
    }
    if (!targetUserId) {
      throw new AppError('targetUserId is required', 400);
    }
    if (targetUserId === adminId) {
      throw new AppError('Cannot impersonate yourself', 400);
    }

    const [target, admin] = await Promise.all([
      prisma.user.findUnique({
        where: { id: targetUserId },
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

    if (!target) throw new AppError('Target account not found', 404);
    // BC-ADMIN-RBAC-ROLES-019 — gating is now permission-based, not role-based.
    // Derive the REQUIRED permission from the *resolved* target role (never from a
    // client-supplied hint): a PARTNER target requires `impersonate.partner`; a USER
    // target requires `impersonate.user`. SUPER_ADMIN bypasses the permission check
    // entirely (mirrors requirePermission's SUPER_ADMIN bypass at the route layer).
    // The route-level requirePermission already screens the caller, but we re-check
    // here against the resolved target type because POST /impersonate serves BOTH
    // target kinds under a single outer guard.
    if (target.role !== 'PARTNER' && target.role !== 'USER') {
      throw new AppError('Target account cannot be impersonated', 400);
    }
    if (adminRole !== 'SUPER_ADMIN') {
      const requiredPermission =
        target.role === 'PARTNER' ? 'impersonate.partner' : 'impersonate.user';
      const callerPermissions = await resolveUserPermissions(adminId);
      if (!callerPermissions.includes(requiredPermission)) {
        throw new AppError(
          target.role === 'PARTNER'
            ? 'You do not have permission to impersonate partners'
            : 'You do not have permission to impersonate end-users',
          403,
        );
      }
    }
    if (target.status !== 'ACTIVE') {
      throw new AppError('Target account is not active', 403);
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

    // Audit log the impersonation start event
    // Await the audit write before returning the token — audit records must be
    // committed before the privileged session is issued.
    await writeAudit({
      actorUserId: admin.id,
      action: 'admin.impersonate.start',
      objectType: target.role === 'PARTNER' ? 'partner' : 'user',
      objectId: target.id,
      after: {
        targetRole: target.role,
        targetEmail: target.email,
        startedAt,
      },
    });

    // Revoke the admin's pre-impersonation refresh token so a stolen copy of
    // it can't be replayed to silently resurrect the admin session alongside
    // the impersonation session. Stop-impersonate mints a fresh admin pair
    // on exit, so nothing else depends on this row.
    // NOTE: This comes AFTER audit write to ensure audit record is committed
    // before any irreversible mutations. If audit write throws, no token is revoked.
    if (currentAdminRefreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: currentAdminRefreshToken, userId: admin.id },
      });
    }

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
    tokenIssuedAt?: number;
  }) {
    const { currentUserId, impersonatedBy, impersonatedByAg, isImpersonation, clientType, currentRefreshToken, tokenIssuedAt } = input;

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
        mustChangePassword: true,
        totpEnabledAt: true,
        rolesUpdatedAt: true,
      },
    });

    if (!admin) throw new AppError('Admin account no longer exists', 404);
    if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') {
      throw new AppError('Your admin privileges have changed — please sign in again', 401);
    }
    if (admin.status !== 'ACTIVE') {
      throw new AppError('Admin account is not active', 403);
    }
    // rolesUpdatedAt bump after token issuance invalidates the impersonation.
    // Mirror the middleware check (ms vs iat*1000) so units match exactly.
    // Only perform this check if tokenIssuedAt is provided.
    if (
      tokenIssuedAt &&
      admin.rolesUpdatedAt &&
      admin.rolesUpdatedAt.getTime() > tokenIssuedAt * 1000
    ) {
      throw new AppError('Your admin privileges have changed — please sign in again', 401);
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

    const endedAt = new Date().toISOString();

    // Resolve the impersonated target's role to match objectType with the START record
    const target = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });
    const objectType = target?.role === 'PARTNER' ? 'partner' : 'user';

    logger.warn('Admin impersonation ended', {
      adminId: admin.id,
      adminRole: admin.role,
      impersonatedUserId: currentUserId,
      endedAt,
    });

    // Audit log the impersonation stop event
    // Await the audit write before returning the token — audit records must be
    // committed before the session restoration is complete.
    await writeAudit({
      actorUserId: admin.id,
      action: 'admin.impersonate.stop',
      objectType,
      objectId: currentUserId,
      after: {
        adminRole: admin.role,
        endedAt,
      },
    });

    // Revoke the current (impersonation) refresh token. Scope to the
    // impersonation userId so a body-supplied token string can only delete
    // a row belonging to the authenticated caller — same invariant as
    // switchAccount.
    // NOTE: This comes AFTER audit write to ensure audit record is committed
    // before any irreversible mutations. If audit write throws, no token is deleted.
    if (currentRefreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: currentRefreshToken, userId: currentUserId },
      });
    }

    const { totpEnabledAt: adminTotpEnabledAt, ...adminWithout } = admin;
    return {
      user: { ...adminWithout, twoFactorEnabled: adminTotpEnabledAt !== null },
      ...tokens,
      ...(switchableAccounts ? { switchableAccounts } : {}),
    };
  }

  static async createSession(user: { id: string; email: string; role: string }): Promise<AuthTokens> {
    return AuthService.generateTokens(user);
  }
}
