/**
 * Review Types for BoomCard Partner Dashboard
 */

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FLAGGED';

export interface Review {
  id: string;
  userId: string;
  partnerId: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  images?: string[] | null;
  status: ReviewStatus;
  isVerified: boolean;
  helpful: number;
  notHelpful: number;
  adminResponse?: string | null;
  adminRespondedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatar?: string | null;
  };
  partner?: {
    id: string;
    businessName: string;
    businessNameBg?: string | null;
    logo?: string | null;
  };
}

export interface CreateReviewDTO {
  partnerId: string;
  rating: number;
  title?: string;
  comment?: string;
  images?: string[];
}

export interface UpdateReviewDTO {
  rating?: number;
  title?: string;
  comment?: string;
  images?: string[];
}

export interface ReviewFilters {
  partnerId?: string;
  userId?: string;
  status?: ReviewStatus;
  rating?: number;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'rating' | 'helpful';
  sortOrder?: 'asc' | 'desc';
}

export interface ReviewStats {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface PaginatedReviewsResponse {
  success: boolean;
  data: Review[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ReviewResponse {
  success: boolean;
  data: Review;
}

export interface ReviewStatsResponse {
  success: boolean;
  data: ReviewStats;
}
