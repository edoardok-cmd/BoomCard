-- BC-QA-022: Squash-baseline migration (2026-08-10)
--
-- WHY THIS EXISTS
-- ----------------
-- `prisma migrate deploy` against a brand-new empty postgres:16 database
-- failed mid-chain in two ways during BC-UX-E2E-REAUDIT bring-up
-- (2026-07-22):
--   1. `ERROR: relation "MarketingList" does not exist` — no migration in
--      the old history ever contained `CREATE TABLE "MarketingList"` /
--      `"MarketingListMember"` / `CREATE TYPE "MarketingListType"`. Those
--      objects were introduced to `schema.prisma` (and to real databases)
--      via `prisma db push` / hand-applied SQL and were never captured in
--      migration history at all — there was no single "move this migration
--      earlier" fix available because the CREATE step never existed as a
--      migration to reorder.
--   2. A `SubscriptionPlan` / `CardType` enum-value rename chain
--      (STANDARD/PREMIUM/PLATINUM -> LIGHT/BASIC/PREMIUM, later
--      LIGHT -> PREMIUM_WEEKLY) was completed out-of-band: the final
--      rename lives only in `prisma/migrations/manual/001_audit_fixes.sql`,
--      a file `prisma migrate deploy` never executes (its actual
--      `migration.sql` in that folder is intentionally a documented no-op —
--      see the archived copy). So replaying the old history top-to-bottom
--      left the enum at `LIGHT`, never reaching the `PREMIUM_WEEKLY` value
--      `schema.prisma` actually declares, and any later migration touching
--      that enum could hit Postgres's new-enum-value-not-yet-committed
--      restriction depending on execution order.
--
-- Given that the pre-existing history already contains an out-of-band,
-- non-replayable step (the `manual/` folder) and at least one whole set of
-- objects with zero corresponding CREATE migration, in-place repair
-- (reordering / inserting a missing CREATE TABLE at the "right" historical
-- point, splitting the enum ALTER) was rejected: there is no single correct
-- historical point to insert the missing MarketingList CREATE at, since it
-- was never migrated in the first place on any real database either — we
-- cannot reconstruct "the day it should have been created" without
-- guessing. Squash-baselining is the approach that is actually correct
-- here (option (b) from the task), not a shortcut.
--
-- WHAT THIS MIGRATION IS
-- -----------------------
-- The entire previous migration history (62 folders, `0_init` through
-- `20260702100000_add_phone_verified`, plus `manual/`) has been moved to
-- `prisma/migrations_archive_pre_baseline_20260810/` (sibling directory,
-- NOT under `prisma/migrations/`, so `prisma migrate deploy` never sees it)
-- for historical reference. This file replaces the old `0_init/migration.sql`
-- and is the ONLY migration `prisma migrate deploy` will run against a
-- fresh database going forward. Its contents were generated mechanically
-- from the current schema and verified to produce a database with ZERO
-- drift against `prisma/schema.prisma`:
--
--   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
--
-- APPLYING THIS TO EXISTING DATABASES (staging / production)
-- ------------------------------------------------------------
-- Existing databases already have the full pre-baseline history applied
-- and are already in the schema shape this migration produces — DO NOT
-- run this migration's SQL against them. Instead, mark it as already
-- applied without executing it:
--
--   npx prisma migrate resolve --applied 0_init
--
-- (this exact command is also wired up as `npm run db:migrate:baseline`
-- in backend-api/package.json, which predates this migration and already
-- assumed this recipe). This is a metadata-only operation: it inserts a
-- row into `_prisma_migrations` marking `0_init` as applied at the current
-- timestamp; it does not touch any application table and has zero
-- data-loss risk.
--
-- UPDATE (2026-08-10, BC-QA-022 follow-up round): the task-review round
-- correctly flagged that nothing in the deploy pipeline actually ran the
-- manual command above before the first post-squash deploy against a real
-- (un-baselined) database — it would fail with Prisma error P3018
-- (e.g. `type "UserRole" already exists`) and block the app from starting.
-- This is now handled automatically: `backend-api/prisma/auto-baseline.js`
-- runs at container startup (wired into both `backend-api/Dockerfile`'s CMD
-- and `backend-api/fly.toml`'s `[processes].app`, immediately before
-- `prisma migrate deploy`). It inspects `_prisma_migrations` and, if it
-- detects old pre-squash history rows with no successfully-applied
-- `0_init` row, runs the exact `prisma migrate resolve --applied 0_init`
-- command above for you — including recovering a `0_init` row left in a
-- failed state by a prior crashed attempt via
-- `prisma migrate resolve --rolled-back 0_init` first. The manual recipe
-- above is retained here as the documented fallback (and is what the
-- script logs verbatim if it cannot connect or hits an unexpected error) —
-- it is no longer something an operator has to remember to run by hand
-- before the first post-squash deploy. After this one-time resolve
-- (automatic or manual), ordinary `prisma migrate deploy` on new future
-- migrations behaves normally.
--
-- VERIFICATION PERFORMED (see BC-QA-022 report for full detail)
-- -----------------------------------------------------------------
--   1. `prisma migrate diff --from-empty --to-schema prisma/schema.prisma
--      --exit-code --script` against a disposable local postgres:16
--      cluster: applied cleanly (psql exit 0).
--   2. `prisma migrate diff --from-config-datasource ... --to-schema
--      prisma/schema.prisma --exit-code` against the resulting database:
--      reported "This is an empty migration." (zero drift, exit 0).
--   3. `prisma migrate deploy` run end-to-end against a second, completely
--      fresh disposable database using this exact migrations/ directory
--      layout: exit 0.
--
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'PARTNER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "RiskBucket" AS ENUM ('LOW_0_20', 'MEDIUM_21_50', 'HIGH_51_PLUS');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DisputeSubjectType" AS ENUM ('RECEIPT', 'CASHBACK', 'PAYOUT', 'INVOICE');

-- CreateEnum
CREATE TYPE "AdminRoleKey" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'RISK_REVIEW', 'PARTNER_MANAGER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'PENDING_PAYMENT', 'DELETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PartnerRequestStatus" AS ENUM ('NOVA', 'KOMUNIKACIYA', 'DOGOVARYANE', 'ONBOARDING', 'ODOBRENA', 'OTKAZANA');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'PAUSED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartnerVenueCountBucket" AS ENUM ('1', '2-5', '6-10', '11+');

-- CreateEnum
CREATE TYPE "ActivationLinkReason" AS ENUM ('INITIAL', 'RESEND');

-- CreateEnum
CREATE TYPE "CashbackPaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "MenuStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VenueStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REPLACED', 'INACTIVE', 'IN_PROCESSING');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('DISCOUNT', 'CASHBACK', 'POINTS', 'BUNDLE', 'SEASONAL');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BOOKING', 'PURCHASE', 'WALLET_TOPUP', 'REFUND', 'LOYALTY_REDEMPTION', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'WALLET', 'BANK_TRANSFER', 'CASH');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('TOP_UP', 'WITHDRAWAL', 'CASHBACK_CREDIT', 'PURCHASE', 'REFUND', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TRIAL_PENDING', 'ANNULLED', 'RISK_HOLD');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('PREMIUM_WEEKLY', 'BASIC', 'PREMIUM_MONTHLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'UNPAID', 'PAUSED', 'EXPIRED', 'FAILED_PAYMENT');

