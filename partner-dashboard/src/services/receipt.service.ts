/**
 * Receipt Processing Service
 *
 * Handles:
 * - Receipt submission and validation
 * - OCR processing
 * - Fraud detection
 * - Cashback calculation
 * - Admin review workflow
 */

import { ocrService, ReceiptData } from './ocr.service';
import { apiService } from './api.service';
import {
  generateImageHash,
  calculateFraudScore,
  calculateCashback,
  validateAmount,
  verifyGPSLocation,
  validateReceiptAge,
  FraudCheckResult,
} from '../utils/fraudDetection';
import { Receipt, ReceiptStatus } from '../types/receipt.types';

export interface SubmitReceiptRequest {
  imageFile: File;
  userAmount?: number;
  venueId?: string;
  offerId?: string;
  latitude?: number;
  longitude?: number;
  metadata?: Record<string, unknown>;
}

export interface ReceiptSubmissionResult {
  receiptId: string;
  status: ReceiptStatus;
  ocrData: ReceiptData;
  fraudCheck: FraudCheckResult;
  cashbackAmount: number;
  cashbackPercent: number;
  message: string;
}

// Re-export types from centralized location
export type { Receipt } from '../types/receipt.types';
export { ReceiptStatus } from '../types/receipt.types';

export interface AdminReviewRequest {
  receiptId: string;
  action: 'APPROVE' | 'REJECT';
  verifiedAmount?: number;
  notes?: string;
  rejectionReason?: string;
}

export interface ReceiptListFilters {
  status?: ReceiptStatus;
  userId?: string;
  venueId?: string;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  minFraudScore?: number;
  maxFraudScore?: number;
}

interface VenueConfig {
  gpsVerificationEnabled?: boolean;
  venueLat: number;
  venueLon: number;
  gpsRadiusMeters?: number;
  maxScansPerDay?: number;
  discountPercent?: number;
  maxCashbackPerScan?: number;
}

interface UserSubmissionStats {
  submissionsToday: number;
  submissionsThisMonth: number;
  cardType: 'BASIC' | 'LIGHT' | 'PREMIUM';
}

