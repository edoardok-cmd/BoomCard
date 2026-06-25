/**
 * Loyalty API
 *
 * Handles loyalty points, rewards, and tier management
 *
 * ⚠️ BACKEND NOT IMPLEMENTED (N9). The backend loyalty.routes.ts exposes only
 * GET /api/loyalty/accounts/me → HTTP 501, and every other path 404s. Do NOT
 * surface any loyalty UI from this client until the backend exists. This module
 * is intentionally kept unwired (zero screen consumers) so that a future feature
 * can flip it on once the server-side is built — calling it today will fail.
 */

import apiClient from './client';
import { API_CONFIG } from '../constants/config';
import type {
  LoyaltyAccount,
  ApiResponse,
} from '../types';

export class LoyaltyApi {
  /**
   * Get user's loyalty account.
   * Backend returns HTTP 501 — the loyalty system is not yet implemented.
   * This method is retained so the endpoint can be wired once the server-side
   * is built; no other loyalty methods are present because they have no
   * corresponding backend routes (all other /api/loyalty/* paths 404).
   */
  static async getAccount(): Promise<ApiResponse<LoyaltyAccount>> {
    return await apiClient.get<LoyaltyAccount>(
      API_CONFIG.ENDPOINTS.LOYALTY.ACCOUNT
    );
  }
}

export default LoyaltyApi;
