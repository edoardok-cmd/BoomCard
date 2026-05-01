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
 * - All receipts require admin manual review regardless of score
 * - Score is recorded for admin reference only
 */

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
  cardTier?: 'LIGHT' | 'BASIC' | 'PREMIUM';
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
            templateVisualWeight:      config.templateVisualWeight      ?? 0.5,
            templateMerchantWeight:    config.templateMerchantWeight    ?? 0.3,
            templateKeywordWeight:     config.templateKeywordWeight     ?? 0.2,
            templateMinSimilarity:     config.templateMinSimilarity     ?? 0.6,
            templateFraudPoints:       config.templateFraudPoints       ?? DEFAULT_TEMPLATE_FRAUD_POINTS,
            templateMerchantThreshold: config.templateMerchantThreshold ?? 0.8,
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

      // All receipts require admin manual review — no auto-approve or auto-reject
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
   *   2. The user's card tier (BASIC → basic column; LIGHT/PREMIUM → premium column)
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
    cardTier: 'LIGHT' | 'BASIC' | 'PREMIUM' | null;
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
    const isPremium = params.cardTier === 'PREMIUM' || params.cardTier === 'LIGHT';
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
    return prisma.venueFraudConfig.upsert({
      where: { venueId },
      create: { venueId, ...config },
      update: config,
    });
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
