import { WalletTransactionType, WalletTransactionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { getSystemSettingInt, getSystemSettingFloat } from '../utils/systemSettings';
import {
  DEFAULT_DAILY_SUBMISSION_LIMIT,
  DEFAULT_MAX_CASHBACK_PER_SCAN,
  DEFAULT_MAX_CASHBACK_PER_DAY,
  DEFAULT_MAX_CASHBACK_PER_MONTH,
  DEFAULT_MIN_BILL_AMOUNT,
  DEFAULT_MONTHLY_SUBMISSION_LIMIT,
  GPS_FAR_THRESHOLD_M,
  GPS_WARNING_THRESHOLD_M,
  OCR_LOW_CONFIDENCE_THRESHOLD,
  OCR_MODERATE_CONFIDENCE_THRESHOLD,
  AMOUNT_LARGE_MISMATCH_PCT,
  AMOUNT_MODERATE_MISMATCH_PCT,
  RAPID_SUBMISSION_WINDOW_MS,
  RAPID_SUBMISSION_COUNT_THRESHOLD,
  UNUSUAL_HOUR_START,
  UNUSUAL_HOUR_END,
  DEFAULT_TEMPLATE_FRAUD_POINTS,
  DEFAULT_TEMPLATE_VISUAL_WEIGHT,
  DEFAULT_TEMPLATE_MERCHANT_WEIGHT,
  DEFAULT_TEMPLATE_KEYWORD_WEIGHT,
  DEFAULT_TEMPLATE_MIN_SIMILARITY,
  DEFAULT_TEMPLATE_MERCHANT_THRESHOLD,
  CASHBACK_MATRIX,
  CASHBACK_MATRIX_STEPS,
  PERCEPTUAL_HASH_CLOSE_THRESHOLD,
  PERCEPTUAL_HASH_MODERATE_THRESHOLD,
  DEVICE_FINGERPRINT_LOOKBACK_MS,
  DEVICE_FINGERPRINT_FAMILIAR_THRESHOLD,
  DEVICE_FINGERPRINT_NEW_MULTI_DEVICE_POINTS,
  DEVICE_FINGERPRINT_NEW_POINTS,
  DEVICE_FINGERPRINT_RARE_MULTI_DEVICE_POINTS,
} from '../constants/receipt.constants';
import { receiptTemplateService } from './receiptTemplate.service';

/**
 * Fraud Detection Service
 *
 * Comprehensive fraud checking system with 10+ fraud indicators
 * - Duplicate image detection via SHA-256 hashing
 * - Amount validation (OCR vs user-entered)
 * - GPS verification (Haversine distance calculation)
 * - OCR confidence scoring
 * - Rate limiting (daily/monthly submission caps)
 * - Merchant whitelist/blacklist checking
 * - Time-based anomaly detection
 * - Card tier verification
 *
 * Fraud Score Scale:
 * - Internal multi-signal fraud score used for admin triage
 * - Spec §2.1 five-signal additive risk level drives the manual-review gate:
 *   Low (0–20) → auto-approve within 24h; Medium/High → manual review queue
 */

// Spec §2.1 five-signal risk scoring constants (additive model, canonical set)
const RISK_IBAN_CHANGE_POINTS   = 40;  // IBAN changed in last 24h
const RISK_RECEIPT_MATCH_POINTS = 30;  // Receipt match confidence < 60%
const RISK_LOCATION_MISMATCH_POINTS = 20; // QR location mismatch
const RISK_USER_VOIDED_POINTS   = 20;  // User has 3+ Voided cashback records
const RISK_PARTNER_FLAG_POINTS  = 10;  // Partner has active risk flag

/** Spec §2.1: threshold boundaries for the additive risk level. */
const RISK_LEVEL_MEDIUM_MIN = 21; // scores 21–50 → Medium
const RISK_LEVEL_HIGH_MIN   = 51; // scores 51+  → High

export type SpecRiskLevel = 'Low' | 'Medium' | 'High';

export interface SpecRiskResult {
  /** Additive score from the 5 canonical signals (spec §2.1). */
  riskScore: number;
  /** Spec §2.1 risk level derived from riskScore thresholds. */
  riskLevel: SpecRiskLevel;
  /**
   * True when riskLevel is Medium or High — both require admin manual review.
   * Spec §2.2: "Medium Risk → Manual Review triggered — all Medium-risk records
   * enter the admin review queue (same workflow as High Risk)."
   * False (Low) → eligible for automatic approval within 24h (spec §3.4).
   */
  requiresManualReview: boolean;
  /** Human-readable reasons for each signal that fired. */
  riskSignals: string[];
}

interface FraudCheckParams {
  imageHash: string;
  ocrAmount?: number;
  userAmount?: number;
  userLat?: number;
  userLon?: number;
  venueLat?: number;
  venueLon?: number;
  ocrConfidence: number;
  merchantName?: string;
  ocrRawText?: string;      // for template keyword matching
  perceptualHash?: string;  // dHash hex for visual template comparison
  userId: string;
  venueId?: string;
  cardTier?: 'PREMIUM_WEEKLY' | 'BASIC' | 'PREMIUM';
  deviceFingerprint?: string;  // SHA-256 hash of device properties
  /** When re-checking an existing receipt (e.g. admin amount correction), pass its ID
   *  so the duplicate-image check doesn't penalise the receipt against itself. */
  excludeReceiptId?: string;
}

interface FraudCheckResult {
  fraudScore: number;
  fraudReasons: string[];
  isApproved: boolean;
  requiresManualReview: boolean;
  recommendations?: string[];
}

interface MerchantCheckResult {
  isWhitelisted: boolean;
  isBlacklisted: boolean;
  merchantData?: any;
}

class FraudDetectionService {
  /**
   * Main fraud detection method
   * Runs all fraud checks and returns comprehensive result
   */
  async checkReceipt(params: FraudCheckParams): Promise<FraudCheckResult> {
    let score = 0;
    const reasons: string[] = [];
    const recommendations: string[] = [];

    try {
      // Fetch per-venue config up front so later checks (GPS/OCR/rate-limit/
      // template) share a single DB read. Toggles like gpsVerificationEnabled
      // and ocrVerificationEnabled must be known before those checks run.
      const config = params.venueId ? await this.getVenueConfig(params.venueId) : null;

      // 1. Duplicate image check (40 points)
      const isDuplicate = await this.checkDuplicate(params.imageHash, params.excludeReceiptId);
      if (isDuplicate) {
        score += 40;
        reasons.push('DUPLICATE_IMAGE');
        recommendations.push('Image has been previously submitted');
      }

      // 1b. Perceptual hash duplicate check (35/15 points)
      // Detects resubmission of the same receipt as a slightly different image file,
      // which bypasses the SHA-256 check. Compares dHash Hamming distance against
      // all of this user's previously approved receipts.
      if (params.perceptualHash) {
        const phResult = await this.checkPerceptualDuplicate({
          perceptualHash: params.perceptualHash,
          userId: params.userId,
          excludeReceiptId: params.excludeReceiptId,
        });
        if (phResult.isClose) {
          score += 35;
          reasons.push('PERCEPTUAL_DUPLICATE_CLOSE');
          recommendations.push('Receipt image is visually near-identical to a previously submitted receipt');
        } else if (phResult.isModerate) {
          score += 15;
          reasons.push('PERCEPTUAL_DUPLICATE_MODERATE');
          recommendations.push('Receipt image is visually similar to a previously submitted receipt');
        }
      }

      // 2. Amount validation (15-30 points)
      if (params.ocrAmount != null && params.userAmount != null && (params.ocrAmount > 0 || params.userAmount > 0)) {
        const diff = Math.abs(params.ocrAmount - params.userAmount);
        const maxAmount = Math.max(params.ocrAmount, params.userAmount);
        const percentDiff = maxAmount > 0 ? (diff / maxAmount) * 100 : 0;

        if (percentDiff > AMOUNT_LARGE_MISMATCH_PCT) {
          score += 30;
          reasons.push('LARGE_AMOUNT_MISMATCH');
          recommendations.push(`OCR detected ${params.ocrAmount} BGN but user entered ${params.userAmount} BGN`);
        } else if (percentDiff > AMOUNT_MODERATE_MISMATCH_PCT) {
          score += 15;
          reasons.push('AMOUNT_MISMATCH');
          recommendations.push('Moderate mismatch between OCR and user-entered amount');
        }
      }

      // 3. GPS verification (15-25 points)
      // Skipped when the partner has explicitly disabled GPS scoring for their
      // locations (e.g. delivery/no-fixed-address partners). Per-venue radius
      // override (config.gpsRadiusMeters) replaces the global FAR threshold;
      // warning threshold stays global so the scoring curve still makes sense.
      if (
        config?.gpsVerificationEnabled !== false &&
        params.userLat && params.userLon && params.venueLat && params.venueLon
      ) {
        const distance = this.calculateDistance(
          params.userLat,
          params.userLon,
          params.venueLat,
          params.venueLon
        );
        const farThreshold = config?.gpsRadiusMeters && config.gpsRadiusMeters > 0
          ? config.gpsRadiusMeters
          : GPS_FAR_THRESHOLD_M;

        if (distance > farThreshold) {
          score += 25;
          reasons.push('GPS_FAR_FROM_VENUE');
          recommendations.push(`User is ${Math.round(distance)}m away from venue (max: ${farThreshold}m)`);
        } else if (distance > GPS_WARNING_THRESHOLD_M) {
          score += 15;
          reasons.push('GPS_OUTSIDE_RANGE');
          recommendations.push(`User is ${Math.round(distance)}m away from venue (recommended: <${GPS_WARNING_THRESHOLD_M}m)`);
        }
      }

      // 4. OCR confidence check (20 points)
      if (config?.ocrVerificationEnabled !== false) {
        if (params.ocrConfidence < OCR_LOW_CONFIDENCE_THRESHOLD) {
          score += 20;
          reasons.push('LOW_OCR_CONFIDENCE');
          recommendations.push(`OCR confidence is ${params.ocrConfidence.toFixed(0)}% (min: ${OCR_LOW_CONFIDENCE_THRESHOLD}%)`);
        } else if (params.ocrConfidence < OCR_MODERATE_CONFIDENCE_THRESHOLD) {
          score += 10;
          reasons.push('MODERATE_OCR_CONFIDENCE');
        }
      }

      // 5. Rate limiting check (30 points)
      const userStats = await this.getUserStats(params.userId);

      const systemDailyLimit = await getSystemSettingInt('daily_scan_limit_default', DEFAULT_DAILY_SUBMISSION_LIMIT);
      const maxDaily = config?.maxScansPerDay || systemDailyLimit;
      const maxMonthly = config?.maxScansPerMonth || DEFAULT_MONTHLY_SUBMISSION_LIMIT;

      if (userStats.submissionsToday >= maxDaily) {
        score += 30;
        reasons.push('DAILY_LIMIT_EXCEEDED');
        recommendations.push(`User has submitted ${userStats.submissionsToday} receipts today (max: ${maxDaily})`);
      }

      if (userStats.submissionsThisMonth >= maxMonthly) {
        score += 30;
        reasons.push('MONTHLY_LIMIT_EXCEEDED');
        recommendations.push(`User has submitted ${userStats.submissionsThisMonth} receipts this month (max: ${maxMonthly})`);
      }

      // 6. Merchant whitelist/blacklist check (50 points)
      if (params.merchantName) {
        const merchantStatus = await this.checkMerchant(params.merchantName);
        if (merchantStatus.isBlacklisted) {
          score += 50;
          reasons.push('MERCHANT_BLACKLISTED');
          recommendations.push(`Merchant "${params.merchantName}" is blacklisted`);
        } else if (merchantStatus.isWhitelisted) {
          // Reduce score by 10 if merchant is trusted
          score = Math.max(0, score - 10);
        }
      }

      // 7. Suspicious time patterns (up to 25 points: 15 rapid + 10 unusual hour)
      // Both signals are evaluated independently and can combine.
      const timePatterns = await this.checkTimePattern(params.userId);
      for (const pattern of timePatterns) {
        score += pattern.score;
        reasons.push(pattern.reason);
        recommendations.push(pattern.recommendation);
      }

      // 7b. Device fingerprint check (15-25 points)
      if (params.deviceFingerprint) {
        const deviceCheck = await this.checkDeviceFingerprint({
          userId: params.userId,
          deviceFingerprint: params.deviceFingerprint,
        });

        if (deviceCheck.isNew && deviceCheck.distinctDevices >= 2) {
          score += DEVICE_FINGERPRINT_NEW_MULTI_DEVICE_POINTS;
          reasons.push('NEW_DEVICE_MULTI_DEVICE_USER');
          recommendations.push(
            `Submission from a never-seen device; user has ${deviceCheck.distinctDevices} distinct devices in the last 90 days`
          );
        } else if (deviceCheck.isNew) {
          score += DEVICE_FINGERPRINT_NEW_POINTS;
          reasons.push('NEW_DEVICE');
          recommendations.push('First submission from this device');
        } else if (deviceCheck.isRare && deviceCheck.distinctDevices >= 3) {
          score += DEVICE_FINGERPRINT_RARE_MULTI_DEVICE_POINTS;
          reasons.push('RARE_DEVICE_MULTI_DEVICE_USER');
          recommendations.push(
            `Rarely-used device (${deviceCheck.distinctDevices} distinct devices in 90 days)`
          );
        }
      }

      // 8. Amount threshold checks (10 points each)
      if (params.userAmount) {
        const minAmount = config?.minBillAmount || DEFAULT_MIN_BILL_AMOUNT;
        if (params.userAmount < minAmount) {
          score += 10;
          reasons.push('AMOUNT_TOO_LOW');
          recommendations.push(`Receipt amount ${params.userAmount} BGN is below minimum ${minAmount} BGN`);
        }
        if (config?.maxBillAmount && params.userAmount > config.maxBillAmount) {
          score += 20;
          reasons.push('AMOUNT_EXCEEDS_VENUE_MAX');
          recommendations.push(`Receipt amount ${params.userAmount} BGN exceeds venue maximum ${config.maxBillAmount} BGN`);
        }
      }

      // 9. Card tier verification (reduce score for premium users).
      // cardTier === null (no active subscription) gets no discount — intentional.
      if (params.cardTier === 'PREMIUM') {
        score = Math.max(0, score - 5);
      } else if (params.cardTier === 'BASIC') {
        score = Math.max(0, score - 3);
      }

      // 10. Venue receipt template comparison
      // Only runs when: templateMatchEnabled is true, venueId is known, and a
      // perceptual hash was computed for the submitted image.
      // config is already in scope from check #5 — no additional DB query.
      if (
        params.venueId &&
        params.perceptualHash &&
        config?.templateMatchEnabled === true
      ) {
        const templateResult = await receiptTemplateService.compareAgainstTemplates({
          venueId:       params.venueId,
          perceptualHash: params.perceptualHash,
          merchantName:  params.merchantName,
          ocrRawText:    params.ocrRawText,
          config: {
            templateVisualWeight:      config.templateVisualWeight      ?? DEFAULT_TEMPLATE_VISUAL_WEIGHT,
            templateMerchantWeight:    config.templateMerchantWeight    ?? DEFAULT_TEMPLATE_MERCHANT_WEIGHT,
            templateKeywordWeight:     config.templateKeywordWeight     ?? DEFAULT_TEMPLATE_KEYWORD_WEIGHT,
            templateMinSimilarity:     config.templateMinSimilarity     ?? DEFAULT_TEMPLATE_MIN_SIMILARITY,
            templateFraudPoints:       config.templateFraudPoints       ?? DEFAULT_TEMPLATE_FRAUD_POINTS,
            templateMerchantThreshold: config.templateMerchantThreshold ?? DEFAULT_TEMPLATE_MERCHANT_THRESHOLD,
          },
        });

        if (templateResult.templatesChecked > 0 && !templateResult.matches) {
          const fraudPoints = config.templateFraudPoints ?? DEFAULT_TEMPLATE_FRAUD_POINTS;
          score += fraudPoints;
          reasons.push('TEMPLATE_MISMATCH');
          recommendations.push(
            `Receipt does not match venue templates (best similarity: ${templateResult.bestSimilarity.toFixed(2)})`
          );
        }
      }

      // Final score capping
      const finalScore = Math.min(100, Math.max(0, score));

      // Spec §3.4: requiresManualReview is determined by the spec §2.1 five-signal
      // risk level (computed separately via computeSpecRiskLevel). The internal
      // fraud score is retained for admin triage reference only.
      // NOTE: The legacy Receipt submission flow always sets requiresManualReview=true
      // here as a conservative default; the sticker scan flow (sticker.service.ts)
      // calls computeSpecRiskLevel() separately and uses that result to gate manual review.
      return {
        fraudScore: finalScore,
        fraudReasons: reasons,
        isApproved: false,
        requiresManualReview: true,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
      };
    } catch (error) {
      logger.error('Error in fraud detection:', error);
      // On error, require manual review
      return {
        fraudScore: 50,
        fraudReasons: ['FRAUD_CHECK_ERROR'],
        isApproved: false,
        requiresManualReview: true,
        recommendations: ['Fraud check failed - requires manual verification'],
      };
    }
  }

  /**
   * Check if image hash exists in database (duplicate detection).
   * Pass excludeReceiptId when re-checking an existing receipt so it isn't
   * flagged against its own stored hash.
   *
   * Cross-flow aware: checks BOTH Receipt.imageHash AND StickerScan.receiptImageHash
   * so a user can't submit the same receipt photo via the sticker flow and the
   * receipt flow without detection.
   *
   * Only counts non-REJECTED records as true duplicates. REJECTED records are
   * excluded so users can re-submit legitimately rejected receipts without
   * being penalized 40 fraud points for the same hash.
   */
  private async checkDuplicate(imageHash: string, excludeReceiptId?: string): Promise<boolean> {
    const [receiptDup, stickerDup] = await Promise.all([
      prisma.receipt.findFirst({
        where: {
          imageHash,
          status: { in: ['APPROVED', 'PENDING', 'MANUAL_REVIEW'] },
          ...(excludeReceiptId ? { id: { not: excludeReceiptId } } : {}),
        },
      }),
      (prisma.stickerScan as any).findFirst({
        where: {
          receiptImageHash: imageHash,
          status: { in: ['PENDING', 'VALIDATING', 'APPROVED', 'MANUAL_REVIEW'] },
        },
      }),
    ]);
    return !!(receiptDup || stickerDup);
  }

  /**
   * Count set bits in a nibble (0–15).
   */
  private popcount4(n: number): number {
    return ((n >> 3) & 1) + ((n >> 2) & 1) + ((n >> 1) & 1) + (n & 1);
  }

  /**
   * Hamming distance between two dHash hex strings (character-by-character XOR).
   * Returns Infinity if lengths differ (hashes are incomparable).
   */
  private hexHammingDistance(a: string, b: string): number {
    if (a.length !== b.length) return Infinity;
    let distance = 0;
    for (let i = 0; i < a.length; i++) {
      distance += this.popcount4(parseInt(a[i], 16) ^ parseInt(b[i], 16));
    }
    return distance;
  }

  /**
   * Compare a submitted perceptualHash against all of the user's approved receipts.
   * Returns whether the closest match is within the close or moderate duplicate thresholds.
   */
  private async checkPerceptualDuplicate(params: {
    perceptualHash: string;
    userId: string;
    excludeReceiptId?: string;
  }): Promise<{ isClose: boolean; isModerate: boolean }> {
    // Include both APPROVED and MANUAL_REVIEW receipts — consistent with SHA-256
    // checkDuplicate() which has no status filter. Excluding MANUAL_REVIEW would let
    // a fraudster submit a slightly-modified image of a receipt already under review.
    const existing = await prisma.receipt.findMany({
      where: {
        userId: params.userId,
        status: { in: ['APPROVED', 'MANUAL_REVIEW'] as any[] },
        perceptualHash: { not: null },
        ...(params.excludeReceiptId ? { id: { not: params.excludeReceiptId } } : {}),
      },
      select: { perceptualHash: true },
    });

    let minDistance = Infinity;
    for (const r of existing) {
      if (!r.perceptualHash) continue;
      const d = this.hexHammingDistance(params.perceptualHash, r.perceptualHash);
      if (d < minDistance) minDistance = d;
    }

    return {
      isClose: minDistance <= PERCEPTUAL_HASH_CLOSE_THRESHOLD,
      isModerate:
        minDistance > PERCEPTUAL_HASH_CLOSE_THRESHOLD &&
        minDistance <= PERCEPTUAL_HASH_MODERATE_THRESHOLD,
    };
  }

  /**
   * Check if the submitting device is familiar for this user.
   * Queries the user's last 90 days of receipts + sticker scans.
   */
  private async checkDeviceFingerprint(params: {
    userId: string;
    deviceFingerprint: string;
  }): Promise<{ isNew: boolean; isRare: boolean; distinctDevices: number }> {
    const cutoff = new Date(Date.now() - DEVICE_FINGERPRINT_LOOKBACK_MS);

    const [matchCount, distinctReceipts, distinctScans] = await Promise.all([
      // How many times has this exact fingerprint been seen for this user?
      prisma.receipt.count({
        where: {
          userId: params.userId,
          deviceFingerprint: params.deviceFingerprint,
          createdAt: { gte: cutoff },
        },
      }).then(async (receiptCount) => {
        const scanCount = await prisma.stickerScan.count({
          where: {
            userId: params.userId,
            deviceFingerprint: params.deviceFingerprint,
            createdAt: { gte: cutoff },
          },
        });
        return receiptCount + scanCount;
      }),
      // Distinct device fingerprints from receipts
      prisma.receipt.findMany({
        where: {
          userId: params.userId,
          deviceFingerprint: { not: null },
          createdAt: { gte: cutoff },
        },
        select: { deviceFingerprint: true },
        distinct: ['deviceFingerprint'],
      }),
      // Distinct device fingerprints from sticker scans
      prisma.stickerScan.findMany({
        where: {
          userId: params.userId,
          deviceFingerprint: { not: null },
          createdAt: { gte: cutoff },
        },
        select: { deviceFingerprint: true },
        distinct: ['deviceFingerprint'],
      }),
    ]);

    const allFingerprints = new Set([
      ...distinctReceipts.map((r) => r.deviceFingerprint),
      ...distinctScans.map((s) => s.deviceFingerprint),
    ]);

    return {
      isNew: matchCount === 0,
      isRare: matchCount > 0 && matchCount < DEVICE_FINGERPRINT_FAMILIAR_THRESHOLD,
      distinctDevices: allFingerprints.size,
    };
  }

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   * Returns distance in meters
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Get user submission statistics for rate limiting
   */
  private async getUserStats(userId: string) {
    const now = new Date();

    // Rolling 24-hour window — matches the cashback cap window in calculateCashback()
    const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const submissionsToday = await prisma.receipt.count({
      where: {
        userId,
        createdAt: { gte: dayStart },
      },
    });

    // Rolling 30-day window — matches the cashback cap window in calculateCashback()
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const submissionsThisMonth = await prisma.receipt.count({
      where: {
        userId,
        createdAt: { gte: monthStart },
      },
    });

    return {
      submissionsToday,
      submissionsThisMonth,
    };
  }

  /**
   * Check merchant whitelist/blacklist status
   */
  async checkMerchant(merchantName: string): Promise<MerchantCheckResult> {
    const merchant = await prisma.merchantWhitelist.findUnique({
      where: { merchantName },
    });

    return {
      isWhitelisted: merchant?.status === 'APPROVED',
      isBlacklisted: merchant?.status === 'BLOCKED',
      merchantData: merchant,
    };
  }

  /**
   * Detect suspicious time patterns.
   * Returns ALL signals that fire — both RAPID_SUBMISSIONS and UNUSUAL_TIME can trigger
   * simultaneously (e.g. a user submitting many receipts at 3 AM). The previous early-return
   * design prevented the combination, under-scoring high-risk patterns by up to 10 points.
   */
  private async checkTimePattern(userId: string): Promise<Array<{
    score: number;
    reason: string;
    recommendation: string;
  }>> {
    const results: Array<{ score: number; reason: string; recommendation: string }> = [];
    const now = new Date();
    const windowStart = new Date(now.getTime() - RAPID_SUBMISSION_WINDOW_MS);

    // Check for rapid submissions
    const recentSubmissions = await prisma.receipt.count({
      where: {
        userId,
        createdAt: { gte: windowStart },
      },
    });

    const windowMinutes = RAPID_SUBMISSION_WINDOW_MS / (60 * 1000);
    if (recentSubmissions >= RAPID_SUBMISSION_COUNT_THRESHOLD) {
      results.push({
        score: 15,
        reason: 'RAPID_SUBMISSIONS',
        recommendation: `User submitted ${recentSubmissions} receipts in last ${windowMinutes} minutes`,
      });
    }

    // Check for unusual hours — evaluated independently so both signals can combine
    const hour = now.getHours();
    if (hour >= UNUSUAL_HOUR_START && hour < UNUSUAL_HOUR_END) {
      results.push({
        score: 10,
        reason: 'UNUSUAL_TIME',
        recommendation: `Receipt submitted at ${hour}:00 (unusual hours)`,
      });
    }

    return results;
  }

  /**
   * Get venue-specific fraud configuration.
   *
   * Despite the name, VenueFraudConfig.venueId stores a Partner.id
   * (see schema.prisma comment + admin UI which lists partners, not venues).
   * Callers inside this service pass a real Venue.id though — so we accept
   * either and resolve Venue.id → partnerId transparently with a single
   * indexed lookup. If the argument is already a Partner.id, the Venue
   * lookup returns null and we use it as-is.
   *
   * Falls back to the global config (venueId: null) if no per-partner row.
   */
  async getVenueConfig(venueOrPartnerId: string) {
    let partnerId = venueOrPartnerId;
    const venue = await prisma.venue.findUnique({
      where: { id: venueOrPartnerId },
      select: { partnerId: true },
    });
    if (venue?.partnerId) partnerId = venue.partnerId;

    let config = await prisma.venueFraudConfig.findUnique({
      where: { venueId: partnerId },
    });

    // Fall back to global config (venueId: null)
    if (!config) {
      config = await prisma.venueFraudConfig.findFirst({
        where: { venueId: null },
      });
    }

    return config;
  }

  /**
   * Calculate cashback amount using the BOOM cashback matrix.
   *
   * The cashback % is determined by:
   *   1. The partner's effective discount rate (discountRate or partnerType.maxDiscountRate)
   *   2. The user's card tier (BASIC → basic column; PREMIUM_WEEKLY/PREMIUM → premium column)
   *
   * Matrix rows are keyed by partner discount steps [5, 10, 15, 20, 25].
   * The nearest step that does not exceed the partner's actual discount is used.
   * Partners offering less than 5% discount yield 0% cashback.
   */
  async calculateCashback(params: {
    venueId?: string;
    amount: number;
    /**
     * The user's cashback tier. Source of truth is the user's active Subscription.plan
     * (see resolveCashbackTier). Pass `null` when the user has no active subscription —
     * in that case cashback is 0 regardless of Card.type (Finding #1 fix).
     */
    cardTier: 'PREMIUM_WEEKLY' | 'BASIC' | 'PREMIUM' | null;
    /** When provided, rolling daily/monthly cashback caps are enforced. */
    userId?: string;
  }): Promise<{ cashbackAmount: number; cashbackPercent: number }> {
    // Gate: no active subscription → no cashback. Prevents FREE users (no sub) from earning
    // via the Card.type fallback that existed previously.
    if (params.cardTier === null) {
      return { cashbackAmount: 0, cashbackPercent: 0 };
    }
    // Step 1: resolve partner's discount rate via the venue's partner relation.
    // NOTE: params.venueId is a Venue.id — Partner IDs are different UUIDs, so we
    // must traverse Venue → partner rather than doing partner.findUnique(venueId).
    // `as any` casts are needed because the Prisma client types are stale (run `prisma generate`).
    let partnerDiscountPct = 0;
    if (params.venueId) {
      try {
        const venue = await (prisma.venue.findUnique as any)({
          where: { id: params.venueId },
          select: {
            partner: {
              select: {
                discountRate: true,
                partnerType: { select: { maxDiscountRate: true } },
              },
            },
          },
        }) as { partner?: { discountRate?: number | null; partnerType?: { maxDiscountRate?: number | null } | null } | null } | null;
        // Prefer the partner's own discountRate; fall back to their type's cap
        partnerDiscountPct = venue?.partner?.discountRate
          ?? venue?.partner?.partnerType?.maxDiscountRate
          ?? 0;
      } catch {
        // Non-fatal — proceed with 0 (no cashback)
      }
    }

    // Step 2: find the highest matrix step that does not exceed the partner discount
    const minStep = CASHBACK_MATRIX_STEPS[0];
    if (partnerDiscountPct < minStep) {
      return { cashbackAmount: 0, cashbackPercent: 0 };
    }

    let step: typeof CASHBACK_MATRIX_STEPS[number] = CASHBACK_MATRIX_STEPS[0];
    for (const s of CASHBACK_MATRIX_STEPS) {
      if (partnerDiscountPct >= s) step = s;
    }

    // Step 3: look up user cashback percent from DB rate matrix, fall back to hardcoded constants.
    // Fetch only the most recent effective row for this specific step (single DB call).
    let matrixRow: { basic: number; premium: number } = CASHBACK_MATRIX[step];
    try {
      const dbRate = await prisma.cashbackRate.findFirst({
        where: { discountStep: step, effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (dbRate) {
        matrixRow = { basic: dbRate.basic, premium: dbRate.premium };
      }
    } catch {
      // Non-fatal: fall back to hardcoded constants if DB lookup fails
    }
    const isPremium = params.cardTier === 'PREMIUM' || params.cardTier === 'PREMIUM_WEEKLY';
    const cashbackPercent = isPremium ? matrixRow.premium : matrixRow.basic;

    // Step 4: calculate amount and cap at max per scan
    const config = params.venueId ? await this.getVenueConfig(params.venueId) : null;
    const maxCashback = config?.maxCashbackPerScan || DEFAULT_MAX_CASHBACK_PER_SCAN;
    let cashbackAmount = Math.min(
      parseFloat(((params.amount * cashbackPercent) / 100).toFixed(2)),
      maxCashback,
    );

    // Step 5: enforce rolling daily/monthly caps per user
    if (params.userId && cashbackAmount > 0) {
      try {
        const now = new Date();
        // Rolling windows: 24 h back and 30 d back from the current instant.
        // Calendar-day/month resets would allow near-double spending at midnight or
        // month boundaries (earn cap just before reset, earn cap again just after).
        const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Two-part cap check to close the TOCTOU window between receipt creation and
        // wallet crediting:
        //
        //  Part A — completed wallet credits (the authoritative ledger).
        //  Part B — APPROVED receipts whose CASHBACK_CREDIT wallet transaction does not
        //           yet exist (receipts in-flight between receipt.create and walletService.credit).
        //           The `walletTransactions: { none: { type: CASHBACK_CREDIT } }` guard
        //           ensures a credited record is counted ONLY in Part A, never in both.
        //
        //  Part C — sticker scans in any non-terminal pending state (PENDING, VALIDATING,
        //           MANUAL_REVIEW, APPROVED) whose CASHBACK_CREDIT wallet transaction does
        //           not yet exist. Mirrors Part B but for StickerScan records, which are
        //           invisible to the receipt aggregate and would otherwise bypass the cap.
        const [
          dailyAgg, monthlyAgg,
          dailyPendingReceiptAgg, monthlyPendingReceiptAgg,
          dailyPendingStickerAgg, monthlyPendingStickerAgg,
        ] = await Promise.all([
          prisma.walletTransaction.aggregate({
            where: {
              wallet: { userId: params.userId },
              type: WalletTransactionType.CASHBACK_CREDIT,
              status: WalletTransactionStatus.COMPLETED,
              createdAt: { gte: dayStart },
            },
            _sum: { amount: true },
          }),
          prisma.walletTransaction.aggregate({
            where: {
              wallet: { userId: params.userId },
              type: WalletTransactionType.CASHBACK_CREDIT,
              status: WalletTransactionStatus.COMPLETED,
              createdAt: { gte: monthStart },
            },
            _sum: { amount: true },
          }),
          // Part B — daily: receipts approved but wallet credit not yet committed
          prisma.receipt.aggregate({
            where: {
              userId: params.userId,
              status: 'APPROVED' as any,
              cashbackAmount: { gt: 0 },
              createdAt: { gte: dayStart },
              walletTransactions: { none: { type: WalletTransactionType.CASHBACK_CREDIT } },
            },
            _sum: { cashbackAmount: true },
          }),
          // Part B — monthly
          prisma.receipt.aggregate({
            where: {
              userId: params.userId,
              status: 'APPROVED' as any,
              cashbackAmount: { gt: 0 },
              createdAt: { gte: monthStart },
              walletTransactions: { none: { type: WalletTransactionType.CASHBACK_CREDIT } },
            },
            _sum: { cashbackAmount: true },
          }),
          // Part C — daily: sticker scans pending or approved but not yet credited
          (prisma.stickerScan as any).aggregate({
            where: {
              userId: params.userId,
              status: { in: ['PENDING', 'VALIDATING', 'MANUAL_REVIEW', 'APPROVED'] },
              cashbackAmount: { gt: 0 },
              createdAt: { gte: dayStart },
              walletTransactions: { none: { type: WalletTransactionType.CASHBACK_CREDIT } },
            },
            _sum: { cashbackAmount: true },
          }),
          // Part C — monthly
          (prisma.stickerScan as any).aggregate({
            where: {
              userId: params.userId,
              status: { in: ['PENDING', 'VALIDATING', 'MANUAL_REVIEW', 'APPROVED'] },
              cashbackAmount: { gt: 0 },
              createdAt: { gte: monthStart },
              walletTransactions: { none: { type: WalletTransactionType.CASHBACK_CREDIT } },
            },
            _sum: { cashbackAmount: true },
          }),
        ]);

        const earnedToday = (dailyAgg._sum.amount ?? 0)
          + (dailyPendingReceiptAgg._sum.cashbackAmount ?? 0)
          + ((dailyPendingStickerAgg as any)?._sum?.cashbackAmount ?? 0);
        const earnedThisMonth = (monthlyAgg._sum.amount ?? 0)
          + (monthlyPendingReceiptAgg._sum.cashbackAmount ?? 0)
          + ((monthlyPendingStickerAgg as any)?._sum?.cashbackAmount ?? 0);

        const systemMonthlyMax = await getSystemSettingFloat('max_cashback_per_month', DEFAULT_MAX_CASHBACK_PER_MONTH);
        const remainingDaily = Math.max(0, DEFAULT_MAX_CASHBACK_PER_DAY - earnedToday);
        const remainingMonthly = Math.max(0, systemMonthlyMax - earnedThisMonth);
        cashbackAmount = Math.min(cashbackAmount, remainingDaily, remainingMonthly);
        cashbackAmount = parseFloat(cashbackAmount.toFixed(2));
      } catch (capError) {
        // If cap check fails, do NOT proceed with uncapped cashback — that would defeat the
        // purpose of caps. Instead, zero out the amount and log a CRITICAL error so ops can
        // investigate and manually process affected users when DB is healthy.
        logger.error(
          `CRITICAL: Failed to check cashback caps for user ${params.userId}. ` +
          `Cashback credit blocked until cap verification is restored. Error: ${capError}`,
          capError
        );
        cashbackAmount = 0;
      }
    }

    return { cashbackAmount, cashbackPercent };
  }

  // ===== Spec §2.1 Five-Signal Risk Level =====

  /**
   * Spec §2.1 / §2.2 / §3.4 — Compute the canonical five-signal additive risk
   * level for a cashback/receipt record. This is separate from the broader
   * fraud score (checkReceipt) and is the authoritative gate for manual review.
   *
   * Risk level drives the PENDING → review decision:
   *   Low  (0–20)  → auto-approve within 24h (spec §3.4)
   *   Medium (21–50) → manual review queue (spec §2.2)
   *   High (51+)   → manual review queue (spec §2.2)
   *
   * Signal 2 (receipt match confidence) maps to ocrConfidence: a value below
   * 60% triggers the +30 signal. Pass the OCR confidence as a percentage (0–100).
   *
   * Signal 3 (QR location mismatch) is true when the GPS distance between the
   * user location and the venue location exceeds the configured radius.
   */
  async computeSpecRiskLevel(params: {
    userId: string;
    partnerId?: string;
    /** True if the user's IBAN was changed within the last 24 hours. */
    ibanChangedRecently: boolean;
    /** OCR confidence percentage (0–100). Below 60% → +30 points. */
    ocrConfidence: number;
    /** True when the QR code location does not match the user's GPS location. */
    locationMismatch: boolean;
  }): Promise<SpecRiskResult> {
    // Spec §2.1: additive risk score
    let riskScore = 0;
    const riskSignals: string[] = [];

    // Signal 1: IBAN changed in last 24h → +40
    if (params.ibanChangedRecently) {
      riskScore += RISK_IBAN_CHANGE_POINTS;
      riskSignals.push('IBAN_CHANGED_24H');
    }

    // Signal 2: Receipt match confidence < 60% → +30
    if (params.ocrConfidence < 60) {
      riskScore += RISK_RECEIPT_MATCH_POINTS;
      riskSignals.push('RECEIPT_MATCH_LOW_CONFIDENCE');
    }

    // Signal 3: QR location mismatch → +20
    if (params.locationMismatch) {
      riskScore += RISK_LOCATION_MISMATCH_POINTS;
      riskSignals.push('LOCATION_MISMATCH');
    }

    // Signal 4: User has 3+ Voided cashback records → +20
    const voidedCount = await prisma.walletTransaction.count({
      where: {
        wallet: { userId: params.userId },
        cashbackStatus: 'VOIDED',
      },
    }).catch(() => 0);
    if (voidedCount >= 3) {
      riskScore += RISK_USER_VOIDED_POINTS;
      riskSignals.push('USER_HAS_3_PLUS_VOIDED');
    }

    // Signal 5: Partner has active risk flag → +10
    // Spec §2.1 defines "partner has active risk flag" as a boolean field on the
    // partner record. Reads Partner.hasRiskFlag directly (added in BC-SCHEMA-1).
    if (params.partnerId) {
      const partner = await prisma.partner.findUnique({
        where: { id: params.partnerId },
        select: { hasRiskFlag: true },
      }).catch(() => null);
      if (partner?.hasRiskFlag === true) {
        riskScore += RISK_PARTNER_FLAG_POINTS;
        riskSignals.push('PARTNER_ACTIVE_RISK_FLAG');
      }
    }

    // Spec §2.1 thresholds: 0–20 = Low, 21–50 = Medium, 51+ = High
    let riskLevel: SpecRiskLevel;
    if (riskScore >= RISK_LEVEL_HIGH_MIN) {
      riskLevel = 'High';
    } else if (riskScore >= RISK_LEVEL_MEDIUM_MIN) {
      riskLevel = 'Medium';
    } else {
      riskLevel = 'Low';
    }

    // Spec §2.2: Medium AND High both trigger manual review
    const requiresManualReview = riskLevel === 'Medium' || riskLevel === 'High';

    return { riskScore, riskLevel, requiresManualReview, riskSignals };
  }

  // ===== Admin Methods =====

  /**
   * Get all merchants from whitelist
   */
  async getMerchantWhitelist() {
    return prisma.merchantWhitelist.findMany({
      orderBy: { merchantName: 'asc' },
    });
  }

  /**
   * Add merchant to whitelist
   */
  async addMerchantToWhitelist(data: {
    merchantName: string;
    status: 'APPROVED' | 'BLOCKED' | 'PENDING';
    reason?: string;
  }) {
    return prisma.merchantWhitelist.create({ data });
  }

  /**
   * Update merchant status
   */
  async updateMerchantStatus(id: string, status: string, reason?: string) {
    return prisma.merchantWhitelist.update({
      where: { id },
      data: { status: status as any, reason },
    });
  }

  /**
   * Update venue fraud configuration.
   * Only known config fields are accepted — callers pass req.body directly, so we
   * must not spread arbitrary properties into the Prisma upsert (an attacker could
   * inject `id`, `venueId`, or `createdAt` to tamper with the record identity).
   */
  async updateVenueConfig(venueId: string, raw: Record<string, unknown>) {
    const config: Record<string, unknown> = {};
    // Only the fields that the detection/cashback engine actually consults are
    // accepted. cashbackPercent / premiumBonus / platinumBonus are NOT here:
    // cashback is matrix-driven (CASHBACK_MATRIX + Partner.discountRate) and
    // managed via the Admin › Cashback Rates and Admin › Partners pages.
    // autoApproveThreshold / autoRejectThreshold are NOT here either: every
    // receipt is sent to manual review regardless of score (see checkReceipt).
    const ALLOWED = [
      'minBillAmount', 'maxBillAmount', 'maxCashbackPerScan',
      'maxScansPerDay', 'maxScansPerMonth',
      'gpsVerificationEnabled', 'gpsRadiusMeters', 'ocrVerificationEnabled',
      'templateMatchEnabled', 'templateVisualWeight', 'templateMerchantWeight',
      'templateKeywordWeight', 'templateMinSimilarity', 'templateFraudPoints',
      'templateMerchantThreshold', 'isActive', 'metadata',
    ] as const;
    for (const key of ALLOWED) {
      if (key in raw) config[key] = raw[key];
    }

    // Validate template weight fields: each must be in [0, 1] and all three must
    // be supplied together so the sum-to-1 invariant can be enforced atomically.
    // Partial updates (1 or 2 weights) are rejected because the persisted weights
    // could end up summing to ≠1, making compareAgainstTemplates produce scores
    // outside [0, 1] and rendering templateMinSimilarity meaningless.
    const weightKeys = ['templateVisualWeight', 'templateMerchantWeight', 'templateKeywordWeight'] as const;
    const updatedWeights = weightKeys.filter(k => k in config);
    if (updatedWeights.length > 0 && updatedWeights.length < 3) {
      throw new Error(
        'templateVisualWeight, templateMerchantWeight, and templateKeywordWeight must all be updated together'
      );
    }
    for (const k of updatedWeights) {
      const v = config[k];
      if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1) {
        throw new Error(`${k} must be a number between 0 and 1`);
      }
    }
    if (updatedWeights.length === 3) {
      const sum =
        (config.templateVisualWeight   as number) +
        (config.templateMerchantWeight as number) +
        (config.templateKeywordWeight  as number);
      if (Math.abs(sum - 1) > 0.001) {
        throw new Error(
          `templateVisualWeight + templateMerchantWeight + templateKeywordWeight must sum to 1.0 (got ${sum.toFixed(4)})`
        );
      }
    }

    // Threshold fields must be in [0, 1].
    for (const k of ['templateMinSimilarity', 'templateMerchantThreshold'] as const) {
      if (k in config) {
        const v = config[k];
        if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1) {
          throw new Error(`${k} must be a number between 0 and 1`);
        }
      }
    }

    // Fraud points must be a non-negative finite number.
    if ('templateFraudPoints' in config) {
      const v = config.templateFraudPoints;
      if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new Error('templateFraudPoints must be a non-negative number');
      }
    }

    // B3-HIGH fix: Strip partnerRiskFlag from the metadata blob before the upsert.
    // partnerRiskFlag is a security-sensitive fraud signal (Signal 5, +10 points).
    // Allowing any admin with venueFraudConfig.write to set it to false via a
    // generic metadata write is a privilege escalation in the fraud model.
    // The flag must only be set/cleared via the dedicated setPartnerRiskFlag()
    // method, which requires a specific permission and writes an explicit audit trail.
    if (config.metadata !== undefined && config.metadata !== null) {
      // Parse if already a string (round-trip from DB), then sanitize.
      const metaObj: Record<string, unknown> =
        typeof config.metadata === 'string'
          ? JSON.parse(config.metadata as string)
          : { ...(config.metadata as Record<string, unknown>) };
      delete metaObj['partnerRiskFlag'];
      // Re-serialize: VenueFraudConfig.metadata is String? in the Prisma schema.
      config.metadata = JSON.stringify(metaObj);
    }

    return prisma.venueFraudConfig.upsert({
      where: { venueId },
      create: { venueId, ...config },
      update: config,
    });
  }

  /**
   * Set or clear the partner-level risk flag (Signal 5, +10 points) on a venue's
   * fraud config. This is a dedicated, separately-audited method because the flag
   * is a security-sensitive control — suppressing it hides a fraud signal from the
   * review queue. Access requires the caller to check 'admins.actions.write' or an
   * equivalent privileged permission before calling this method.
   *
   * The flag is stored in two places during the transition period:
   *   - VenueFraudConfig.metadata.partnerRiskFlag (legacy — kept for backward compat)
   *   - Partner.hasRiskFlag (new column added in BC-SCHEMA-1, canonical going forward)
   * Both are written atomically in sequence here. The metadata write will be removed
   * in a follow-up cleanup task once all readers are migrated to Partner.hasRiskFlag.
   *
   * @param partnerId   - The partner whose risk flag is being changed.
   * @param flagValue - true to set the flag; false to clear it.
   * @param actorUserId - Admin performing the action (for audit log).
   * @param reason    - Mandatory justification for the change.
   * @param ip        - Originating IP address (for audit log).
   * @param userAgent - Originating User-Agent header (for audit log).
   */
  async setPartnerRiskFlag(
    partnerId: string,
    flagValue: boolean,
    actorUserId: string,
    reason: string,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('A reason is required when setting or clearing the partner risk flag.');
    }

    // Fetch the current config to capture the before state for the audit log.
    const existing = await prisma.venueFraudConfig.findUnique({
      where: { venueId: partnerId },
      select: { metadata: true },
    });

    const beforeMeta = existing?.metadata
      ? (typeof existing.metadata === 'string'
        ? JSON.parse(existing.metadata)
        : existing.metadata) as Record<string, unknown>
      : {};
    const beforeFlag = beforeMeta.partnerRiskFlag ?? false;

    // Merge the new flag value into the existing metadata, preserving other keys.
    const afterMeta = { ...beforeMeta, partnerRiskFlag: flagValue };
    // VenueFraudConfig.metadata is String? in the Prisma schema — must serialize.
    const afterMetaStr = JSON.stringify(afterMeta);

    // Wrap both writes in a single transaction so the two stores cannot diverge on crash.
    // Partner.hasRiskFlag is the canonical column (read by computeSpecRiskLevel); it is
    // written first. VenueFraudConfig.metadata is kept for backward compat during the
    // transition period and will be removed in a follow-up cleanup task once all readers
    // have migrated to Partner.hasRiskFlag.
    // Note: VenueFraudConfig.venueId stores Partner.id — pass partnerId directly.
    await prisma.$transaction(async (tx) => {
      await tx.partner.update({
        where: { id: partnerId },
        data: { hasRiskFlag: flagValue },
      });
      await tx.venueFraudConfig.upsert({
        where: { venueId: partnerId },
        create: { venueId: partnerId, metadata: afterMetaStr },
        update: { metadata: afterMetaStr },
      });
    });

    // Explicit audit entry for risk flag changes — required for security traceability.
    const { writeAudit } = await import('../middleware/audit.middleware');
    await writeAudit({
      actorUserId,
      action: 'partner.riskFlag.set',
      objectType: 'venueFraudConfig',
      objectId: partnerId,
      before: { partnerRiskFlag: beforeFlag },
      after:  { partnerRiskFlag: flagValue, reason: reason.trim() },
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });

    logger.info(
      `[fraudDetection.setPartnerRiskFlag] partnerId=${partnerId} flagValue=${flagValue} ` +
      `by actorUserId=${actorUserId} reason="${reason.trim()}"`
    );
  }

  /**
   * Get fraud detection statistics
   */
  async getFraudStats() {
    const total = await prisma.receipt.count();
    const approved = await prisma.receipt.count({ where: { status: 'APPROVED' } });
    const rejected = await prisma.receipt.count({ where: { status: 'REJECTED' } });
    const manualReview = await prisma.receipt.count({ where: { status: 'MANUAL_REVIEW' } });

    const avgFraudScore = await prisma.receipt.aggregate({
      _avg: { fraudScore: true },
    });

    return {
      total,
      approved,
      rejected,
      manualReview,
      averageFraudScore: avgFraudScore._avg.fraudScore || 0,
      approvalRate: total > 0 ? (approved / total) * 100 : 0,
      rejectionRate: total > 0 ? (rejected / total) * 100 : 0,
      manualReviewRate: total > 0 ? (manualReview / total) * 100 : 0,
    };
  }
}

export const fraudDetectionService = new FraudDetectionService();
