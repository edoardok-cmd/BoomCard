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
  ReceiptSubmitRequest,
  ReceiptStats,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export class ReceiptsApi {
  /**
   * Submit receipt with OCR data and GPS coordinates
   * CRITICAL: GPS coordinates are required for 60m validation
   */
  static async submitReceipt(
    data: ReceiptSubmitRequest
  ): Promise<ApiResponse<Receipt>> {
    return await apiClient.post<Receipt>(
      API_CONFIG.ENDPOINTS.RECEIPTS.SUBMIT,
      data
    );
  }

  /**
   * Upload receipt image
   */
  static async uploadReceiptImage(
    imageUri: string,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ imageUrl: string; imageKey: string; imageHash: string }>> {
    const formData = new FormData();

    // Convert URI to blob/file for upload
    const filename = imageUri.split('/').pop() || 'receipt.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('receipt', {
      uri: imageUri,
      name: filename,
      type,
    } as any);

    return await apiClient.upload(
      API_CONFIG.ENDPOINTS.RECEIPTS.UPLOAD,
      formData,
      (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      }
    );
  }

  /**
   * Check if receipt image is a duplicate
   */
  static async checkDuplicate(
    imageHash: string
  ): Promise<ApiResponse<{ isDuplicate: boolean; existingReceiptId?: string }>> {
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
