/**
 * Receipts API
 *
 * Handles receipt submission, upload, validation, and management
 * CRITICAL: Includes GPS validation for 60-meter requirement
 */

import apiClient from './client';
import { API_CONFIG } from '../constants/config';
import type {
  Receipt,
  ReceiptStats,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export class ReceiptsApi {
  // NOTE: submitReceipt() and uploadReceiptImage() were removed (R2). The
  // /api/receipts/v2/submit and /v2/upload endpoints are RETIRED (410 GONE).
  // The live receipt-upload path is POST /api/stickers/scan/:scanId/receipt,
  // wired through StickersApi.uploadReceiptForScan.

  /**
   * Check if receipt image is a duplicate.
   * Backend returns { exists: boolean } (R2 — shape corrected).
   */
  static async checkDuplicate(
    imageHash: string
  ): Promise<ApiResponse<{ exists: boolean }>> {
    return await apiClient.get(
      `${API_CONFIG.ENDPOINTS.RECEIPTS.CHECK_DUPLICATE}?hash=${imageHash}`
    );
  }

  /**
   * Get user's receipts with filters
   */
  static async getReceipts(params?: {
    status?: string;
    merchant?: string;
    minAmount?: number;
    maxAmount?: number;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<PaginatedResponse<Receipt>>> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const url = `${API_CONFIG.ENDPOINTS.RECEIPTS.BASE}?${queryParams.toString()}`;
    return await apiClient.get<PaginatedResponse<Receipt>>(url);
  }

  /**
   * Get single receipt by ID
   */
  static async getReceiptById(id: string): Promise<ApiResponse<Receipt>> {
    return await apiClient.get<Receipt>(
      `${API_CONFIG.ENDPOINTS.RECEIPTS.BASE}/${id}`
    );
  }

  /**
   * Update receipt (manual corrections)
   */
  static async updateReceipt(
    id: string,
    data: Partial<Receipt>
  ): Promise<ApiResponse<Receipt>> {
    return await apiClient.put<Receipt>(
      `${API_CONFIG.ENDPOINTS.RECEIPTS.BASE}/${id}`,
      data
    );
  }

  /**
   * Delete receipt
   */
  static async deleteReceipt(id: string): Promise<ApiResponse<void>> {
    return await apiClient.delete<void>(
      `${API_CONFIG.ENDPOINTS.RECEIPTS.BASE}/${id}`
    );
  }

  /**
   * Get user's receipt statistics
   */
  static async getStats(): Promise<ApiResponse<ReceiptStats>> {
    return await apiClient.get<ReceiptStats>(
      API_CONFIG.ENDPOINTS.RECEIPTS.STATS
    );
  }

  /**
   * Get receipt analytics
   */
  static async getAnalytics(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<any>> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value);
        }
      });
    }

    const url = `${API_CONFIG.ENDPOINTS.RECEIPTS.ANALYTICS}?${queryParams.toString()}`;
    return await apiClient.get(url);
  }
}

export default ReceiptsApi;
