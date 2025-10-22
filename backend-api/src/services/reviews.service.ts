import { PrismaClient, Review, ReviewStatus, Prisma } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import { isReviewCommentAppropriate } from '../utils/profanity-filter';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

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

class ReviewsService {
  /**
   * Get reviews with filters and pagination
   */
  async getReviews(filters: ReviewFilters = {}) {
    try {
      const {
        partnerId,
        userId,
        status = ReviewStatus.APPROVED,
        rating,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      const skip = (page - 1) * limit;

      const where: Prisma.ReviewWhereInput = {
        ...(partnerId && { partnerId }),
        ...(userId && { userId }),
        ...(status && { status }),
        ...(rating && { rating })
      };

      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true
              }
            },
            partner: {
              select: {
                id: true,
                businessName: true,
                businessNameBg: true
              }
            }
          }
        }),
        prisma.review.count({ where })
      ]);

      return {
        success: true,
        data: reviews,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Error fetching reviews:', error);
      throw new AppError('Failed to fetch reviews', 500);
    }
  }

  /**
   * Get single review by ID
   */
  async getReviewById(id: string) {
    try {
      const review = await prisma.review.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true
            }
          },
          partner: {
            select: {
              id: true,
              businessName: true,
              businessNameBg: true,
              logo: true
            }
          }
        }
      });

      if (!review) {
        throw new AppError('Review not found', 404);
      }

      return { success: true, data: review };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error fetching review:', error);
      throw new AppError('Failed to fetch review', 500);
    }
  }

  /**
   * Get reviews for a specific partner
   */
  async getPartnerReviews(partnerId: string, page = 1, limit = 10) {
    return this.getReviews({
      partnerId,
      status: ReviewStatus.APPROVED,
      page,
      limit
    });
  }

  /**
   * Get review statistics for a partner
   */
  async getReviewStats(partnerId: string): Promise<ReviewStats> {
    try {
      const reviews = await prisma.review.findMany({
        where: {
          partnerId,
          status: ReviewStatus.APPROVED
        },
        select: {
          rating: true
        }
      });

      const totalReviews = reviews.length;

      if (totalReviews === 0) {
        return {
          averageRating: 0,
          totalReviews: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        };
      }

      const sumRatings = reviews.reduce((sum, review) => sum + review.rating, 0);
      const averageRating = sumRatings / totalReviews;

      const ratingDistribution = reviews.reduce((dist, review) => {
        dist[review.rating as keyof typeof dist]++;
        return dist;
      }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

      return {
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews,
        ratingDistribution
      };
    } catch (error) {
      logger.error('Error fetching review stats:', error);
      throw new AppError('Failed to fetch review statistics', 500);
    }
  }

  /**
   * Create a new review
   */
  async createReview(userId: string, data: CreateReviewDTO) {
    try {
      // Validate rating
      if (data.rating < 1 || data.rating > 5) {
        throw new AppError('Rating must be between 1 and 5', 400);
      }

      // Check profanity
      if (data.comment && !isReviewCommentAppropriate(data.comment)) {
        throw new AppError('Review comment contains inappropriate content', 400);
      }

      if (data.title && !isReviewCommentAppropriate(data.title)) {
        throw new AppError('Review title contains inappropriate content', 400);
      }

      // Check if partner exists
      const partner = await prisma.partner.findUnique({
        where: { id: data.partnerId }
      });

      if (!partner) {
        throw new AppError('Partner not found', 404);
      }

      // Check if user already reviewed this partner
      const existingReview = await prisma.review.findFirst({
        where: {
          userId,
          partnerId: data.partnerId
        }
      });

      if (existingReview) {
        throw new AppError('You have already reviewed this partner', 400);
      }

      // Create review
      const review = await prisma.review.create({
        data: {
          userId,
          partnerId: data.partnerId,
          rating: data.rating,
          title: data.title,
          comment: data.comment,
          images: data.images ? JSON.stringify(data.images) : null,
          status: ReviewStatus.PENDING // Requires approval
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true
            }
          }
        }
      });

      logger.info(`Review created: ${review.id} by user: ${userId}`);

      return { success: true, data: review };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error creating review:', error);
      throw new AppError('Failed to create review', 500);
    }
  }

  /**
   * Update a review (only by the review owner and only if PENDING)
   */
  async updateReview(userId: string, id: string, data: UpdateReviewDTO) {
    try {
      const review = await prisma.review.findUnique({
        where: { id }
      });

      if (!review) {
        throw new AppError('Review not found', 404);
      }

      if (review.userId !== userId) {
        throw new AppError('Unauthorized to update this review', 403);
      }

      if (review.status !== ReviewStatus.PENDING) {
        throw new AppError('Only pending reviews can be edited', 400);
      }

      // Validate new rating if provided
      if (data.rating && (data.rating < 1 || data.rating > 5)) {
        throw new AppError('Rating must be between 1 and 5', 400);
      }

      // Check profanity
      if (data.comment && !isReviewCommentAppropriate(data.comment)) {
        throw new AppError('Review comment contains inappropriate content', 400);
      }

      if (data.title && !isReviewCommentAppropriate(data.title)) {
        throw new AppError('Review title contains inappropriate content', 400);
      }

      const updatedReview = await prisma.review.update({
        where: { id },
        data: {
          ...(data.rating && { rating: data.rating }),
          ...(data.title !== undefined && { title: data.title }),
          ...(data.comment !== undefined && { comment: data.comment }),
          ...(data.images && { images: JSON.stringify(data.images) })
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true
            }
          }
        }
      });

      logger.info(`Review updated: ${id} by user: ${userId}`);

      return { success: true, data: updatedReview };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error updating review:', error);
      throw new AppError('Failed to update review', 500);
    }
  }

  /**
   * Delete a review (only by the review owner)
   */
  async deleteReview(userId: string, id: string) {
    try {
      const review = await prisma.review.findUnique({
        where: { id }
      });

      if (!review) {
        throw new AppError('Review not found', 404);
      }

      if (review.userId !== userId) {
        throw new AppError('Unauthorized to delete this review', 403);
      }

      await prisma.review.delete({
        where: { id }
      });

      // Update partner rating
      await this.updatePartnerRating(review.partnerId);

      logger.info(`Review deleted: ${id} by user: ${userId}`);

      return { success: true, message: 'Review deleted successfully' };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error deleting review:', error);
      throw new AppError('Failed to delete review', 500);
    }
  }

  /**
   * Approve a review (admin only)
   */
  async approveReview(id: string) {
    try {
      const review = await prisma.review.update({
        where: { id },
        data: {
          status: ReviewStatus.APPROVED
        }
      });

      // Update partner rating
      await this.updatePartnerRating(review.partnerId);

      logger.info(`Review approved: ${id}`);

      return { success: true, data: review };
    } catch (error) {
      logger.error('Error approving review:', error);
      throw new AppError('Failed to approve review', 500);
    }
  }

  /**
   * Reject a review (admin only)
   */
  async rejectReview(id: string, reason: string) {
    try {
      const review = await prisma.review.update({
        where: { id },
        data: {
          status: ReviewStatus.REJECTED,
          adminResponse: reason
        }
      });

      logger.info(`Review rejected: ${id}`);

      return { success: true, data: review };
    } catch (error) {
      logger.error('Error rejecting review:', error);
      throw new AppError('Failed to reject review', 500);
    }
  }

  /**
   * Flag a review as inappropriate
   */
  async flagReview(id: string, reason: string) {
    try {
      const review = await prisma.review.update({
        where: { id },
        data: {
          status: ReviewStatus.FLAGGED,
          adminResponse: `Flagged: ${reason}`
        }
      });

      logger.info(`Review flagged: ${id} - ${reason}`);

      return { success: true, data: review };
    } catch (error) {
      logger.error('Error flagging review:', error);
      throw new AppError('Failed to flag review', 500);
    }
  }

  /**
   * Add admin response to a review
   */
  async addAdminResponse(id: string, response: string) {
    try {
      const review = await prisma.review.update({
        where: { id },
        data: {
          adminResponse: response,
          adminRespondedAt: new Date()
        }
      });

      logger.info(`Admin response added to review: ${id}`);

      return { success: true, data: review };
    } catch (error) {
      logger.error('Error adding admin response:', error);
      throw new AppError('Failed to add admin response', 500);
    }
  }

  /**
   * Mark review as helpful/not helpful
   */
  async markHelpful(id: string, helpful: boolean) {
    try {
      const review = await prisma.review.findUnique({
        where: { id }
      });

      if (!review) {
        throw new AppError('Review not found', 404);
      }

      const updatedReview = await prisma.review.update({
        where: { id },
        data: {
          helpful: helpful ? review.helpful + 1 : review.helpful,
          notHelpful: !helpful ? review.notHelpful + 1 : review.notHelpful
        }
      });

      return { success: true, data: updatedReview };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error marking review helpful:', error);
      throw new AppError('Failed to update review', 500);
    }
  }

  /**
   * Update partner's average rating and review count
   */
  private async updatePartnerRating(partnerId: string) {
    try {
      const stats = await this.getReviewStats(partnerId);

      await prisma.partner.update({
        where: { id: partnerId },
        data: {
          rating: stats.averageRating,
          reviewCount: stats.totalReviews
        }
      });

      logger.info(`Partner rating updated: ${partnerId} - ${stats.averageRating}`);
    } catch (error) {
      logger.error('Error updating partner rating:', error);
      // Don't throw error, just log it
    }
  }
}

export const reviewsService = new ReviewsService();
