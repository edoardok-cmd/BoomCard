/**
 * Loyalty API
 *
 * Handles loyalty points, rewards, and tier management
 */

import apiClient from './client';
import { API_CONFIG } from '../constants/config';
import type {
  LoyaltyAccount,
  LoyaltyTransaction,
  Reward,
  ApiResponse,
  PaginatedResponse,
} from '../types';

export class LoyaltyApi {
  /**
   * Get user's loyalty account
   */
  static async getAccount(): Promise<ApiResponse<LoyaltyAccount>> {
    return await apiClient.get<LoyaltyAccount>(
      API_CONFIG.ENDPOINTS.LOYALTY.ACCOUNT
    );
  }

  /**
   * Get loyalty transactions history
   */
  static async getTransactions(params?: {
    type?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<PaginatedResponse<LoyaltyTransaction>>> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const url = `${API_CONFIG.ENDPOINTS.LOYALTY.TRANSACTIONS}?${queryParams.toString()}`;
    return await apiClient.get<PaginatedResponse<LoyaltyTransaction>>(url);
  }

  /**
   * Get available rewards
   */
  static async getRewards(params?: {
    category?: string;
    maxPoints?: number;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<PaginatedResponse<Reward>>> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const url = `${API_CONFIG.ENDPOINTS.LOYALTY.REWARDS}?${queryParams.toString()}`;
    return await apiClient.get<PaginatedResponse<Reward>>(url);
  }

  /**
   * Get single reward by ID
   */
  static async getRewardById(id: string): Promise<ApiResponse<Reward>> {
    return await apiClient.get<Reward>(
      `${API_CONFIG.ENDPOINTS.LOYALTY.REWARDS}/${id}`
    );
  }

  /**
   * Redeem reward with points
   */
  static async redeemReward(
    rewardId: string
  ): Promise<ApiResponse<{
    redemptionId: string;
    code: string;
    pointsSpent: number;
    expiresAt: string;
  }>> {
    return await apiClient.post(
      `${API_CONFIG.ENDPOINTS.LOYALTY.REWARDS}/${rewardId}/redeem`
    );
  }

  /**
   * Get reward redemption history
   */
  static async getRedemptions(): Promise<ApiResponse<any[]>> {
    return await apiClient.get(
      `${API_CONFIG.ENDPOINTS.LOYALTY.REWARDS}/redemptions`
    );
  }

  /**
   * Get points summary
   */
  static async getPointsSummary(): Promise<ApiResponse<{
    totalPoints: number;
    lifetimePoints: number;
    pointsEarnedThisMonth: number;
    pointsRedeemedThisMonth: number;
    nextTierPoints: number;
    nextTier: string;
  }>> {
    return await apiClient.get(`${API_CONFIG.ENDPOINTS.LOYALTY.ACCOUNT}/summary`);
  }

  /**
   * Get tier benefits
   */
  static async getTierBenefits(
    tier: string
  ): Promise<ApiResponse<{
    tier: string;
    benefits: string[];
    minPoints: number;
    bonusPercentage: number;
  }>> {
    return await apiClient.get(
      `${API_CONFIG.ENDPOINTS.LOYALTY.ACCOUNT}/tiers/${tier}`
    );
  }
}

export default LoyaltyApi;
