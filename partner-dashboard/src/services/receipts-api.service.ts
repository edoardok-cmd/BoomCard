/**
 * Receipt API Service
 * Handles all API communication for receipt operations
 * Base URL: /receipts/v2 (enhanced routes with fraud detection)
 */

import { apiService } from './api.service';
import {
  Receipt,
  ReceiptFilters,
  ReceiptListResponse,
  ReceiptResponse,
  ReceiptStatsResponse,
} from '../types/receipt.types';

class ReceiptsApiService {
  private readonly baseUrl = '/receipts/v2';

  /**
   * Get current user's receipts with optional filters
   */
  async getReceipts(filters?: ReceiptFilters): Promise<ReceiptListResponse> {
    return apiService.get<ReceiptListResponse>(this.baseUrl, filters);
  }

  /**
   * Get single receipt by ID
   */
  async getReceiptById(id: string): Promise<ReceiptResponse> {
    return apiService.get<ReceiptResponse>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get receipt statistics for current user
   */
  async getUserStats(): Promise<ReceiptStatsResponse> {
    return apiService.get<ReceiptStatsResponse>(`${this.baseUrl}/stats/user`);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  /**
   * Get all receipts (admin only)
   */
  async getAllReceipts(filters?: ReceiptFilters & {
    userId?: string;
    venueId?: string;
    minFraudScore?: number;
    maxFraudScore?: number;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    page?: number;
  }): Promise<{ success: boolean; data: Receipt[]; total?: number }> {
    return apiService.get(`${this.baseUrl}/admin/all`, filters);
  }

  /**
   * Get receipts pending manual review (admin only)
   */
  async getPendingReviews(limit = 50): Promise<{ success: boolean; data: Receipt[] }> {
    return apiService.get(`${this.baseUrl}/admin/pending-review`, { limit });
  }

  /**
   * Review a receipt (approve or reject) - admin only
   * On APPROVE, cashback is automatically calculated and credited to the user's wallet.
   */
  async reviewReceipt(
    id: string,
    action: 'APPROVE' | 'REJECT',
    opts?: { verifiedAmount?: number; notes?: string; rejectionReason?: string }
  ): Promise<ReceiptResponse> {
    return apiService.post<ReceiptResponse>(`${this.baseUrl}/${id}/review`, {
      action,
      ...opts,
    });
  }

  /**
   * Bulk approve receipts - admin only
   */
  async bulkApprove(receiptIds: string[]): Promise<{ success: boolean; message: string }> {
    return apiService.post(`${this.baseUrl}/bulk-approve`, { receiptIds });
  }

  /**
   * Bulk reject receipts - admin only
   */
  async bulkReject(receiptIds: string[], reason: string): Promise<{ success: boolean; message: string }> {
    return apiService.post(`${this.baseUrl}/bulk-reject`, { receiptIds, reason });
  }
}

export const receiptsApiService = new ReceiptsApiService();
