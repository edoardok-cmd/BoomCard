import { Sticker, StickerScan, StickerLocation, VenueStickerConfig, ScanStatus, StickerStatus, LocationType, TransactionStatus, TransactionType, PaymentMethod, SubscriptionStatus, WalletTransactionType } from '@prisma/client';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { walletService } from './wallet.service';
import { notificationService } from './notification.service';
import { logger } from '../utils/logger';
import { partnerTypeService } from './partnerType.service';
import { fraudDetectionService } from './fraudDetection.service';
import { recognizeReceiptImage } from './ocr.service';
import { imageUploadService } from './imageUpload.service';
import { enqueueMerchantVerification } from '../queues/merchantVerification.queue';
import { cashbackLifecycleService } from './cashbackLifecycle.service';
import { writeAudit } from '../middleware/audit.middleware';

// ============================================
// Interfaces
// ============================================

export interface StickerQRData {
  type: 'BOOM_STICKER';
  venueId: string;
  locationId: string;
  stickerId: string; // Format: "BAR32-MASA04"
  locationType: LocationType;
  version: string;
}

export interface CreateStickerLocationData {
  venueId: string;
  name: string;
  nameBg?: string;
  locationType: LocationType;
  locationNumber: string;
  capacity?: number;
  floor?: string;
  section?: string;
  metadata?: any;
}

export interface CreateSessionData {
  userId: string;
  stickerId: string;
  cardId?: string; // Optional — resolved from userId when omitted
  latitude?: number;
  longitude?: number;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  deviceFingerprintRaw?: string;
  /**
   * venueId embedded in the QR payload. Required: must match the sticker's true
   * venueId (server-side cross-check; Finding #4). Clients that omit it are rejected.
   */
  payloadVenueId?: string;
  /**
   * version embedded in the QR payload. Required: major must be >= 1 (Finding #5).
   * Missing / non-numeric / < 1.0 is rejected so retired sticker formats can be cut off
   * server-side and not only in the mobile client.
   */
  payloadVersion?: string;
}

export interface ScanStickerData {
  userId: string;
  stickerId: string;
  cardId?: string; // Optional — resolved from userId when omitted
  billAmount: number;
  latitude?: number;
  longitude?: number;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  deviceFingerprintRaw?: string;
  /** If provided, complete an existing SESSION_ACTIVE session rather than creating a new scan. */
  sessionId?: string;
  /** Legacy one-call flow only: required here too so the legacy path can't bypass Finding #4/#5. */
  payloadVenueId?: string;
  payloadVersion?: string;
}

export interface UploadReceiptData {
  scanId: string;
  userId?: string;
  receiptImageUrl: string;
  /** SHA-256 of raw bytes. Required for duplicate rejection (Finding #6). */
  receiptImageHash?: string;
  imageKey?: string;
  ocrData?: {
    amount?: number;
    date?: string;
    merchantName?: string;
    items?: string[];
    total?: number;
    currency?: string;
    confidence?: number;
  };
  /**
   * Raw receipt bytes. When supplied, the service runs server-side OCR and compares
   * the extracted merchant name against the venue/partner names. Mismatches append
   * a MERCHANT_MISMATCH fraudReason and bump fraudScore — routes that need this
   * fraud gate MUST pass the buffer; client-supplied ocrData is untrusted.
   */
  imageBuffer?: Buffer;
}

/**
 * Normalize a merchant string for fuzzy matching: lowercase, strip punctuation,
 * collapse whitespace. Leaves Latin + Cyrillic + digits so Bulgarian names work.
 */
