/**
 * Fraud Admin API Service
 * Wraps merchant whitelist, venue fraud config, and receipt template endpoints.
 */

import { apiService } from './api.service';
import type {
  MerchantWhitelistEntry,
  VenueFraudConfig,
  ReceiptTemplate,
  WhitelistStatus,
} from '../types/fraud.types';

class FraudAdminService {
  private readonly baseUrl = '/receipts/v2';

  // ── Merchant Whitelist ──────────────────────────────────────────────────────

  async getMerchantWhitelist(): Promise<{ success: boolean; data: MerchantWhitelistEntry[] }> {
    return apiService.get(`${this.baseUrl}/merchants/whitelist`);
  }

  async addMerchant(data: {
    merchantName: string;
    status: WhitelistStatus;
    nameBg?: string;
    taxId?: string;
    reason?: string;
  }): Promise<{ success: boolean; data: MerchantWhitelistEntry }> {
    return apiService.post(`${this.baseUrl}/merchants/whitelist`, data);
  }

  async updateMerchantStatus(
    id: string,
    status: WhitelistStatus,
    reason?: string
  ): Promise<{ success: boolean; data: MerchantWhitelistEntry }> {
    return apiService.patch(`${this.baseUrl}/merchants/whitelist/${id}`, { status, reason });
  }

  // ── Venue Fraud Config ──────────────────────────────────────────────────────

  async getVenueConfig(venueId: string): Promise<{ success: boolean; data: VenueFraudConfig }> {
    return apiService.get(`${this.baseUrl}/venues/${venueId}/config`);
  }

  async updateVenueConfig(
    venueId: string,
    config: Partial<VenueFraudConfig>
  ): Promise<{ success: boolean; data: VenueFraudConfig }> {
    return apiService.put(`${this.baseUrl}/venues/${venueId}/config`, config);
  }

  // ── Receipt Templates ───────────────────────────────────────────────────────

  async getTemplates(venueId: string): Promise<{ success: boolean; data: ReceiptTemplate[] }> {
    return apiService.get(`${this.baseUrl}/venues/${venueId}/templates`);
  }

  async createTemplate(
    venueId: string,
    formData: FormData
  ): Promise<{ success: boolean; data: ReceiptTemplate }> {
    return apiService.post(`${this.baseUrl}/venues/${venueId}/templates`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  async updateTemplate(
    venueId: string,
    templateId: string,
    data: Partial<Pick<ReceiptTemplate, 'merchantName' | 'description' | 'expectedKeywords' | 'isActive'>>
  ): Promise<{ success: boolean; data: ReceiptTemplate }> {
    return apiService.patch(`${this.baseUrl}/venues/${venueId}/templates/${templateId}`, data);
  }

  async deleteTemplate(
    venueId: string,
    templateId: string
  ): Promise<{ success: boolean; message: string }> {
    return apiService.delete(`${this.baseUrl}/venues/${venueId}/templates/${templateId}`);
  }
}

export const fraudAdminService = new FraudAdminService();
