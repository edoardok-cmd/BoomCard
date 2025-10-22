/**
 * Partner Reviews Service
 * Simplified review service for partner-focused reviews (homepage use)
 */

import { apiService } from './api.service';
import type {
  Review,
  CreateReviewDTO,
  UpdateReviewDTO,
  ReviewFilters,
  PaginatedReviewsResponse,
  ReviewStatsResponse
} from '../types/review.types';

class PartnerReviewsService {
  private readonly baseUrl = '/reviews';

  /**
   * Get all reviews with filters
   */
  async getReviews(filters?: ReviewFilters): Promise<PaginatedReviewsResponse> {
    const response = await apiService.get<PaginatedReviewsResponse>(this.baseUrl, filters);
    return response;
  }

  /**
   * Get review by ID
   */
  async getReviewById(id: string): Promise<Review> {
    const response = await apiService.get<{ success: boolean; data: Review }>(`${this.baseUrl}/${id}`);
    return response.data;
  }

  /**
   * Get reviews for a specific partner
   */
  async getPartnerReviews(partnerId: string, page = 1, limit = 10): Promise<PaginatedReviewsResponse> {
    const response = await apiService.get<PaginatedReviewsResponse>(`${this.baseUrl}/partner/${partnerId}`, {
      page,
      limit
    });
    return response;
  }

  /**
   * Get review statistics for a partner
   */
  async getPartnerReviewStats(partnerId: string): Promise<ReviewStatsResponse> {
    const response = await apiService.get<ReviewStatsResponse>(`${this.baseUrl}/partner/${partnerId}/stats`);
    return response;
  }

  /**
   * Create new review (requires authentication)
   */
  async createReview(data: CreateReviewDTO): Promise<Review> {
    const response = await apiService.post<{ success: boolean; data: Review }>(this.baseUrl, data);
    return response.data;
  }

  /**
   * Update review (only own reviews, only if PENDING)
   */
  async updateReview(id: string, data: UpdateReviewDTO): Promise<Review> {
    const response = await apiService.put<{ success: boolean; data: Review }>(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  /**
   * Delete review (only own reviews)
   */
  async deleteReview(id: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/${id}`);
  }

  /**
   * Mark review as helpful or not helpful
   */
  async markHelpful(id: string, helpful: boolean): Promise<Review> {
    const response = await apiService.patch<{ success: boolean; data: Review }>(`${this.baseUrl}/${id}/helpful`, {
      helpful
    });
    return response.data;
  }

  /**
   * Flag review as inappropriate
   */
  async flagReview(id: string, reason: string): Promise<Review> {
    const response = await apiService.patch<{ success: boolean; data: Review }>(`${this.baseUrl}/${id}/flag`, {
      reason
    });
    return response.data;
  }
}

// Export singleton instance
export const partnerReviewsService = new PartnerReviewsService();
export default partnerReviewsService;
