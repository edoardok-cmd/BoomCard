/**
 * Reviews Service
 *
 * Complete review and rating system with:
 * - User reviews for venues, offers, and partners
 * - Rating system (1-5 stars)
 * - Review moderation and verification
 * - Review responses from partners
 * - Helpful votes
 * - Review photos
 * - Verified purchase reviews
 * - Sentiment analysis
 */

import { apiService } from './api.service';

export type ReviewRating = 1 | 2 | 3 | 4 | 5;

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'flagged' | 'hidden';

export type ReviewEntityType = 'venue' | 'offer' | 'partner' | 'experience';

export interface Review {
  id: string;
  entityType: ReviewEntityType;
  entityId: string;
  entityName: string;
  entityNameBg: string;

  // Author
  userId: string;
  userName: string;
  userAvatar?: string;
  isVerifiedPurchase: boolean;

  // Rating & Content
  rating: ReviewRating;
  title: string;
  titleBg?: string;
  content: string;
  contentBg?: string;

  // Photos
  photos: string[];

  // Ratings Breakdown (for detailed reviews)
  ratings?: {
    quality?: ReviewRating;
    service?: ReviewRating;
    value?: ReviewRating;
    atmosphere?: ReviewRating;
    cleanliness?: ReviewRating;
  };

  // Status & Moderation
  status: ReviewStatus;
  moderationReason?: string;
  moderationReasonBg?: string;

  // Partner Response
  response?: {
    content: string;
    contentBg: string;
    respondedAt: string;
    respondedBy: string;
    respondedByName: string;
  };

  // Engagement
  helpfulCount: number;
  notHelpfulCount: number;
  userHelpfulVote?: 'helpful' | 'not_helpful';

  // Metadata
  bookingId?: string;
  orderId?: string;
  visitDate?: string;
  createdAt: string;
  updatedAt: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  sentimentScore?: number; // 0-1

  // Flags
  isFeatured: boolean;
  isEdited: boolean;
  editedAt?: string;
}

export interface CreateReviewData {
  entityType: ReviewEntityType;
  entityId: string;
  rating: ReviewRating;
  title: string;
  titleBg?: string;
  content: string;
  contentBg?: string;
  ratings?: {
    quality?: ReviewRating;
    service?: ReviewRating;
    value?: ReviewRating;
    atmosphere?: ReviewRating;
    cleanliness?: ReviewRating;
  };
  bookingId?: string;
  orderId?: string;
  visitDate?: string;
  photos?: File[];
}