class ReceiptService {
  /**
   * Submit a receipt for processing
   */
  async submitReceipt(request: SubmitReceiptRequest): Promise<ReceiptSubmissionResult> {
    try {
      console.log('📄 Starting receipt submission...');

      // Step 1: Generate image hash for duplicate detection
      const imageHash = await generateImageHash(request.imageFile);
      console.log('🔑 Image hash generated:', imageHash.substring(0, 16) + '...');

      // Step 2: Check for duplicate
      const isDuplicate = await this.checkDuplicate(imageHash);
      if (isDuplicate) {
        throw new Error('Duplicate receipt detected. This receipt has already been submitted.');
      }

      // Step 3: Run OCR
      console.log('🔍 Running OCR...');
      await ocrService.initialize('bul+eng');
      const ocrData = await ocrService.recognizeText(request.imageFile);
      console.log('✅ OCR complete. Confidence:', ocrData.confidence);

      // Step 4: Validate amount if user provided one
      let amountValidation = { isValid: true, difference: 0 };
      if (request.userAmount && ocrData.totalAmount) {
        amountValidation = validateAmount(ocrData.totalAmount, request.userAmount, 10);
      }

      // Step 5: Get venue configuration for fraud checks and cashback
      const venueConfig = request.venueId
        ? await this.getVenueConfig(request.venueId)
        : null;

      // Step 6: GPS verification if enabled
      let gpsVerification: { isValid: boolean; distance: number | null } = { isValid: true, distance: null };
      if (venueConfig?.gpsVerificationEnabled && request.latitude && request.longitude) {
        gpsVerification = verifyGPSLocation(
          request.latitude,
          request.longitude,
          venueConfig.venueLat,
          venueConfig.venueLon,
          venueConfig.gpsRadiusMeters || 100
        );
      }

      // Step 7: Check receipt age against upload window (default: 1-day / 6am-next-day cutoff)
      const receiptAge = ocrData.date ? validateReceiptAge(new Date(ocrData.date)) : { isValid: true, ageDays: null };
      // Flag receipts uploaded more than 1 hour after issuance (spec: may route to manual review)
      const receiptLate = receiptAge.ageDays !== null && receiptAge.ageDays * 24 > 1;

      // Step 8: Get user submission stats for rate limiting
      const userStats = await this.getUserSubmissionStats();

      // Step 9: Check rate limits
      // Rate limits deactivated — venue config defaults to 999999 (unlimited)

      // Step 10: Check merchant whitelist
      const merchantCheck = ocrData.merchantName
        ? await this.checkMerchantWhitelist(ocrData.merchantName)
        : { isWhitelisted: false, isBlacklisted: false };

      // Step 11: Calculate fraud score
      const fraudCheck = calculateFraudScore({
        isDuplicate: false,
        amountMismatch: !amountValidation.isValid,
        amountDifferencePercent: amountValidation.difference,
        isOutsideGeoFence: !gpsVerification.isValid,
        distanceFromVenue: gpsVerification.distance || undefined,
        ocrConfidence: ocrData.confidence,
        userDailyScans: userStats.submissionsToday,
        maxDailyScans: venueConfig?.maxScansPerDay,
        merchantBlacklisted: merchantCheck.isBlacklisted,
        merchantWhitelisted: merchantCheck.isWhitelisted,
        receiptLate,
        receiptTooOld: !receiptAge.isValid,
      });

      console.log('🎯 Fraud score:', fraudCheck.fraudScore);

      // Step 12: Calculate cashback using fixed lookup table
      const amount = ocrData.totalAmount || request.userAmount || 0;
      const cashback = calculateCashback({
        amount,
        partnerDiscountPercent: venueConfig?.discountPercent || 5,
        cardType: userStats.cardType,
        maxCashbackPerTransaction: venueConfig?.maxCashbackPerScan,
      });

      console.log('💰 Cashback:', cashback.cashbackAmount, 'BGN');

      // Step 13: Determine status
      let status: ReceiptStatus;
      if (fraudCheck.isApproved) {
        status = ReceiptStatus.APPROVED;
      } else if (fraudCheck.requiresManualReview) {
        status = ReceiptStatus.MANUAL_REVIEW;
      } else {
        status = ReceiptStatus.REJECTED;
      }

      // Step 14: Upload image and save receipt
      const imageUrl = await this.uploadReceiptImage(request.imageFile);

      const receipt = await this.createReceipt({
        imageUrl,
        imageHash,
        ocrData,
        venueId: request.venueId,
        offerId: request.offerId,
        totalAmount: amount,
        cashbackPercent: cashback.cashbackPercent,
        cashbackAmount: status === ReceiptStatus.APPROVED ? cashback.cashbackAmount : 0,
        status,
        ocrConfidence: ocrData.confidence,
        fraudScore: fraudCheck.fraudScore,
        fraudReasons: fraudCheck.fraudReasons,
        latitude: request.latitude,
        longitude: request.longitude,
        metadata: request.metadata,
      });

      // Step 15: Update analytics
      await this.updateReceiptAnalytics(receipt.id, status, cashback.cashbackAmount, amount);

      return {
        receiptId: receipt.id,
        status,
        ocrData,
        fraudCheck,
        cashbackAmount: status === ReceiptStatus.APPROVED ? cashback.cashbackAmount : 0,
        cashbackPercent: cashback.cashbackPercent,
        message: this.getStatusMessage(status, fraudCheck),
      };
    } catch (error) {
      console.error('❌ Receipt submission failed:', error);
      throw error;
    }
  }

  /**
   * Get receipt by ID
   */
  async getReceipt(receiptId: string): Promise<Receipt> {
    return apiService.get<Receipt>(`/receipts/${receiptId}`);
  }

  /**
   * Get user's receipts
   */
  async getUserReceipts(filters?: ReceiptListFilters): Promise<Receipt[]> {
    return apiService.get<Receipt[]>('/receipts', filters);
  }

  /**
   * Get receipts pending admin review
   */
  async getPendingReviews(limit: number = 50): Promise<Receipt[]> {
    return apiService.get<Receipt[]>('/receipts/pending-review', { limit });
  }

  /**
   * Admin: Review a receipt
   */
  async reviewReceipt(request: AdminReviewRequest): Promise<Receipt> {
    return apiService.post<Receipt>(`/receipts/${request.receiptId}/review`, request);
  }

