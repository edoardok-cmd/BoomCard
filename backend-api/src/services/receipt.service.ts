import { Receipt, ReceiptStatus, Prisma, WalletTransactionType, SubscriptionStatus } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';
import { fraudDetectionService } from './fraudDetection.service';
import { receiptAnalyticsService } from './receiptAnalytics.service';
import { notificationService } from './notification.service';
import { walletService } from './wallet.service';
import { cashbackLifecycleService } from './cashbackLifecycle.service';
import { cardService } from './card.service';
import { prisma } from '../lib/prisma';
import { emailService } from './email.service';
import {
  CASHBACK_ESTIMATED_CREDIT_DAYS,
  DEFAULT_CORRECTION_WARNING_THRESHOLD,
  DEFAULT_CARD_TIER,
  DEFAULT_DAILY_SUBMISSION_LIMIT,
  DEFAULT_MONTHLY_SUBMISSION_LIMIT,
  FRAUD_ALERT_SCORE_THRESHOLD,
} from '../constants/receipt.constants';
import { getSystemSettingInt, getSystemSettingFloat } from '../utils/systemSettings';
import { detach } from '../utils/detach';

/**
 * Receipt Item structure (parsed from OCR)
 */
export interface ReceiptItem {
  name: string;
  price?: number;
  quantity?: number;
}

/**
 * Create Receipt DTO
 */
export interface CreateReceiptDTO {
  // OCR Data
  totalAmount?: number;
  merchantName?: string;
  date?: string | Date;
  items?: ReceiptItem[];
  rawText: string;
  confidence: number;

  // Image data
  imageUrl?: string;
  imageKey?: string;
  imageData?: string; // Base64 or buffer for hash calculation

  // Optional metadata
  metadata?: Record<string, any>;
  transactionId?: string;
}

/**
 * Update Receipt DTO
 */
export interface UpdateReceiptDTO {
  totalAmount?: number;
  merchantName?: string;
  date?: string | Date;
  items?: ReceiptItem[];
  rawText?: string;
  metadata?: Record<string, any>;
}

/**
 * Validate Receipt DTO
 */
export interface ValidateReceiptDTO {
  isValid: boolean;
  rejectionReason?: string;
}

/**
 * Receipt Filters for querying
 */
export interface ReceiptFilters {
  userId?: string;
  status?: ReceiptStatus;
  merchantName?: string;
  venueId?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'totalAmount' | 'date' | 'status';
  sortOrder?: 'asc' | 'desc';
  // Admin-only: include fraudScore/fraudReasons/ipAddress/userAgent/ocrRawText.
  // Default false — formatReceipt strips these so user-facing endpoints never leak.
  includeInternal?: boolean;
}

// Runtime allowlist for sortBy — enforced inside getReceipts() so any caller
// (route layer, test, or internal service) that passes an out-of-spec field
// is corrected to 'createdAt' rather than constructing a Prisma orderBy with
// an internal column like fraudScore.
const ALLOWED_SORT_FIELDS = ['createdAt', 'totalAmount', 'date', 'status'] as const;
type AllowedSortField = typeof ALLOWED_SORT_FIELDS[number];

/**
 * Receipt Service
 * Handles all receipt-related operations including OCR data storage,
 * validation, duplicate detection, and cashback processing
 */