-- CreateEnum
CREATE TYPE "CashbackEntryStatus" AS ENUM ('PENDING', 'CLEARED', 'LOCKED', 'PAID', 'EXPIRED', 'VOIDED', 'TRIAL_PENDING');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'PROCESSING', 'VALIDATING', 'APPROVED', 'REJECTED', 'MANUAL_REVIEW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WhitelistStatus" AS ENUM ('APPROVED', 'BLOCKED', 'PENDING');

-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARNED', 'REDEEMED', 'EXPIRED', 'ADJUSTED', 'BONUS');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'USED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP', 'SUPPORT');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'LOYALTY_POINTS', 'REWARD_AVAILABLE', 'NEW_MESSAGE', 'REVIEW_RECEIVED', 'OFFER_EXPIRING', 'RECEIPT_APPROVED', 'RECEIPT_REJECTED', 'RECEIPT_MANUAL_REVIEW', 'CASHBACK_CREDITED', 'SYSTEM', 'STICKER_SCAN_APPROVED', 'FRAUD_ALERT', 'MARKETING', 'PARTNER_ACTIVATION_LINK', 'PARTNER_ONBOARDING_FOLLOWUP', 'PARTNER_NEW_TRANSACTION', 'PARTNER_MONTHLY_SUMMARY', 'PARTNER_REQUEST_UPDATE', 'PARTNER_STATUS_CHANGE', 'PARTNER_CONTRACT_CHANGE', 'PARTNER_MARKETING');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('TABLE', 'COUNTER', 'BAR', 'ENTRANCE', 'RECEPTION', 'OTHER');

-- CreateEnum
CREATE TYPE "StickerStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'DAMAGED', 'RETIRED', 'PROCESSING', 'REPLACED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'VALIDATING', 'APPROVED', 'REJECTED', 'MANUAL_REVIEW', 'SESSION_ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('PREMIUM_WEEKLY', 'BASIC', 'PREMIUM');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'OPEN', 'WAITING', 'RESOLVED', 'CLOSED', 'IN_REVIEW', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketRequestType" AS ENUM ('SUPPORT', 'DISPUTE', 'CHANGE', 'DATA_CHANGE', 'LOCATION_CHANGE', 'CONTRACT_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('CASHBACK', 'ACCOUNT', 'PAYMENT', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketingChannel" AS ENUM ('EMAIL', 'PUSH', 'SMS');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENT', 'PAUSED');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DRAFT');

-- CreateEnum
CREATE TYPE "MarketingListType" AS ENUM ('STATIC', 'DYNAMIC', 'SEGMENT');

