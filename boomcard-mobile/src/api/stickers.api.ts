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
  StickerSessionRequest,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export class StickersApi {
  /**
   * Register a BOOM session at QR-scan time (Step 1 of 2).
   * Per spec §6 Step 3: records time, venue, device, GPS immediately.
   * Returns { sessionId } to pass into scanSticker() when the bill is known.
   */
  static async createSession(
    data: StickerSessionRequest
  ): Promise<ApiResponse<{ sessionId: string; venueId: string }>> {
    const result = await apiClient.post(`${API_CONFIG.ENDPOINTS.STICKERS.BASE}/session`, data);
    if (result.success && result.data) {
      const body = result.data as any;
      return { success: true, data: body?.data ?? body };
    }
    return result;
  }

  /**
   * Complete a scan by submitting the bill amount (Step 2 of 2).
   * Pass sessionId from createSession() for the spec-compliant two-step flow.
   * Without sessionId falls back to the legacy single-call flow.
   *
   * Note: the backend wraps the StickerScan in { success, data: <scan>, message }.
   * The apiClient also wraps, so we unwrap one level here to expose the scan directly.
   */
  static async scanSticker(
    data: StickerScanRequest
  ): Promise<ApiResponse<StickerScan & { message?: string }>> {
    const result = await apiClient.post(API_CONFIG.ENDPOINTS.STICKERS.SCAN, data);
    if (result.success && result.data) {
      // Backend sends { success, data: <StickerScan>, message }; apiClient wraps once more.
      // Unwrap to expose the StickerScan directly.
      const backendBody = result.data as any;
      const scan: StickerScan = backendBody?.data ?? backendBody;
      return { success: true, data: { ...scan, message: backendBody?.message } };
    }
    return result;
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

  // NOTE: getVenueConfig() was removed (R1). GET /api/stickers/venue/:venueId/config
  // is PARTNER/ADMIN-only and 403s for USER. The public validateSticker() above
  // already returns cashbackPercent for the user scan flow.
}

export default StickersApi;