  /**
   * Admin: Bulk approve receipts
   */
  async bulkApprove(receiptIds: string[]): Promise<{ approved: number; failed: number }> {
    return apiService.post('/receipts/bulk-approve', { receiptIds });
  }

  /**
   * Admin: Bulk reject receipts
   */
  async bulkReject(
    receiptIds: string[],
    reason: string
  ): Promise<{ rejected: number; failed: number }> {
    return apiService.post('/receipts/bulk-reject', { receiptIds, reason });
  }

  /**
   * Get receipt analytics for user
   */
  async getReceiptAnalytics(userId?: string): Promise<unknown> {
    return apiService.get('/receipts/analytics', { userId });
  }

  /**
   * Check if image hash already exists (duplicate detection)
   */
  private async checkDuplicate(imageHash: string): Promise<boolean> {
    try {
      const response = await apiService.get<{ exists: boolean }>('/receipts/check-duplicate', {
        imageHash,
      });
      return response.exists;
    } catch (error) {
      console.error('Error checking duplicate:', error);
      return false;
    }
  }

  /**
   * Get venue configuration for fraud checks and cashback
   */
  private async getVenueConfig(venueId: string): Promise<VenueConfig | null> {
    try {
      return await apiService.get<VenueConfig>(`/venues/${venueId}/config`);
    } catch (error) {
      console.error('Error getting venue config:', error);
      return null;
    }
  }

  /**
   * Get user submission statistics
   */
  private async getUserSubmissionStats(): Promise<UserSubmissionStats> {
    try {
      return await apiService.get<UserSubmissionStats>('/receipts/stats/user');
    } catch (error) {
      console.error('Error getting user stats:', error);
      return {
        submissionsToday: 0,
        submissionsThisMonth: 0,
        cardType: 'BASIC',
      };
    }
  }

  /**
   * Check merchant whitelist/blacklist
   */
  private async checkMerchantWhitelist(
    merchantName: string
  ): Promise<{ isWhitelisted: boolean; isBlacklisted: boolean }> {
    try {
      return await apiService.get('/receipts/merchant-check', { merchantName });
    } catch (error) {
      console.error('Error checking merchant:', error);
      return { isWhitelisted: false, isBlacklisted: false };
    }
  }

  /**
   * Get offer discount percentage
   */
  private async getOfferDiscount(offerId: string): Promise<number> {
    try {
      const offer = await apiService.get<{ discount?: number }>(`/offers/${offerId}`);
      return offer.discount || 0;
    } catch (error) {
      console.error('Error getting offer:', error);
      return 0;
    }
  }

  /**
   * Upload receipt image to storage
   */
  private async uploadReceiptImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('receipt', file);

    const response = await apiService.post<{ url: string }>('/receipts/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.url;
  }

  /**
   * Create receipt record in database
   */
  private async createReceipt(data: Record<string, unknown>): Promise<Receipt> {
    return apiService.post<Receipt>('/receipts', data);
  }

  /**
   * Update receipt analytics
   */
  private async updateReceiptAnalytics(
    receiptId: string,
    status: ReceiptStatus,
    cashbackAmount: number,
    totalAmount: number
  ): Promise<void> {
    try {
      await apiService.post('/receipts/analytics/update', {
        receiptId,
        status,
        cashbackAmount,
        totalAmount,
      });
    } catch (error) {
      console.error('Error updating analytics:', error);
    }
  }

  /**
   * Get user-friendly status message
   */
  private getStatusMessage(status: ReceiptStatus, fraudCheck: FraudCheckResult): string {
    switch (status) {
      case ReceiptStatus.APPROVED:
        return 'Receipt approved! Cashback will be credited to your account.';
      case ReceiptStatus.MANUAL_REVIEW:
        return `Receipt flagged for review: ${fraudCheck.fraudReasons.join(', ')}. We'll review it within 24 hours.`;
      case ReceiptStatus.REJECTED:
        return `Receipt rejected: ${fraudCheck.fraudReasons.join(', ')}. Please contact support if you believe this is an error.`;
      default:
        return 'Receipt is being processed.';
    }
  }
}

export const receiptService = new ReceiptService();
