import { Receipt, ReceiptStatus, Prisma } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';
import { fraudDetectionService } from './fraudDetection.service';
import { receiptAnalyticsService } from './receiptAnalytics.service';
import { notificationService } from './notification.service';
import { walletService } from './wallet.service';
import { cardService } from './card.service';
import { prisma } from '../lib/prisma';

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
  minAmount?: number;
  maxAmount?: number;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'totalAmount' | 'date';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Receipt Service
 * Handles all receipt-related operations including OCR data storage,
 * validation, duplicate detection, and cashback processing
 */
class ReceiptService {
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
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

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
        data: receipts.map(r => this.formatReceipt(r)),
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
          ...(receiptDate && { date: receiptDate }),
          ...(data.items && { items: JSON.stringify(data.items) }),
          ...(data.rawText && { rawText: data.rawText }),
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

      return { success: true, data: this.formatReceipt(updatedReceipt) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error validating receipt:', error);
      throw new AppError('Failed to validate receipt', 500);
    }
  }

  /**
   * Apply cashback for a validated receipt
   */
  async applyCashback(id: string, cashbackAmount: number) {
    try {
      const receipt = await prisma.receipt.findUnique({
        where: { id },
        include: {
          transaction: true,
          user: {
            include: {
              loyaltyAccount: true
            }
          }
        }
      });

      if (!receipt) {
        throw new AppError('Receipt not found', 404);
      }

      if (receipt.status !== ReceiptStatus.APPROVED) {
        throw new AppError('Receipt must be approved before applying cashback', 400);
      }

      if (receipt.cashbackAmount > 0) {
        throw new AppError('Cashback has already been applied to this receipt', 400);
      }

      // Create or update loyalty account
      let loyaltyAccount = receipt.user.loyaltyAccount;
      if (!loyaltyAccount) {
        loyaltyAccount = await prisma.loyaltyAccount.create({
          data: {
            userId: receipt.userId,
            cashbackBalance: cashbackAmount
          }
        });
      } else {
        loyaltyAccount = await prisma.loyaltyAccount.update({
          where: { id: loyaltyAccount.id },
          data: {
            cashbackBalance: loyaltyAccount.cashbackBalance + cashbackAmount
          }
        });
      }

      // Update receipt cashback amount
      const updatedReceipt = await prisma.receipt.update({
        where: { id },
        data: {
          cashbackAmount
        }
      });

      logger.info(`Cashback applied: ${cashbackAmount} BGN to user ${receipt.userId} for receipt ${id}`);

      return {
        success: true,
        data: {
          receipt: this.formatReceipt(updatedReceipt),
          cashbackAmount,
          newBalance: loyaltyAccount.cashbackBalance
        }
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error applying cashback:', error);
      throw new AppError('Failed to apply cashback', 500);
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

      // Only allow deletion of PENDING or REJECTED receipts
      if (receipt.cashbackAmount > 0) {
        throw new AppError('Cannot delete receipt with applied cashback', 400);
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
   */
  async getUserReceiptStats(userId: string) {
    try {
      const receipts = await prisma.receipt.findMany({
        where: { userId }
      });

      const totalReceipts = receipts.length;
      const validatedReceipts = receipts.filter(r => r.status === ReceiptStatus.APPROVED).length;
      const rejectedReceipts = receipts.filter(r => r.status === ReceiptStatus.REJECTED).length;
      const pendingReceipts = receipts.filter(r => r.status === ReceiptStatus.PENDING).length;

      const totalAmount = receipts
        .filter(r => r.totalAmount)
        .reduce((sum, r) => sum + (r.totalAmount || 0), 0);

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
            : 0
        }
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
   * Format receipt for response (parse JSON fields)
   */
  private formatReceipt(receipt: any) {
    return {
      ...receipt,
      items: receipt.items ? JSON.parse(receipt.items) : undefined,
      metadata: receipt.metadata ? JSON.parse(receipt.metadata) : undefined
    };
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
  }) {
    try {
      // Get user
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Get user's card tier
      const userCard = await prisma.card.findFirst({
        where: { userId: request.userId },
      });

      const cardTier = userCard?.type || 'STANDARD';

      // Auto-create card if user doesn't have one
      if (!userCard) {
        await cardService.createCard({ userId: request.userId, cardType: 'STANDARD' });
      }

      // Get venue location if provided
      let venueLat: number | undefined;
      let venueLon: number | undefined;

      if (request.venueId) {
        const venue = await prisma.partner.findUnique({
          where: { id: request.venueId },
          select: { latitude: true, longitude: true },
        });
        venueLat = venue?.latitude ?? undefined;
        venueLon = venue?.longitude ?? undefined;
      }

      // Run fraud detection
      const fraudCheck = await fraudDetectionService.checkReceipt({
        imageHash: request.imageHash,
        ocrAmount: request.ocrData?.totalAmount,
        userAmount: request.userAmount,
        userLat: request.latitude,
        userLon: request.longitude,
        venueLat,
        venueLon,
        ocrConfidence: request.ocrData?.confidence || 0,
        merchantName: request.ocrData?.merchantName,
        userId: request.userId,
        venueId: request.venueId,
        cardTier: cardTier as any,
      });

      // Calculate cashback
      const amount = request.userAmount || request.ocrData?.totalAmount || 0;
      const cashbackCalc = await fraudDetectionService.calculateCashback({
        venueId: request.venueId,
        amount,
        cardTier: cardTier as any,
      });

      // Determine status
      let status: ReceiptStatus = 'PENDING' as any;
      let cashbackAmount = 0;

      if (fraudCheck.isApproved) {
        status = 'APPROVED' as any;
        cashbackAmount = cashbackCalc.cashbackAmount;
      } else if (fraudCheck.requiresManualReview) {
        status = 'MANUAL_REVIEW' as any;
      } else {
        status = 'REJECTED' as any;
      }

      // Get card ID (refresh to get newly created card if needed)
      const card = await prisma.card.findFirst({
        where: { userId: request.userId },
      });

      // Create receipt record
      const receipt = await prisma.receipt.create({
        data: {
          userId: request.userId,
          cardId: card?.id,
          imageUrl: request.imageUrl,
          imageHash: request.imageHash,
          ocrRawText: request.ocrData?.rawText || '',
          merchantName: request.ocrData?.merchantName,
          totalAmount: amount,
          receiptDate: request.ocrData?.receiptDate ? new Date(request.ocrData.receiptDate) : undefined,
          ocrConfidence: request.ocrData?.confidence || 0,
          cashbackAmount,
          cashbackPercent: cashbackCalc.cashbackPercent,
          fraudScore: fraudCheck.fraudScore,
          fraudReasons: JSON.stringify(fraudCheck.fraudReasons || []),
          status: status,
          venueId: request.venueId,
          offerId: request.offerId,
          latitude: request.latitude,
          longitude: request.longitude,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
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

      // Send notifications
      if (status === 'APPROVED') {
        await notificationService.notifyReceiptApproved({
          userId: request.userId,
          receiptId: receipt.id,
          merchantName: request.ocrData?.merchantName || 'Unknown Merchant',
          cashbackAmount,
        });
      } else if (status === 'MANUAL_REVIEW') {
        await notificationService.notifyManualReviewRequired({
          userId: request.userId,
          receiptId: receipt.id,
          merchantName: request.ocrData?.merchantName || 'Unknown Merchant',
        });
      } else if (status === 'REJECTED') {
        await notificationService.notifyReceiptRejected({
          userId: request.userId,
          receiptId: receipt.id,
          merchantName: request.ocrData?.merchantName || 'Unknown Merchant',
          reason: fraudCheck.fraudReasons?.join(', ') || 'Fraud score too high',
        });
      }

      // Send fraud alert to admins if high score
      if (fraudCheck.fraudScore >= 60) {
        await notificationService.notifyFraudAlert({
          receiptId: receipt.id,
          userId: request.userId,
          fraudScore: fraudCheck.fraudScore,
          fraudReasons: fraudCheck.fraudReasons,
        });
      }

      logger.info(`Receipt ${receipt.id} submitted: ${status} (fraud score: ${fraudCheck.fraudScore})`);

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
        },
        fraudAnalysis: {
          score: fraudCheck.fraudScore,
          decision: fraudCheck.isApproved ? 'APPROVED' : fraudCheck.requiresManualReview ? 'MANUAL_REVIEW' : 'REJECTED',
          riskLevel: fraudCheck.fraudScore <= 30 ? 'LOW' : fraudCheck.fraudScore <= 60 ? 'MEDIUM' : 'HIGH',
          flagsTriggered: fraudCheck.fraudReasons?.map(reason => ({
            indicator: reason,
            description: this.getFraudReasonDescription(reason),
            score: this.getFraudReasonScore(reason),
          })) || [],
          requiresManualReview: status === 'MANUAL_REVIEW',
        },
        cashback: {
          amount: cashbackAmount,
          percentage: cashbackCalc.cashbackPercent,
          status: cashbackAmount > 0 ? 'PENDING' : 'NOT_APPLICABLE',
          estimatedDate: cashbackAmount > 0 ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null, // 7 days from now
        },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error submitting receipt:', error);
      throw new AppError('Failed to submit receipt', 500);
    }
  }

  /**
   * Check if image hash already exists (duplicate detection)
   */
  async checkDuplicateImage(imageHash: string): Promise<boolean> {
    const existing = await prisma.receipt.findFirst({
      where: { imageHash },
    });
    return !!existing;
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

    return {
      submissionsToday: today,
      submissionsThisMonth: thisMonth,
      totalSubmissions: total,
      dailyLimit: 10,
      monthlyLimit: 100,
      remainingToday: Math.max(0, 10 - today),
      remainingThisMonth: Math.max(0, 100 - thisMonth),
    };
  }

  /**
   * Get receipts pending manual review (admin only)
   */
  async getPendingReviews(limit: number = 50) {
    return prisma.receipt.findMany({
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

      const oldStatus = receipt.status;
      const newStatus: ReceiptStatus = params.action === 'APPROVE' ? 'APPROVED' as any : 'REJECTED' as any;

      // Recalculate cashback if verifiedAmount provided
      let cashbackAmount = 0;
      if (params.action === 'APPROVE') {
        const amount = params.verifiedAmount || receipt.totalAmount || 0;

        // Get user's card tier
        const userCard = await prisma.card.findFirst({
          where: { userId: receipt.userId },
        });

        const cardTier = userCard?.type || 'STANDARD';

        const cashbackCalc = await fraudDetectionService.calculateCashback({
          venueId: undefined,
          amount,
          cardTier: cardTier as any,
        });
        cashbackAmount = cashbackCalc.cashbackAmount;
      }

      // Update receipt
      const updated = await prisma.receipt.update({
        where: { id: params.receiptId },
        data: {
          status: newStatus,
          totalAmount: params.verifiedAmount || receipt.totalAmount,
          validatedBy: params.reviewedBy,
          validatedAt: new Date(),
          rejectionReason: params.rejectionReason,
          metadata: params.notes ? JSON.stringify({ ...JSON.parse(receipt.metadata || '{}'), reviewNotes: params.notes }) : receipt.metadata,
        } as any,
      });

      // Update analytics
      await receiptAnalyticsService.updateAnalyticsOnStatusChange({
        userId: receipt.userId,
        oldStatus: oldStatus as string,
        newStatus: newStatus as string,
        cashbackAmount,
      });

      // Credit cashback to wallet if approved
      if (newStatus === 'APPROVED' && cashbackAmount > 0) {
        try {
          await walletService.credit({
            userId: receipt.userId,
            amount: cashbackAmount,
            type: 'CASHBACK_CREDIT',
            description: `Cashback from receipt at ${receipt.merchantName || 'merchant'}`,
            receiptId: receipt.id,
            metadata: {
              merchantName: receipt.merchantName,
              totalAmount: updated.totalAmount,
              receiptDate: receipt.receiptDate,
            },
          });

          logger.info(`Approved receipt ${params.receiptId} and credited ${cashbackAmount} BGN`);
        } catch (error) {
          logger.error(`Failed to credit cashback for receipt ${params.receiptId}:`, error);
          // Continue even if wallet credit fails
        }
      }

      // Send notification
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

      logger.info(`Receipt ${params.receiptId} ${newStatus.toLowerCase()} by admin`);

      return {
        success: true,
        receipt: this.formatReceipt(updated),
        message: `Receipt ${params.action.toLowerCase()}d successfully`,
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
  private getStatusMessage(status: string, cashbackAmount: number): string {
    switch (status) {
      case 'APPROVED':
        return `Receipt approved! You earned ${cashbackAmount.toFixed(2)} BGN cashback.`;
      case 'MANUAL_REVIEW':
        return 'Receipt is under review. You will be notified within 24-48 hours.';
      case 'REJECTED':
        return 'Receipt was not approved. Please ensure the receipt is clear and meets our guidelines.';
      default:
        return 'Receipt submitted successfully.';
    }
  }

  /**
   * Get human-readable description for fraud reason
   */
  private getFraudReasonDescription(reason: string): string {
    const descriptions: Record<string, string> = {
      DUPLICATE_IMAGE: 'This receipt has been submitted before',
      BLACKLISTED_MERCHANT: 'Merchant is not eligible for cashback',
      EDITED_IMAGE: 'Receipt image appears to have been edited or manipulated',
      SUSPICIOUS_MERCHANT: 'Merchant name does not match known establishments',
      AMOUNT_MISMATCH: 'Receipt amount does not match OCR data',
      LOCATION_MISMATCH: 'GPS location does not match venue location',
      FREQUENT_SUBMISSIONS: 'Too many submissions in a short time period',
      INVALID_GPS: 'GPS location data is missing or invalid',
      LOW_OCR_CONFIDENCE: 'Receipt text could not be read clearly',
      UNUSUAL_TIME: 'Receipt submitted at an unusual time',
    };
    return descriptions[reason] || reason;
  }

  /**
   * Get fraud score value for a specific reason
   */
  private getFraudReasonScore(reason: string): number {
    const scores: Record<string, number> = {
      BLACKLISTED_MERCHANT: 100,
      DUPLICATE_IMAGE: 40,
      EDITED_IMAGE: 35,
      SUSPICIOUS_MERCHANT: 30,
      AMOUNT_MISMATCH: 25,
      LOCATION_MISMATCH: 25,
      FREQUENT_SUBMISSIONS: 20,
      INVALID_GPS: 20,
      LOW_OCR_CONFIDENCE: 15,
      UNUSUAL_TIME: 15,
    };
    return scores[reason] || 0;
  }
}

export const receiptService = new ReceiptService();
