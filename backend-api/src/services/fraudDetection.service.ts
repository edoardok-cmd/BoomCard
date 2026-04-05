import { prisma } from '../lib/prisma';
import {
  DEFAULT_AUTO_APPROVE_THRESHOLD,
  DEFAULT_AUTO_REJECT_THRESHOLD,
  DEFAULT_DAILY_SUBMISSION_LIMIT,
  DEFAULT_MAX_CASHBACK_PER_SCAN,
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
 * - 0-30: Auto-approve
 * - 31-60: Manual review required
 * - 61-100: Auto-reject
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
      // 1. Duplicate image check (40 points)
      const isDuplicate = await this.checkDuplicate(params.imageHash);
      if (isDuplicate) {
        score += 40;
        reasons.push('DUPLICATE_IMAGE');
        recommendations.push('Image has been previously submitted');
      }

      // 2. Amount validation (15-30 points)
      if (params.ocrAmount && params.userAmount) {
        const diff = Math.abs(params.ocrAmount - params.userAmount);
        const percentDiff = (diff / Math.max(params.ocrAmount, params.userAmount)) * 100;

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
      if (params.userLat && params.userLon && params.venueLat && params.venueLon) {
        const distance = this.calculateDistance(
          params.userLat,
          params.userLon,
          params.venueLat,
          params.venueLon
        );

        if (distance > GPS_FAR_THRESHOLD_M) {
          score += 25;
          reasons.push('GPS_FAR_FROM_VENUE');
          recommendations.push(`User is ${Math.round(distance)}m away from venue (max: ${GPS_FAR_THRESHOLD_M}m)`);
        } else if (distance > GPS_WARNING_THRESHOLD_M) {
          score += 15;
          reasons.push('GPS_OUTSIDE_RANGE');
          recommendations.push(`User is ${Math.round(distance)}m away from venue (recommended: <${GPS_WARNING_THRESHOLD_M}m)`);
        }
      }

      // 4. OCR confidence check (20 points)
      if (params.ocrConfidence < OCR_LOW_CONFIDENCE_THRESHOLD) {
        score += 20;
        reasons.push('LOW_OCR_CONFIDENCE');
        recommendations.push(`OCR confidence is ${params.ocrConfidence.toFixed(0)}% (min: ${OCR_LOW_CONFIDENCE_THRESHOLD}%)`);
      } else if (params.ocrConfidence < OCR_MODERATE_CONFIDENCE_THRESHOLD) {
        score += 10;
        reasons.push('MODERATE_OCR_CONFIDENCE');
      }

      // 5. Rate limiting check (30 points)
      const userStats = await this.getUserStats(params.userId);
      const config = params.venueId ? await this.getVenueConfig(params.venueId) : null;

      const maxDaily = config?.maxScansPerDay || DEFAULT_DAILY_SUBMISSION_LIMIT;
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

      // 7. Suspicious time patterns (10-15 points)
      const isSuspiciousTime = await this.checkTimePattern(params.userId);
      if (isSuspiciousTime.isSuspicious) {
        score += isSuspiciousTime.score;
        reasons.push(isSuspiciousTime.reason);
        recommendations.push(isSuspiciousTime.recommendation);
      }

      // 8. Amount threshold check (10 points)
      if (params.userAmount) {
        const minAmount = config?.minBillAmount || DEFAULT_MIN_BILL_AMOUNT;
        if (params.userAmount < minAmount) {
          score += 10;
          reasons.push('AMOUNT_TOO_LOW');
          recommendations.push(`Receipt amount ${params.userAmount} BGN is below minimum ${minAmount} BGN`);
        }
      }

      // 9. Card tier verification (reduce score for premium users)
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

      // Determine approval based on thresholds
      const autoApproveThreshold = config?.autoApproveThreshold || DEFAULT_AUTO_APPROVE_THRESHOLD;
      const autoRejectThreshold = config?.autoRejectThreshold || DEFAULT_AUTO_REJECT_THRESHOLD;

      const isApproved = finalScore <= autoApproveThreshold;
      const requiresManualReview = finalScore > autoApproveThreshold && finalScore <= autoRejectThreshold;

      return {
        fraudScore: finalScore,
        fraudReasons: reasons,
        isApproved,
        requiresManualReview,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
      };
    } catch (error) {
      console.error('❌ Error in fraud detection:', error);
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
   * Check if image hash exists in database (duplicate detection)
   */
  private async checkDuplicate(imageHash: string): Promise<boolean> {
    const existing = await prisma.receipt.findFirst({
      where: { imageHash },
    });
    return !!existing;
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

    // Today's submissions (from midnight)
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const submissionsToday = await prisma.receipt.count({
      where: {
        userId,
        createdAt: { gte: todayStart },
      },
    });

    // This month's submissions
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const submissionsThisMonth = await prisma.receipt.count({
      where: {
        userId,
        createdAt: { gte: monthStart },
      },
    });

    // Average submission frequency
    const firstReceipt = await prisma.receipt.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    let averagePerDay = 0;
    if (firstReceipt) {
      const daysSinceFirst = Math.ceil(
        (now.getTime() - firstReceipt.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const totalReceipts = await prisma.receipt.count({ where: { userId } });
      averagePerDay = totalReceipts / Math.max(1, daysSinceFirst);
    }

    return {
      submissionsToday,
      submissionsThisMonth,
      averagePerDay,
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
   * Detect suspicious time patterns
   * - Multiple submissions in short time span
   * - Submissions at unusual hours (2-6 AM)
   */
  private async checkTimePattern(userId: string): Promise<{
    isSuspicious: boolean;
    score: number;
    reason: string;
    recommendation: string;
  }> {
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
      return {
        isSuspicious: true,
        score: 15,
        reason: 'RAPID_SUBMISSIONS',
        recommendation: `User submitted ${recentSubmissions} receipts in last ${windowMinutes} minutes`,
      };
    }

    // Check for unusual hours
    const hour = now.getHours();
    if (hour >= UNUSUAL_HOUR_START && hour < UNUSUAL_HOUR_END) {
      return {
        isSuspicious: true,
        score: 10,
        reason: 'UNUSUAL_TIME',
        recommendation: `Receipt submitted at ${hour}:00 (unusual hours)`,
      };
    }

    return {
      isSuspicious: false,
      score: 0,
      reason: '',
      recommendation: '',
    };
  }

  /**
   * Get venue-specific fraud configuration
   * Falls back to global config if venue config not found
   */
  async getVenueConfig(venueId: string) {
    let config = await prisma.venueFraudConfig.findUnique({
      where: { venueId },
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
   * Matrix rows are keyed by partner discount steps [5, 10, 15, 20, 25, 30].
   * The nearest step that does not exceed the partner's actual discount is used.
   * Partners offering less than 5% discount yield 0% cashback.
   */
  async calculateCashback(params: {
    venueId?: string;
    amount: number;
    cardTier: 'LIGHT' | 'BASIC' | 'PREMIUM';
  }): Promise<{ cashbackAmount: number; cashbackPercent: number }> {
    // Step 1: resolve partner's discount rate
    let partnerDiscountPct = 0;
    if (params.venueId) {
      try {
        const partner = await prisma.partner.findUnique({
          where: { id: params.venueId },
          select: {
            discountRate: true,
            partnerType: { select: { maxDiscountRate: true } },
          },
        });
        // Prefer the partner's own discountRate; fall back to their type's cap
        partnerDiscountPct = partner?.discountRate
          ?? partner?.partnerType?.maxDiscountRate
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

    let step = CASHBACK_MATRIX_STEPS[0];
    for (const s of CASHBACK_MATRIX_STEPS) {
      if (partnerDiscountPct >= s) step = s;
    }

    // Step 3: look up user cashback percent from matrix
    const matrixRow = CASHBACK_MATRIX[step];
    const isPremium = params.cardTier === 'PREMIUM' || params.cardTier === 'LIGHT';
    const cashbackPercent = isPremium ? matrixRow.premium : matrixRow.basic;

    // Step 4: calculate amount and cap at max per scan
    const config = params.venueId ? await this.getVenueConfig(params.venueId) : null;
    const maxCashback = config?.maxCashbackPerScan || DEFAULT_MAX_CASHBACK_PER_SCAN;
    const cashbackAmount = Math.min(
      parseFloat(((params.amount * cashbackPercent) / 100).toFixed(2)),
      maxCashback,
    );

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
   * Update venue fraud configuration
   */
  async updateVenueConfig(venueId: string, config: any) {
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
