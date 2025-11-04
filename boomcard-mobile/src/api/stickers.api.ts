/**
 * Stickers API
 *
 * Handles BOOM-Sticker QR code scanning and cashback flow
 * CRITICAL: Includes GPS validation for venue proximity
 */

import apiClient from './client';
import { API_CONFIG } from '../constants/config';
import type {
  StickerScan,
  StickerScanRequest,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export class StickersApi {
  /**
   * Initiate sticker scan with GPS validation
   * CRITICAL: GPS coordinates are required for venue proximity validation
   */
  static async scanSticker(
    data: StickerScanRequest
  ): Promise<ApiResponse<{ scanId: string; cashbackPercent: number; message: string }>> {
    return await apiClient.post(API_CONFIG.ENDPOINTS.STICKERS.SCAN, data);
  }

  /**
   * Upload receipt for completed scan
   */
  static async uploadReceiptForScan(
    scanId: string,
    imageUri: string,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<StickerScan>> {
    const formData = new FormData();

    const filename = imageUri.split('/').pop() || 'receipt.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('receipt', {
      uri: imageUri,
      name: filename,
      type,
    } as any);

    return await apiClient.upload(
      `${API_CONFIG.ENDPOINTS.STICKERS.SCAN}/${scanId}/receipt`,
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
   * Get user's scan history
   */
  static async getMyScan(): Promise<ApiResponse<PaginatedResponse<StickerScan>>> {
    return await apiClient.get<PaginatedResponse<StickerScan>>(
      API_CONFIG.ENDPOINTS.STICKERS.MY_SCANS
    );
  }

  /**
   * Get single scan by ID
   */
  static async getScanById(
    scanId: string
  ): Promise<ApiResponse<StickerScan>> {
    return await apiClient.get<StickerScan>(
      `${API_CONFIG.ENDPOINTS.STICKERS.SCAN}/${scanId}`
    );
  }

  /**
   * Validate QR code before scanning
   */
  static async validateSticker(
    stickerId: string
  ): Promise<ApiResponse<{
    valid: boolean;
    venueId?: string;
    venueName?: string;
    cashbackPercent?: number;
    message?: string;
  }>> {
    return await apiClient.get(
      `${API_CONFIG.ENDPOINTS.STICKERS.VALIDATE}/${stickerId}`
    );
  }

  /**
   * Get venue sticker configuration
   */
  static async getVenueConfig(
    venueId: string
  ): Promise<ApiResponse<{
    cashbackPercent: number;
    premiumBonus?: number;
    platinumBonus?: number;
    minBillAmount?: number;
    maxScansPerDay?: number;
    gpsVerificationEnabled: boolean;
    gpsRadiusMeters: number;
    ocrVerificationEnabled: boolean;
  }>> {
    return await apiClient.get(
      `${API_CONFIG.ENDPOINTS.STICKERS.BASE}/venue/${venueId}/config`
    );
  }
}

export default StickersApi;