function normalizeMerchantString(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokens that appear on almost every Bulgarian receipt and carry no identity:
 * legal-entity suffixes (EOOD / OOD / AD / ET), generic venue-type words, and
 * very common filler. Without this list "KRISTAL EOOD" matches "Bar EOOD" with
 * score 1.0 even though they're unrelated businesses. Each entry is pre-normalized
 * (lowercase, Cyrillic where applicable).
 */
const MERCHANT_STOPWORDS = new Set<string>([
  // BG legal-entity suffixes (Latin + Cyrillic forms)
  'eood', 'ood', 'ad', 'et', 'ead', 'kd', 'sd',
  'еоод', 'оод', 'ад', 'ет', 'еад', 'кд', 'сд',
  // generic venue/business words
  'bar', 'cafe', 'restaurant', 'pub', 'bistro', 'shop', 'store', 'market',
  'бар', 'кафе', 'ресторант', 'бистро', 'магазин', 'маркет',
  // filler
  'the', 'and', 'bg', 'ltd', 'inc',
]);

/**
 * Token-set overlap between two merchant strings (0..1). We strip single-char
 * tokens and domain stopwords first so "Kristal EOOD" vs "Bar EOOD" doesn't score
 * 1.0 on the shared legal suffix. Denominator is min(|a|,|b|) of meaningful tokens
 * so a 1-vs-1 match still registers when both names have one distinctive word.
 */
function merchantMatchScore(ocrName: string, candidate: string): number {
  const tokenize = (s: string) =>
    new Set(
      normalizeMerchantString(s)
        .split(' ')
        .filter((t) => t.length > 1 && !MERCHANT_STOPWORDS.has(t)),
    );
  const a = tokenize(ocrName);
  const b = tokenize(candidate);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common / Math.min(a.size, b.size);
}

const MERCHANT_MATCH_THRESHOLD = 0.5;

/**
 * Guard: if BOTH the OCR merchant and the venue/partner candidates reduce to zero
 * meaningful tokens after stopword filtering, we can't make a meaningful
 * comparison — return null from the verifier rather than flagging a mismatch.
 * This happens when e.g. the seeded venue is literally named "Bar" (one stopword
 * token) — we can't prove the receipt doesn't belong to that venue from name alone.
 */
function hasMeaningfulTokens(s: string): boolean {
  return normalizeMerchantString(s)
    .split(' ')
    .some((t) => t.length > 1 && !MERCHANT_STOPWORDS.has(t));
}

export interface FraudCheckResult {
  fraudScore: number; // 0-100
  fraudReasons: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresManualReview: boolean;
}

// ============================================
// Sticker Service Class
// ============================================

class StickerService {
  /**
   * Spec §4.2 v1.1 — block receipt scanning when the user's current
   * subscription is in PAST_DUE or FAILED_PAYMENT ("неуспешно плащане").
   * No protected period, no retry window. The mobile app pattern-matches the
   * SUBSCRIPTION_PAST_DUE / SUBSCRIPTION_FAILED_PAYMENT marker to render the
   * renewal CTA.
   *
   * A user can have multiple subscriptions over time; we only block if their
   * MOST-RECENT subscription is in a failed-payment state. Users with an older
   * expired sub plus a new ACTIVE one are not blocked. We also block if ANY
   * subscription for the user is in FAILED_PAYMENT — per spec §4.2 v1.1 this
   * is a hard gate that supersedes the most-recent-only check.
   */
  async assertSubscriptionAllowsScanning(userId: string): Promise<void> {
    // FAILED_PAYMENT / PAST_DUE only block when the user has no NEWER active subscription.
    // A user who lapsed and then re-subscribed (new ACTIVE/TRIALING row) is recovered and
    // must be allowed to scan even if an older FAILED_PAYMENT row is still on file.
    const latest = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    if (latest?.status === SubscriptionStatus.FAILED_PAYMENT) {
      throw new Error(
        'SUBSCRIPTION_FAILED_PAYMENT: Абонаментът Ви е в статус „неуспешно плащане". ' +
        'Възобновете го от менюто „Абонамент и плащания", за да продължите да сканирате бележки.'
      );
    }
    if (latest?.status === SubscriptionStatus.PAST_DUE) {
      throw new Error(
        'SUBSCRIPTION_PAST_DUE: Абонаментът Ви е в статус „неуспешно плащане". ' +
        'Възобновете го от менюто „Абонамент и плащания", за да продължите да сканирате бележки.'
      );
    }
  }

  /**
   * Resolve the user's cashback tier from their active Subscription.
   * Returns null when no active subscription exists — callers should treat this as
   * "no cashback" (Finding #1 fix). Using Subscription.plan as the single source of
   * truth (not Card.type) resolves Finding #2.
   */
  private async resolveCashbackTier(userId: string): Promise<'LIGHT' | 'BASIC' | 'PREMIUM' | null> {
    const sub = await prisma.subscription.findFirst({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED] } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (!sub) return null;
    const plan = sub.plan as 'LIGHT' | 'BASIC' | 'PREMIUM';
    return plan === 'LIGHT' || plan === 'BASIC' || plan === 'PREMIUM' ? plan : null;
  }

  /**
   * Create a new sticker location for a venue
   */
  async createStickerLocation(data: CreateStickerLocationData): Promise<StickerLocation> {
    return prisma.stickerLocation.create({
      data,
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            partner: {
              select: {
                id: true,
                businessName: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Create multiple sticker locations at once (bulk)
   */
  async createStickerLocationsBulk(locations: CreateStickerLocationData[]): Promise<StickerLocation[]> {
    const created: StickerLocation[] = [];
    for (const location of locations) {
      const result = await this.createStickerLocation(location);
      created.push(result);
    }
    return created;
  }

  /**
   * Generate a sticker with QR code for a location
   */
  async generateSticker(locationId: string): Promise<Sticker> {
    const location = await prisma.stickerLocation.findUnique({
      where: { id: locationId },
      include: { venue: true },
    });

    if (!location) {
      throw new Error('Location not found');
    }

    // Generate sticker ID: e.g., "BAR32-MASA04"
    const venueCode = await this.getVenueCode(location.venueId);
    const stickerId = `${venueCode}-${location.locationNumber}`;

    // Check if sticker already exists
    const existing = await prisma.sticker.findUnique({
      where: { stickerId },
    });

    if (existing) {
      throw new Error(`Sticker ${stickerId} already exists`);
    }

    // Generate QR code data
    const qrData: StickerQRData = {
      type: 'BOOM_STICKER',
      venueId: location.venueId,
      locationId: location.id,
      stickerId,
      locationType: location.locationType,
      version: '1.0',
    };

    // Store the QR payload (JSON string) — the client renders the QR image from this.
    // We intentionally do NOT store a base64 PNG: the unique index on qrCode has a
    // 2704-byte limit in Postgres BTREE, which a base64-encoded PNG easily exceeds.
    const qrCodePayload = JSON.stringify(qrData);

    // Create sticker record
    const sticker = await prisma.sticker.create({
      data: {
        venueId: location.venueId,
        locationId: location.id,
        stickerId,
        qrCode: qrCodePayload,
        locationType: location.locationType,
        status: StickerStatus.PENDING,
        metadata: JSON.stringify({ stickerId }),
      },
      include: {
        venue: true,
        location: true,
      },
    });

    return sticker;
  }

  /**
   * Generate multiple stickers at once
   */
  async generateStickersBulk(locationIds: string[]): Promise<Sticker[]> {
    const stickers: Sticker[] = [];
    for (const locationId of locationIds) {
      try {
        const sticker = await this.generateSticker(locationId);
        stickers.push(sticker);
      } catch (error) {
        console.error(`Failed to generate sticker for location ${locationId}:`, error);
      }
    }
    return stickers;
  }

  /**
   * Mark sticker as printed and active
   */
  async activateSticker(stickerId: string): Promise<Sticker> {
    return prisma.sticker.update({
      where: { stickerId },
      data: {
        status: StickerStatus.ACTIVE,
        printedAt: new Date(),
        activatedAt: new Date(),
      },
    });
  }

  /**
   * Get a guaranteed-unique venue code.
   *
   * Uses the first 8 characters of the venue's UUID (hex).
   * This is collision-free because UUIDs are unique per venue.
   * Name-based codes were intentionally removed: two venues with the
   * same name prefix (e.g., two "McDonald's" branches) would produce
   * the same code, causing sticker ID collisions.
   */
  private async getVenueCode(venueId: string): Promise<string> {
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new Error('Venue not found');
    // Strip hyphens from UUID and take the first 8 hex characters → always unique
    return venue.id.replace(/-/g, '').substring(0, 8).toUpperCase();
  }

  /**
   * Look up a sticker by its short ID and return lightweight validation info.
   * Used by the pre-scan validate endpoint — does not initiate a scan or
   * perform fraud / subscription checks.
   */
  async validateStickerById(stickerId: string): Promise<{
    valid: boolean;
    venueId?: string;
    venueName?: string;
    cashbackPercent?: number;
    message?: string;
  }> {
    const sticker = await prisma.sticker.findUnique({
      where: { stickerId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            stickerConfig: true,
            partner: { select: { id: true, status: true, verifiedAt: true, discountRate: true, partnerType: { select: { maxDiscountRate: true } } } },
          },
        },
      },
    });

    if (!sticker) {
      return { valid: false, message: 'Sticker not found' };
    }

    if (sticker.status !== StickerStatus.ACTIVE) {
      return { valid: false, message: `Sticker is ${sticker.status.toLowerCase()}` };
    }

    // Spec §5.3 v1.1 — even if the sticker row is ACTIVE, the partner's status
    // + verifiedAt gates whether the QR is operationally active. Mirror the
    // createSession / scanSticker gates so the mobile app gets a consistent
    // answer during pre-scan validation.
    if (
      sticker.venue.partner &&
      (sticker.venue.partner.status !== 'ACTIVE' || !sticker.venue.partner.verifiedAt)
    ) {
      return {
        valid: false,
        message: 'PARTNER_NOT_ACCEPTING: Този обект временно не приема BoomCard транзакции.',
      };
    }

    // Show the best-case cashback % for this venue (Premium tier at partner's discount level).
    // The actual % at scan time depends on the user's card tier.
    const { cashbackPercent } = await fraudDetectionService.calculateCashback({
      venueId: sticker.venue.id, // venue ID — calculateCashback traverses Venue → partner internally
      amount: 100, // dummy amount — we only need the percent
      cardTier: 'PREMIUM', // show maximum possible
    });

    return {
      valid: true,
      venueId: sticker.venueId,
      venueName: sticker.venue.name,
      cashbackPercent,
      message: 'Valid BOOM sticker',
    };
  }

  /**
   * Register a BOOM session when the user scans the QR sticker.
   *
   * Per BOOM_Card_Master_Functionality §6, Step 3: "Scans QR code on the table/venue →
   * Create active BOOM session; record time, table, venue, device, and location."
   *
   * This runs subscription + GPS validation immediately so the server knows the exact
   * scan time. The receipt (+ bill amount) are attached later via scanSticker(sessionId).
   */
  async createSession(data: CreateSessionData): Promise<StickerScan> {
    const { userId, latitude, longitude, ipAddress, userAgent } = data;
    let { stickerId, cardId } = data;

    // Spec §4.2 v1.1 — block immediately when subscription is in PAST_DUE.
    await this.assertSubscriptionAllowsScanning(userId);

    // Findings #4 + #5 (info-leak mitigation): validate payload fields that do NOT depend
    // on the DB BEFORE the sticker lookup, so attackers can't enumerate stickerIds by
    // distinguishing "missing field" from "invalid sticker" errors.
    if (!data.payloadVenueId) {
      throw new Error('QR payload is missing venueId — refusing to proceed.');
    }
    const rawVersion = typeof data.payloadVersion === 'string' ? data.payloadVersion : '';
    const major = parseInt(rawVersion.split('.')[0], 10);
    if (!Number.isFinite(major) || major < 1) {
      throw new Error('QR payload version is outdated — please ask the venue for a new sticker.');
    }

    // 1. Validate sticker
    const sticker = await prisma.sticker.findUnique({
      where: { stickerId },
      include: {
        venue: { include: { stickerConfig: true } },
        location: true,
      },
    });

    if (!sticker) throw new Error('Invalid sticker code');
    if (sticker.status !== StickerStatus.ACTIVE) throw new Error('Sticker is not active');

    // Final cross-check: payload venueId must match the sticker's true venue.
    if (data.payloadVenueId !== sticker.venueId) {
      throw new Error('QR payload venue does not match sticker — refusing to proceed.');
    }

    // 2. Resolve card
    if (!cardId) {
      const userCard = await prisma.card.findFirst({ where: { userId } });
      if (!userCard) throw new Error('No card found for your account. Please create a card first.');
      cardId = userCard.id;
    }
    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { user: true } });
    if (!card) throw new Error('Card not found');
    if (card.userId !== userId) throw new Error('Card does not belong to user');
    if (card.status !== 'ACTIVE') throw new Error(`Card is ${card.status.toLowerCase()}`);

    // 3. Subscription / partner access check
    const partner = await prisma.partner.findFirst({
      where: { venues: { some: { id: sticker.venueId } } },
      select: { id: true, partnerTypeId: true, status: true, verifiedAt: true },
    });

    // Spec §5.3 v1.1 — QR auto-deactivates when partner leaves ACTIVE status.
    // Mobile app surfaces this as: "Този обект временно не приема BoomCard
    // транзакции. Опитайте отново по-късно или вижте близки активни обекти."
    // The server raises a distinct marker the client pattern-matches without
    // parsing localized text. The gate is BOTH status=ACTIVE AND verifiedAt
    // not null — a partner technically status=ACTIVE but with verifiedAt null
    // means the admin approved but the activation link was never consumed,
    // which the spec treats as not operational.
    if (partner && (partner.status !== 'ACTIVE' || !partner.verifiedAt)) {
      throw new Error('PARTNER_NOT_ACCEPTING: Този обект временно не приема BoomCard транзакции.');
    }

    if (partner?.partnerTypeId) {
      const userSubscription = await prisma.subscription.findFirst({
        where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED] } },
        orderBy: { currentPeriodEnd: 'desc' },
      });
      const redeemableTypeIds = await partnerTypeService.getRedeemableTypeIdsForPlan(
        userSubscription?.plan ?? null
      );
      if (!redeemableTypeIds.includes(partner.partnerTypeId)) {
        throw new Error(
          'Your current subscription does not include access to this partner. ' +
          'Upgrade your plan to scan this venue.'
        );
      }
    }

    // 4. GPS check — always mandatory. Per product decision, no venue may opt out of
    // proximity verification; we ignore VenueStickerConfig.gpsVerificationEnabled here
    // and always require the user to be within gpsRadiusMeters of the venue.
    const config = sticker.venue.stickerConfig || (await this.getOrCreateVenueConfig(sticker.venueId));
    if (latitude === undefined || longitude === undefined) {
      throw new Error('Location access is required to scan. Please enable GPS and try again.');
    }
    if (sticker.venue.latitude == null || sticker.venue.longitude == null) {
      throw new Error('Venue location is not configured. Please contact support.');
    }
    const distance = this.calculateDistance(latitude, longitude, sticker.venue.latitude, sticker.venue.longitude);
    if (distance > config.gpsRadiusMeters) {
      throw new Error(
        `You must be within ${config.gpsRadiusMeters}m of the venue to scan. ` +
        `You are currently ${Math.round(distance)}m away.`
      );
    }

    // 5. Create SESSION_ACTIVE record (no bill amount yet)
    const session = await prisma.stickerScan.create({
      data: {
        userId,
        stickerId: sticker.id,
        venueId: sticker.venueId,
        cardId,
        billAmount: 0,
        cashbackPercent: 0,
        cashbackAmount: 0,
        sessionStartedAt: new Date(),
        status: ScanStatus.SESSION_ACTIVE,
        latitude,
        longitude,
        distance,
        fraudScore: 0,
        ipAddress,
        userAgent,
        deviceFingerprint: data.deviceFingerprint,
        deviceFingerprintRaw: data.deviceFingerprintRaw,
      },
      include: {
        sticker: { include: { venue: true, location: true } },
        card: true,
      },
    });

    // Update sticker last-scanned timestamp
    await prisma.sticker.update({
      where: { id: sticker.id },
      data: { lastScannedAt: new Date() },
    });

    logger.info(`Session created: ${session.id} for sticker ${stickerId} by user ${userId}`);
    return session;
  }

  /**
   * Validate and initiate a sticker scan
   */
  async scanSticker(data: ScanStickerData): Promise<StickerScan> {
    const { userId, billAmount, latitude, longitude, ipAddress, userAgent, sessionId } = data;

    // Spec §4.2 v1.1 — block scanning when subscription is in PAST_DUE.
    await this.assertSubscriptionAllowsScanning(userId);

    // ── Path A: complete an existing SESSION_ACTIVE session ──────────────────
    if (sessionId) {
      const existing = await prisma.stickerScan.findUnique({
        where: { id: sessionId },
        include: {
          sticker: { include: { venue: { include: { stickerConfig: true } }, location: true } },
          card: true,
        },
      });

      if (!existing) throw new Error('Session not found');
      if (existing.userId !== userId) throw new Error('Session does not belong to user');
      if (existing.status !== ScanStatus.SESSION_ACTIVE) {
        throw new Error('Session has already been submitted or is no longer active');
      }

      // Spec §5.3 v1.1 — re-check partner status at receipt-upload time.
      // The session created earlier passed the gate, but a partner can be
      // deactivated between session-open and receipt-upload. Without this
      // re-check the user could complete the scan and earn cashback at a
      // venue that is no longer accepting BoomCard.
      const sessionPartner = await prisma.partner.findFirst({
        where: { venues: { some: { id: existing.venueId } } },
        select: { status: true, verifiedAt: true },
      });
      // Spec §5.3 — mirror the createSession / validateStickerById gate.
      // verifiedAt cleared between session open and receipt upload (admin
      // re-onboarding) means the partner is no longer operationally active.
      if (
        sessionPartner &&
        (sessionPartner.status !== 'ACTIVE' || !sessionPartner.verifiedAt)
      ) {
        throw new Error('PARTNER_NOT_ACCEPTING: Този обект временно не приема BoomCard транзакции.');
      }

      // Server-side deadline: receipts must be submitted by 6:00 AM Sofia time the morning
      // after scan. The server runs UTC (Fly.io), so naive setHours(6) would give 06:00 UTC
      // = 08:00/09:00 Sofia — up to 3 hours too generous.
      //
      // Sofia is UTC+2 (EET, winter) or UTC+3 (EEST, summer). We compute "next day 06:00
      // Sofia" by converting the session date to Sofia's calendar day and subtracting 3 hours
      // (max offset). This makes the deadline at most 1 hour strict in winter — acceptable.
      const sessionStart = existing.sessionStartedAt ?? existing.createdAt;
      const sofiaDayStr = sessionStart.toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });
      const [y, m, d] = sofiaDayStr.split('-').map(Number);
      const deadline = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0)); // 06:00 Sofia ≈ 03:00 UTC
      if (Date.now() > deadline.getTime()) {
        // Expire the session so it can't be retried
        await prisma.stickerScan.update({
          where: { id: sessionId },
          data: { status: ScanStatus.EXPIRED },
        }).catch(() => {});
        throw new Error('Submission deadline has passed. Receipts must be submitted by 6:00 AM the following morning.');
      }

      const config = existing.sticker.venue.stickerConfig ||
        await this.getOrCreateVenueConfig(existing.venueId);

      if (billAmount < config.minBillAmount) {
        throw new Error(`Minimum bill amount is ${config.minBillAmount} BGN`);
      }

      const tier = await this.resolveCashbackTier(userId);
      const { cashbackAmount, cashbackPercent } = await fraudDetectionService.calculateCashback({
        venueId: existing.venueId, // venue ID — calculateCashback traverses Venue → partner internally
        amount: billAmount,
        cardTier: tier, // null when no active subscription → 0 cashback (Finding #1)
        userId,
      });

      const fraudCheck = await this.performFraudCheck({
        userId,
        venueId: existing.venueId,
        billAmount,
        distance: existing.distance ?? undefined,
        config,
      });

      const updated = await prisma.stickerScan.update({
        where: { id: sessionId },
        data: {
          billAmount,
          cashbackPercent,
          cashbackAmount,
          fraudScore: fraudCheck.fraudScore,
          fraudReasons: fraudCheck.fraudReasons,
          status: ScanStatus.PENDING,
          // Keep original GPS from session start; update only if re-submitted
          ...(latitude !== undefined && { latitude }),
          ...(longitude !== undefined && { longitude }),
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          sticker: { include: { venue: true, location: true } },
          card: true,
        },
      });

      await prisma.sticker.update({
        where: { id: existing.stickerId },
        data: { totalScans: { increment: 1 } },
      });

      // Audit-pass [1.2]: PENDING cashback row is now written ONCE, by
      // uploadReceipt when the scan transitions to MANUAL_REVIEW. That keeps
      // a single canonical insertion point and avoids three places racing for
      // the same row (Path A scanSticker, Path B scanSticker, uploadReceipt).
      // The DB-level partial unique index added in 20260518_audit_pass_v11_followups
      // is the safety net against any straggling caller.

      return updated;
    }

    // ── Path B: legacy — create scan + session in one call (no sessionId) ────
    let { stickerId, cardId } = data;

    // Findings #4 + #5 (info-leak mitigation): validate payload fields that do NOT depend
    // on the DB BEFORE the sticker lookup, so attackers can't enumerate stickerIds by
    // distinguishing "missing field" from "invalid sticker" errors.
    if (!data.payloadVenueId) {
      throw new Error('QR payload is missing venueId — refusing to proceed.');
    }
    {
      const raw = typeof data.payloadVersion === 'string' ? data.payloadVersion : '';
      const major = parseInt(raw.split('.')[0], 10);
      if (!Number.isFinite(major) || major < 1) {
        throw new Error('QR payload version is outdated — please ask the venue for a new sticker.');
      }
    }

    // 1. Validate sticker exists and is active
    const sticker = await prisma.sticker.findUnique({
      where: { stickerId },
      include: {
        venue: {
          include: {
            stickerConfig: true,
          },
        },
        location: true,
      },
    });

    if (!sticker) {
      throw new Error('Invalid sticker code');
    }

    if (sticker.status !== StickerStatus.ACTIVE) {
      throw new Error('Sticker is not active');
    }

    // Final cross-check: payload venueId must match the sticker's true venue.
    if (data.payloadVenueId !== sticker.venueId) {
      throw new Error('QR payload venue does not match sticker — refusing to proceed.');
    }

    // 2. Resolve and validate the user's card
    let resolvedCardId = cardId;
    if (!resolvedCardId) {
      const userCard = await prisma.card.findFirst({ where: { userId } });
      if (!userCard) {
        throw new Error('No card found for your account. Please create a card first.');
      }
      resolvedCardId = userCard.id;
    }

    const card = await prisma.card.findUnique({
      where: { id: resolvedCardId },
      include: { user: true },
    });

    if (!card) throw new Error('Card not found');
    if (card.userId !== userId) throw new Error('Card does not belong to user');
    if (card.status !== 'ACTIVE') throw new Error(`Card is ${card.status.toLowerCase()}`);

    // 3. Subscription check
    const partner = await prisma.partner.findFirst({
      where: { venues: { some: { id: sticker.venueId } } },
      select: { id: true, partnerTypeId: true, status: true, verifiedAt: true },
    });

    // Spec §5.3 — partner status + verifiedAt gate (see createSession for full note).
    if (partner && (partner.status !== 'ACTIVE' || !partner.verifiedAt)) {
      throw new Error('PARTNER_NOT_ACCEPTING: Този обект временно не приема BoomCard транзакции.');
    }

    if (partner && partner.partnerTypeId) {
      const userSubscription = await prisma.subscription.findFirst({
        where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED] } },
        orderBy: { currentPeriodEnd: 'desc' },
      });

      const userPlan = userSubscription?.plan ?? null;
      const redeemableTypeIds = await partnerTypeService.getRedeemableTypeIdsForPlan(userPlan);

      if (!redeemableTypeIds.includes(partner.partnerTypeId)) {
        throw new Error(
          `Your current subscription does not include access to this partner. ` +
          `Upgrade your plan to scan this venue.`,
        );
      }
    }

    // 4. Config + bill amount validation
    const config = sticker.venue.stickerConfig || await this.getOrCreateVenueConfig(sticker.venueId);

    if (billAmount < config.minBillAmount) {
      throw new Error(`Minimum bill amount is ${config.minBillAmount} BGN`);
    }

    // 5. Cashback calculation — tier comes from active Subscription, not Card.type (Finding #1+#2)
    const tier = await this.resolveCashbackTier(userId);
    const { cashbackAmount, cashbackPercent } = await fraudDetectionService.calculateCashback({
      venueId: sticker.venueId, // venue ID — calculateCashback traverses Venue → partner internally
      amount: billAmount,
      cardTier: tier,
      userId,
    });

    // 6. GPS distance — mandatory, no opt-out (see createSession comment).
    if (latitude === undefined || longitude === undefined) {
      throw new Error('Location access is required to scan. Please enable GPS and try again.');
    }
    if (sticker.venue.latitude == null || sticker.venue.longitude == null) {
      throw new Error('Venue location is not configured. Please contact support.');
    }
    const distance = this.calculateDistance(latitude, longitude, sticker.venue.latitude, sticker.venue.longitude);
    if (distance > config.gpsRadiusMeters) {
      throw new Error(
        `You must be within ${config.gpsRadiusMeters}m of the venue to scan. You are currently ${Math.round(distance)}m away.`
      );
    }

    // 7. Fraud check
    const fraudCheck = await this.performFraudCheck({
      userId,
      venueId: sticker.venueId,
      billAmount,
      distance,
      config,
    });

    // 8. Create scan record
    const scan = await prisma.stickerScan.create({
      data: {
        userId,
        stickerId: sticker.id,
        venueId: sticker.venueId,
        cardId: resolvedCardId,
        billAmount,
        cashbackPercent,
        cashbackAmount,
        sessionStartedAt: new Date(), // legacy path: session starts and completes together
        latitude,
        longitude,
        distance,
        fraudScore: fraudCheck.fraudScore,
        fraudReasons: fraudCheck.fraudReasons,
        status: ScanStatus.PENDING,
        ipAddress,
        userAgent,
        deviceFingerprint: data.deviceFingerprint,
        deviceFingerprintRaw: data.deviceFingerprintRaw,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        sticker: { include: { venue: true, location: true } },
        card: true,
      },
    });

    await prisma.sticker.update({
      where: { id: sticker.id },
      data: { totalScans: { increment: 1 }, lastScannedAt: new Date() },
    });

    // Audit-pass [1.2]: Pending cashback row is now written by uploadReceipt
    // (single canonical insertion point). See note in Path A above.

    return scan;
  }

  /**
   * Finding #6: SHA-256 dedupe probe. Call BEFORE uploading to S3 so duplicates don't
   * incur storage cost. Returns a truthy value if a prior scan with the same hash exists
   * (excluding the caller's own scanId).
   *
   * Cross-flow aware: also checks Receipt.imageHash so a user can't submit the same
   * receipt photo via the receipt flow and escape detection in the sticker flow.
   */
  async findDuplicateReceipt(
    receiptImageHash: string,
    excludeScanId?: string,
  ): Promise<{ id: string; userId: string; status: string } | null> {
    if (!receiptImageHash) return null;

    const [stickerDup, receiptDup] = await Promise.all([
      (prisma.stickerScan as any).findFirst({
        where: {
          receiptImageHash,
          status: { in: ['PENDING', 'VALIDATING', 'APPROVED', 'MANUAL_REVIEW'] },
          ...(excludeScanId ? { id: { not: excludeScanId } } : {}),
        },
        select: { id: true, userId: true, status: true },
      }),
      prisma.receipt.findFirst({
        where: {
          imageHash: receiptImageHash,
          status: { in: ['APPROVED', 'PENDING', 'MANUAL_REVIEW'] as any[] },
        },
        select: { id: true, userId: true, status: true },
      }),
    ]);

    return stickerDup || receiptDup || null;
  }

  /**
   * Upload receipt image and OCR data for a scan
   */
  async uploadReceipt(data: UploadReceiptData): Promise<StickerScan> {
    const { scanId, userId, receiptImageUrl, receiptImageHash, ocrData, imageBuffer } = data;

    // Spec §4.2 v1.1 — block receipt scanning when subscription = PAST_DUE.
    if (userId) await this.assertSubscriptionAllowsScanning(userId);

    // IDOR guard: when the caller provides a userId, the scan must belong to that user.
    // Route handlers pass req.user.id here. Internal callers that omit userId fall back
    // to the old unguarded lookup — they already know what scan they're working with.
    const scan = userId
      ? await prisma.stickerScan.findFirst({
          where: { id: scanId, userId },
          include: { venue: { include: { stickerConfig: true, partner: true } } },
        })
      : await prisma.stickerScan.findUnique({
          where: { id: scanId },
          include: { venue: { include: { stickerConfig: true, partner: true } } },
        });

    if (!scan) throw new Error('Scan not found');

    // Audit-pass [2.1]: re-check partner status here. The original Path A
    // scanSticker(sessionId) re-checks too, but uploadReceipt is a separate
    // route handler that can be hit independently. Without this gate, a user
    // could complete a SESSION_ACTIVE scan and then upload the receipt after
    // their partner was deactivated, reaching PENDING cashback at a venue
    // that no longer accepts BoomCard. Mirrors the createSession gate exactly.
    if (
      scan.venue?.partner &&
      (scan.venue.partner.status !== 'ACTIVE' || !scan.venue.partner.verifiedAt)
    ) {
      throw new Error('PARTNER_NOT_ACCEPTING: Този обект временно не приема BoomCard транзакции.');
    }

    // Pre-existing-bug fix: reject re-upload on scans past the upload stage. Without this,
    // a second POST to /scan/:id/receipt would silently downgrade APPROVED → VALIDATING →
    // MANUAL_REVIEW while the original wallet credit stayed paid. Allowed states are
    // PENDING (first upload after submitScan) and VALIDATING (client retry after crash).
    const uploadableStates: ScanStatus[] = [ScanStatus.PENDING, ScanStatus.VALIDATING];
    if (!uploadableStates.includes(scan.status)) {
      throw new Error(
        `Receipt cannot be uploaded: scan is in ${scan.status} state. ` +
        `Only PENDING or VALIDATING scans accept a receipt upload.`,
      );
    }

    // Finding #6: reject duplicate receipts by SHA-256 across ALL scans. The route already
    // runs this probe BEFORE S3 upload; we run it again here as defence-in-depth for any
    // caller that bypasses the route (e.g. internal services).
    if (receiptImageHash) {
      const existing = await this.findDuplicateReceipt(receiptImageHash, scanId);
      if (existing) {
        // Mark this scan as REJECTED and surface the duplicate reason in fraudReasons.
        // We do NOT swallow update failures — if the REJECTED state can't be persisted the
        // caller deserves to know so they can retry or page ops, rather than leaving the
        // scan in an inconsistent intermediate state.
        // Use { push } to append rather than overwrite — preserves any fraud reasons
        // from the scan phase (GPS, OCR, device checks, etc.).
        await prisma.stickerScan.update({
          where: { id: scanId },
          data: {
            status: ScanStatus.REJECTED,
            rejectionReason: 'Duplicate receipt image (SHA-256 match)',
            fraudReasons: { push: 'DUPLICATE_IMAGE_HASH' },
          },
        });
        throw new Error('This receipt has already been submitted. Duplicate receipts are not accepted.');
      }
    }

    const verifiedAmount = ocrData?.amount || ocrData?.total;

    try {
      await (prisma.stickerScan.update as any)({
        where: { id: scanId },
        data: {
          receiptImageUrl,
          receiptImageHash: receiptImageHash ?? null,
          ocrData: ocrData as any,
          verifiedAmount,
          status: ScanStatus.VALIDATING,
        },
      });
    } catch (err: any) {
      // Finding #6 race: the unique index on receiptImageHash (migration
      // 20260417_sticker_scan_receipt_image_hash_unique) throws P2002 when a concurrent
      // request inserts the same hash between our findFirst and update. Treat as duplicate.
      if (err?.code === 'P2002') {
        await prisma.stickerScan.update({
          where: { id: scanId },
          data: {
            status: ScanStatus.REJECTED,
            rejectionReason: 'Duplicate receipt image (SHA-256 race)',
            fraudReasons: { push: 'DUPLICATE_IMAGE_HASH_RACE' },
          },
        });
        throw new Error('This receipt has already been submitted. Duplicate receipts are not accepted.');
      }
      throw err;
    }

    // Server-side OCR merchant verification is run asynchronously after the response
    // returns: Tesseract takes 10–30s per receipt, and blocking the upload response
    // that long would time out the mobile client. The scan is already in MANUAL_REVIEW,
    // so enriching fraudReasons after the fact is always safe — an admin reviewing a
    // flagged scan a minute later will see MERCHANT_MISMATCH. Client-supplied ocrData
    // is still ignored — merchant verification must be independent of the client.
    //
    // Preferred path: enqueue a BullMQ job. Survives server restart, retries on failure.
    // Fallback (Redis unconfigured): detached promise — the legacy behavior, no durability.
    const candidateNames = [
      scan.venue?.name,
      scan.venue?.nameBg,
      scan.venue?.partner?.businessName,
      scan.venue?.partner?.businessNameBg,
    ].filter((n): n is string => !!n && n.trim().length > 0);
    if (candidateNames.length > 0) {
      const enqueued = await enqueueMerchantVerification(scanId);
      if (!enqueued && imageBuffer) {
        // Fallback: in-process detached promise (legacy). No restart durability.
        void this.runMerchantVerificationFromBuffer(scanId, imageBuffer, candidateNames, scan.venue?.name ?? '');
      }
    }

    // Spec §7.1: 0-30 → auto-approve; 31-60 → manual review; 61+ → high risk.
    const autoApproveThreshold = (scan as any).venue?.stickerConfig?.autoApproveThreshold ?? 30;
    const scanFraudScore = scan.fraudScore ?? 0;

    if (scanFraudScore <= autoApproveThreshold) {
      // ── Auto-approve path ────────────────────────────────────────────────
      // Transition to MANUAL_REVIEW first so approveScan() accepts the scan,
      // then immediately promote. This reuses all cashback-credit, wallet,
      // audit-trail, and notification logic in a single call.
      await prisma.stickerScan.update({
        where: { id: scanId },
        data: { status: ScanStatus.MANUAL_REVIEW },
      });

      // Create the PENDING row so the promote path works correctly even
      // for the instant-approval case (promotePendingToCleared expects it).
      try {
        if (scan.userId && (scan.cashbackAmount ?? 0) > 0) {
          await cashbackLifecycleService.recordPendingForRiskReview({
            userId: scan.userId,
            amount: scan.cashbackAmount,
            description: `Кешбек — ${scan.venue?.name ?? 'обект'}`,
            stickerScanId: scan.id,
            metadata: { source: 'STICKER_SCAN_AUTO_APPROVE', venueId: scan.venueId },
          });
        }
      } catch (err) {
        logger.error(`[uploadReceipt] failed to record PENDING cashback for auto-approve scan ${scanId}:`, err);
      }

      if ((scan.cashbackAmount ?? 0) > 0) {
        try {
          return await this.approveScan(scanId, { adminUserId: null });
        } catch (autoApproveError) {
          // Unexpected failure — leave in MANUAL_REVIEW for admin action.
          logger.error(`[uploadReceipt] auto-approve failed for scan ${scanId}, leaving in MANUAL_REVIEW:`, autoApproveError);
          return prisma.stickerScan.findUniqueOrThrow({ where: { id: scanId } });
        }
      }

      // Zero cashback (no active subscription) — just mark APPROVED; no
      // wallet or cashback record needed.
      return prisma.stickerScan.update({
        where: { id: scanId },
        data: { status: ScanStatus.APPROVED, processedAt: new Date() },
      });
    }

    // ── Manual review path (fraudScore 31-60 = review, 61+ = high risk) ───
    const finalScan = await prisma.stickerScan.update({
      where: { id: scanId },
      data: { status: ScanStatus.MANUAL_REVIEW },
    });

    // Spec §7.1 v1.1 — create a PENDING cashback record visible to the user
    // for the duration of the risk review. Non-fatal: a write failure here
    // must not roll back the upload. Idempotent — repeated calls return the
    // existing entry. On admin approve, this row is promoted to CLEARED
    // (and the wallet finally credited); on reject, it's marked VOIDED.
    try {
      if (scan.userId && (scan.cashbackAmount ?? 0) > 0) {
        await cashbackLifecycleService.recordPendingForRiskReview({
          userId: scan.userId,
          amount: scan.cashbackAmount,
          description: `Чакащ кешбек (риск преглед) — ${scan.venue?.name ?? 'обект'}`,
          stickerScanId: scan.id,
          metadata: { source: 'STICKER_SCAN_MANUAL_REVIEW', venueId: scan.venueId },
        });
      }
    } catch (err) {
      logger.error(`[uploadReceipt] failed to record PENDING cashback for scan ${scanId}:`, err);
    }

    return finalScan;
  }

  /**
   * Worker entrypoint: re-fetches the scan + image from S3 and runs verification.
   * Throws on real failure (so BullMQ can retry); short-circuits silently when the
   * scan is missing/invalid (those are not retryable).
   */
  async runMerchantVerification(scanId: string): Promise<void> {
    const scan = await prisma.stickerScan.findUnique({
      where: { id: scanId },
      include: {
        venue: { include: { partner: true } },
      },
    });
    if (!scan) {
      logger.warn(`runMerchantVerification: scan ${scanId} not found — dropping job`);
      return;
    }
    if (!scan.receiptImageUrl) {
      logger.warn(`runMerchantVerification: scan ${scanId} has no receiptImageUrl — dropping job`);
      return;
    }

    const candidateNames = [
      scan.venue?.name,
      scan.venue?.nameBg,
      scan.venue?.partner?.businessName,
      scan.venue?.partner?.businessNameBg,
    ].filter((n): n is string => !!n && n.trim().length > 0);
    if (candidateNames.length === 0) return;

    // Re-download the receipt bytes. We never queue the buffer itself — it would
    // bloat Redis and tie payload size to image size. S3 is the source of truth.
    const buffer = await imageUploadService.downloadImageFromUrl(scan.receiptImageUrl);
    await this.verifyAndAnnotateScan(scanId, buffer, candidateNames, scan.venue?.name ?? '');
  }

  /**
   * Legacy in-process fallback used when REDIS_URL is unset. Same body as
   * runMerchantVerification but skips the S3 round-trip because the caller already
   * has the buffer. Errors are swallowed (legacy contract: detached promise).
   */
  private async runMerchantVerificationFromBuffer(
    scanId: string,
    imageBuffer: Buffer,
    candidateNames: string[],
    venueName: string,
  ): Promise<void> {
    try {
      await this.verifyAndAnnotateScan(scanId, imageBuffer, candidateNames, venueName);
    } catch (err: any) {
      logger.warn(`OCR merchant verification (fallback) failed for scan ${scanId}: ${err?.message ?? err}`);
    }
  }

  /**
   * Shared core: runs OCR, scores the merchant match, atomically appends a
   * MERCHANT_MISMATCH fraudReason when the score is below threshold. Idempotent —
   * a re-fire (from BullMQ retry or detached re-call) won't double-flag a scan.
   */
  private async verifyAndAnnotateScan(
    scanId: string,
    imageBuffer: Buffer,
    candidateNames: string[],
    venueName: string,
  ): Promise<void> {
    const serverOcr = await recognizeReceiptImage(imageBuffer);
    const ocrMerchant = serverOcr.merchantName?.trim() ?? '';
    // Only score a mismatch when OCR is confident enough to be trusted. Thermal
    // receipt photos routinely OCR at 30–40% confidence and produce garbage merchant
    // strings; flagging those would false-positive on every legitimate upload. 60
    // is an empirical floor for "the first line is actually readable text".
    if (ocrMerchant.length < 2 || serverOcr.confidence < 60) return;

    // Skip if no venue candidate has any distinctive token after stopword filtering —
    // otherwise we'd false-flag every receipt against a venue literally named "Bar".
    const meaningfulCandidates = candidateNames.filter(hasMeaningfulTokens);
    if (meaningfulCandidates.length === 0) return;

    const bestScore = Math.max(...meaningfulCandidates.map((c) => merchantMatchScore(ocrMerchant, c)));
    if (bestScore >= MERCHANT_MATCH_THRESHOLD) return;

    const newReason = `MERCHANT_MISMATCH: receipt="${ocrMerchant}" vs venue="${venueName}"`;
    // Idempotency guard: read status + fraudReasons together.
    // (BullMQ retry, detached re-fire). Concurrent admin edits between this read and
    // the push below are safe — both writes use server-side atomic operators.
    const current = await prisma.stickerScan.findUnique({
      where: { id: scanId },
      select: { fraudReasons: true, status: true },
    });
    if (!current) return;
    // Do not retroactively annotate scans that have already been settled. An
    // APPROVED scan already has its cashback credited — appending MERCHANT_MISMATCH
    // would corrupt the fraud history without reversing anything. REJECTED/EXPIRED
    // scans are similarly terminal: there is nothing actionable left to do.
    if (
      current.status === ScanStatus.APPROVED ||
      current.status === ScanStatus.REJECTED ||
      current.status === ScanStatus.EXPIRED
    ) {
      logger.warn(
        `[verifyAndAnnotateScan] scan ${scanId} is already ${current.status} — ` +
        `skipping MERCHANT_MISMATCH annotation (OCR: "${ocrMerchant}")`,
      );
      return;
    }
    if (current.fraudReasons.some((r) => r.startsWith('MERCHANT_MISMATCH'))) return;
    await prisma.stickerScan.update({
      where: { id: scanId },
      data: {
        fraudReasons: { push: newReason },
        fraudScore: { increment: 40 },
      },
    });
  }

  /**
   * Approve a scan and credit cashback.
   *
   * Optional `verifiedAmount`: admin-corrected bill amount used when the
   * user-entered number is wrong (e.g. OCR confirms a different total).
   * When set, cashbackPercent / cashbackAmount are recomputed from the
   * verified amount via `calculateCashback`, and the scan record is updated
   * to reflect the corrected values before crediting the wallet. Without it,
   * the pre-computed scan.cashbackAmount is used as-is.
   */
  async approveScan(scanId: string, opts?: { verifiedAmount?: number; adminUserId?: string | null }): Promise<StickerScan> {
    const scan = await prisma.stickerScan.findUnique({
      where: { id: scanId },
      include: {
        user: true,
        venue: true,
        card: true,
        sticker: {
          include: {
            venue: true,
            location: true,
          },
        },
      },
    });

    if (!scan) {
      throw new Error('Scan not found');
    }

    const approvableStatuses: ScanStatus[] = [ScanStatus.PENDING, ScanStatus.VALIDATING, ScanStatus.MANUAL_REVIEW];
    if (!approvableStatuses.includes(scan.status)) {
      throw new Error(`Scan cannot be approved: current status is ${scan.status}`);
    }

    // Resolve admin amount override. Null/undefined → use scan as-is; any
    // numeric value (including 0, to catch admin typos) is validated.
    let effectiveBillAmount = scan.billAmount;
    let effectiveCashbackPercent = scan.cashbackPercent;
    let effectiveCashbackAmount = scan.cashbackAmount;

    if (opts?.verifiedAmount != null) {
      if (!isFinite(opts.verifiedAmount) || opts.verifiedAmount <= 0) {
        throw new Error('verifiedAmount must be a positive number');
      }
      // Sanity ceiling: reject overrides that are more than 10× the scanned amount.
      // This catches admin typos (e.g. 1000 instead of 100) while still allowing
      // legitimate corrections in both directions.
      // When billAmount=0 the OCR failed to read the total; 10×0=0 so any positive
      // override would pass, which is nonsensical. Reject entirely in that case.
      if (scan.billAmount <= 0) {
        throw new Error(
          `verifiedAmount cannot be set when the scanned bill amount is 0. ` +
          `Correct the scan or use the rejection flow.`
        );
      }
      if (opts.verifiedAmount > scan.billAmount * 10) {
        throw new Error(
          `verifiedAmount ${opts.verifiedAmount} exceeds 10× the scanned bill amount (${scan.billAmount}). ` +
          `Check the value and retry.`
        );
      }
      const cardTier = await this.resolveCashbackTier(scan.userId);
      const recalc = await fraudDetectionService.calculateCashback({
        venueId: scan.venueId,
        amount: opts.verifiedAmount,
        cardTier: cardTier as any,
        userId: scan.userId,
      });
      effectiveBillAmount = opts.verifiedAmount;
      effectiveCashbackPercent = recalc.cashbackPercent;
      effectiveCashbackAmount = recalc.cashbackAmount;
    }

    if (effectiveCashbackAmount <= 0) {
      throw new Error('Scan cashback amount must be positive');
    }

    // Save original state so rollback can restore precisely.
    const oldStatus = scan.status;
    const oldProcessedAt = scan.processedAt;

    // Atomic claim — prevents concurrent double-approval AND blocks REJECTED/EXPIRED scans
    // from being approved after the fact (mirrors the rejectScan guard which excludes
    // APPROVED scans to protect already-credited cashback). Narrowing to approvable
    // statuses (not just "not APPROVED") prevents a rejected scan from being re-approved.
    // When an admin override is in play, the claim also writes the corrected
    // billAmount/cashback fields so the persisted record matches what gets credited.
    const claimData: Record<string, unknown> = {
      status: ScanStatus.APPROVED,
      processedAt: new Date(),
    };
    if (opts?.verifiedAmount != null) {
      claimData.verifiedAmount = opts.verifiedAmount;
      claimData.billAmount = effectiveBillAmount;
      claimData.cashbackPercent = effectiveCashbackPercent;
      claimData.cashbackAmount = effectiveCashbackAmount;
    }
    const claimResult = await prisma.stickerScan.updateMany({
      where: { id: scanId, status: { in: approvableStatuses } },
      data: claimData as any,
    });

    if (claimResult.count === 0) {
      throw new Error('Scan has already been approved');
    }

    const locationName = scan.sticker?.location?.name ?? 'location';

    // Pre-check: if wallet is locked, don't attempt credit — roll back the claim and
    // leave the scan in MANUAL_REVIEW with a clear log. This prevents opaque retry loops.
    try {
      const wallet = await prisma.wallet.findUnique({ where: { userId: scan.userId } });
      if (wallet?.isLocked) {
        logger.warn(
          `Cannot approve scan ${scanId}: wallet is locked (${wallet.lockedReason}). ` +
          `Rolling back and leaving scan in MANUAL_REVIEW for retry after lock is lifted.`
        );
        // Roll back the claim so the scan can be retried
        await prisma.stickerScan.update({
          where: { id: scanId },
          data: { status: oldStatus, processedAt: oldProcessedAt },
        });
        throw new Error(
          `User's wallet is locked and cannot receive cashback credits. ` +
          `Contact support to resolve: ${wallet.lockedReason}`
        );
      }
    } catch (walletCheckError) {
      // If the pre-check query fails, be conservative: don't proceed with credit
      logger.error(`Failed to check wallet lock status for user ${scan.userId}:`, walletCheckError);
      // Try to roll back the claim
      try {
        await prisma.stickerScan.update({
          where: { id: scanId },
          data: { status: oldStatus, processedAt: oldProcessedAt },
        });
      } catch (rollbackError) {
        logger.error(`CRITICAL: Failed to restore scan status for ${scanId}. Manual intervention required.`, rollbackError);
      }
      throw new Error(`Failed to verify wallet status. Scan approval has been rolled back — please retry.`);
    }

    // All post-claim writes are inside a single try/catch so ANY failure — including
    // transaction.create or stickerScan.update — rolls back the claim. Without this,
    // a DB error on those steps would leave the scan permanently APPROVED with no
    // cashback and no retry path (both guards throw "already approved" on re-entry).
    let transactionId: string | null = null;
    let updated: StickerScan | null = null;

    try {
      // Spec §4.3 v1.1 — persist the fraud/risk score at transaction creation
      // so admin search/filter by risk score works without re-deriving from
      // receipt+stickerScan at query time.
      const persistedRiskScore = Math.round(scan.fraudScore ?? 0);

      const transaction = await prisma.transaction.create({
        data: {
          userId: scan.userId,
          venueId: scan.venueId,
          cardId: scan.cardId,
          type: TransactionType.PURCHASE,
          paymentMethod: PaymentMethod.CARD,
          amount: effectiveBillAmount,
          discount: effectiveCashbackPercent,
          discountAmount: effectiveCashbackAmount,
          finalAmount: effectiveBillAmount - effectiveCashbackAmount,
          currency: 'BGN',
          status: TransactionStatus.COMPLETED,
          riskScore: persistedRiskScore,
          metadata: JSON.stringify({
            scanId: scan.id,
            stickerId: scan.stickerId,
            source: 'STICKER_SCAN',
            ...(opts?.verifiedAmount != null ? { adminAmountOverride: { from: scan.billAmount, to: opts.verifiedAmount } } : {}),
          }),
        },
      });
      transactionId = transaction.id;

      updated = await prisma.stickerScan.update({
        where: { id: scanId },
        data: { transactionId: transaction.id },
        include: {
          transaction: true,
          user: true,
          sticker: {
            include: {
              venue: true,
              location: true,
            },
          },
        },
      }) as unknown as StickerScan;

      // Resolve the subscription-backed tier for metadata consistency. Falling back to
      // scan.card?.type was misleading (Finding #1/#2 leftover) — the tier at the time of
      // the scan was already gated by the subscription, so record it that way.
      const metadataTier = await this.resolveCashbackTier(scan.userId);

      // Spec §7.1 v1.1 — if a PENDING cashback entry was created when the scan
      // entered MANUAL_REVIEW, promote it to CLEARED (and credit wallet balance)
      // rather than creating a NEW credit row. Without this branch, the approve
      // path would double-record: one PENDING ghost + one CLEARED credit.
      // Legacy scans (pre-§7.1) have no PENDING entry → fall back to credit.
      const pendingEntry = await prisma.walletTransaction.findFirst({
        where: {
          stickerScanId: scan.id,
          type: WalletTransactionType.CASHBACK_CREDIT,
          cashbackStatus: 'PENDING' as any,
        },
        select: { id: true, amount: true },
      });

      if (pendingEntry) {
        // Audit-pass [1.1]: pass overrideAmount only when it actually differs,
        // so the lifecycle service can apply the reconciliation atomically with
        // the promotion + wallet credit (single $transaction).
        await cashbackLifecycleService.promotePendingToCleared({
          walletTransactionId: pendingEntry.id,
          actorUserId: opts?.adminUserId ?? null,
          reason: 'Admin approved sticker scan after risk review',
          ...(pendingEntry.amount !== effectiveCashbackAmount
            ? { overrideAmount: effectiveCashbackAmount }
            : {}),
        });
      } else {
        await walletService.credit({
          userId: scan.userId,
          amount: effectiveCashbackAmount,
          type: WalletTransactionType.CASHBACK_CREDIT,
          description: `Кешбек от сканиране на стикер в ${locationName}`,
          stickerScanId: scan.id,
          metadata: {
            venueId: scan.venueId,
            locationName,
            billAmount: effectiveBillAmount,
            cashbackTier: metadataTier ?? 'NONE',
            ...(opts?.verifiedAmount != null ? { adminAmountOverride: { from: scan.billAmount, to: opts.verifiedAmount } } : {}),
          },
        });
      }

      // Write a dedicated audit row when an admin overrides the bill amount so the
      // before/after figures are permanently traceable to the actor (not just in the
      // transaction metadata JSON which is harder to query).
      if (opts?.verifiedAmount != null) {
        writeAudit({
          actorUserId: opts.adminUserId ?? null,
          action: 'ADMIN_AMOUNT_OVERRIDE',
          objectType: 'StickerScan',
          objectId: scanId,
          before: { billAmount: scan.billAmount, cashbackAmount: scan.cashbackAmount },
          after: { billAmount: effectiveBillAmount, cashbackAmount: effectiveCashbackAmount, verifiedAmount: opts.verifiedAmount },
        }).catch((err) => logger.error(`[approveScan] audit write failed for override on scan ${scanId}:`, err));
      }

      logger.info(`Credited ${effectiveCashbackAmount} BGN cashback for scan ${scanId}${opts?.verifiedAmount != null ? ` (admin override: ${scan.billAmount} → ${opts.verifiedAmount})` : ''}`);
    } catch (error) {
      logger.error(`Failed to process scan ${scanId} after claim, rolling back:`, error);
      // Each rollback step is independent so a failure on one doesn't prevent the other.
      // Also restore the original bill/cashback fields if an admin override rewrote them
      // during the claim, so a retry starts from the same state as the original scan.
      const rollbackData: Record<string, unknown> = {
        status: oldStatus,
        transactionId: null,
        processedAt: oldProcessedAt,
      };
      if (opts?.verifiedAmount != null) {
        rollbackData.verifiedAmount = scan.verifiedAmount;
        rollbackData.billAmount = scan.billAmount;
        rollbackData.cashbackPercent = scan.cashbackPercent;
        rollbackData.cashbackAmount = scan.cashbackAmount;
      }
      try {
        await prisma.stickerScan.update({
          where: { id: scanId },
          data: rollbackData as any,
        });
      } catch (rollbackError) {
        logger.error(`CRITICAL: Failed to restore scan status for ${scanId}. Manual intervention required.`, rollbackError);
      }
      if (transactionId) {
        try {
          await prisma.transaction.delete({ where: { id: transactionId } });
        } catch (rollbackError) {
          logger.error(`CRITICAL: Failed to delete orphaned transaction ${transactionId} for scan ${scanId}. Manual intervention required.`, rollbackError);
        }
      }
      throw new Error('Failed to process scan. Scan approval has been rolled back — please retry.');
    }

    // Notify user of cashback credit (non-fatal)
    try {
      await notificationService.notifyStickerScanApproved({
        userId: scan.userId,
        scanId,
        venueName: (scan as any).venue?.name || 'venue',
        cashbackAmount: effectiveCashbackAmount,
      });
    } catch (notifyError) {
      logger.error(`Failed to send notification for sticker scan ${scanId}:`, notifyError);
    }

    // Notify the venue's partner owner so they see live activity at their venue.
    // Non-fatal — a failure here must not affect the already-credited cashback.
    try {
      await notificationService.notifyPartnerScanAtVenue({
        venueId: scan.venueId,
        scanId,
        billAmount: effectiveBillAmount,
        cashbackAmount: effectiveCashbackAmount,
      });
    } catch (partnerNotifyError) {
      logger.error(`Failed to notify partner of scan ${scanId}:`, partnerNotifyError);
    }

    return updated!;
  }

  /**
   * Reject a scan.
   *
   * Spec §4.4 / §7.1 v1.1: also record a Voided cashback ghost row so the user
   * sees an "Анулиран" entry with the reason instead of the cashback silently
   * disappearing. actorUserId is the admin who made the decision (audit).
   */
  async rejectScan(scanId: string, reason: string, actorUserId: string | null = null): Promise<StickerScan> {
    // Guard against rejecting an already-approved scan — cashback would already be
    // credited to the wallet, leaving the user with funds but a REJECTED status.
    const scan = await prisma.stickerScan.findUnique({
      where: { id: scanId },
      select: { id: true, userId: true, cashbackAmount: true, venueId: true, status: true },
    });
    if (!scan) throw new Error(`Scan ${scanId} not found`);

    const result = await prisma.stickerScan.updateMany({
      where: { id: scanId, status: { not: ScanStatus.APPROVED } },
      data: { status: ScanStatus.REJECTED, rejectionReason: reason, processedAt: new Date() },
    });
    if (result.count === 0) {
      throw new Error('Scan has already been approved and cannot be rejected');
    }

    // Spec §4.4 — visible Voided record with the rejection reason. Non-fatal:
    // a ghost write failure must not leave the scan in an inconsistent state.
    //
    // Audit-pass [1.4]: the scan-level updateMany above already serialized
    // approve vs reject (both filter on status, only one can transition out
    // of MANUAL_REVIEW). If reject wins the scan claim, the PENDING row was
    // not yet promoted because approveScan's promotion is in the same try
    // block as the scan flip. We can safely void the PENDING row OR write
    // a ghost. Defensive: if the row is no longer PENDING (e.g. legacy data,
    // direct DB intervention), skip the wallet-mutating markVoided to avoid
    // double-spending against a CLEARED entry.
    try {
      const pendingEntry = await prisma.walletTransaction.findFirst({
        where: {
          stickerScanId: scan.id,
          type: WalletTransactionType.CASHBACK_CREDIT,
        },
        select: { id: true, cashbackStatus: true },
        orderBy: { createdAt: 'desc' },
      });
      if (pendingEntry && pendingEntry.cashbackStatus === 'PENDING') {
        await cashbackLifecycleService.markVoided({
          walletTransactionId: pendingEntry.id,
          actorUserId,
          reason,
        });
      } else if (pendingEntry) {
        logger.warn(`[stickerService.rejectScan] scan ${scanId} cashback entry already in ${pendingEntry.cashbackStatus}; skipping void to avoid wallet desync`);
      } else {
        await cashbackLifecycleService.recordRejectedAsVoided({
          userId: scan.userId,
          amount: scan.cashbackAmount ?? 0,
          reason,
          actorUserId,
          description: `Кешбек анулиран след риск преглед`,
          stickerScanId: scan.id,
          metadata: { source: 'STICKER_SCAN_REJECT', venueId: scan.venueId },
        });
      }
    } catch (err) {
      logger.error(`[stickerService.rejectScan] failed to record voided ghost for ${scanId}:`, err);
    }

    return prisma.stickerScan.findUniqueOrThrow({ where: { id: scanId } });
  }

  /**
   * Bulk approve scans. Sequential to keep cashback crediting deterministic and
   * avoid hammering the DB; per-scan failures are isolated so one bad row
   * doesn't kill the batch.
   */
  async bulkApprove(scanIds: string[]): Promise<{ successCount: number; errorCount: number; errors: Array<{ scanId: string; error: string }> }> {
    let successCount = 0;
    const errors: Array<{ scanId: string; error: string }> = [];
    for (const scanId of scanIds) {
      try {
        await this.approveScan(scanId);
        successCount++;
      } catch (error: any) {
        logger.error(`Bulk approve failed for scan ${scanId}:`, error);
        errors.push({ scanId, error: error?.message || 'Unknown error' });
      }
    }
    return { successCount, errorCount: errors.length, errors };
  }

  /**
   * Bulk reject scans with a shared reason.
   */
  async bulkReject(scanIds: string[], reason: string, actorUserId: string | null = null): Promise<{ successCount: number; errorCount: number; errors: Array<{ scanId: string; error: string }> }> {
    let successCount = 0;
    const errors: Array<{ scanId: string; error: string }> = [];
    for (const scanId of scanIds) {
      try {
        await this.rejectScan(scanId, reason, actorUserId);
        successCount++;
      } catch (error: any) {
        logger.error(`Bulk reject failed for scan ${scanId}:`, error);
        errors.push({ scanId, error: error?.message || 'Unknown error' });
      }
    }
    return { successCount, errorCount: errors.length, errors };
  }

  /**
   * Get or create venue sticker configuration
   */
  async getOrCreateVenueConfig(venueId: string): Promise<VenueStickerConfig> {
    let config = await prisma.venueStickerConfig.findUnique({
      where: { venueId },
    });

    if (!config) {
      config = await prisma.venueStickerConfig.create({
        data: { venueId },
      });
    }

    return config;
  }

  /**
   * Update venue sticker configuration.
   * Only fields that the sticker engine actually consults are accepted.
   *
   * cashbackPercent / premiumBonus / platinumBonus are NOT here: sticker cashback
   * is matrix-driven (CASHBACK_MATRIX + Partner.discountRate) via
   * fraudDetectionService.calculateCashback — managed in Admin › Cashback Rates
   * and Admin › Partners.
   *
   * gpsVerificationEnabled is intentionally NOT writable: proximity verification
   * is mandatory per product decision and the flag is ignored at runtime.
   * ocrVerificationEnabled / maxCashbackPerScan are NOT writable either: the
   * sticker flow has no OCR step, and cashback caps are driven by
   * VenueFraudConfig.maxCashbackPerScan through fraudDetectionService.calculateCashback.
   */
  async updateVenueConfig(venueId: string, raw: Record<string, unknown>): Promise<VenueStickerConfig> {
    const data: Record<string, unknown> = {};
    const ALLOWED = [
      'minBillAmount',
      'maxScansPerDay', 'maxScansPerMonth',
      'gpsRadiusMeters',
      'autoApproveThreshold',
      'isActive', 'metadata',
    ] as const;
    for (const key of ALLOWED) {
      if (key in raw) data[key] = raw[key];
    }
    // Spec §7.1: autoApproveThreshold must be in the 0–100 range (fraudScore is 0–100).
    if ('autoApproveThreshold' in data) {
      const t = data.autoApproveThreshold;
      if (typeof t !== 'number' || !isFinite(t) || t < 0 || t > 100) {
        throw new Error('autoApproveThreshold must be a number between 0 and 100');
      }
    }
    return prisma.venueStickerConfig.upsert({
      where: { venueId },
      update: data,
      create: { venueId, ...data },
    });
  }

  /**
   * Calculate distance between two GPS coordinates (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Perform fraud detection checks
   */
  private async performFraudCheck(params: {
    userId: string;
    venueId: string;
    billAmount: number;
    distance?: number;
    config: VenueStickerConfig;
  }): Promise<FraudCheckResult> {
    const { userId, venueId, billAmount, distance, config } = params;

    let fraudScore = 0;
    const fraudReasons: string[] = [];

    // GPS is enforced at the gate (createSession + scanSticker Path B): an out-of-radius
    // scan throws before reaching here, and VenueStickerConfig.gpsVerificationEnabled is
    // ignored by product decision. No duplicate GPS scoring at this layer.

    // 2. Check for duplicate scans (same user, same venue, same day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const scansToday = await prisma.stickerScan.count({
      where: {
        userId,
        venueId,
        createdAt: { gte: today },
      },
    });

    if (scansToday >= config.maxScansPerDay) {
      fraudScore += 40;
      fraudReasons.push(`MAX_SCANS_PER_DAY: ${scansToday}/${config.maxScansPerDay}`);
    }

    // 3. Check scans this month
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const scansThisMonth = await prisma.stickerScan.count({
      where: {
        userId,
        venueId,
        createdAt: { gte: thisMonth },
      },
    });

    if (scansThisMonth >= config.maxScansPerMonth) {
      fraudScore += 50;
      fraudReasons.push(`MAX_SCANS_PER_MONTH: ${scansThisMonth}/${config.maxScansPerMonth}`);
    }

    // 4. Unusual bill amount (very high)
    if (billAmount > 1000) {
      fraudScore += 15;
      fraudReasons.push(`HIGH_BILL_AMOUNT: ${billAmount} BGN`);
    }

    // 5. Check for rapid successive scans (within 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recentScans = await prisma.stickerScan.count({
      where: {
        userId,
        createdAt: { gte: thirtyMinutesAgo },
      },
    });

    if (recentScans > 3) {
      fraudScore += 25;
      fraudReasons.push(`RAPID_SCANNING: ${recentScans} scans in 30 minutes`);
    }

    // Spec §7.1: 0-30 = auto-approve, 31-60 = review, 61+ = high risk.
    const autoApproveThreshold = config.autoApproveThreshold ?? 30;

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (fraudScore <= 30) {
      riskLevel = 'LOW';
    } else if (fraudScore <= 60) {
      riskLevel = 'MEDIUM';
    } else if (fraudScore <= 90) {
      riskLevel = 'HIGH';
    } else {
      riskLevel = 'CRITICAL';
    }

    return {
      fraudScore,
      fraudReasons,
      riskLevel,
      requiresManualReview: fraudScore > autoApproveThreshold,
    };
  }

  /**
   * Get sticker scans by user
   */
  async getScansByUser(userId: string, limit: number = 50) {
    // Explicit select: fraudScore, fraudReasons, ipAddress, userAgent, ocrData MUST NOT
    // reach the scan owner. Leaking MERCHANT_MISMATCH or GPS_MISMATCH tells a fraudster
    // which rule tripped so they iterate on forged receipts. rejectionReason is kept
    // because users need to know *why* a scan was rejected (e.g. "receipt unreadable");
    // admin rejection copy must be written for the user, not for analysts. Admin-only
    // endpoints use a separate query that includes all internal fields.
    return prisma.stickerScan.findMany({
      where: { userId },
      select: {
        id: true,
        stickerId: true,
        venueId: true,
        cardId: true,
        billAmount: true,
        verifiedAmount: true,
        cashbackPercent: true,
        cashbackAmount: true,
        status: true,
        receiptImageUrl: true,
        rejectionReason: true,
        sessionStartedAt: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
        sticker: { include: { venue: true, location: true } },
        transaction: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get sticker scans by venue
   */
  async getScansByVenue(venueId: string, limit: number = 100): Promise<StickerScan[]> {
    return prisma.stickerScan.findMany({
      where: { venueId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sticker: {
          include: {
            location: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get stickers for a venue
   */
  async getStickersByVenue(venueId: string): Promise<Sticker[]> {
    return prisma.sticker.findMany({
      where: { venueId },
      include: {
        location: true,
        scans: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get pending scans for manual review
   */
  async getPendingReviewScans(limit: number = 50): Promise<StickerScan[]> {
    return prisma.stickerScan.findMany({
      where: {
        status: ScanStatus.MANUAL_REVIEW,
      },
      include: {
        user: true,
        sticker: {
          include: {
            venue: true,
            location: true,
          },
        },
        card: true,
      },
      orderBy: [
        { fraudScore: 'desc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
  }

  /**
   * Get venue sticker analytics
   */
  async getVenueAnalytics(venueId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const scans = await prisma.stickerScan.findMany({
      where: {
        venueId,
        createdAt: { gte: startDate },
      },
      include: {
        sticker: {
          include: {
            location: true,
          },
        },
      },
    });

    const totalScans = scans.length;
    const approvedScans = scans.filter(s => s.status === ScanStatus.APPROVED).length;
    const rejectedScans = scans.filter(s => s.status === ScanStatus.REJECTED).length;
    const pendingScans = scans.filter(s => s.status === ScanStatus.PENDING || s.status === ScanStatus.VALIDATING).length;

    const totalRevenue = scans
      .filter(s => s.status === ScanStatus.APPROVED)
      .reduce((sum, s) => sum + s.billAmount, 0);

    const totalCashback = scans
      .filter(s => s.status === ScanStatus.APPROVED)
      .reduce((sum, s) => sum + s.cashbackAmount, 0);

    const avgBillAmount = totalScans > 0 ? totalRevenue / approvedScans : 0;
    const avgCashback = approvedScans > 0 ? totalCashback / approvedScans : 0;

    return {
      period: {
        days,
        startDate,
        endDate: new Date(),
      },
      scans: {
        total: totalScans,
        approved: approvedScans,
        rejected: rejectedScans,
        pending: pendingScans,
        approvalRate: totalScans > 0 ? (approvedScans / totalScans) * 100 : 0,
      },
      revenue: {
        total: totalRevenue,
        average: avgBillAmount,
      },
      cashback: {
        total: totalCashback,
        average: avgCashback,
        percentage: totalRevenue > 0 ? (totalCashback / totalRevenue) * 100 : 0,
      },
    };
  }

  /**
   * Get admin review statistics
   */
  async getAdminStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get counts for different statuses
    const pending = await prisma.stickerScan.count({
      where: {
        status: ScanStatus.MANUAL_REVIEW,
      },
    });

    const approvedToday = await prisma.stickerScan.count({
      where: {
        status: ScanStatus.APPROVED,
        updatedAt: { gte: today },
      },
    });

    const rejectedToday = await prisma.stickerScan.count({
      where: {
        status: ScanStatus.REJECTED,
        updatedAt: { gte: today },
      },
    });

    // Calculate average fraud score for pending scans
    const pendingScans = await prisma.stickerScan.findMany({
      where: {
        status: ScanStatus.MANUAL_REVIEW,
      },
      select: {
        fraudScore: true,
      },
    });

    const avgFraudScore = pendingScans.length > 0
      ? pendingScans.reduce((sum, scan) => sum + scan.fraudScore, 0) / pendingScans.length
      : 0;

    return {
      pending,
      approved: approvedToday,
      rejected: rejectedToday,
      avgFraudScore,
    };
  }
}

export const stickerService = new StickerService();