export interface ReviewFilters {
  entityType?: ReviewEntityType;
  entityId?: string;
  userId?: string;
  rating?: ReviewRating;
  minRating?: ReviewRating;
  status?: ReviewStatus;
  isVerifiedPurchase?: boolean;
  hasPhotos?: boolean;
  hasResponse?: boolean;
  isFeatured?: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'rating' | 'helpfulCount' | 'sentiment';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedReviews {
  data: Review[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface ReviewStatistics {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  verifiedPurchasePercentage: number;
  withPhotosPercentage: number;
  withResponsePercentage: number;
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  averageResponseTime: number; // in hours
  topKeywords: Array<{ keyword: string; count: number; sentiment: string }>;
  recentTrend: 'improving' | 'declining' | 'stable';
}

export interface ReviewResponse {
  content: string;
  contentBg: string;
}

class ReviewsService {
  private readonly baseUrl = '/reviews';

  /**
   * Get all reviews with filters
   */
  async getReviews(filters?: ReviewFilters): Promise<PaginatedReviews> {
    return apiService.get<PaginatedReviews>(this.baseUrl, filters);
  }

  /**
   * Get review by ID
   */
  async getReviewById(id: string): Promise<Review> {
    return apiService.get<Review>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get reviews for entity (venue, offer, partner)
   */
  async getEntityReviews(
    entityType: ReviewEntityType,
    entityId: string,
    filters?: Omit<ReviewFilters, 'entityType' | 'entityId'>
  ): Promise<PaginatedReviews> {
    return apiService.get<PaginatedReviews>(`${this.baseUrl}/${entityType}/${entityId}`, filters);
  }

  /**
   * Get user's reviews
   */
  async getUserReviews(userId: string, filters?: ReviewFilters): Promise<PaginatedReviews> {
    return apiService.get<PaginatedReviews>(`${this.baseUrl}/user/${userId}`, filters);
  }

  /**
   * Create new review
   */
  async createReview(data: CreateReviewData): Promise<Review> {
    const formData = new FormData();

    // Add review data
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'photos' && Array.isArray(value)) {
        value.forEach((photo) => {
          formData.append('photos', photo);
        });
      } else if (key === 'ratings' && typeof value === 'object') {
        formData.append('ratings', JSON.stringify(value));
      } else if (value !== undefined) {
        formData.append(key, String(value));
      }
    });

    return apiService.post<Review>(this.baseUrl, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  /**
   * Update review
   */
  async updateReview(id: string, updates: Partial<CreateReviewData>): Promise<Review> {
    return apiService.put<Review>(`${this.baseUrl}/${id}`, updates);
  }

  /**
   * Delete review
   */
  async deleteReview(id: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * Add response to review (partner)
   */
  async addResponse(id: string, response: ReviewResponse): Promise<Review> {
    return apiService.post<Review>(`${this.baseUrl}/${id}/response`, response);
  }

  /**
   * Update response
   */
  async updateResponse(id: string, response: ReviewResponse): Promise<Review> {
    return apiService.put<Review>(`${this.baseUrl}/${id}/response`, response);
  }

  /**
   * Delete response
   */
  async deleteResponse(id: string): Promise<Review> {
    return apiService.delete<Review>(`${this.baseUrl}/${id}/response`);
  }

  /**
   * Vote review as helpful
   */
  async voteHelpful(id: string, helpful: boolean): Promise<Review> {
    return apiService.post<Review>(`${this.baseUrl}/${id}/vote`, {
      helpful,
    });
  }

  /**
   * Remove vote
   */
  async removeVote(id: string): Promise<Review> {
    return apiService.delete<Review>(`${this.baseUrl}/${id}/vote`);
  }

  /**
   * Flag review for moderation
   */
  async flagReview(id: string, reason: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/${id}/flag`, {
      reason,
    });
  }

  /**
   * Moderate review (admin/moderator)
   */
  async moderateReview(
    id: string,
    action: 'approve' | 'reject' | 'hide',
    reason?: string
  ): Promise<Review> {
    return apiService.post<Review>(`${this.baseUrl}/${id}/moderate`, {
      action,
      reason,
    });
  }

  /**
   * Feature review
   */
  async featureReview(id: string): Promise<Review> {
    return apiService.post<Review>(`${this.baseUrl}/${id}/feature`);
  }

  /**
   * Unfeature review
   */
  async unfeatureReview(id: string): Promise<Review> {
    return apiService.post<Review>(`${this.baseUrl}/${id}/unfeature`);
  }

  /**
   * Get review statistics
   */
  async getStatistics(
    entityType: ReviewEntityType,
    entityId: string,
    startDate?: string,
    endDate?: string
  ): Promise<ReviewStatistics> {
    return apiService.get<ReviewStatistics>(`${this.baseUrl}/statistics/${entityType}/${entityId}`, {
      startDate,
      endDate,
    });
  }

  /**
   * Get featured reviews
   */
  async getFeaturedReviews(
    entityType: ReviewEntityType,
    entityId: string,
    limit: number = 5
  ): Promise<Review[]> {
    return apiService.get<Review[]>(`${this.baseUrl}/featured/${entityType}/${entityId}`, {
      limit,
    });
  }

  /**
   * Get pending reviews (for moderation)
   */
  async getPendingReviews(page: number = 1, limit: number = 20): Promise<PaginatedReviews> {
    return apiService.get<PaginatedReviews>(`${this.baseUrl}/pending`, {
      page,
      limit,
    });
  }

  /**
   * Get flagged reviews (for moderation)
   */
  async getFlaggedReviews(page: number = 1, limit: number = 20): Promise<PaginatedReviews> {
    return apiService.get<PaginatedReviews>(`${this.baseUrl}/flagged`, {
      page,
      limit,
    });
  }

  /**
   * Check if user can review entity
   */
  async canUserReview(userId: string, entityType: ReviewEntityType, entityId: string): Promise<{
    canReview: boolean;
    reason?: string;
    existingReviewId?: string;
  }> {
    return apiService.get(`${this.baseUrl}/can-review`, {
      userId,
      entityType,
      entityId,
    });
  }

  /**
   * Get review summary
   */
  async getReviewSummary(entityType: ReviewEntityType, entityId: string): Promise<{
    averageRating: number;
    totalReviews: number;
    ratingDistribution: { [key: number]: number };
    recommendationPercentage: number;
    topPositives: string[];
    topNegatives: string[];
  }> {
    return apiService.get(`${this.baseUrl}/summary/${entityType}/${entityId}`);
  }

  /**
   * Get similar reviews
   */
  async getSimilarReviews(id: string, limit: number = 5): Promise<Review[]> {
    return apiService.get<Review[]>(`${this.baseUrl}/${id}/similar`, {
      limit,
    });
  }

  /**
   * Export reviews
   */
  async exportReviews(
    entityType: ReviewEntityType,
    entityId: string,
    format: 'csv' | 'xlsx' | 'pdf' = 'csv'
  ): Promise<Blob> {
    return apiService.get<Blob>(`${this.baseUrl}/export/${entityType}/${entityId}`, {
      format,
    }, {
      responseType: 'blob',
    });
  }

  /**
   * Get review insights (AI-powered)
   */
  async getReviewInsights(entityType: ReviewEntityType, entityId: string): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    topThemes: Array<{ theme: string; count: number; sentiment: string }>;
    improvements: string[];
    strengths: string[];
    commonComplaints: string[];
    commonPraises: string[];
  }> {
    return apiService.get(`${this.baseUrl}/insights/${entityType}/${entityId}`);
  }

  /**
   * Bulk approve reviews
   */
  async bulkApproveReviews(reviewIds: string[]): Promise<{ approved: number; failed: number }> {
    return apiService.post(`${this.baseUrl}/bulk-approve`, {
      reviewIds,
    });
  }

  /**
   * Bulk reject reviews
   */
  async bulkRejectReviews(
    reviewIds: string[],
    reason: string
  ): Promise<{ rejected: number; failed: number }> {
    return apiService.post(`${this.baseUrl}/bulk-reject`, {
      reviewIds,
      reason,
    });
  }

  /**
   * Request review from customer
   */
  async requestReview(
    entityType: ReviewEntityType,
    entityId: string,
    userId: string,
    bookingId?: string
  ): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/request`, {
      entityType,
      entityId,
      userId,
      bookingId,
    });
  }
}

// Export singleton instance
export const reviewsService = new ReviewsService();
export default reviewsService;