class ReceiptService {
  /**
   * Resolve the user's cashback tier from their active Subscription.
   * Returns null when no active subscription → cashback must be 0 (Finding #1+#2).
   * Mirrors sticker.service.ts resolveCashbackTier so both flows share the same gate.
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
   * Create a new receipt from OCR results
   */
  async createReceipt(userId: string, data: CreateReceiptDTO) {
    try {
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Verify transaction exists if transactionId provided
      if (data.transactionId) {
        const transaction = await prisma.transaction.findUnique({
          where: { id: data.transactionId }
        });

        if (!transaction) {
          throw new AppError('Transaction not found', 404);
        }

        if (transaction.userId !== userId) {
          throw new AppError('Transaction does not belong to this user', 403);
        }

        // Check if receipt already exists for this transaction
        const existingReceipt = await prisma.receipt.findUnique({
          where: { transactionId: data.transactionId }
        });

        if (existingReceipt) {
          throw new AppError('Receipt already exists for this transaction', 400);
        }
      }

      // Generate image hash for duplicate detection
      const imageHash = data.imageData
        ? this.generateImageHash(data.imageData)
        : undefined;

      // Check for duplicate receipt by image hash
      if (imageHash) {
        const duplicate = await prisma.receipt.findFirst({
          where: {
            userId,
            imageHash
          }
        });

        if (duplicate) {
          throw new AppError('This receipt has already been uploaded', 400);
        }
      }

      // Parse date if string
      const receiptDate = data.date
        ? (typeof data.date === 'string' ? new Date(data.date) : data.date)
        : undefined;

      // Create receipt
      const receipt = await prisma.receipt.create({
        data: {
          userId,
          transactionId: data.transactionId,
          totalAmount: data.totalAmount,
          merchantName: data.merchantName,
          receiptDate: receiptDate,
          items: data.items ? JSON.stringify(data.items) : undefined,
          ocrRawText: data.rawText,
          ocrConfidence: data.confidence,
          imageUrl: data.imageUrl,
          imageKey: data.imageKey,
          imageHash,
          metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
          status: ReceiptStatus.PENDING
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      logger.info(`Receipt created: ${receipt.id} for user: ${userId}`);

      return { success: true, data: this.formatReceipt(receipt) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error creating receipt:', error);
      throw new AppError('Failed to create receipt', 500);
    }
  }

  /**
   * Get receipts with filters and pagination
   */
  async getReceipts(filters: ReceiptFilters = {}) {
    try {
      const {
        userId,
        status,
        merchantName,
        minAmount,
        maxAmount,
        startDate,
        endDate,
        page = 1,
        limit = 10,
        sortOrder = 'desc',
        includeInternal = false,
      } = filters;

      // Spec §11.3 / Clash 5.1: enforce sortBy allowlist at the service boundary.
      // Rejects any column not in the safe set (e.g. fraudScore) — the route layer
      // also guards via safeSortBy(), but defence-in-depth here means internal
      // callers are protected too.
      const rawSortBy = filters.sortBy ?? 'createdAt';
      const sortBy: AllowedSortField = (ALLOWED_SORT_FIELDS as readonly string[]).includes(rawSortBy)
        ? (rawSortBy as AllowedSortField)
        : 'createdAt';

      const skip = (page - 1) * limit;

      const where: Prisma.ReceiptWhereInput = {
        ...(userId && { userId }),
        ...(status && { status }),
        ...(merchantName && {
          merchantName: {
            contains: merchantName
          }
        }),
        ...(minAmount !== undefined || maxAmount !== undefined) && {
          totalAmount: {
            ...(minAmount !== undefined && { gte: minAmount }),
            ...(maxAmount !== undefined && { lte: maxAmount })
          }
        },
        ...(startDate || endDate) && {
          receiptDate: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate })
          }
        }
      };

      const [receipts, total] = await Promise.all([
        prisma.receipt.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
              }
            },
            transaction: {
              select: {
                id: true,
                amount: true,
                status: true,
                createdAt: true
              }
            }
          }
        }),
        prisma.receipt.count({ where })
      ]);

      return {
        success: true,
        data: receipts.map(r => this.formatReceipt(r, { includeInternal })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Error fetching receipts:', error);
      throw new AppError('Failed to fetch receipts', 500);
    }
  }

  /**
   * Get single receipt by ID
   */
  async getReceiptById(id: string, userId?: string) {
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          },
          transaction: {
            select: {
              id: true,
              amount: true,
              status: true,
              cashbackAmount: true,
              createdAt: true
            }
          }
        }
      });

      if (!receipt) {
        throw new AppError('Receipt not found', 404);
      }

      // If userId provided, verify ownership
      if (userId && receipt.userId !== userId) {
        throw new AppError('Unauthorized to access this receipt', 403);
      }

      return { success: true, data: this.formatReceipt(receipt) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error fetching receipt:', error);
      throw new AppError('Failed to fetch receipt', 500);
    }
  }

  /**
   * Update receipt data (for manual corrections)
   */
  async updateReceipt(userId: string, id: string, data: UpdateReceiptDTO) {
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { id }
      });

      if (!receipt) {
        throw new AppError('Receipt not found', 404);
      }

      if (receipt.userId !== userId) {
        throw new AppError('Unauthorized to update this receipt', 403);
      }

      // Only allow updates for PENDING receipts
      if (receipt.status !== ReceiptStatus.PENDING) {
        throw new AppError('Only pending receipts can be edited', 400);
      }

      const receiptDate = data.date
        ? (typeof data.date === 'string' ? new Date(data.date) : data.date)
        : undefined;

      const updatedReceipt = await prisma.receipt.update({
        where: { id },
        data: {
          ...(data.totalAmount !== undefined && { totalAmount: data.totalAmount }),
          ...(data.merchantName !== undefined && { merchantName: data.merchantName }),
          ...(receiptDate && { receiptDate }),
          ...(data.items && { items: JSON.stringify(data.items) }),
          // Finding #7: data.rawText maps to the ocrRawText column (was previously
          // incorrectly mapped to rawText which does not exist on the Receipt model,
          // causing Prisma to silently discard the update).
          ...(data.rawText && { ocrRawText: data.rawText }),
          ...(data.metadata && { metadata: JSON.stringify(data.metadata) })
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      logger.info(`Receipt updated: ${id} by user: ${userId}`);

      return { success: true, data: this.formatReceipt(updatedReceipt) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error updating receipt:', error);
      throw new AppError('Failed to update receipt', 500);
    }
  }

  /**
   * Validate a receipt (approve or reject)
   */
  async validateReceipt(id: string, validatorId: string, data: ValidateReceiptDTO) {
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { id }
      });

      if (!receipt) {
        throw new AppError('Receipt not found', 404);
      }

      if (receipt.status !== ReceiptStatus.PENDING) {
        throw new AppError('Receipt has already been validated', 400);
      }

      const newStatus = data.isValid
        ? ReceiptStatus.APPROVED
        : ReceiptStatus.REJECTED;

      const updatedReceipt = await prisma.receipt.update({
        where: { id },
        data: {
          status: newStatus,
          reviewedBy: validatorId,
          reviewedAt: new Date(),
          rejectionReason: !data.isValid ? data.rejectionReason : undefined
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      logger.info(`Receipt ${newStatus.toLowerCase()}: ${id} by validator: ${validatorId}`);

      // Credit cashback on approval, mirroring reviewReceipt behaviour.
      if (newStatus === ReceiptStatus.APPROVED) {
        const cashbackAmount = (updatedReceipt as any).cashbackAmount ?? 0;
        if (cashbackAmount > 0) {
          try {
            await walletService.credit({
              userId: updatedReceipt.user.id,
              amount: cashbackAmount,
              type: WalletTransactionType.CASHBACK_CREDIT,
              description: `Кешбек от бележка в ${(updatedReceipt as any).merchantName || 'търговец'}`,
              receiptId: updatedReceipt.id,
              metadata: {
                merchantName: (updatedReceipt as any).merchantName,
                totalAmount: (updatedReceipt as any).totalAmount,
              },
            });
            logger.info(`validateReceipt: credited ${cashbackAmount} BGN cashback for receipt ${id}`);
          } catch (creditError) {
            logger.error(`validateReceipt: failed to credit cashback for receipt ${id}:`, creditError);
          }
        }
      }

      // Admin-only call site (PATCH /:id/validate is gated by authorize('ADMIN','SUPER_ADMIN')).
      return { success: true, data: this.formatReceipt(updatedReceipt, { includeInternal: true }) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error validating receipt:', error);
      throw new AppError('Failed to validate receipt', 500);
    }
  }

  /**
   * Delete a receipt
   */
  async deleteReceipt(userId: string, id: string) {
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { id }
      });

      if (!receipt) {
        throw new AppError('Receipt not found', 404);
      }

      if (receipt.userId !== userId) {
        throw new AppError('Unauthorized to delete this receipt', 403);
      }

      // Only allow deletion of PENDING or REJECTED receipts.
      // Checking cashbackAmount > 0 is insufficient — an APPROVED receipt with 0 cashback
      // (e.g., caps exhausted) would pass the old guard, letting users erase fraud history
      // and corrupt analytics counters. Check status directly instead.
      if (receipt.status !== ReceiptStatus.PENDING && receipt.status !== ReceiptStatus.REJECTED) {
        throw new AppError('Only pending or rejected receipts can be deleted', 400);
      }

      await prisma.receipt.delete({
        where: { id }
      });

      logger.info(`Receipt deleted: ${id} by user: ${userId}`);

      return { success: true, message: 'Receipt deleted successfully' };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error deleting receipt:', error);
      throw new AppError('Failed to delete receipt', 500);
    }
  }

  /**
   * Get receipt statistics for a user
   *
   * S2 (r2f): replaced unbounded findMany() with targeted count/aggregate calls so
   * a user with thousands of receipts does not load every row into memory.
   */
  async getUserReceiptStats(userId: string) {
    try {
      const [totalReceipts, validatedReceipts, rejectedReceipts, pendingReceipts, amountAgg] =
        await Promise.all([
          prisma.receipt.count({ where: { userId } }),
          prisma.receipt.count({ where: { userId, status: ReceiptStatus.APPROVED } }),
          prisma.receipt.count({ where: { userId, status: ReceiptStatus.REJECTED } }),
          prisma.receipt.count({ where: { userId, status: ReceiptStatus.PENDING } }),
          prisma.receipt.aggregate({
            where: { userId, totalAmount: { not: null } },
            _sum: { totalAmount: true },
          }),
        ]);

      const totalAmount = amountAgg._sum.totalAmount ?? 0;

      return {
        success: true,
        data: {
          totalReceipts,
          validatedReceipts,
          rejectedReceipts,
          pendingReceipts,
          totalAmount: Math.round(totalAmount * 100) / 100,
          averageAmount: totalReceipts > 0
            ? Math.round((totalAmount / totalReceipts) * 100) / 100
            : 0,
        },
      };
    } catch (error) {
      logger.error('Error fetching receipt stats:', error);
      throw new AppError('Failed to fetch receipt statistics', 500);
    }
  }

  /**
   * Generate SHA-256 hash of image data for duplicate detection
   */
  private generateImageHash(imageData: string): string {
    return crypto
      .createHash('sha256')
      .update(imageData)
      .digest('hex');
  }

  /**
   * Format receipt for response. By default strips server-internal fields
   * (fraudScore, fraudReasons, ipAddress, userAgent, raw OCR text, raw GPS
   * latitude/longitude, imageKey storage key, ocrConfidence, ocrData) that would
   * leak fraud-detection signals / internal verification data to the owner —
   * telling a fraudster which rule tripped makes the next forgery easier.
   * Admin endpoints must pass { includeInternal: true }.
   */
  private formatReceipt(receipt: any, opts: { includeInternal?: boolean } = {}) {
    const base = {
      ...receipt,
      items: receipt.items ? JSON.parse(receipt.items) : undefined,
      metadata: receipt.metadata ? JSON.parse(receipt.metadata) : undefined,
    };
    if (opts.includeInternal) return base;
    // rejectionReason is intentionally kept: users need to know why their scan was
    // rejected ("receipt unreadable — please retake"). Admin rejection copy must be
    // user-appropriate and not leak which fraud rule tripped.
    const {
      fraudScore: _fs,
      fraudReasons: _fr,
      ipAddress: _ip,
      userAgent: _ua,
      ocrRawText: _ocr,
      // Spec §11.3 / Clash 10.6: internal cashback formula and fraud-detection
      // fields must never reach partner-facing or user-facing responses.
      cashbackPercent: _cp,
      deviceFingerprint: _df,
      deviceFingerprintRaw: _dfr,
      perceptualHash: _ph,
      reviewNotes: _rn,
      // receipt.types.ts documents reviewedBy/reviewedAt as internal-only.
      // reviewedBy leaks the admin user-id who actioned the receipt; reviewedAt
      // is internal moderation metadata. Neither belongs in user/partner responses.
      reviewedBy: _rb,
      reviewedAt: _rat,
      internalNote: _in,
      // Spec §11.3 / §7.4 (receipt.types.ts lines 11-16): these are INTERNAL-ONLY
      // and must never reach the receipt owner or partner-facing responses.
      // - latitude/longitude: raw GPS verification data
      // - imageKey: internal storage key (only the public imageUrl is user-facing)
      // - ocrConfidence: internal OCR quality metric
      // - ocrData: raw OCR payload
      latitude: _lat,
      longitude: _lon,
      imageKey: _ik,
      ocrConfidence: _oc,
      ocrData: _od,
      // receipt.types.ts documents userId and imageHash as internal-only.
      // - userId: the owner id is implied by the authenticated request; exposing it
      //   on the payload leaks an internal identifier with no client use.
      // - imageHash: the dedup/forgery-detection fingerprint — disclosing it tells a
      //   fraudster exactly how duplicate detection keys their image.
      userId: _uid,
      imageHash: _ih,
      // submissionCount is an internal anti-abuse / resubmission counter — it
      // must not leak to the receipt owner (it reveals how the platform tracks
      // re-submissions). Strip from all non-admin responses.
      submissionCount: _sc,
      // verifiedAmount is the admin-corrected version of totalAmount — internal
      // moderation data. totalAmount (user-facing) stays; verifiedAmount is stripped
      // from non-admin responses for minimal exposure.
      verifiedAmount: _va,
      // The nested `user` relation (id/email) is the caller's OWN data — redundant
      // with the authenticated identity and needless to echo back. Strip it from
      // non-admin responses (harmless no-op when the include didn't add it).
      user: _user,
      // offerId and cardId are internal references (the offer/card the receipt was
      // matched against). They have no partner-facing or user-facing UI use and only
      // leak internal relation ids — strip them from non-admin responses.
      offerId: _oid,
      cardId: _cid,
      ...safe
    } = base;
    return safe;
  }

  // ============================================
  // ENHANCED FRAUD DETECTION & CASHBACK METHODS
  // ============================================

  /**
   * Submit receipt with fraud detection and cashback calculation
   * This is the enhanced submission flow with automated fraud checks
   */
  async submitReceipt(request: {
    userId: string;
    imageUrl: string;
    imageHash: string;
    perceptualHash?: string;
    ocrData?: {
      rawText?: string;
      merchantName?: string;
      totalAmount?: number;
      receiptDate?: string;
      confidence?: number;
    };
    userAmount?: number;
    venueId?: string;
    offerId?: string;
    latitude?: number;
    longitude?: number;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
    deviceFingerprint?: string;
    deviceFingerprintRaw?: string;
  }) {
    try {
      // Spec §4.2 v1.1 PAST_DUE/FAILED_PAYMENT gates live on stickerService.uploadReceipt,
      // the only entry point that reaches this code path in production. Duplicating the
      // gate here would just be dead defence-in-depth.

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Cashback tier — sourced from active Subscription (Finding #1+#2). null = no cashback.
      const cardTier = await this.resolveCashbackTier(request.userId);

      // Auto-create card if user doesn't have one (keeps UI card display happy even for FREE users)
      const userCard = await prisma.card.findFirst({ where: { userId: request.userId } });
      if (!userCard) {
        await cardService.createCard({ userId: request.userId, cardType: DEFAULT_CARD_TIER });
      }

      // Get venue location if provided
      let venueLat: number | undefined;
      let venueLon: number | undefined;

      if (request.venueId) {
        const venue = await prisma.venue.findUnique({
          where: { id: request.venueId },
          select: { latitude: true, longitude: true },
        });
        venueLat = venue?.latitude ?? undefined;
        venueLon = venue?.longitude ?? undefined;
      }

      // Run fraud detection
      const fraudCheck = await fraudDetectionService.checkReceipt({
        imageHash:      request.imageHash,
        perceptualHash: request.perceptualHash,
        ocrAmount:      request.ocrData?.totalAmount,
        userAmount:     request.userAmount,
        userLat:        request.latitude,
        userLon:        request.longitude,
        venueLat,
        venueLon,
        ocrConfidence:  request.ocrData?.confidence || 0,
        merchantName:   request.ocrData?.merchantName,
        ocrRawText:     request.ocrData?.rawText,
        userId:         request.userId,
        venueId:        request.venueId,
        cardTier:       cardTier as any,
        deviceFingerprint: request.deviceFingerprint,
      });

      // Calculate cashback (passes userId so rolling daily/monthly caps are enforced)
      const amount = request.userAmount || request.ocrData?.totalAmount || 0;
      const cashbackCalc = await fraudDetectionService.calculateCashback({
        venueId: request.venueId,
        amount,
        cardTier: cardTier as any,
        userId: request.userId,
      });

      // F-016: Use computeSpecRiskLevel() to determine requiresManualReview instead of
      // hardcoding to true. Per spec §2.2/§3.4 (amendment 2026-06-24): only High-risk
      // requires manual review. Low and Medium auto-process (auto-approval within 24h);
      // only High routes to the manual review queue.
      // ibanChangedRecently and locationMismatch need context not always available at
      // receipt submission time — we use conservative defaults (false) so the spec's
      // auto-approve path can engage for clearly low- and medium-risk receipts.
      const specRisk = await fraudDetectionService.computeSpecRiskLevel({
        userId: request.userId,
        ibanChangedRecently: false, // conservative default; sticker scan path checks this directly
        ocrConfidence: request.ocrData?.confidence || 0,
        locationMismatch: false, // receipt flow has no QR location check
      });
      const requiresManualReview = specRisk.riskLevel === 'High';

      // Spec §2.2/§3.4 (amendment 2026-06-24): only High-risk routes to MANUAL_REVIEW.
      // Low and Medium auto-process via the PENDING (auto-approval within 24h) path.
      const status: ReceiptStatus = requiresManualReview ? ('MANUAL_REVIEW' as any) : ('PENDING' as any);
      const cashbackAmount = 0;

      // Get card ID (refresh to get newly created card if needed)
      const card = await prisma.card.findFirst({
        where: { userId: request.userId },
      });

      // Create receipt record
      const receipt = await prisma.receipt.create({
        data: {
          userId: request.userId,
          cardId: card?.id,
          imageUrl:      request.imageUrl,
          imageHash:     request.imageHash,
          perceptualHash: request.perceptualHash,
          ocrRawText:    request.ocrData?.rawText || '',
          merchantName: request.ocrData?.merchantName,
          totalAmount: amount,
          receiptDate: request.ocrData?.receiptDate ? new Date(request.ocrData.receiptDate) : undefined,
          ocrConfidence: request.ocrData?.confidence || 0,
          cashbackAmount,
          cashbackPercent: cashbackCalc.cashbackPercent,
          fraudScore: fraudCheck.fraudScore,
          fraudReasons: fraudCheck.fraudReasons || [],
          status: status,
          venueId: request.venueId,
          offerId: request.offerId,
          latitude: request.latitude,
          longitude: request.longitude,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
          deviceFingerprint: request.deviceFingerprint,
          deviceFingerprintRaw: request.deviceFingerprintRaw,
          metadata: request.metadata ? JSON.stringify(request.metadata) : undefined,
        },
      });

      // Update analytics
      await receiptAnalyticsService.updateAnalytics({
        userId: request.userId,
        receiptId: receipt.id,
        status: status as string,
        cashbackAmount,
        totalAmount: amount,
      });

      // Notify user that receipt is pending admin review — only for High-risk
      // submissions that actually route to MANUAL_REVIEW. Per spec §9.5 the
      // "In Review / Pending verification" state (and its 24-48h notification)
      // is shown for High-risk submissions only; Medium/Low auto-process to
      // PENDING and must not receive a manual-verification notification.
      if (requiresManualReview) {
        await notificationService.notifyManualReviewRequired({
          userId: request.userId,
          receiptId: receipt.id,
          merchantName: request.ocrData?.merchantName || 'Unknown Merchant',
        });
      }

      // Send fraud alert to admins if high score (threshold is DB-configurable via max_fraud_score)
      const fraudAlertThreshold = await getSystemSettingInt('max_fraud_score', FRAUD_ALERT_SCORE_THRESHOLD);
      if (fraudCheck.fraudScore >= fraudAlertThreshold) {
        await notificationService.notifyFraudAlert({
          receiptId: receipt.id,
          userId: request.userId,
          fraudScore: fraudCheck.fraudScore,
          fraudReasons: fraudCheck.fraudReasons,
        });
        // Also notify the venue's partner owner — they should know a flagged
        // submission occurred at their venue so they can corroborate in person.
        // Customer identity is intentionally NOT exposed to the partner here.
        if (receipt.venueId) {
          // fraudScore/reasons are internal-only (spec §11.3) — logged here but
          // NOT passed to notifyPartnerFraudFlag (signature accepts only venueId
          // and receiptId to prevent accidental exposure to partners).
          logger.info(`Receipt ${receipt.id} fraud flag: score=${fraudCheck.fraudScore}, reasons=${(fraudCheck.fraudReasons || []).join(',')}`);
          await notificationService.notifyPartnerFraudFlag({
            venueId: receipt.venueId,
            receiptId: receipt.id,
          }).catch((err) => logger.error('Failed to notify partner of fraud flag:', err));
        }
      }

      logger.info(`Receipt ${receipt.id} submitted: ${status} (fraud score: ${fraudCheck.fraudScore})`);

      // Finding #2 (spec §11.3 / Clash 5.1): fraudAnalysis block removed.
      // score, riskLevel, and flagsTriggered are internal-only. The only
      // caller-visible signal is requiresManualReview (boolean).
      return {
        success: true,
        message: this.getStatusMessage(status as string, cashbackAmount),
        receipt: {
          id: receipt.id,
          status,
          merchantName: receipt.merchantName,
          amount: receipt.totalAmount,
          receiptDate: receipt.receiptDate,
          imageUrl: receipt.imageUrl,
          createdAt: receipt.createdAt,
          requiresManualReview: status === 'MANUAL_REVIEW',
        },
        cashback: {
          amount: cashbackCalc.cashbackAmount,
          // Cashback is credited only when an admin explicitly approves the receipt.
          // The amount shown here is an estimate — admin may adjust on approval.
          status: cashbackCalc.cashbackAmount > 0 ? 'PENDING_REVIEW' : 'NOT_APPLICABLE',
          estimatedDate: cashbackCalc.cashbackAmount > 0 ? new Date(Date.now() + CASHBACK_ESTIMATED_CREDIT_DAYS * 24 * 60 * 60 * 1000) : null,
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error submitting receipt:', error);
      throw new AppError('Failed to submit receipt', 500);
    }
  }

  /**
   * Check if image hash already exists (duplicate detection).
   * Cross-flow aware: checks both Receipt.imageHash and StickerScan.receiptImageHash.
   *
   * Only counts non-REJECTED records so users can re-submit legitimately rejected
   * receipts without being blocked. Mirrors fraudDetection.checkDuplicate() filters.
   */
  async checkDuplicateImage(imageHash: string): Promise<boolean> {
    const [receiptDup, stickerDup] = await Promise.all([
      prisma.receipt.findFirst({
        where: {
          imageHash,
          status: { in: ['APPROVED', 'PENDING', 'MANUAL_REVIEW'] as any[] },
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
   * Get user submission statistics (for rate limiting display)
   */
  async getUserSubmissionStats(userId: string) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, thisMonth, total] = await Promise.all([
      prisma.receipt.count({
        where: {
          userId,
          createdAt: { gte: todayStart },
        },
      }),
      prisma.receipt.count({
        where: {
          userId,
          createdAt: { gte: monthStart },
        },
      }),
      prisma.receipt.count({
        where: { userId },
      }),
    ]);

    const dailyLimit = await getSystemSettingInt('daily_scan_limit_default', DEFAULT_DAILY_SUBMISSION_LIMIT);
    return {
      submissionsToday: today,
      submissionsThisMonth: thisMonth,
      totalSubmissions: total,
      dailyLimit,
      monthlyLimit: DEFAULT_MONTHLY_SUBMISSION_LIMIT,
      remainingToday: Math.max(0, dailyLimit - today),
      remainingThisMonth: Math.max(0, DEFAULT_MONTHLY_SUBMISSION_LIMIT - thisMonth),
    };
  }

  /**
   * Get receipts pending manual review (admin only)
   *
   * LOW-1 (r2g): Wrap results in formatReceipt({ includeInternal: true }) for
   * consistency with every other list/read path. The endpoint is gated by
   * authorize('ADMIN','SUPER_ADMIN'), so internal fields are appropriate here,
   * but applying the wrapper ensures defence-in-depth: any future access-control
   * change cannot accidentally bypass the field-stripping layer by reusing this
   * method from a less-privileged context.
   */
  async getPendingReviews(limit: number = 50) {
    const receipts = await prisma.receipt.findMany({
      where: {
        status: 'MANUAL_REVIEW' as any,
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    return receipts.map((r) => this.formatReceipt(r, { includeInternal: true }));
  }

  /**
   * Admin review receipt (approve or reject)
   */
  async reviewReceipt(params: {
    receiptId: string;
    action: 'APPROVE' | 'REJECT';
    reviewedBy: string;
    verifiedAmount?: number;
    notes?: string;
    rejectionReason?: string;
  }) {
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { id: params.receiptId },
      });

      if (!receipt) {
        throw new AppError('Receipt not found', 404);
      }

      // Top-level guard: prevent re-processing a receipt that has already been
      // admin-reviewed. Explicit terminal-status checks guard against edge cases
      // where reviewedBy is null but the receipt reached a terminal state via an
      // automated path (e.g. fraud-engine auto-reject or expiry job).
      const alreadyAdminReviewed = receipt.reviewedBy !== null;
      const terminalStatus = (receipt.status as string) === 'REJECTED'
        || (receipt.status as string) === 'APPROVED'
        || (receipt.status as string) === 'EXPIRED';
      if (alreadyAdminReviewed || terminalStatus) {
        throw new AppError(
          `Receipt has already been reviewed by an admin and cannot be reviewed again`,
          409
        );
      }

      const oldStatus = receipt.status;
      const newStatus: ReceiptStatus = params.action === 'APPROVE' ? 'APPROVED' as any : 'REJECTED' as any;

      // Determine cashback amount for APPROVE action.
      // If no verifiedAmount override is provided, calculate cashback from the receipt's
      // totalAmount. Recalculate when the admin provides a corrected verifiedAmount.
      let cashbackAmount = 0;
      let updatedFraudScore: number | undefined;
      let fraudWarning: string | undefined;
      if (params.action === 'APPROVE') {
        if (params.verifiedAmount) {
          // Admin corrected the amount — recalculate cashback AND recompute fraud score
          const cardTier = await this.resolveCashbackTier(receipt.userId);
          const cashbackCalc = await fraudDetectionService.calculateCashback({
            venueId: receipt.venueId ?? undefined,
            amount: params.verifiedAmount,
            cardTier,
            userId: receipt.userId,
          });
          cashbackAmount = cashbackCalc.cashbackAmount;

          // Recompute fraud score with the corrected amount so the record reflects
          // the actual risk of the verified transaction, not the originally-submitted one.
          try {
            const recomputedFraud = await fraudDetectionService.checkReceipt({
              imageHash: (receipt as any).imageHash || '',
              ocrAmount: receipt.totalAmount ?? undefined,
              userAmount: params.verifiedAmount,
              ocrConfidence: (receipt as any).ocrConfidence || 0,
              userId: receipt.userId,
              venueId: (receipt as any).venueId ?? undefined,
              cardTier: cardTier as any, // null is OK (no sub → checkReceipt just skips cashback bit)
              // Exclude this receipt from its own duplicate check — the hash is already
              // in the DB and would otherwise always add 40 fraud points.
              excludeReceiptId: params.receiptId,
            });
            updatedFraudScore = recomputedFraud.fraudScore;
            const correctionWarnThreshold = await getSystemSettingFloat('correction_warning_threshold', DEFAULT_CORRECTION_WARNING_THRESHOLD);
            if (recomputedFraud.fraudScore > correctionWarnThreshold) {
              fraudWarning = `Recomputed fraud score (${recomputedFraud.fraudScore}) exceeds the correction warning threshold (${correctionWarnThreshold}). Manual correction applied.`;
              logger.warn(`Receipt ${params.receiptId} corrected to ${params.verifiedAmount} BGN — ${fraudWarning}`);
            }
          } catch (fraudRecomputeError) {
            logger.error(`Failed to recompute fraud score for receipt ${params.receiptId}:`, fraudRecomputeError);
            // Keep the original fraud score so the admin record is explicit, not silently stale
            updatedFraudScore = receipt.fraudScore as number;
          }
        } else {
          // Calculate cashback from the receipt's original amount
          const amount = receipt.totalAmount || 0;
          const cardTier = await this.resolveCashbackTier(receipt.userId);
          const cashbackCalc = await fraudDetectionService.calculateCashback({
            venueId: receipt.venueId ?? undefined,
            amount,
            cardTier,
            userId: receipt.userId,
          });
          cashbackAmount = cashbackCalc.cashbackAmount;
        }
      }

      // Guard: linked transaction must be COMPLETED BEFORE we claim the receipt.
      // If this check were after claimResult, a failed guard would leave the receipt
      // APPROVED with cashbackAmount > 0 but no wallet credit — and the admin claim
      // would be consumed, making it impossible to retry.
      if (newStatus === 'APPROVED' && cashbackAmount > 0 && receipt.transactionId) {
        const linkedTx = await prisma.transaction.findUnique({
          where: { id: receipt.transactionId },
          select: { status: true },
        });
        if (!linkedTx || linkedTx.status !== 'COMPLETED') {
          throw new AppError('Linked payment transaction is not completed — cashback cannot be credited', 409);
        }
      }

      // Atomic claim: only one concurrent admin can win the reviewedBy: null condition.
      // Use != null check for verifiedAmount so an explicit 0 is honoured (|| would treat 0 as falsy).
      const reviewedAt = new Date();
      const claimResult = await prisma.receipt.updateMany({
        where: { id: params.receiptId, reviewedBy: null },
        data: {
          status: newStatus,
          totalAmount: params.verifiedAmount != null ? params.verifiedAmount : receipt.totalAmount,
          cashbackAmount: params.action === 'APPROVE' ? cashbackAmount : 0,
          reviewedBy: params.reviewedBy,
          reviewedAt,
          rejectionReason: params.rejectionReason,
          reviewNotes: params.notes,
          ...(updatedFraudScore !== undefined && { fraudScore: updatedFraudScore }),
        } as any,
      });

      if (claimResult.count === 0) {
        throw new AppError('Receipt has already been reviewed by another admin', 409);
      }

      // Fetch updated record for response (updateMany doesn't return records).
      const updated = await prisma.receipt.findUniqueOrThrow({ where: { id: params.receiptId } });

      // Credit cashback to wallet on admin approval.
      // Cashback is never credited at submission time — only an explicit admin APPROVE
      // triggers the wallet credit. On failure, roll back the claim so the admin can retry.
      if (newStatus === 'APPROVED' && cashbackAmount > 0) {
        try {
          await walletService.credit({
            userId: receipt.userId,
            amount: cashbackAmount,
            type: WalletTransactionType.CASHBACK_CREDIT,
            description: `Кешбек от бележка в ${receipt.merchantName || 'търговец'}`,
            receiptId: receipt.id,
            metadata: {
              merchantName: receipt.merchantName,
              totalAmount: updated.totalAmount,
              receiptDate: receipt.receiptDate,
            },
          });

          logger.info(`Approved receipt ${params.receiptId} and credited ${cashbackAmount} BGN`);
        } catch (error) {
          // Roll back the receipt so the admin can safely retry — don't leave the receipt
          // APPROVED with cashbackAmount > 0 but no wallet credit.
          logger.error(`Failed to credit cashback for receipt ${params.receiptId}, rolling back receipt status:`, error);
          try {
            await prisma.receipt.update({
              where: { id: params.receiptId },
              data: {
                status: oldStatus,
                totalAmount: receipt.totalAmount,
                cashbackAmount: receipt.cashbackAmount,
                reviewedBy: null,
                reviewedAt: null,
                rejectionReason: receipt.rejectionReason ?? null,
                reviewNotes: (receipt as any).reviewNotes ?? null,
              } as any,
            });
          } catch (rollbackError) {
            logger.error(`CRITICAL: Failed to roll back receipt review for ${params.receiptId}. Manual intervention required.`, rollbackError);
          }
          throw new AppError('Failed to credit cashback to wallet. Receipt approval has been rolled back — please retry.', 500);
        }
      }

      // Spec §4.4 / §7.1 v1.1 — on REJECT, record a Voided cashback ghost so
      // the user sees "Анулиран" with the reason rather than silence. Non-fatal.
      // The pre-reject cashback amount is computed here (not earlier — earlier
      // only ran in the APPROVE branch) so the ghost row reflects what the
      // user "would have earned" if not rejected.
      if (newStatus === 'REJECTED') {
        try {
          const amount = receipt.totalAmount || 0;
          let voidedCashback = 0;
          if (amount > 0) {
            const cardTier = await this.resolveCashbackTier(receipt.userId);
            const calc = await fraudDetectionService.calculateCashback({
              venueId: receipt.venueId ?? undefined,
              amount,
              cardTier,
              userId: receipt.userId,
            });
            voidedCashback = calc.cashbackAmount;
          }
          if (voidedCashback > 0) {
            await cashbackLifecycleService.recordRejectedAsVoided({
              userId: receipt.userId,
              amount: voidedCashback,
              reason: params.rejectionReason || 'Касовата бележка не премина проверката',
              actorUserId: params.reviewedBy,
              description: `Кешбек анулиран — ${receipt.merchantName || 'търговец'}`,
              receiptId: receipt.id,
              metadata: { source: 'RECEIPT_REVIEW_REJECT', merchantName: receipt.merchantName },
            });
          }
        } catch (voidedErr) {
          logger.error(`[receipt.reviewReceipt] failed to record voided ghost for ${params.receiptId}:`, voidedErr);
        }
      }

      // Update analytics after wallet credit succeeds (or for REJECT where no credit is needed).
      // Non-fatal: analytics failure must not block or reverse the review result.
      try {
        await receiptAnalyticsService.updateAnalyticsOnStatusChange({
          userId: receipt.userId,
          oldStatus: oldStatus as string,
          newStatus: newStatus as string,
          cashbackAmount,
        });
      } catch (analyticsError) {
        logger.error(`Failed to update analytics for receipt ${params.receiptId} — review stands:`, analyticsError);
      }

      // Send notification — non-fatal: a notify failure must not mask a successful review.
      try {
        if (newStatus === 'APPROVED') {
          await notificationService.notifyReceiptApproved({
            userId: receipt.userId,
            receiptId: receipt.id,
            merchantName: receipt.merchantName || 'Unknown Merchant',
            cashbackAmount,
          });
        } else {
          await notificationService.notifyReceiptRejected({
            userId: receipt.userId,
            receiptId: receipt.id,
            merchantName: receipt.merchantName || 'Unknown Merchant',
            reason: params.rejectionReason || 'Receipt did not pass verification',
          });
        }
      } catch (notifyError) {
        logger.error(`Failed to send notification for receipt ${params.receiptId} — review stands:`, notifyError);
      }

      // Also notify the venue's partner owner on approval — gives partners real-time
      // visibility into activity at their venue. Guarded by venueId since older
      // receipts (sticker-less OCR path) may not have a venue linked.
      if (newStatus === 'APPROVED' && receipt.venueId) {
        try {
          await notificationService.notifyPartnerReceiptAtVenue({
            venueId: receipt.venueId,
            receiptId: receipt.id,
            totalAmount: updated.totalAmount || 0,
            cashbackAmount,
          });
        } catch (partnerNotifyError) {
          logger.error(`Failed to notify partner of receipt ${params.receiptId}:`, partnerNotifyError);
        }
      }

      // Send email notification to user (non-fatal)
      try {
        const user = await prisma.user.findUnique({
          where: { id: receipt.userId },
          select: { email: true, firstName: true },
        });
        if (user?.email) {
          if (newStatus === 'APPROVED') {
            detach(emailService.sendReceiptApprovedEmail(user.email, {
              customerName: user.firstName || user.email.split('@')[0],
              merchantName: receipt.merchantName || 'Unknown Merchant',
              amount: updated.totalAmount || 0,
              cashbackAmount,
              receiptDate: receipt.receiptDate || undefined,
            }), (err) => logger.error('Failed to send receipt approved email:', err));
          } else {
            detach(emailService.sendReceiptRejectedEmail(user.email, {
              customerName: user.firstName || user.email.split('@')[0],
              merchantName: receipt.merchantName || 'Unknown Merchant',
              amount: receipt.totalAmount || 0,
              reason: params.rejectionReason || 'Receipt did not pass verification',
            }), (err) => logger.error('Failed to send receipt rejected email:', err));
          }
        }
      } catch (emailError) {
        logger.error(`Failed to send email for receipt ${params.receiptId} — review stands:`, emailError);
      }

      logger.info(`Receipt ${params.receiptId} ${newStatus.toLowerCase()} by admin`);

      // Admin-only call site (POST /:id/review is gated by authorize('ADMIN','SUPER_ADMIN')).
      return {
        success: true,
        receipt: this.formatReceipt(updated, { includeInternal: true }),
        message: `Receipt ${params.action.toLowerCase()}d successfully`,
        ...(fraudWarning && { fraudWarning }),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error reviewing receipt:', error);
      throw new AppError('Failed to review receipt', 500);
    }
  }

  /**
   * Bulk approve receipts (admin only)
   */
  async bulkApprove(receiptIds: string[], reviewedBy: string) {
    let successCount = 0;
    let errorCount = 0;

    for (const receiptId of receiptIds) {
      try {
        // No verifiedAmount → reviewReceipt uses the receipt's original amount and skips
        // fraud recomputation, so fraudWarning is never set. Bulk approve is intentionally
        // silent on fraud warnings — admins are expected to triage high-risk receipts
        // individually before including them in a bulk action.
        await this.reviewReceipt({
          receiptId,
          action: 'APPROVE',
          reviewedBy,
          notes: 'Bulk approved',
        });
        successCount++;
      } catch (error) {
        logger.error(`Error approving receipt ${receiptId}:`, error);
        errorCount++;
      }
    }

    return {
      success: true,
      successCount,
      errorCount,
      message: `${successCount} receipts approved, ${errorCount} errors`,
    };
  }

  /**
   * Bulk reject receipts (admin only)
   */
  async bulkReject(receiptIds: string[], reason: string, reviewedBy: string) {
    let successCount = 0;
    let errorCount = 0;

    for (const receiptId of receiptIds) {
      try {
        await this.reviewReceipt({
          receiptId,
          action: 'REJECT',
          reviewedBy,
          rejectionReason: reason,
          notes: 'Bulk rejected',
        });
        successCount++;
      } catch (error) {
        logger.error(`Error rejecting receipt ${receiptId}:`, error);
        errorCount++;
      }
    }

    return {
      success: true,
      successCount,
      errorCount,
      message: `${successCount} receipts rejected, ${errorCount} errors`,
    };
  }

  /**
   * Get user-friendly status message
   */
  private getStatusMessage(status: string, _cashbackAmount: number): string {
    switch (status) {
      case 'MANUAL_REVIEW':
        return 'Receipt submitted and is pending admin review. You will be notified once reviewed.';
      case 'APPROVED':
        return 'Receipt approved.';
      case 'REJECTED':
        return 'Receipt was not approved.';
      default:
        return 'Receipt submitted successfully.';
    }
  }

}
// S3 (r2f): getFraudReasonDescription and getFraudReasonScore were dead code —
// defined but never called. Removed to avoid misleading readers into thinking
// fraud reason descriptions are surfaced to users. If fraud reason descriptions
// are needed in future, re-add them where the output is actually consumed.

export const receiptService = new ReceiptService();