-- CreateEnum
CREATE TYPE "PendingSubscriptionStatus" AS ENUM ('CREATED', 'PAID', 'COMPLETED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportingPeriodStatus" AS ENUM ('OPEN', 'FOR_REVIEW', 'LOCKED', 'INVOICED');

-- CreateEnum
CREATE TYPE "FraudRuleTier" AS ENUM ('SYSTEM', 'PARTNER_TYPE', 'PARTNER', 'USER');

-- CreateEnum
CREATE TYPE "PartnerApplicationStatus" AS ENUM ('NEW', 'COMMUNICATION', 'NEGOTIATION', 'ONBOARDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "avatar" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentAt" TIMESTAMP(3),
    "privacyAcceptedAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordChangedAt" TIMESTAMP(3),
    "emailVerificationExpiry" TIMESTAMP(3),
    "emailVerificationToken" TEXT,
    "notificationPreferences" JSONB,
    "deletedAt" TIMESTAMP(3),
    "iban" TEXT,
    "ibanLastChangedAt" TIMESTAMP(3),
    "marketingConsentEmail" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentEmailAt" TIMESTAMP(3),
    "marketingConsentPhone" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentPhoneAt" TIMESTAMP(3),
    "riskBucket" "RiskBucket",
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "totpEnabledAt" TIMESTAMP(3),
    "totpSecret" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'bg',
    "lastActivityAt" TIMESTAMP(3),
    "city" TEXT,
    "country" TEXT,
    "pendingEmail" TEXT,
    "pendingEmailExpiry" TIMESTAMP(3),
    "pendingEmailToken" TEXT,
    "totpPendingSecret" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "emailUnsubscribeToken" TEXT,
    "rolesUpdatedAt" TIMESTAMP(3),
    "address" TEXT,
    "riskOverriddenAt" TIMESTAMP(3),
    "riskOverriddenBy" TEXT,
    "totpRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "statusBeforeDelete" "UserStatus",

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_super_admin_requests" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "secondApproverId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "pending_super_admin_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "critical_action_requests" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "note" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "critical_action_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientType" TEXT,
    "accountGroup" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessNameBg" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "descriptionBg" TEXT,
    "logo" TEXT,
    "coverImage" TEXT,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "openingHours" TEXT,
    "features" TEXT,
    "amenities" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "discountRate" DOUBLE PRECISION,
    "partnerTypeId" TEXT,
    "pendingChanges" JSONB,
    "pendingChangesAt" TIMESTAMP(3),
    "categories" TEXT[],
    "assignedAdminId" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "requestStatus" "PartnerRequestStatus",
    "onboardingCompletedAt" TIMESTAMP(3),
    "requestObjectCount" "PartnerVenueCountBucket",
    "hasRiskFlag" BOOLEAN NOT NULL DEFAULT false,
    "statusReason" TEXT,
    "participationLevel" TEXT,
    "acceptPrivacy" BOOLEAN DEFAULT false,
    "additionalInfo" TEXT,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCashbackPayment" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "totalCashbackOwed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "notes" TEXT,
    "status" "CashbackPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "marginAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractedRate" DOUBLE PRECISION,
    "turnoverAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceNumber" TEXT,

    CONSTRAINT "PartnerCashbackPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivationLink" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailError" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "reason" "ActivationLinkReason" NOT NULL DEFAULT 'INITIAL',

    CONSTRAINT "ActivationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkResendLog" (
    "id" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkResendLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerStatusChange" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "fromStatus" "PartnerStatus" NOT NULL,
    "toStatus" "PartnerStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerRequestNote" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerRequestNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBg" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "email" TEXT,
    "description" TEXT,
    "descriptionBg" TEXT,
    "images" TEXT,
    "openingHours" TEXT,
    "capacity" INTEGER,
    "features" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "menuImages" TEXT,
    "menuRejectionReason" TEXT,
    "menuReviewedAt" TIMESTAMP(3),
    "menuReviewedBy" TEXT,
    "menuStatus" "MenuStatus" NOT NULL DEFAULT 'NONE',
    "menuSubmittedAt" TIMESTAMP(3),
    "menuUrl" TEXT,
    "pendingMenuUrl" TEXT,
    "venueStatus" "VenueStatus" NOT NULL DEFAULT 'ACTIVE',
    "venueStatusAt" TIMESTAMP(3),
    "venueStatusNote" TEXT,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueStatusHistory" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "fromStatus" "VenueStatus" NOT NULL,
    "toStatus" "VenueStatus" NOT NULL,
    "note" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBg" TEXT,
    "description" TEXT,
    "descriptionBg" TEXT,
    "maxDiscountRate" DOUBLE PRECISION NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTypeAccess" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "partnerTypeId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canRedeem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlanTypeAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleBg" TEXT,
    "description" TEXT NOT NULL,
    "descriptionBg" TEXT,
    "type" "OfferType" NOT NULL,
    "discountPercent" DOUBLE PRECISION,
    "discountAmount" DOUBLE PRECISION,
    "cashbackPercent" DOUBLE PRECISION,
    "pointsMultiplier" DOUBLE PRECISION,
    "minPurchase" DOUBLE PRECISION,
    "maxDiscount" DOUBLE PRECISION,
    "termsConditions" TEXT,
    "termsConditionsBg" TEXT,
    "image" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredOrder" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tags" TEXT,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferRedemption" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "displayNameBg" TEXT,
    "priceWeeklyEur" INTEGER,
    "priceMonthlyEur" INTEGER,
    "priceYearlyEur" INTEGER NOT NULL,
    "cashbackRate" DOUBLE PRECISION NOT NULL,
    "stickerBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "features" TEXT,
    "featuresBg" TEXT,
    "cardType" TEXT NOT NULL DEFAULT 'silver',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "badgeText" TEXT,
    "badgeTextBg" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "hasWeeklyOption" BOOLEAN NOT NULL DEFAULT false,
    "hasMonthlyOption" BOOLEAN NOT NULL DEFAULT true,
    "hasYearlyOption" BOOLEAN NOT NULL DEFAULT true,
    "yearlyDiscountPct" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT,
    "venueId" TEXT,
    "offerId" TEXT,
    "bookingId" TEXT,
    "cardId" TEXT,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION,
    "discountAmount" DOUBLE PRECISION,
    "finalAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'BGN',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentIntentId" TEXT,
    "stripePaymentId" TEXT,
    "description" TEXT,
    "descriptionBg" TEXT,
    "metadata" TEXT,
    "loyaltyPoints" INTEGER,
    "cashbackAmount" DOUBLE PRECISION,
    "processingFee" DOUBLE PRECISION,
    "netAmount" DOUBLE PRECISION,
    "refundedAmount" DOUBLE PRECISION,
    "refundedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "riskScore" INTEGER,
    "marginAmount" DOUBLE PRECISION,
    "subscriptionId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "availableBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "pendingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "currency" TEXT NOT NULL DEFAULT 'BGN',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedReason" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "payoutIban" TEXT,
    "payoutBeneficiaryName" TEXT,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceBefore" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BGN',
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "metadata" TEXT,
    "transactionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "receiptId" TEXT,
    "stickerScanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashbackExpiresAt" TIMESTAMP(3),
    "cashbackPaidAt" TIMESTAMP(3),
    "cashbackStatus" "CashbackEntryStatus",
    "clearedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "voidedReason" TEXT,
    "lockedAt" TIMESTAMP(3),
    "payoutIbanSnapshot" TEXT,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "stripeCustomerId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "payseraOrderId" TEXT,
    "planId" TEXT,
    "autoRenewal" BOOLEAN NOT NULL DEFAULT true,
    "retryAttempt" INTEGER NOT NULL DEFAULT 0,
    "trialRefundEligibleUntil" TIMESTAMP(3),
    "trialRefundUsed" BOOLEAN NOT NULL DEFAULT false,
    "lastRenewalReminderSentAt" TIMESTAMP(3),
    "failedPaymentAt" TIMESTAMP(3),
    "renewalRemindersSent" INTEGER NOT NULL DEFAULT 0,
    "failedPaymentClearedAt" TIMESTAMP(3),
    "pauseEndsAt" TIMESTAMP(3),

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripePaymentMethodId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "last4" TEXT,
    "brand" TEXT,
    "expiryMonth" INTEGER,
    "expiryYear" INTEGER,
    "funding" TEXT,
    "bankName" TEXT,
    "accountLast4" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "billingDetails" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT,
    "venueId" TEXT,
    "offerId" TEXT,
    "cardId" TEXT,
    "imageUrl" TEXT,
    "imageKey" TEXT,
    "imageHash" TEXT,
    "ocrRawText" TEXT,
    "ocrData" TEXT,
    "merchantName" TEXT,
    "totalAmount" DOUBLE PRECISION,
    "verifiedAmount" DOUBLE PRECISION,
    "receiptDate" TIMESTAMP(3),
    "items" TEXT,
    "cashbackPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashbackAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ocrConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fraudScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fraudReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "submissionCount" INTEGER NOT NULL DEFAULT 1,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "rejectionReason" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "perceptualHash" TEXT,
    "deviceFingerprint" TEXT,
    "deviceFingerprintRaw" TEXT,
    "stickerScanId" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptUploadToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "perceptualHash" TEXT,
    "livePhotoOk" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "ReceiptUploadToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptAnalytics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalReceipts" INTEGER NOT NULL DEFAULT 0,
    "approvedReceipts" INTEGER NOT NULL DEFAULT 0,
    "rejectedReceipts" INTEGER NOT NULL DEFAULT 0,
    "pendingReceipts" INTEGER NOT NULL DEFAULT 0,
    "totalCashback" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageReceiptAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topMerchant" TEXT,
    "lastReceiptDate" TIMESTAMP(3),
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantWhitelist" (
    "id" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "nameBg" TEXT,
    "taxId" TEXT,
    "status" "WhitelistStatus" NOT NULL DEFAULT 'APPROVED',
    "addedBy" TEXT,
    "reason" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueFraudConfig" (
    "id" TEXT NOT NULL,
    "venueId" TEXT,
    "partnerId" TEXT,
    "cashbackPercent" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "premiumBonus" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "platinumBonus" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "minBillAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxCashbackPerScan" DOUBLE PRECISION,
    "maxScansPerDay" INTEGER NOT NULL DEFAULT 999999,
    "maxScansPerMonth" INTEGER NOT NULL DEFAULT 999999,
    "gpsVerificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gpsRadiusMeters" INTEGER NOT NULL DEFAULT 100,
    "ocrVerificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveThreshold" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "autoRejectThreshold" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateMatchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "templateVisualWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "templateMerchantWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "templateKeywordWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "templateMinSimilarity" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "templateFraudPoints" INTEGER NOT NULL DEFAULT 20,
    "templateMerchantThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "maxBillAmount" DOUBLE PRECISION,

    CONSTRAINT "VenueFraudConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueReceiptTemplate" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "perceptualHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expectedKeywords" TEXT[],
    "merchantNameVariations" TEXT[],

    CONSTRAINT "VenueReceiptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT,
    "userId" TEXT NOT NULL,
    "assignedTo" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "decision" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subjectId" TEXT,
    "subjectType" "DisputeSubjectType" NOT NULL DEFAULT 'RECEIPT',
    "ticketId" TEXT,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeNote" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "LoyaltyTier" NOT NULL DEFAULT 'BRONZE',
    "points" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "tierProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashbackBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nextTierPoints" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT,
    "descriptionBg" TEXT,
    "metadata" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleBg" TEXT,
    "description" TEXT NOT NULL,
    "descriptionBg" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "cashValue" DOUBLE PRECISION,
    "category" TEXT NOT NULL,
    "image" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stockQuantity" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRedemption" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "pointsSpent" INTEGER NOT NULL,
    "code" TEXT,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBg" TEXT,
    "description" TEXT NOT NULL,
    "descriptionBg" TEXT,
    "icon" TEXT,
    "category" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "venueId" TEXT,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "bookingTime" TEXT NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "specialRequests" TEXT,
    "specialRequestsBg" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "confirmationCode" TEXT,
    "notes" TEXT,
    "notesInternal" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT,
    "images" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "helpful" INTEGER NOT NULL DEFAULT 0,
    "notHelpful" INTEGER NOT NULL DEFAULT 0,
    "adminResponse" TEXT,
    "adminRespondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'DIRECT',
    "title" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "attachments" TEXT,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "titleBg" TEXT,
    "message" TEXT NOT NULL,
    "messageBg" TEXT,
    "data" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionText" TEXT,
    "actionTextBg" TEXT,
    "actionUrl" TEXT,
    "archivedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "imageUrl" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "relatedEntityId" TEXT,
    "relatedEntityType" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT,
    "offerId" TEXT,
    "venueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entityId" TEXT,
    "entityKind" TEXT,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "type" "CardType" NOT NULL DEFAULT 'PREMIUM_WEEKLY',
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "qrCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "stickerId" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "locationType" "LocationType" NOT NULL DEFAULT 'TABLE',
    "status" "StickerStatus" NOT NULL DEFAULT 'ACTIVE',
    "printedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "totalScans" INTEGER NOT NULL DEFAULT 0,
    "lastScannedAt" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "replacesId" TEXT,
    "autoDeactivatedAt" TIMESTAMP(3),

    CONSTRAINT "Sticker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StickerLocation" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBg" TEXT,
    "locationType" "LocationType" NOT NULL DEFAULT 'TABLE',
    "locationNumber" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "floor" TEXT,
    "section" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StickerScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stickerId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "billAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verifiedAmount" DOUBLE PRECISION,
    "cashbackPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashbackAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ScanStatus" NOT NULL DEFAULT 'SESSION_ACTIVE',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "distance" DOUBLE PRECISION,
    "receiptImageUrl" TEXT,
    "ocrData" TEXT,
    "fraudScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fraudReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "transactionId" TEXT,
    "rejectionReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionStartedAt" TIMESTAMP(3),
    "receiptImageHash" TEXT,
    "deviceFingerprint" TEXT,
    "deviceFingerprintRaw" TEXT,
    "specRiskLevel" TEXT,

    CONSTRAINT "StickerScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueStickerConfig" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "cashbackPercent" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "premiumBonus" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "platinumBonus" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "minBillAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxCashbackPerScan" DOUBLE PRECISION,
    "maxScansPerDay" INTEGER NOT NULL DEFAULT 999999,
    "maxScansPerMonth" INTEGER NOT NULL DEFAULT 999999,
    "gpsVerificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gpsRadiusMeters" INTEGER NOT NULL DEFAULT 100,
    "ocrVerificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveThreshold" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueStickerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_rates" (
    "id" TEXT NOT NULL,
    "discountStep" INTEGER NOT NULL,
    "basic" DOUBLE PRECISION NOT NULL,
    "premium" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_thresholds" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "minAmount" DOUBLE PRECISION NOT NULL,
    "createdBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT,

    CONSTRAINT "payout_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL,
    "key" "AdminRoleKey" NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "allow" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAdminRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "UserAdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "allow" BOOLEAN NOT NULL,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "system_setting_history" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "changedBy" TEXT,
    "changedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "system_setting_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpTicket" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "category" "TicketCategory" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "userId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "externalEmail" TEXT,
    "linkedTicketId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "rootMessageId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "resolvedAt" TIMESTAMP(3),
    "shortRef" TEXT,
    "partnerId" TEXT,
    "requestType" "TicketRequestType" NOT NULL DEFAULT 'SUPPORT',

    CONSTRAINT "HelpTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketReply" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    "externalFrom" TEXT,
    "inReplyTo" TEXT,
    "isAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "messageId" TEXT,

    CONSTRAINT "TicketReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCC" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketCC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MarketingChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "bodyEn" TEXT,
    "subjectEn" TEXT,

    CONSTRAINT "MarketingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MarketingListType" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncKey" TEXT,

    CONSTRAINT "MarketingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MarketingChannel" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "openRate" DOUBLE PRECISION,
    "clickRate" DOUBLE PRECISION,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listId" TEXT,
    "scheduledAt" TIMESTAMP(3),

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingListMember" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "partnerId" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memberType" TEXT NOT NULL DEFAULT 'PARTNER',
    "userId" TEXT,

    CONSTRAINT "MarketingListMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAutomation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingSubscription" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "payseraOrderId" TEXT,
    "status" "PendingSubscriptionStatus" NOT NULL DEFAULT 'CREATED',
    "token" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "billingPeriod" TEXT,
    "language" TEXT,

    CONSTRAINT "PendingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingPeriod" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "ReportingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "invoicedAt" TIMESTAMP(3),
    "invoicedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "openedAt" TIMESTAMP(3),
    "openedBy" TEXT,

    CONSTRAINT "ReportingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudRule" (
    "id" TEXT NOT NULL,
    "tier" "FraudRuleTier" NOT NULL,
    "targetId" TEXT,
    "dailyScanLimit" INTEGER,
    "minTransactionValue" DOUBLE PRECISION,
    "maxTransactionValue" DOUBLE PRECISION,
    "autoApproveThreshold" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudRuleOverride" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "override" JSONB NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudRuleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_error_logs" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "errorType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrphanInboundEmail" (
    "id" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "messageId" TEXT,
    "rawPayload" JSONB,
    "reason" TEXT NOT NULL DEFAULT 'NO_ADMIN',
    "replayedAt" TIMESTAMP(3),
    "replayedTicketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrphanInboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundBounce" (
    "id" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT,
    "subject" TEXT,
    "messageId" TEXT,
    "ticketId" TEXT,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundBounce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connected_integrations" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "credentials" TEXT,
    "settings" JSONB,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connected_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerApplication" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "venueCount" INTEGER NOT NULL,
    "participationLevel" TEXT NOT NULL,
    "additionalText" TEXT,
    "termsConsent" BOOLEAN NOT NULL DEFAULT false,
    "privacyConsent" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'NEW',
    "assignedAdminId" TEXT,
    "internalNotes" TEXT,
    "history" JSONB,
    "partnerId" TEXT,

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewVote" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_pendingEmailToken_key" ON "User"("pendingEmailToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailUnsubscribeToken_key" ON "User"("emailUnsubscribeToken");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_role_key" ON "User"("email", "role");

-- CreateIndex
CREATE UNIQUE INDEX "pending_super_admin_requests_email_key" ON "pending_super_admin_requests"("email");

-- CreateIndex
CREATE INDEX "pending_super_admin_requests_requestedById_idx" ON "pending_super_admin_requests"("requestedById");

-- CreateIndex
CREATE INDEX "pending_super_admin_requests_expiresAt_idx" ON "pending_super_admin_requests"("expiresAt");

-- CreateIndex
CREATE INDEX "pending_super_admin_requests_status_idx" ON "pending_super_admin_requests"("status");

-- CreateIndex
CREATE INDEX "critical_action_requests_status_idx" ON "critical_action_requests"("status");

-- CreateIndex
CREATE INDEX "critical_action_requests_requestedById_idx" ON "critical_action_requests"("requestedById");

-- CreateIndex
CREATE INDEX "critical_action_requests_createdAt_idx" ON "critical_action_requests"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_accountGroup_gin" ON "RefreshToken" USING GIN ("accountGroup");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_userId_key" ON "Partner"("userId");

-- CreateIndex
CREATE INDEX "Partner_category_idx" ON "Partner"("category");

-- CreateIndex
CREATE INDEX "Partner_partnerTypeId_idx" ON "Partner"("partnerTypeId");

-- CreateIndex
CREATE INDEX "Partner_status_idx" ON "Partner"("status");

-- CreateIndex
CREATE INDEX "Partner_city_idx" ON "Partner"("city");

-- CreateIndex
CREATE INDEX "Partner_hasRiskFlag_idx" ON "Partner"("hasRiskFlag");

-- CreateIndex
CREATE INDEX "Partner_status_category_city_idx" ON "Partner"("status", "category", "city");

-- CreateIndex
CREATE INDEX "Partner_categories_gin" ON "Partner" USING GIN ("categories");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCashbackPayment_invoiceNumber_key" ON "PartnerCashbackPayment"("invoiceNumber");

-- CreateIndex
CREATE INDEX "PartnerCashbackPayment_status_idx" ON "PartnerCashbackPayment"("status");

-- CreateIndex
CREATE INDEX "PartnerCashbackPayment_month_idx" ON "PartnerCashbackPayment"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCashbackPayment_partnerId_month_key" ON "PartnerCashbackPayment"("partnerId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ActivationLink_token_key" ON "ActivationLink"("token");

-- CreateIndex
CREATE INDEX "ActivationLink_partnerId_idx" ON "ActivationLink"("partnerId");

-- CreateIndex
CREATE INDEX "ActivationLink_expiresAt_idx" ON "ActivationLink"("expiresAt");

-- CreateIndex
CREATE INDEX "LinkResendLog_linkType_subjectId_idx" ON "LinkResendLog"("linkType", "subjectId");

-- CreateIndex
CREATE INDEX "LinkResendLog_createdAt_idx" ON "LinkResendLog"("createdAt");

-- CreateIndex
CREATE INDEX "PartnerStatusChange_partnerId_idx" ON "PartnerStatusChange"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerStatusChange_partnerId_createdAt_idx" ON "PartnerStatusChange"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerStatusChange_changedById_idx" ON "PartnerStatusChange"("changedById");

-- CreateIndex
CREATE INDEX "PartnerRequestNote_partnerId_idx" ON "PartnerRequestNote"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerRequestNote_createdAt_idx" ON "PartnerRequestNote"("createdAt");

-- CreateIndex
CREATE INDEX "Venue_partnerId_idx" ON "Venue"("partnerId");

-- CreateIndex
CREATE INDEX "Venue_city_idx" ON "Venue"("city");

-- CreateIndex
CREATE INDEX "Venue_menuStatus_idx" ON "Venue"("menuStatus");

-- CreateIndex
CREATE INDEX "Venue_venueStatus_idx" ON "Venue"("venueStatus");

-- CreateIndex
CREATE INDEX "VenueStatusHistory_venueId_idx" ON "VenueStatusHistory"("venueId");

-- CreateIndex
CREATE INDEX "VenueStatusHistory_venueId_createdAt_idx" ON "VenueStatusHistory"("venueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerType_name_key" ON "PartnerType"("name");

-- CreateIndex
CREATE INDEX "PartnerType_isActive_idx" ON "PartnerType"("isActive");

-- CreateIndex
CREATE INDEX "PartnerType_sortOrder_idx" ON "PartnerType"("sortOrder");

-- CreateIndex
CREATE INDEX "PlanTypeAccess_plan_idx" ON "PlanTypeAccess"("plan");

-- CreateIndex
CREATE INDEX "PlanTypeAccess_partnerTypeId_idx" ON "PlanTypeAccess"("partnerTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanTypeAccess_plan_partnerTypeId_key" ON "PlanTypeAccess"("plan", "partnerTypeId");

-- CreateIndex
CREATE INDEX "Offer_partnerId_idx" ON "Offer"("partnerId");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- CreateIndex
CREATE INDEX "Offer_isFeatured_idx" ON "Offer"("isFeatured");

-- CreateIndex
CREATE INDEX "Offer_startDate_idx" ON "Offer"("startDate");

-- CreateIndex
CREATE INDEX "Offer_endDate_idx" ON "Offer"("endDate");

-- CreateIndex
CREATE INDEX "Offer_status_isFeatured_startDate_endDate_idx" ON "Offer"("status", "isFeatured", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "OfferRedemption_code_key" ON "OfferRedemption"("code");

-- CreateIndex
CREATE INDEX "OfferRedemption_offerId_idx" ON "OfferRedemption"("offerId");

-- CreateIndex
CREATE INDEX "OfferRedemption_userId_idx" ON "OfferRedemption"("userId");

-- CreateIndex
CREATE INDEX "OfferRedemption_expiresAt_idx" ON "OfferRedemption"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfferRedemption_userId_offerId_key" ON "OfferRedemption"("userId", "offerId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_planCode_key" ON "plans"("planCode");

-- CreateIndex
CREATE INDEX "plans_planCode_idx" ON "plans"("planCode");

-- CreateIndex
CREATE INDEX "plans_isActive_idx" ON "plans"("isActive");

-- CreateIndex
CREATE INDEX "plans_displayOrder_idx" ON "plans"("displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_stripePaymentId_key" ON "Transaction"("stripePaymentId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_subscriptionId_idx" ON "Transaction"("subscriptionId");

-- CreateIndex
CREATE INDEX "Transaction_partnerId_idx" ON "Transaction"("partnerId");

-- CreateIndex
CREATE INDEX "Transaction_venueId_idx" ON "Transaction"("venueId");

-- CreateIndex
CREATE INDEX "Transaction_cardId_idx" ON "Transaction"("cardId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_transactionId_key" ON "wallet_transactions"("transactionId");

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_idx" ON "wallet_transactions"("walletId");

-- CreateIndex
CREATE INDEX "wallet_transactions_type_idx" ON "wallet_transactions"("type");

-- CreateIndex
CREATE INDEX "wallet_transactions_status_idx" ON "wallet_transactions"("status");

-- CreateIndex
CREATE INDEX "wallet_transactions_createdAt_idx" ON "wallet_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "wallet_transactions_cashbackExpiresAt_idx" ON "wallet_transactions"("cashbackExpiresAt");

-- CreateIndex
CREATE INDEX "wallet_transactions_stripePaymentIntentId_idx" ON "wallet_transactions"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "wallet_transactions_cashbackStatus_idx" ON "wallet_transactions"("cashbackStatus");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_payseraOrderId_key" ON "subscriptions"("payseraOrderId");

-- CreateIndex
CREATE INDEX "subscriptions_userId_idx" ON "subscriptions"("userId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions"("plan");

-- CreateIndex
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");

-- CreateIndex
CREATE INDEX "subscriptions_payseraOrderId_idx" ON "subscriptions"("payseraOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_stripePaymentMethodId_key" ON "payment_methods"("stripePaymentMethodId");

-- CreateIndex
CREATE INDEX "payment_methods_userId_idx" ON "payment_methods"("userId");

-- CreateIndex
CREATE INDEX "payment_methods_isDefault_idx" ON "payment_methods"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_transactionId_key" ON "Receipt"("transactionId");

-- CreateIndex
CREATE INDEX "Receipt_userId_idx" ON "Receipt"("userId");

-- CreateIndex
CREATE INDEX "Receipt_venueId_idx" ON "Receipt"("venueId");

-- CreateIndex
CREATE INDEX "Receipt_status_idx" ON "Receipt"("status");

-- CreateIndex
CREATE INDEX "Receipt_imageHash_idx" ON "Receipt"("imageHash");

-- CreateIndex
CREATE INDEX "Receipt_perceptualHash_idx" ON "Receipt"("perceptualHash");

-- CreateIndex
CREATE INDEX "Receipt_createdAt_idx" ON "Receipt"("createdAt");

-- CreateIndex
CREATE INDEX "Receipt_merchantName_idx" ON "Receipt"("merchantName");

-- CreateIndex
CREATE INDEX "Receipt_fraudScore_idx" ON "Receipt"("fraudScore");

-- CreateIndex
CREATE INDEX "Receipt_userId_deviceFingerprint_idx" ON "Receipt"("userId", "deviceFingerprint");

-- CreateIndex
CREATE INDEX "Receipt_userId_perceptualHash_idx" ON "Receipt"("userId", "perceptualHash");

-- CreateIndex
CREATE INDEX "Receipt_userId_createdAt_idx" ON "Receipt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_stickerScanId_idx" ON "Receipt"("stickerScanId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptUploadToken_token_key" ON "ReceiptUploadToken"("token");

-- CreateIndex
CREATE INDEX "ReceiptUploadToken_userId_idx" ON "ReceiptUploadToken"("userId");

-- CreateIndex
CREATE INDEX "ReceiptUploadToken_expiresAt_idx" ON "ReceiptUploadToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptAnalytics_userId_key" ON "ReceiptAnalytics"("userId");

-- CreateIndex
CREATE INDEX "ReceiptAnalytics_userId_idx" ON "ReceiptAnalytics"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantWhitelist_merchantName_key" ON "MerchantWhitelist"("merchantName");

-- CreateIndex
CREATE INDEX "MerchantWhitelist_status_idx" ON "MerchantWhitelist"("status");

-- CreateIndex
CREATE INDEX "MerchantWhitelist_merchantName_idx" ON "MerchantWhitelist"("merchantName");

-- CreateIndex
CREATE UNIQUE INDEX "VenueFraudConfig_venueId_key" ON "VenueFraudConfig"("venueId");

-- CreateIndex
CREATE INDEX "VenueFraudConfig_venueId_idx" ON "VenueFraudConfig"("venueId");

-- CreateIndex
CREATE INDEX "VenueFraudConfig_partnerId_idx" ON "VenueFraudConfig"("partnerId");

-- CreateIndex
CREATE INDEX "VenueReceiptTemplate_venueId_idx" ON "VenueReceiptTemplate"("venueId");

-- CreateIndex
CREATE INDEX "VenueReceiptTemplate_venueId_isActive_idx" ON "VenueReceiptTemplate"("venueId", "isActive");

-- CreateIndex
CREATE INDEX "Dispute_receiptId_idx" ON "Dispute"("receiptId");

-- CreateIndex
CREATE INDEX "Dispute_userId_idx" ON "Dispute"("userId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_subjectType_idx" ON "Dispute"("subjectType");

-- CreateIndex
CREATE INDEX "Dispute_ticketId_idx" ON "Dispute"("ticketId");

-- CreateIndex
CREATE INDEX "DisputeNote_disputeId_idx" ON "DisputeNote"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_userId_key" ON "LoyaltyAccount"("userId");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_userId_idx" ON "LoyaltyAccount"("userId");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_tier_idx" ON "LoyaltyAccount"("tier");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_accountId_idx" ON "LoyaltyTransaction"("accountId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_createdAt_idx" ON "LoyaltyTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "Reward_category_idx" ON "Reward"("category");

-- CreateIndex
CREATE INDEX "Reward_isActive_idx" ON "Reward"("isActive");

-- CreateIndex
CREATE INDEX "RewardRedemption_accountId_idx" ON "RewardRedemption"("accountId");

-- CreateIndex
CREATE INDEX "RewardRedemption_rewardId_idx" ON "RewardRedemption"("rewardId");

-- CreateIndex
CREATE INDEX "RewardRedemption_status_idx" ON "RewardRedemption"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");

-- CreateIndex
CREATE INDEX "Badge_category_idx" ON "Badge"("category");

-- CreateIndex
CREATE INDEX "UserBadge_accountId_idx" ON "UserBadge"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_accountId_badgeId_key" ON "UserBadge"("accountId", "badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_confirmationCode_key" ON "Booking"("confirmationCode");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "Booking_partnerId_idx" ON "Booking"("partnerId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_bookingDate_idx" ON "Booking"("bookingDate");

-- CreateIndex
CREATE INDEX "Review_userId_idx" ON "Review"("userId");

-- CreateIndex
CREATE INDEX "Review_partnerId_idx" ON "Review"("partnerId");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- CreateIndex
CREATE INDEX "Review_rating_idx" ON "Review"("rating");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_idx" ON "ConversationParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_userId_idx" ON "Message"("userId");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_archivedAt_idx" ON "Notification"("archivedAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_partnerId_key" ON "Favorite"("userId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_entityKind_entityId_key" ON "Favorite"("userId", "entityKind", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_cardNumber_key" ON "Card"("cardNumber");

-- CreateIndex
CREATE INDEX "Card_userId_idx" ON "Card"("userId");

-- CreateIndex
CREATE INDEX "Card_cardNumber_idx" ON "Card"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Sticker_stickerId_key" ON "Sticker"("stickerId");

-- CreateIndex
CREATE UNIQUE INDEX "Sticker_qrCode_key" ON "Sticker"("qrCode");

-- CreateIndex
CREATE INDEX "Sticker_venueId_idx" ON "Sticker"("venueId");

-- CreateIndex
CREATE INDEX "Sticker_locationId_idx" ON "Sticker"("locationId");

-- CreateIndex
CREATE INDEX "Sticker_stickerId_idx" ON "Sticker"("stickerId");

-- CreateIndex
CREATE INDEX "Sticker_status_idx" ON "Sticker"("status");

-- CreateIndex
CREATE INDEX "Sticker_autoDeactivatedAt_idx" ON "Sticker"("autoDeactivatedAt");

-- CreateIndex
CREATE INDEX "StickerLocation_venueId_idx" ON "StickerLocation"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "StickerLocation_venueId_locationNumber_locationType_key" ON "StickerLocation"("venueId", "locationNumber", "locationType");

-- CreateIndex
CREATE UNIQUE INDEX "StickerScan_transactionId_key" ON "StickerScan"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "StickerScan_receiptImageHash_key" ON "StickerScan"("receiptImageHash");

-- CreateIndex
CREATE INDEX "StickerScan_userId_idx" ON "StickerScan"("userId");

-- CreateIndex
CREATE INDEX "StickerScan_stickerId_idx" ON "StickerScan"("stickerId");

-- CreateIndex
CREATE INDEX "StickerScan_venueId_idx" ON "StickerScan"("venueId");

-- CreateIndex
CREATE INDEX "StickerScan_cardId_idx" ON "StickerScan"("cardId");

-- CreateIndex
CREATE INDEX "StickerScan_status_idx" ON "StickerScan"("status");

-- CreateIndex
CREATE INDEX "StickerScan_createdAt_idx" ON "StickerScan"("createdAt");

-- CreateIndex
CREATE INDEX "StickerScan_userId_deviceFingerprint_idx" ON "StickerScan"("userId", "deviceFingerprint");

-- CreateIndex
CREATE INDEX "StickerScan_specRiskLevel_idx" ON "StickerScan"("specRiskLevel");

-- CreateIndex
CREATE UNIQUE INDEX "VenueStickerConfig_venueId_key" ON "VenueStickerConfig"("venueId");

-- CreateIndex
CREATE INDEX "VenueStickerConfig_venueId_idx" ON "VenueStickerConfig"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- CreateIndex
CREATE INDEX "PushToken_token_idx" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_isActive_idx" ON "PushToken"("isActive");

-- CreateIndex
CREATE INDEX "cashback_rates_discountStep_idx" ON "cashback_rates"("discountStep");

-- CreateIndex
CREATE INDEX "cashback_rates_effectiveFrom_idx" ON "cashback_rates"("effectiveFrom");

-- CreateIndex
CREATE INDEX "payout_thresholds_plan_idx" ON "payout_thresholds"("plan");

-- CreateIndex
CREATE INDEX "payout_thresholds_createdAt_idx" ON "payout_thresholds"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_key_key" ON "AdminRole"("key");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "UserAdminRole_userId_idx" ON "UserAdminRole"("userId");

-- CreateIndex
CREATE INDEX "UserAdminRole_expiresAt_idx" ON "UserAdminRole"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserAdminRole_userId_roleId_key" ON "UserAdminRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_userId_idx" ON "UserPermissionOverride"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionOverride_userId_permissionId_key" ON "UserPermissionOverride"("userId", "permissionId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_objectType_objectId_idx" ON "AuditLog"("objectType", "objectId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "system_setting_history_key_idx" ON "system_setting_history"("key");

-- CreateIndex
CREATE INDEX "system_setting_history_createdAt_idx" ON "system_setting_history"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HelpTicket_rootMessageId_unique" ON "HelpTicket"("rootMessageId") WHERE ("rootMessageId" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "HelpTicket_shortRef_key" ON "HelpTicket"("shortRef");

-- CreateIndex
CREATE INDEX "HelpTicket_userId_idx" ON "HelpTicket"("userId");

-- CreateIndex
CREATE INDEX "HelpTicket_assigneeId_idx" ON "HelpTicket"("assigneeId");

-- CreateIndex
CREATE INDEX "HelpTicket_partnerId_idx" ON "HelpTicket"("partnerId");

-- CreateIndex
CREATE INDEX "HelpTicket_status_idx" ON "HelpTicket"("status");

-- CreateIndex
CREATE INDEX "HelpTicket_createdAt_idx" ON "HelpTicket"("createdAt");

-- CreateIndex
CREATE INDEX "HelpTicket_requestType_idx" ON "HelpTicket"("requestType");

-- CreateIndex
CREATE INDEX "HelpTicket_source_idx" ON "HelpTicket"("source");

-- CreateIndex
CREATE INDEX "HelpTicket_rootMessageId_idx" ON "HelpTicket"("rootMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketReply_messageId_key" ON "TicketReply"("messageId");

-- CreateIndex
CREATE INDEX "TicketReply_ticketId_idx" ON "TicketReply"("ticketId");

-- CreateIndex
CREATE INDEX "TicketReply_inReplyTo_idx" ON "TicketReply"("inReplyTo");

-- CreateIndex
CREATE INDEX "TicketCC_ticketId_idx" ON "TicketCC"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCC_ticketId_email_key" ON "TicketCC"("ticketId", "email");

-- CreateIndex
CREATE INDEX "MarketingTemplate_type_idx" ON "MarketingTemplate"("type");

-- CreateIndex
CREATE INDEX "MarketingTemplate_createdAt_idx" ON "MarketingTemplate"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingList_syncKey_key" ON "MarketingList"("syncKey");

-- CreateIndex
CREATE INDEX "MarketingList_type_idx" ON "MarketingList"("type");

-- CreateIndex
CREATE INDEX "MarketingList_createdAt_idx" ON "MarketingList"("createdAt");

-- CreateIndex
CREATE INDEX "MarketingCampaign_status_idx" ON "MarketingCampaign"("status");

-- CreateIndex
CREATE INDEX "MarketingCampaign_type_idx" ON "MarketingCampaign"("type");

-- CreateIndex
CREATE INDEX "MarketingCampaign_listId_idx" ON "MarketingCampaign"("listId");

-- CreateIndex
CREATE INDEX "MarketingCampaign_createdAt_idx" ON "MarketingCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "MarketingListMember_listId_idx" ON "MarketingListMember"("listId");

-- CreateIndex
CREATE INDEX "MarketingListMember_partnerId_idx" ON "MarketingListMember"("partnerId");

-- CreateIndex
CREATE INDEX "MarketingListMember_userId_idx" ON "MarketingListMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingListMember_listId_partnerId_key" ON "MarketingListMember"("listId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingListMember_listId_userId_key" ON "MarketingListMember"("listId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingAutomation_trigger_key" ON "MarketingAutomation"("trigger");

-- CreateIndex
CREATE INDEX "MarketingAutomation_status_idx" ON "MarketingAutomation"("status");

-- CreateIndex
CREATE INDEX "MarketingAutomation_createdAt_idx" ON "MarketingAutomation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSubscription_payseraOrderId_key" ON "PendingSubscription"("payseraOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSubscription_token_key" ON "PendingSubscription"("token");

-- CreateIndex
CREATE INDEX "PendingSubscription_email_idx" ON "PendingSubscription"("email");

-- CreateIndex
CREATE INDEX "PendingSubscription_status_idx" ON "PendingSubscription"("status");

-- CreateIndex
CREATE INDEX "PendingSubscription_expiresAt_idx" ON "PendingSubscription"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginHistory_userId_idx" ON "LoginHistory"("userId");

-- CreateIndex
CREATE INDEX "LoginHistory_createdAt_idx" ON "LoginHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingPeriod_month_key" ON "ReportingPeriod"("month");

-- CreateIndex
CREATE INDEX "ReportingPeriod_status_idx" ON "ReportingPeriod"("status");

-- CreateIndex
CREATE INDEX "ReportingPeriod_month_idx" ON "ReportingPeriod"("month");

-- CreateIndex
CREATE INDEX "FraudRule_tier_idx" ON "FraudRule"("tier");

-- CreateIndex
CREATE INDEX "FraudRule_targetId_idx" ON "FraudRule"("targetId");

-- CreateIndex
CREATE INDEX "FraudRule_isActive_idx" ON "FraudRule"("isActive");

-- CreateIndex
CREATE INDEX "FraudRuleOverride_ruleId_idx" ON "FraudRuleOverride"("ruleId");

-- CreateIndex
CREATE INDEX "FraudRuleOverride_targetType_targetId_idx" ON "FraudRuleOverride"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "mobile_error_logs_createdAt_idx" ON "mobile_error_logs"("createdAt");

-- CreateIndex
CREATE INDEX "mobile_error_logs_platform_idx" ON "mobile_error_logs"("platform");

-- CreateIndex
CREATE INDEX "OrphanInboundEmail_createdAt_idx" ON "OrphanInboundEmail"("createdAt");

-- CreateIndex
CREATE INDEX "OrphanInboundEmail_replayedAt_idx" ON "OrphanInboundEmail"("replayedAt");

-- CreateIndex
CREATE INDEX "InboundBounce_fromEmail_idx" ON "InboundBounce"("fromEmail");

-- CreateIndex
CREATE INDEX "InboundBounce_ticketId_idx" ON "InboundBounce"("ticketId");

-- CreateIndex
CREATE INDEX "InboundBounce_createdAt_idx" ON "InboundBounce"("createdAt");

-- CreateIndex
CREATE INDEX "connected_integrations_partnerId_idx" ON "connected_integrations"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "connected_integrations_partnerId_integrationId_key" ON "connected_integrations"("partnerId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerApplication_partnerId_key" ON "PartnerApplication"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerApplication_assignedAdminId_idx" ON "PartnerApplication"("assignedAdminId");

-- CreateIndex
CREATE INDEX "PartnerApplication_createdAt_idx" ON "PartnerApplication"("createdAt");

-- CreateIndex
CREATE INDEX "PartnerApplication_email_idx" ON "PartnerApplication"("email");

-- CreateIndex
CREATE INDEX "PartnerApplication_status_idx" ON "PartnerApplication"("status");

-- CreateIndex
CREATE INDEX "ReviewVote_reviewId_idx" ON "ReviewVote"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewVote_reviewId_userId_key" ON "ReviewVote"("reviewId", "userId");

-- AddForeignKey
ALTER TABLE "pending_super_admin_requests" ADD CONSTRAINT "pending_super_admin_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_action_requests" ADD CONSTRAINT "critical_action_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_action_requests" ADD CONSTRAINT "critical_action_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_partnerTypeId_fkey" FOREIGN KEY ("partnerTypeId") REFERENCES "PartnerType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCashbackPayment" ADD CONSTRAINT "PartnerCashbackPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationLink" ADD CONSTRAINT "ActivationLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationLink" ADD CONSTRAINT "ActivationLink_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkResendLog" ADD CONSTRAINT "LinkResendLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerStatusChange" ADD CONSTRAINT "PartnerStatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerStatusChange" ADD CONSTRAINT "PartnerStatusChange_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRequestNote" ADD CONSTRAINT "PartnerRequestNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerRequestNote" ADD CONSTRAINT "PartnerRequestNote_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueStatusHistory" ADD CONSTRAINT "VenueStatusHistory_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTypeAccess" ADD CONSTRAINT "PlanTypeAccess_partnerTypeId_fkey" FOREIGN KEY ("partnerTypeId") REFERENCES "PartnerType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRedemption" ADD CONSTRAINT "OfferRedemption_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferRedemption" ADD CONSTRAINT "OfferRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_stickerScanId_fkey" FOREIGN KEY ("stickerScanId") REFERENCES "StickerScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_stickerScanId_fkey" FOREIGN KEY ("stickerScanId") REFERENCES "StickerScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptUploadToken" ADD CONSTRAINT "ReceiptUploadToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "HelpTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeNote" ADD CONSTRAINT "DisputeNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeNote" ADD CONSTRAINT "DisputeNote_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StickerLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "Sticker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticker" ADD CONSTRAINT "Sticker_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerLocation" ADD CONSTRAINT "StickerLocation_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerScan" ADD CONSTRAINT "StickerScan_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerScan" ADD CONSTRAINT "StickerScan_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "Sticker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerScan" ADD CONSTRAINT "StickerScan_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerScan" ADD CONSTRAINT "StickerScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StickerScan" ADD CONSTRAINT "StickerScan_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueStickerConfig" ADD CONSTRAINT "VenueStickerConfig_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAdminRole" ADD CONSTRAINT "UserAdminRole_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAdminRole" ADD CONSTRAINT "UserAdminRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAdminRole" ADD CONSTRAINT "UserAdminRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpTicket" ADD CONSTRAINT "HelpTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpTicket" ADD CONSTRAINT "HelpTicket_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "HelpTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpTicket" ADD CONSTRAINT "HelpTicket_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpTicket" ADD CONSTRAINT "HelpTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReply" ADD CONSTRAINT "TicketReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReply" ADD CONSTRAINT "TicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "HelpTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCC" ADD CONSTRAINT "TicketCC_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "HelpTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MarketingList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingListMember" ADD CONSTRAINT "MarketingListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MarketingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingListMember" ADD CONSTRAINT "MarketingListMember_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingListMember" ADD CONSTRAINT "MarketingListMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAutomation" ADD CONSTRAINT "MarketingAutomation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingSubscription" ADD CONSTRAINT "PendingSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudRuleOverride" ADD CONSTRAINT "FraudRuleOverride_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "FraudRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connected_integrations" ADD CONSTRAINT "connected_integrations_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplication" ADD CONSTRAINT "PartnerApplication_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplication" ADD CONSTRAINT "PartnerApplication_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

