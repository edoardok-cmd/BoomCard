/**
 * Receipt API Service
 * Handles all API communication for receipt operations
 */

import { apiService } from './api.service';
import {
  Receipt,
  CreateReceiptDTO,
  UpdateReceiptDTO,
  ReceiptFilters,
  ReceiptListResponse,
  ReceiptResponse,
  ReceiptStatsResponse,
} from '../types/receipt.types';

class ReceiptsApiService {
  private readonly baseUrl = '/receipts';

  /**
   * Create a new receipt from OCR results
   */
  async createReceipt(data: CreateReceiptDTO): Promise<ReceiptResponse> {
    return apiService.post<ReceiptResponse>(this.baseUrl, data);
  }

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
   * Update receipt data (manual corrections)
   */
  async updateReceipt(id: string, data: UpdateReceiptDTO): Promise<ReceiptResponse> {
    return apiService.put<ReceiptResponse>(`${this.baseUrl}/${id}`, data);
  }

  /**
   * Delete a receipt
   */
  async deleteReceipt(id: string): Promise<{ success: boolean; message: string }> {
    return apiService.delete<{ success: boolean; message: string }>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get receipt statistics for current user
   */
  async getUserStats(): Promise<ReceiptStatsResponse> {
    return apiService.get<ReceiptStatsResponse>(`${this.baseUrl}/stats`);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  /**
   * Get all receipts (admin only)
   */
  async getAllReceipts(filters?: ReceiptFilters): Promise<ReceiptListResponse> {
    return apiService.get<ReceiptListResponse>(`${this.baseUrl}/admin/all`, filters);
  }

  /**
   * Validate a receipt (approve or reject) - admin only
   */
  async validateReceipt(
    id: string,
    isValid: boolean,
    rejectionReason?: string
  ): Promise<ReceiptResponse> {
    return apiService.patch<ReceiptResponse>(`${this.baseUrl}/${id}/validate`, {
      isValid,
      rejectionReason,
    });
  }

  /**
   * Apply cashback for a validated receipt - admin only
   */
  async applyCashback(
    id: string,
    cashbackAmount: number
  ): Promise<{
    success: boolean;
    data: {
      receipt: Receipt;
      cashbackAmount: number;
      newBalance: number;
    };
  }> {
    return apiService.post(`${this.baseUrl}/${id}/cashback`, { cashbackAmount });
  }
}

export const receiptsApiService = new ReceiptsApiService();
