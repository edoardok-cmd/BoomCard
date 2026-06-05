/**
 * Receipt API Service
 * Handles all API communication for receipt operations
 * Base URL: /receipts/v2 (enhanced routes with fraud detection)
 */

import { apiService } from './api.service';
import {
  CreateReceiptDTO,
  PartnerReceiptResponse,
  Receipt,
  ReceiptFilters,
  ReceiptListResponse,
  // ReceiptResponse intentionally NOT imported here — this service is partner-facing.
  // Use PartnerReceiptResponse for all partner-accessible endpoints.
  // See receipt.types.ts @internal annotation on ReceiptResponse.
  ReceiptStatsResponse,
  ReviewReceiptResponse,
  UpdateReceiptDTO,
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
   * Get single receipt by ID.
   * Returns PartnerReceiptResponse (spec §11.3, HIGH-1 fix r2ad) — partner
   * callers must never receive the full Receipt type with internal-only fields.
   * Admin callers should use a separate admin endpoint or cast appropriately.
   */
  async getReceiptById(id: string): Promise<PartnerReceiptResponse> {
    return apiService.get<PartnerReceiptResponse>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get receipt statistics for current user
   */
  async getUserStats(): Promise<ReceiptStatsResponse> {
    return apiService.get<ReceiptStatsResponse>(`${this.baseUrl}/stats/user`);
  }

  /**
   * Create a new receipt from OCR scan data.
   * Returns PartnerReceiptResponse — internal fields are not returned to the
   * partner submitting the scan (spec §11.3).
   */
  async createReceipt(data: CreateReceiptDTO): Promise<PartnerReceiptResponse> {
    return apiService.post<PartnerReceiptResponse>(this.baseUrl, data);
  }

  /**
   * Update an existing receipt.
   * Returns PartnerReceiptResponse — internal fields remain hidden from
   * the caller (spec §11.3).
   */
  async updateReceipt(id: string, data: UpdateReceiptDTO): Promise<PartnerReceiptResponse> {
    // Receipt update lives on the v1 router (PUT /api/receipts/:id) — the v2
    // (enhanced) router has no PATCH/PUT /:id. Use the real endpoint so this
    // doesn't 404 if a caller is wired up later.
    return apiService.put<PartnerReceiptResponse>(`/receipts/${id}`, data);
  }

  /**
   * Delete a receipt.
   * HIGH fix: the enhanced (v2) router has NO `DELETE /:id` — `${this.baseUrl}/${id}`
   * resolved to `/api/receipts/v2/:id`, which 404s. The real endpoint lives on the
   * v1 receipts router: `DELETE /api/receipts/:id` (authenticated, owner-scoped,
   * receipts.routes.ts L158). apiService.delete prepends the `/api` baseURL, so the
   * absolute `/receipts/${id}` path below resolves to `/api/receipts/:id` — NOT v2.
   */
  async deleteReceipt(id: string): Promise<{ success: boolean }> {
    return apiService.delete<{ success: boolean }>(`/receipts/${id}`);
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
  ): Promise<ReviewReceiptResponse> {
    return apiService.post<ReviewReceiptResponse>(`${this.baseUrl}/${id}/review`, {
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
