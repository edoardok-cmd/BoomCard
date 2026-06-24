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
import { cashbackLifecycleService, VOID_REASON_CATEGORIES } from './cashbackLifecycle.service';
import { writeAudit } from '../middleware/audit.middleware';
import { getSystemSettingStr } from '../utils/systemSettings';
import { isPartnerOperationallyActive } from './partner.service';
import { detach } from '../utils/detach';

/**
 * Convert a wall-clock date/time in a named IANA timezone to a UTC Date.
 * Uses the Intl.DateTimeFormat offset trick: format a candidate UTC date as
 * local-time components, parse them, derive the offset, then correct.
 * Works correctly across DST transitions without any external library.
 */
function wallClockToUTC(year: number, month: number, day: number, hour: number, tz: string): Date {
  const naive = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(naive);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const localEquiv = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second));
  const offsetMs = naive.getTime() - localEquiv.getTime();
  return new Date(naive.getTime() + offsetMs);
}

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
   * Spec §4.2 v1.1 — block receipt scanning when the user's most-recent
   * subscription is FAILED_PAYMENT ("неуспешно плащане"). No protected period,
   * no retry window. The mobile app pattern-matches the
   * SUBSCRIPTION_FAILED_PAYMENT marker to render the renewal CTA.
   *
   * Only the most-recent subscription row is checked. A user who lapsed and
   * then re-subscribed (new ACTIVE/TRIALING row) is recovered and must be
   * allowed to scan even if an older FAILED_PAYMENT row is still on file.
   * clearFailedPaymentSubsForUser() transitions those older rows to EXPIRED
   * when the new subscription is created, so in practice the most-recent check
   * is sufficient.
   *
   * PAST_DUE is blocked — it matches none of the allow branches below and falls
   * through to the generic SUBSCRIPTION_INACTIVE throw. It is a Stripe-internal
   * dunning state; §1.2's terminal block-states include Failed Payment, and
   * PAST_DUE precedes that state.
   */
  async assertSubscriptionAllowsScanning(userId: string): Promise<void> {
    // Spec §1.3 / §8.2 — user.status gate MUST be checked BEFORE subscription status.
    // Inactive account blocks scanning regardless of subscription status.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (user) {
      const s = user.status as string;
      if (s === 'INACTIVE') {
        throw new Error('ACCOUNT_INACTIVE: Account paused. Contact support to resume.');
      }
      if (s === 'ARCHIVED' || s === 'DELETED') {
        throw new Error('ACCOUNT_NOT_ACCESSIBLE: Account not accessible.');
      }
      if (s === 'PENDING_VERIFICATION' || s === 'PENDING_PAYMENT') {
        throw new Error('REGISTRATION_INCOMPLETE: Registration not complete.');
      }
    }

    const latest = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, cancelAtPeriodEnd: true, currentPeriodEnd: true },
    });

    if (!latest) {
      throw new Error(
        'SUBSCRIPTION_INACTIVE: Нямате активен абонамент. ' +
        'Абонирайте се от менюто „Абонамент и плащания", за да сканирате бележки.'
      );
    }

    const now = new Date();
    const status = latest.status;

    // (Spec §1.2) — the source spec DEFERS the admin handling of the Stripe-
    // mapped statuses (TRIALING, PAST_DUE, PAUSED, etc.) to product confirmation.
    // Decisions made here, documented as the current spec-aligned defaults:
    //   • TRIALING ≡ Active: a user in the Stripe trial has a live, paid-intent
    //     subscription, so scanning is allowed (treated identically to ACTIVE).
    //   • PAST_DUE is blocked — it matches none of the allow branches below and
    //     falls through to the generic SUBSCRIPTION_INACTIVE throw at the end of
    //     this function. It is a Stripe-internal dunning state; §1.2's terminal
    //     block-states include Failed Payment, and PAST_DUE precedes that state.
    //   • PAUSED blocks payout (enforced in wallet.service, not here) but is not a
    //     scan state in §1.2.
    // If product later defines different rules, change these branches and update
    // this note — they are the single documented decision point for the §1.2 gap.
    if (status === SubscriptionStatus.ACTIVE || (status as string) === 'TRIALING') {
      return;
    }

    // Spec §1.2 / §8.1.1 — Cancelled-within-paid-period: scanning allowed through
    // last paid day regardless of how the cancellation was initiated. The spec does
    // not require cancelAtPeriodEnd=true; only that currentPeriodEnd is still in the
    // future. This matches resolveCashbackTier which uses the same gate.
    if (
      status === SubscriptionStatus.CANCELLED &&
      latest.currentPeriodEnd != null &&
      latest.currentPeriodEnd > now
    ) {
      return;
    }

    if (status === SubscriptionStatus.FAILED_PAYMENT) {
      throw new Error(
        'SUBSCRIPTION_FAILED_PAYMENT: Абонаментът Ви е в статус „неуспешно плащане". ' +
        'Възобновете го от менюто „Абонамент и плащания", за да продължите да сканирате бележки.'
      );
    }

    if (status === SubscriptionStatus.EXPIRED) {
      throw new Error(
        'SUBSCRIPTION_EXPIRED: Абонаментът Ви е изтекъл. ' +
        'Подновете го от менюто „Абонамент и плащания", за да продължите да сканирате бележки.'
      );
    }

    // F-015: Distinct error code for CANCELLED post-period (paid period has ended).
    // Mobile client needs to distinguish "cancelled and period has ended" from other
    // inactive states so it can show the correct CTA (subscribe again vs. other action).
    if (
      status === SubscriptionStatus.CANCELLED &&
      (latest.currentPeriodEnd == null || latest.currentPeriodEnd <= new Date())
    ) {
      throw new Error(
        'SUBSCRIPTION_CANCELLED_EXPIRED: Абонаментът Ви е отменен и платеният период е приключил. ' +
        'Абонирайте се отново от менюто „Абонамент и плащания", за да продължите да сканирате бележки.'
      );
    }

    throw new Error(
      'SUBSCRIPTION_INACTIVE: Абонаментът Ви не е активен. ' +
      'Възобновете го от менюто „Абонамент и плащания", за да продължите да сканирате бележки.'
    );
  }

  /**
   * Resolve the user's cashback tier from their active Subscription.
   * Returns null when no active subscription exists — callers should treat this as
   * "no cashback" (Finding #1 fix). Using Subscription.plan as the single source of
   * truth (not Card.type) resolves Finding #2.
   */
  private async resolveCashbackTier(userId: string): Promise<'PREMIUM_WEEKLY' | 'BASIC' | 'PREMIUM_MONTHLY' | null> {
    const now = new Date();
    const sub = await prisma.subscription.findFirst({
      where: {
        userId,
        OR: [
          { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED, 'TRIALING' as any] } },
          { status: SubscriptionStatus.CANCELLED, currentPeriodEnd: { gt: now } },
        ],
      },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (!sub) return null;
    const plan = sub.plan as string;
    if (plan === 'PREMIUM_WEEKLY' || plan === 'BASIC' || plan === 'PREMIUM_MONTHLY') return plan as 'PREMIUM_WEEKLY' | 'BASIC' | 'PREMIUM_MONTHLY';
    return null;
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
        logger.error(`[generateStickersBulk] Failed to generate sticker for location ${locationId}:`, error);
      }
    }
    return stickers;
  }

  /**
   * Mark sticker as dispatched for physical deployment (PENDING → PROCESSING).
   * Spec §5.4 — PROCESSING = "В обработка": the label has been ordered/printed
   * but not yet confirmed deployed at the venue. Admins advance PROCESSING → ACTIVE
   * once the sticker is confirmed live.
   */
  async markStickerProcessing(stickerId: string, actorUserId?: string | null): Promise<Sticker> {
    const sticker = await prisma.sticker.findUnique({ where: { stickerId }, select: { id: true, status: true } });
    if (!sticker) throw new Error(`Sticker ${stickerId} not found`);
    if (sticker.status !== StickerStatus.PENDING) {
      throw new Error(`Sticker ${stickerId} must be in PENDING state to mark as processing (current: ${sticker.status})`);
    }
    const updated = await prisma.sticker.update({
      where: { stickerId },
      data: { status: StickerStatus.PROCESSING, printedAt: new Date() },
    });
    detach(writeAudit({
      actorUserId: actorUserId ?? null,
      action: 'STICKER_PROCESSING',
      objectType: 'Sticker',
      objectId: sticker.id,
      before: { status: StickerStatus.PENDING },
      after: { status: StickerStatus.PROCESSING },
    }), (err) => logger.error('[sticker.markStickerProcessing] audit write failed:', err));
    return updated;
  }

  /**
   * Mark sticker as printed and active (PENDING or PROCESSING → ACTIVE).
   *
   * Spec §1.5 rule 4, §4.2, §12.1 (Data Integrity Atomic Rule 1):
   * QR codes cannot be manually activated while the partner's status is
   * Inactive or Archived. We resolve venue → partner here and block activation
   * before writing the status change (r2c B1).
   */
  async activateSticker(stickerId: string): Promise<Sticker> {
    const sticker = await prisma.sticker.findUnique({
      where: { stickerId },
      select: {
        status: true,
        venue: {
          select: {
            partner: { select: { status: true, verifiedAt: true } },
          },
        },
      },
    });
    if (!sticker) throw new Error(`Sticker ${stickerId} not found`);
    const activatable: StickerStatus[] = [StickerStatus.PENDING, StickerStatus.PROCESSING];
    if (!activatable.includes(sticker.status)) {
      throw new Error(`Sticker ${stickerId} cannot be activated from ${sticker.status} state`);
    }
    // Spec §1.5 rule 4: block activation when the owning partner is non-operational.
    if (sticker.venue?.partner && !isPartnerOperationallyActive(sticker.venue.partner)) {
      throw new Error('Cannot activate QR code while partner status is not Active');
    }
    return prisma.sticker.update({
      where: { stickerId },
      data: {
        status: StickerStatus.ACTIVE,
        printedAt: sticker.status === StickerStatus.PENDING ? new Date() : undefined,
        activatedAt: new Date(),
      },
    });
  }

  /**
   * H2 (Spec §1.4 / §3.6 / Clash 2.4) — explicit per-QR reactivation of an
   * INACTIVE sticker.
   *
   * After a partner is reactivated FROM Archived, `syncQrCodesForPartner` Case 3
   * deliberately does NOT auto-reactivate that partner's stickers — they stay
   * INACTIVE and each must be "explicitly reactivated by an admin per code".
   * `activateSticker` only accepts PENDING/PROCESSING sources, so those stranded
   * INACTIVE stickers had no reachable reactivation path. This method provides it
   * WITHOUT introducing auto-reactivation: it operates on one sticker at a time
   * and is only invoked by an explicit admin action.
   *
   * Guards (mirror activateSticker):
   *   - Sticker must currently be INACTIVE (the Archived-phase auto-deactivated
   *     state). Other states are rejected — PENDING/PROCESSING go through
   *     activateSticker; ACTIVE/REPLACED/etc. are not reactivatable here.
   *   - The owning partner must be operationally Active (status=ACTIVE AND
   *     verifiedAt set). Spec §3.6: "QR codes cannot be manually activated while
   *     the partner is Inactive or Archived." So an admin can only reactivate a
   *     sticker once the re-onboarding completed and the partner re-verified.
   *
   * Clears autoDeactivatedAt so the sticker is no longer considered part of any
   * future bulk auto-reactivation set.
   */
  async reactivateInactiveSticker(stickerId: string, actorUserId?: string | null): Promise<Sticker> {
    const sticker = await prisma.sticker.findUnique({
      where: { stickerId },
      select: {
        id: true,
        status: true,
        venue: {
          select: {
            partner: { select: { status: true, verifiedAt: true } },
          },
        },
      },
    });
    if (!sticker) throw new Error(`Sticker ${stickerId} not found`);
    if (sticker.status !== StickerStatus.INACTIVE) {
      throw new Error(
        `Sticker ${stickerId} cannot be reactivated from ${sticker.status} state. ` +
        `This endpoint reactivates an INACTIVE sticker (e.g. one stranded after an ` +
        `Archived→Active partner reactivation). Use POST /activate for PENDING/PROCESSING stickers.`
      );
    }
    // Spec §3.6: block manual activation unless the owning partner is operationally
    // Active. F3 — fail CLOSED on orphan stickers: if the venue/partner relation
    // cannot be resolved we cannot confirm the partner is operationally Active, so
    // we reject rather than reactivate unconditionally.
    if (!sticker.venue?.partner || !isPartnerOperationallyActive(sticker.venue.partner)) {
      throw new Error('Cannot reactivate QR code while partner status is not Active');
    }
    const updated = await prisma.sticker.update({
      where: { stickerId },
      data: {
        status: StickerStatus.ACTIVE,
        activatedAt: new Date(),
        autoDeactivatedAt: null,
      },
    });
    detach(writeAudit({
      actorUserId: actorUserId ?? null,
      action: 'STICKER_REACTIVATED',
      objectType: 'Sticker',
      objectId: sticker.id,
      before: { status: StickerStatus.INACTIVE },
      after: { status: StickerStatus.ACTIVE, reason: 'explicit admin reactivation (Clash 2.4)' },
    }), (err) => logger.error('[sticker.reactivateInactiveSticker] audit write failed:', err));
    return updated;
  }

  /**
   * Spec §5.4 — atomically replace a sticker with a new one:
   *   1. Marks the old sticker REPLACED + stamps deactivatedAt.
   *   2. Creates a new sticker on the same location (starts as PENDING) with
   *      replacesId = old sticker's internal id (so the chain is queryable via
   *      newSticker.replaces / oldSticker.replacedBy[]).
   *
   * The two writes happen inside a single $transaction so a failure in step 2
   * rolls back the REPLACED stamp on the old sticker — no orphaned state.
   *
   * The new sticker must be separately advanced to ACTIVE via
   * markStickerProcessing + activateSticker once the physical label is deployed.
   */
  async replaceSticker(
    oldStickerId: string,
    actorUserId?: string | null,
  ): Promise<{ oldSticker: Sticker; newSticker: Sticker }> {
    // Pre-flight reads (outside tx — read-only; a concurrent replace would race
    // on the unique newStickerId constraint inside the tx and get a clean error).
    const old = await prisma.sticker.findUnique({
      where: { stickerId: oldStickerId },
      select: { id: true, locationId: true, status: true },
    });
    if (!old) throw new Error(`Sticker ${oldStickerId} not found`);
    if (old.status === StickerStatus.REPLACED) {
      throw new Error(`Sticker ${oldStickerId} is already replaced`);
    }

    // Derive the new sticker ID and QR payload before opening the transaction
    // (getVenueCode / location lookup are reads with no side effects).
    const location = await prisma.stickerLocation.findUnique({
      where: { id: old.locationId },
      include: { venue: true },
    });
    if (!location) throw new Error(`Location ${old.locationId} not found`);

    const venueCode = await this.getVenueCode(location.venueId);
    const baseId = `${venueCode}-${location.locationNumber}`;

    // Replacement stickers get a versioned suffix to avoid the @unique collision with
    // the still-present (REPLACED) old sticker. Count all stickers ever at this location
    // (including REPLACED ones) — revision = total + 1.
    // Original sticker: baseId (implicit V1). First replacement: baseId-V2. Etc.
    const stickerCountAtLocation = await prisma.sticker.count({
      where: { locationId: old.locationId },
    });
    const newStickerId = `${baseId}-V${stickerCountAtLocation + 1}`;

    // Pre-flight: verify the versioned ID isn't already claimed by a concurrent replace.
    const conflict = await prisma.sticker.findUnique({ where: { stickerId: newStickerId } });
    if (conflict) {
      throw new Error(
        `Cannot replace ${oldStickerId}: concurrent replacement in progress ` +
        `(${newStickerId} was just claimed). Please retry.`,
      );
    }

    const qrData: StickerQRData = {
      type: 'BOOM_STICKER',
      venueId: location.venueId,
      locationId: location.id,
      stickerId: newStickerId,
      locationType: location.locationType,
      version: '1.0',
    };

    // Atomic: mark old REPLACED + create new with replacesId in one transaction.
    // The pre-flight conflict check (above) closes the common case; if two replaces
    // both pass that check simultaneously the DB unique constraint on stickerId will
    // reject the second. Catch P2002 here and surface a retry-friendly message
    // rather than leaking the raw Prisma error to the caller.
    let oldSticker: Sticker;
    let newSticker: Sticker & { venue: unknown; location: unknown };
    try {
      ({ oldSticker, newSticker } = await prisma.$transaction(async (tx) => {
        const updatedOld = await tx.sticker.update({
          where: { stickerId: oldStickerId },
          data: { status: StickerStatus.REPLACED, deactivatedAt: new Date() },
        });

        const created = await tx.sticker.create({
          data: {
            venueId: location.venueId,
            locationId: location.id,
            stickerId: newStickerId,
            qrCode: JSON.stringify(qrData),
            locationType: location.locationType,
            status: StickerStatus.PENDING,
            metadata: JSON.stringify({ stickerId: newStickerId }),
            replacesId: old.id, // new sticker → old sticker (correct direction)
          },
          include: { venue: true, location: true },
        });

        return { oldSticker: updatedOld, newSticker: created };
      }));
    } catch (err: any) {
      if (err?.code === 'P2002' && String(err?.meta?.target ?? '').includes('stickerId')) {
        throw new Error(
          `Cannot replace ${oldStickerId}: a concurrent replacement already claimed ` +
          `${newStickerId}. Please retry.`,
        );
      }
      throw err;
    }

    detach(writeAudit({
      actorUserId: actorUserId ?? null,
      action: 'STICKER_REPLACED',
      objectType: 'Sticker',
      objectId: old.id,
      before: { stickerId: oldStickerId, status: old.status },
      after: { status: StickerStatus.REPLACED, newStickerId, newStickerDbId: newSticker.id },
    }), (err) => logger.error('[sticker.replaceSticker] audit write failed:', err));

    return { oldSticker, newSticker };
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
    message?: string;
  }> {
    const sticker = await prisma.sticker.findUnique({
      where: { stickerId },
      include: {
        location: { select: { isActive: true } },
        venue: {
          select: {
            id: true,
            name: true,
            stickerConfig: true,
            // discountRate and maxDiscountRate omitted — internal Business Formula components
            // (spec §11.3, Clash 10.6). isPartnerOperationallyActive only needs status+verifiedAt.
            partner: { select: { id: true, status: true, verifiedAt: true } },
          },
        },
      },
    });

    if (!sticker) {
      return { valid: false, message: 'Sticker not found' };
    }

    if (sticker.status === StickerStatus.REPLACED) {
      return {
        valid: false,
        message: 'STICKER_REPLACED: Този QR код е заменен. Моля, потърсете новия QR код на масата/обекта.',
      };
    }

    if (sticker.status !== StickerStatus.ACTIVE) {
      return { valid: false, message: `Sticker is ${sticker.status.toLowerCase()}` };
    }

    // Spec §5.4 v1.1 — if the physical location is deactivated by admin, QR scans
    // at that location must be blocked regardless of sticker row status.
    // StickerLocation.isActive=false means the spot is out of service (renovations,
    // decommissioned table, etc.). This is distinct from Sticker.status which tracks
    // the physical QR label lifecycle.
    if (sticker.location && !sticker.location.isActive) {
      return {
        valid: false,
        message: 'LOCATION_INACTIVE: Тази локация временно не е активна. Опитайте на друго място в обекта.',
      };
    }

    // Spec §5.3 v1.1 — even if the sticker row is ACTIVE, the partner's status
    // + verifiedAt gates whether the QR is operationally active. Mirror the
    // createSession / scanSticker gates so the mobile app gets a consistent
    // answer during pre-scan validation.
    if (sticker.venue.partner && !isPartnerOperationallyActive(sticker.venue.partner)) {
      return {
        valid: false,
        message: 'PARTNER_NOT_ACCEPTING: Този обект временно не приема BoomCard транзакции.',
      };
    }

    // Spec §11.3 / Clash 10.6: cashbackPercent is internal-only and must NEVER
    // be returned from a public (unauthenticated) endpoint. A partner with
    // physical access to their QR can call this endpoint to learn the cashback
    // rate and derive the internal margin (discountRate − cashbackPercent).
    // If the mobile app needs a cashback estimate for the pre-scan preview it
    // must call an authenticated user endpoint that resolves the user's actual
    // subscription tier.
    return {
      valid: true,
      venueId: sticker.venueId,
      venueName: sticker.venue.name,
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

    // Spec §4.2 v1.1 — block immediately when subscription is FAILED_PAYMENT.
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
    if (sticker.status === StickerStatus.REPLACED) {
      throw new Error('STICKER_REPLACED: Този QR код е заменен. Моля, потърсете новия QR код на масата/обекта.');
    }
    if (sticker.status !== StickerStatus.ACTIVE) throw new Error('Sticker is not active');
    // Spec §5.4 — location.isActive=false means the physical spot is decommissioned.
    if (sticker.location && !sticker.location.isActive) {
      throw new Error('LOCATION_INACTIVE: Тази локация временно не е активна. Опитайте на друго място в обекта.');
    }

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
    if (partner && !isPartnerOperationallyActive(partner)) {
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
      // Root-level select excludes all internal fields (fraudScore, fraudReasons,
      // specRiskLevel, cashbackPercent, ipAddress, userAgent, deviceFingerprint*,
      // receiptImageHash, ocrData) so they are never materialised by the ORM
      // regardless of who calls this method (spec §11.3, Clash 5.1, r2d HIGH).
      select: {
        id: true,
        userId: true,
        venueId: true,
        cardId: true,
        billAmount: true,
        cashbackAmount: true,
        status: true,
        latitude: true,
        longitude: true,
        distance: true,
        sessionStartedAt: true,
        createdAt: true,
        updatedAt: true,
        sticker: { select: { id: true, status: true, locationType: true, venue: { select: { id: true, name: true, nameBg: true, city: true, address: true } }, location: { select: { id: true, name: true, locationNumber: true } } } },
        card: { select: { id: true, type: true, status: true } },
      },
    }) as unknown as StickerScan;

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

    // Spec §4.2 v1.1 — block scanning when subscription is FAILED_PAYMENT.
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
      if (sessionPartner && !isPartnerOperationallyActive(sessionPartner)) {
        throw new Error('PARTNER_NOT_ACCEPTING: Този обект временно не приема BoomCard транзакции.');
      }

      // Server-side deadline: receipts must be submitted by 6:00 AM the next calendar morning
      // in the configured system timezone (§9.5). We read the timezone from SystemSetting so
      // an admin moving operations to a new market does not require a code change.
      const sessionStart = existing.sessionStartedAt ?? existing.createdAt;
      const tz = await getSystemSettingStr('timezone', 'Europe/Sofia');
      const sessionDayStr = sessionStart.toLocaleDateString('en-CA', { timeZone: tz });
      const [y, m, d] = sessionDayStr.split('-').map(Number);
      // wallClockToUTC gives the exact UTC instant for "next day 06:00" in the
      // configured timezone, handling DST transitions correctly without any library.
      const deadline = wallClockToUTC(y, m, d + 1, 6, tz);
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
        // Root-level select excludes all internal fields (spec §11.3, Clash 5.1, r2d HIGH).
        select: {
          id: true,
          userId: true,
          venueId: true,
          cardId: true,
          billAmount: true,
          cashbackAmount: true,
          status: true,
          rejectionReason: true,
          latitude: true,
          longitude: true,
          distance: true,
          sessionStartedAt: true,
          processedAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          sticker: { select: { id: true, status: true, locationType: true, venue: { select: { id: true, name: true, nameBg: true, city: true, address: true } }, location: { select: { id: true, name: true, locationNumber: true } } } },
          card: { select: { id: true, type: true, status: true } },
        },
      }) as unknown as StickerScan;

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

    if (sticker.status === StickerStatus.REPLACED) {
      throw new Error('STICKER_REPLACED: Този QR код е заменен. Моля, потърсете новия QR код на масата/обекта.');
    }
    if (sticker.status !== StickerStatus.ACTIVE) {
      throw new Error('Sticker is not active');
    }
    // Spec §5.4 — location.isActive=false means the physical spot is decommissioned.
    if (sticker.location && !sticker.location.isActive) {
      throw new Error('LOCATION_INACTIVE: Тази локация временно не е активна. Опитайте на друго място в обекта.');
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
    if (partner && !isPartnerOperationallyActive(partner)) {
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
      // Root-level select excludes all internal fields (spec §11.3, Clash 5.1, r2d HIGH).
      select: {
        id: true,
        userId: true,
        venueId: true,
        cardId: true,
        billAmount: true,
        cashbackAmount: true,
        status: true,
        rejectionReason: true,
        latitude: true,
        longitude: true,
        distance: true,
        sessionStartedAt: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        sticker: { select: { id: true, status: true, locationType: true, venue: { select: { id: true, name: true, nameBg: true, city: true, address: true } }, location: { select: { id: true, name: true, locationNumber: true } } } },
        card: { select: { id: true, type: true, status: true } },
      },
    }) as unknown as StickerScan;

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

    // Spec §4.2 v1.1 — block receipt scanning when subscription = FAILED_PAYMENT.
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
    if (scan.venue?.partner && !isPartnerOperationallyActive(scan.venue.partner)) {
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

    // F-018: Spec requires notifyQRSessionOpened when a QR session is opened /
    // receipt upload is confirmed. Fire non-fatally (must not block the upload flow).
    if (userId ?? scan.userId) {
      detach(notificationService
        .notifyQRSessionOpened(userId ?? scan.userId, scanId), (err) => logger.error(`[uploadReceipt] notifyQRSessionOpened failed for scan ${scanId}:`, err));
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
        detach(this.runMerchantVerificationFromBuffer(scanId, imageBuffer, candidateNames, scan.venue?.name ?? ''), () => {});
      }
    }

    // Spec §2.1 / §2.2 / §3.4 — compute the canonical five-signal additive risk level.
    // This is authoritative for routing the scan to auto-approve vs manual review.
    // The internal fraud score (scan.fraudScore) is retained for admin triage only.
    //
    // Signal inputs derived from the scan and OCR data at upload time:
    //   ibanChangedRecently: check if user's IBAN was changed within the last 24h.
    //   ocrConfidence:       OCR confidence from ocrData (0–100); below 60% → +30.
    //   locationMismatch:    GPS distance from the scanSticker phase is stored in
    //                        fraudReasons as 'GPS_FAR_FROM_VENUE'; detect it there.
    // Spec §3.4 / Clash 5.1 — Signal 2 fires when OCR confidence < 60.
    // When the client provides no OCR data we have no evidence of OCR failure,
    // so we default to the threshold boundary (60) rather than 0. Defaulting to 0
    // would permanently add +30 to every scan and make the Low-risk auto-approve
    // path (spec §3.4: score 0–20 → auto-approve) unreachable, violating the spec.
    // The client-supplied confidence field is dropped at the route layer to prevent
    // spoofing; absent confidence therefore means "no data" not "failed OCR".
    const ocrConfidence: number = (ocrData as any)?.confidence ?? 60;
    const locationMismatch = Array.isArray(scan.fraudReasons)
      && (scan.fraudReasons as string[]).some((r) => r === 'GPS_FAR_FROM_VENUE' || r === 'GPS_OUTSIDE_RANGE');
    const partnerId = scan.venue?.partner?.id ?? undefined;

    // Check if user's IBAN was changed in the last 24h (Signal 1, +40 points).
    // Queries by the exact action key 'wallet.iban.update' written by
    // WalletService.updatePayoutAccount() — NOT a substring match, which would
    // be fragile and could produce false positives (e.g. 'admin.iban.read').
    // If this action key ever changes, update both files together.
    let ibanChangedRecently = false;
    if (userId) {
      const ibanCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const ibanLog = await prisma.auditLog.findFirst({
        where: {
          actorUserId: userId,
          action: { equals: 'wallet.iban.update' },
          createdAt: { gte: ibanCutoff },
        },
        select: { id: true },
      }).catch(() => null);
      ibanChangedRecently = ibanLog !== null;
    }

    // Spec §2.1 five-signal risk level — drives manual-review gate
    const specRisk = await fraudDetectionService.computeSpecRiskLevel({
      userId: userId ?? scan.userId,
      partnerId,
      ibanChangedRecently,
      ocrConfidence,
      locationMismatch,
    });

    // Persist the spec risk level on the scan record so the admin dashboard can
    // filter/display. specRiskLevel is the dedicated column (added in BC-SCHEMA-1) and
    // is the single source of truth for spec risk.
    //
    // L3 (user-spec audit): the SPEC_RISK:<level>:<score> tag is no longer pushed into
    // fraudReasons. fraudReasons is an internal fraud-rule enum array; mixing semantic
    // risk metadata into it was fragile (a serializer change could leak the risk level
    // to users). Nothing downstream parses "SPEC_RISK:" out of fraudReasons (verified by
    // grep), so dropping the tag has no consumers to repoint.
    await prisma.stickerScan.update({
      where: { id: scanId },
      data: { specRiskLevel: specRisk.riskLevel },
    }).catch((err: unknown) => logger.error(`[uploadReceipt] failed to store spec risk level:`, err));

    // Spec §2.2/§3.4 (amendment 2026-06-24): only High risk → manual review queue.
    // Low and Medium auto-process via the auto-approval (within 24h) path.
    if (!specRisk.requiresManualReview) {
      // ── Auto-approve path (Spec §2.2/§3.4: Low/Medium risk auto-approve) ──
      // riskLevel=Low or Medium → auto-approve within 24h.
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
          // Safe select: internal fields must not materialise even in the error path.
          return prisma.stickerScan.findUniqueOrThrow({
            where: { id: scanId },
            select: {
              id: true, userId: true, venueId: true, cardId: true,
              billAmount: true, cashbackAmount: true, status: true,
              rejectionReason: true, sessionStartedAt: true, processedAt: true,
              createdAt: true, updatedAt: true,
            },
          }) as unknown as StickerScan;
        }
      }

      // Zero cashback (no active subscription) — just mark APPROVED; no
      // wallet or cashback record needed.
      return prisma.stickerScan.update({
        where: { id: scanId },
        data: { status: ScanStatus.APPROVED, processedAt: new Date() },
        // Safe select — internal fields excluded (spec §11.3, r2d HIGH).
        select: {
          id: true, userId: true, venueId: true, cardId: true,
          billAmount: true, cashbackAmount: true, status: true,
          rejectionReason: true, sessionStartedAt: true, processedAt: true,
          createdAt: true, updatedAt: true,
        },
      }) as unknown as StickerScan;
    }

    // ── Manual review path (Spec §2.2/§3.4: High risk only → manual queue) ─
    // Spec §2.1 thresholds: High = 51+. Only High-risk submissions enter the
    // admin queue; Medium (21–50) and Low (0–20) take the auto-process path.
    const finalScan = await prisma.stickerScan.update({
      where: { id: scanId },
      data: { status: ScanStatus.MANUAL_REVIEW },
      // Safe select — internal fields excluded (spec §11.3, r2d HIGH).
      select: {
        id: true, userId: true, venueId: true, cardId: true,
        billAmount: true, cashbackAmount: true, status: true,
        rejectionReason: true, sessionStartedAt: true, processedAt: true,
        createdAt: true, updatedAt: true,
      },
    }) as unknown as StickerScan;

    // Spec §2.2 / §3.4 v1.1 — create a PENDING cashback record visible to the user
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
        // Spec Clash 5.1: receipt match signal = +30. Corrected from prior +40.
        fraudScore: { increment: 30 },
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
  async approveScan(scanId: string, opts?: { verifiedAmount?: number; adminUserId?: string | null; notes?: string }): Promise<StickerScan> {
    const scan = await prisma.stickerScan.findUnique({
      where: { id: scanId },
      include: {
        // user: true omitted — only scan.userId (scalar) is consumed in this method;
        // fetching the full User row would load passwordHash/tokens into memory (r2e S4).
        venue: {
          include: {
            partner: { select: { id: true, discountRate: true, partnerType: { select: { maxDiscountRate: true } } } },
          },
        },
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
    // LOW-2 — set once a PENDING cashback entry has been promoted to CLEARED and
    // the wallet credited, so the catch block can compensate on a later failure.
    let promotedEntry: { id: string; walletId: string; amount: number } | null = null;

    try {
      // Spec §4.3 v1.1 — persist the fraud/risk score at transaction creation
      // so admin search/filter by risk score works without re-deriving from
      // receipt+stickerScan at query time.
      const persistedRiskScore = Math.round(scan.fraudScore ?? 0);

      // Spec §4.2/4.3 — snapshot the active subscription at approval time so
      // history remains queryable even after the sub is later expired/cancelled.
      const activeSub = await prisma.subscription.findFirst({
        where: { userId: scan.userId, status: { in: ['ACTIVE', 'TRIALING', 'PAUSED'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      // Spec §4.3 — persist margin at creation so historical reports are immune
      // to partner rate renegotiations. Formula: partnerCharge − userCashback.
      const partner = scan.venue?.partner ?? null;
      const discountRate = partner?.discountRate ?? partner?.partnerType?.maxDiscountRate ?? null;
      const persistedMargin = discountRate != null
        ? Math.round(((discountRate / 100) * effectiveBillAmount - effectiveCashbackAmount) * 100) / 100
        : null;

      const transaction = await prisma.transaction.create({
        data: {
          userId: scan.userId,
          subscriptionId: activeSub?.id ?? null,
          partnerId: partner?.id ?? null,
          venueId: scan.venueId,
          cardId: scan.cardId,
          type: TransactionType.PURCHASE,
          paymentMethod: PaymentMethod.CARD,
          amount: effectiveBillAmount,
          marginAmount: persistedMargin,
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
          // marginAmount and riskScore are internal-only (spec §11.3, §7.4, Clash 10.6).
          // Scoped select prevents them from appearing in any serialised response body,
          // admin logs, or request-response traces (r2d B3, task fix #2).
          transaction: { select: { id: true, cashbackAmount: true, status: true } },
          // Full User row excluded — passwordHash/reset tokens must never appear in
          // API responses or logs even on admin-only endpoints (r2e B1, task fix #3).
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          sticker: {
            include: {
              // Scoped select: any future Venue column addition won't silently reach
              // admin responses or auto-approve path serialisation (r2c INFO-2, r2e B1).
              venue: { select: { id: true, name: true, nameBg: true, city: true, address: true } },
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
        select: { id: true, amount: true, walletId: true },
      });

      if (pendingEntry) {
        // Audit-pass [1.1]: pass overrideAmount only when it actually differs,
        // so the lifecycle service can apply the reconciliation atomically with
        // the promotion + wallet credit (single $transaction).
        await cashbackLifecycleService.promotePendingToCleared({
          walletTransactionId: pendingEntry.id,
          actorUserId: opts?.adminUserId ?? null,
          reason: opts?.notes ?? 'Admin approved sticker scan after risk review',
          ...(pendingEntry.amount !== effectiveCashbackAmount
            ? { overrideAmount: effectiveCashbackAmount }
            : {}),
        });
        // LOW-2 (M5/approveScan rollback) — record that the PENDING entry was
        // promoted to CLEARED *and* the wallet was credited, so if a later step
        // in this same call throws, the catch block can compensate (demote back
        // to PENDING + reverse the credit). Without this, a partial failure
        // would leave the wallet credited while the scan reverts to
        // MANUAL_REVIEW, and the next hourly sweep would re-credit (pendingEntry
        // is now null → the credit() fallback runs a second time).
        promotedEntry = { id: pendingEntry.id, walletId: pendingEntry.walletId, amount: effectiveCashbackAmount };
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
        detach(writeAudit({
          actorUserId: opts.adminUserId ?? null,
          action: 'ADMIN_AMOUNT_OVERRIDE',
          objectType: 'StickerScan',
          objectId: scanId,
          before: { billAmount: scan.billAmount, cashbackAmount: scan.cashbackAmount },
          after: { billAmount: effectiveBillAmount, cashbackAmount: effectiveCashbackAmount, verifiedAmount: opts.verifiedAmount },
        }), (err) => logger.error(`[approveScan] audit write failed for override on scan ${scanId}:`, err));
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
      // LOW-2 — if a PENDING cashback entry was already promoted to CLEARED (and
      // the wallet credited) before this failure, compensate: demote it back to
      // PENDING and reverse the wallet credit, atomically. This restores the
      // pre-approve state so the next hourly sweep re-finds the PENDING entry and
      // promotes it once — instead of seeing pendingEntry === null and running
      // the credit() fallback, which would double-credit the user.
      if (promotedEntry) {
        try {
          await prisma.$transaction(async (tx) => {
            // Only reverse if the entry is still CLEARED (idempotent guard):
            // if a concurrent operation already moved it, do not double-revert.
            const { count } = await tx.walletTransaction.updateMany({
              where: { id: promotedEntry!.id, cashbackStatus: 'CLEARED' as any },
              data: {
                status: 'PENDING' as any,
                cashbackStatus: 'PENDING' as any,
                clearedAt: null,
                cashbackExpiresAt: null,
              },
            });
            if (count > 0) {
              await tx.wallet.update({
                where: { id: promotedEntry!.walletId },
                data: {
                  balance:          { increment: -promotedEntry!.amount },
                  availableBalance: { increment: -promotedEntry!.amount },
                },
              });
            }
          });
        } catch (compError) {
          logger.error(`CRITICAL: Failed to reverse promoted cashback credit for scan ${scanId} (entry ${promotedEntry.id}). Manual intervention required to avoid double-credit on next sweep.`, compError);
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
      });
    } catch (partnerNotifyError) {
      logger.error(`Failed to notify partner of scan ${scanId}:`, partnerNotifyError);
    }

    return updated!;
  }

  /**
   * F-008 / Spec §2.2 + §8.1 rule 6: ensure a void reason carries a controlled
   * category prefix so cashbackLifecycle.assertVoidReasonCategory accepts it.
   *
   * - If the reason already starts with a canonical category ("DUPLICATE",
   *   "FRAUD: foo", etc.) it is returned trimmed and unchanged.
   * - Otherwise the free-text reason is prefixed with the neutral default
   *   category (OTHER — per §8.1 rule 6 the voided record stays visible to the
   *   user with the reason shown, so an un-categorized admin rejection must not
   *   default to an unwarranted FRAUD accusation), producing e.g.
   *   "OTHER: Rejected by admin".
   *
   * Reuses VOID_REASON_CATEGORIES from cashbackLifecycle.service — the canonical
   * list is never redefined here.
   */
  private normalizeVoidReason(reason: string): string {
    const trimmed = (reason ?? '').trim();
    const firstToken = trimmed.split(':')[0].trim().toUpperCase();
    if ((VOID_REASON_CATEGORIES as readonly string[]).includes(firstToken)) {
      return trimmed;
    }
    const body = trimmed.length > 0 ? trimmed : 'Rejected by admin';
    return `OTHER: ${body}`;
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

    // F-008 / Spec §2.2 + §8.1 rule 6: cashbackLifecycle.markVoided (and the
    // ghost path) enforce a controlled void-reason vocabulary via
    // assertVoidReasonCategory — a free-text reason ("Rejected by admin", admin
    // notes, etc.) makes markVoided THROW, and the catch below swallows every
    // non-LOCKED/PAID error, silently dropping the void (the wallet entry is
    // never voided despite success:true). Normalize here so every reason carries
    // a controlled category before it reaches the lifecycle service. Per §8.1
    // rule 6 the voided record stays user-visible with its reason shown, so an
    // un-categorized rejection defaults to the neutral category OTHER (NOT
    // FRAUD — do not change this back to FRAUD; an un-categorized admin
    // rejection must not become an unwarranted fraud accusation). If the caller
    // already supplied a controlled category prefix (e.g. "DUPLICATE: ...") it
    // is preserved.
    const voidReason = this.normalizeVoidReason(reason);

    // Spec §4.4 — visible Voided record with the rejection reason. Non-fatal:
    // a ghost write failure must not leave the scan in an inconsistent state.
    //
    // Audit-pass [1.4]: the scan-level updateMany above already serialized
    // approve vs reject (both filter on status, only one can transition out
    // of MANUAL_REVIEW). If reject wins the scan claim, the PENDING row was
    // not yet promoted because approveScan's promotion is in the same try
    // block as the scan flip.
    //
    // Void guard (spec §4.4 v1.1):
    //   PENDING → void (normal path; balance was in pendingBalance, not yet
    //             moved to availableBalance).
    //   CLEARED → also void; markVoided decrements both balance and
    //             availableBalance, which is the correct reversal. This handles
    //             the edge case where an admin manually cleared the entry while
    //             the scan was still under MANUAL_REVIEW.
    //   LOCKED  → markVoided throws ("cancel the pending payout first") — let
    //             the error surface so the admin resolves the payout conflict.
    //   PAID    → markVoided throws ("issue a refund instead") — same.
    //   VOIDED  → markVoided is a no-op (already voided); safe.
    //   absent  → write a ghost Voided record for audit completeness.
    try {
      const pendingEntry = await prisma.walletTransaction.findFirst({
        where: {
          stickerScanId: scan.id,
          type: WalletTransactionType.CASHBACK_CREDIT,
        },
        select: { id: true, cashbackStatus: true },
        orderBy: { createdAt: 'desc' },
      });
      if (pendingEntry) {
        // markVoided handles every reachable state:
        //   PENDING / CLEARED → void + adjust wallet balances correctly
        //   VOIDED             → no-op (idempotent)
        //   LOCKED / PAID      → throws so the admin resolves the conflict
        await cashbackLifecycleService.markVoided({
          walletTransactionId: pendingEntry.id,
          actorUserId,
          reason: voidReason,
        });
      } else {
        await cashbackLifecycleService.recordRejectedAsVoided({
          userId: scan.userId,
          amount: scan.cashbackAmount ?? 0,
          reason: voidReason,
          actorUserId,
          description: `Кешбек анулиран след риск преглед`,
          stickerScanId: scan.id,
          metadata: { source: 'STICKER_SCAN_REJECT', venueId: scan.venueId },
        });
      }
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      // LOCKED/PAID conflicts must surface: swallowing them leaves the wallet
      // unbalanced and gives the admin no feedback that action is required.
      if (msg.includes('LOCKED') || msg.includes('PAID')) throw err;
      logger.error(`[stickerService.rejectScan] failed to record voided ghost for ${scanId}:`, err);
    }

    // Safe select: internal fields excluded (spec §11.3, r2e S1).
    return prisma.stickerScan.findUniqueOrThrow({
      where: { id: scanId },
      select: {
        id: true, userId: true, venueId: true, cardId: true,
        billAmount: true, cashbackAmount: true, status: true,
        rejectionReason: true, sessionStartedAt: true, processedAt: true,
        createdAt: true, updatedAt: true,
      },
    }) as unknown as StickerScan;
  }

  /**
   * Bulk approve scans. Sequential to keep cashback crediting deterministic and
   * avoid hammering the DB; per-scan failures are isolated so one bad row
   * doesn't kill the batch.
   *
   * actorUserId is threaded to each approveScan call so audit log entries record
   * the admin who triggered the bulk action (spec §10.3, r2e S3 / r2d S3).
   */
  async bulkApprove(scanIds: string[], actorUserId?: string | null): Promise<{ successCount: number; errorCount: number; errors: Array<{ scanId: string; error: string }> }> {
    let successCount = 0;
    const errors: Array<{ scanId: string; error: string }> = [];
    for (const scanId of scanIds) {
      try {
        await this.approveScan(scanId, { adminUserId: actorUserId ?? null });
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
      fraudReasons.push('DAILY_LIMIT_EXCEEDED');
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
      fraudReasons.push('MONTHLY_LIMIT_EXCEEDED');
    }

    // 4. Unusual bill amount (very high)
    if (billAmount > 1000) {
      fraudScore += 15;
      fraudReasons.push('HIGH_BILL_AMOUNT');
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
      fraudReasons.push('RAPID_SUBMISSIONS');
    }

    // Spec §2.1: 0-20 = LOW, 21-50 = MEDIUM, 51+ = HIGH.
    // Per spec §2.2 (amendment 2026-06-24): Low AND Medium auto-approve; only High enters
    // manual review. Default threshold=50 means scores 0–50 auto-approve, 51+ require review.
    const autoApproveThreshold = config.autoApproveThreshold ?? 50;

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (fraudScore <= 20) {
      riskLevel = 'LOW';
    } else if (fraudScore <= 50) {
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
        // stickerId omitted — raw QR token, spec §4.3/§11.3
        venueId: true,
        cardId: true,
        billAmount: true,
        verifiedAmount: true,
        // cashbackPercent omitted — internal Business Formula component (spec §11.3, Clash 10.6)
        cashbackAmount: true,
        status: true,
        receiptImageUrl: true,
        rejectionReason: true,
        sessionStartedAt: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
        sticker: {
          select: {
            id: true,
            status: true,
            locationType: true,
            // qrCode omitted — raw QR token
            venue: { select: { id: true, name: true, city: true } },
            location: { select: { id: true, name: true, locationNumber: true } },
          },
        },
        // transaction omitted — contains marginAmount and riskScore (spec §11.3)
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get sticker scans by venue — partner-safe projection.
   *
   * IMPORTANT: uses an explicit select to exclude all internal fraud/risk and
   * customer PII fields. Spec §11.3, §6, Clash 5.1: fraudScore, fraudReasons,
   * specRiskLevel, ipAddress, userAgent, ocrData, deviceFingerprint, and
   * receiptImageHash must NEVER reach a partner-role caller. cashbackPercent is
   * likewise excluded (Clash 10.6: internal formula component).
   *
   * Mirror the safe-select discipline applied in getScansByUser(). If this
   * method is ever extended, do NOT add include/select entries for the excluded
   * fields listed above.
   */
  async getScansByVenue(venueId: string, limit: number = 100) {
    return prisma.stickerScan.findMany({
      where: { venueId },
      select: {
        id: true,
        venueId: true,
        // stickerId omitted — raw QR token, spec §4.3/§11.3 (never shown to partner)
        // cardId omitted — spec §6/§11.3 (card identifiers not in permitted partner columns)
        billAmount: true,
        verifiedAmount: true,
        cashbackAmount: true,
        status: true,
        rejectionReason: true,
        sessionStartedAt: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            // firstName/lastName omitted — spec §6 permitted columns do not include
            // customer name; user PII must not be disclosed to a third-party partner.
            id: true,
          },
        },
        sticker: {
          select: {
            id: true,
            // stickerId omitted — raw QR token, spec §4.3/§11.3
            locationType: true,
            location: {
              select: {
                id: true,
                name: true,
                nameBg: true,
                locationNumber: true,
                locationType: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get stickers for a venue — partner-safe projection.
   *
   * IMPORTANT: uses an explicit select to exclude:
   *   - both raw token fields, stickerId AND qrCode: spec §4.3 / §11.3 — the raw
   *     QR tokens must NEVER reach the partner. A partner can already see the
   *     physical label; serving either raw token via API enables token cloning /
   *     forged /validate|/session|/scan calls.
   *   - nested scans: removed entirely. The scan listing is served by
   *     getScansByVenue() which applies its own safe select. Including full
   *     StickerScan rows here would expose fraudScore, fraudReasons,
   *     specRiskLevel, ipAddress, and other internal fields (spec §11.3,
   *     Clash 5.1). Callers that need recent-scan context for a sticker should
   *     call getScansByVenue() filtered by stickerId.
   */
  async getStickersByVenue(venueId: string) {
    return prisma.sticker.findMany({
      where: { venueId },
      select: {
        id: true,
        venueId: true,
        locationId: true,
        // stickerId AND qrCode both omitted — raw QR token fields, spec §4.3/§11.3.
        // A partner can see the physical label, but serving either raw token via API
        // enables token cloning / forged /validate|/session|/scan calls. Mirrors
        // /me/stickers.
        locationType: true,
        status: true,
        printedAt: true,
        activatedAt: true,
        deactivatedAt: true,
        autoDeactivatedAt: true,
        totalScans: true,
        lastScannedAt: true,
        replacesId: true,
        createdAt: true,
        updatedAt: true,
        location: {
          select: {
            id: true,
            name: true,
            nameBg: true,
            locationNumber: true,
            locationType: true,
            isActive: true,
            floor: true,
            section: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get pending scans for manual review.
   *
   * Uses an explicit select to prevent full User rows (passwordHash, token fields)
   * from being loaded. Any future caller of this public method gets a safe projection
   * rather than relying on the route layer to strip credentials (r2e B2).
   *
   * Fields included align with the safe inline query in the admin pending-review route
   * (stickers.routes.ts:864-882).
   */
  async getPendingReviewScans(limit: number = 50): Promise<any[]> {
    return prisma.stickerScan.findMany({
      where: {
        status: ScanStatus.MANUAL_REVIEW,
      },
      select: {
        id: true,
        venueId: true,
        billAmount: true,
        cashbackAmount: true,
        fraudScore: true,
        specRiskLevel: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // user: true excluded — would return passwordHash/passwordResetToken (r2e B2).
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        sticker: {
          select: {
            id: true,
            locationType: true,
            venue: {
              select: { id: true, name: true },
            },
            location: {
              select: {
                id: true,
                name: true,
                nameBg: true,
                locationNumber: true,
                locationType: true,
              },
            },
          },
        },
        card: {
          select: {
            id: true,
            type: true,
          },
        },
      },
      orderBy: [
        { fraudScore: 'desc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
  }

  /**
   * Get venue sticker analytics.
   *
   * Uses a minimal explicit select — only the four fields consumed by the
   * aggregation below (status, billAmount, cashbackAmount, createdAt). This
   * prevents all internal fields (fraudScore, fraudReasons, specRiskLevel,
   * cashbackPercent, ipAddress, ocrData, etc.) from being loaded into Node.js
   * process memory, even though they never appear in the returned summary object
   * (r2e S1). The sticker/location relation is not needed for aggregation.
   *
   * days is capped at MAX_ANALYTICS_DAYS (365) to prevent unbounded table scans
   * from being triggered by an untrusted query parameter (r2e S2).
   */
  private static readonly MAX_ANALYTICS_DAYS = 365;

  async getVenueAnalytics(venueId: string, days: number = 30) {
    const safeDays = Math.min(Math.max(1, Math.floor(days)), StickerService.MAX_ANALYTICS_DAYS);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - safeDays);

    const scans = await prisma.stickerScan.findMany({
      where: {
        venueId,
        createdAt: { gte: startDate },
      },
      // Minimal select — only the four scalar fields consumed by the aggregations
      // below. Internal fields (fraudScore, specRiskLevel, cashbackPercent, ipAddress,
      // ocrData, deviceFingerprint, etc.) must not be loaded into memory (r2e S1).
      select: {
        status: true,
        billAmount: true,
        cashbackAmount: true,
        createdAt: true,
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

    // Divide-by-zero guard: use approvedScans (not totalScans) as the denominator
    // because totalRevenue and totalCashback are both derived from approved scans only.
    const avgBillAmount = approvedScans > 0 ? totalRevenue / approvedScans : 0;
    const avgCashback = approvedScans > 0 ? totalCashback / approvedScans : 0;

    return {
      period: {
        days: safeDays,
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
      // Spec §11.3 / §7.4 / Clash 10.6: cashback.percentage (the derived effective
      // cashback rate) is an internal formula component and must NEVER be shown to
      // partners. Total and average cashback monetary amounts are permissible.
      cashback: {
        total: totalCashback,
        average: avgCashback,
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
