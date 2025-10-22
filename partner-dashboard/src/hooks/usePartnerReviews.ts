import { useState, useEffect, useCallback } from 'react';
import { partnerReviewsService } from '../services/partnerReviews.service';
import type { Review, ReviewFilters } from '../types/review.types';
import toast from 'react-hot-toast';

interface UsePartnerReviewsOptions {
  filters?: ReviewFilters;
  autoFetch?: boolean;
}

export const usePartnerReviews = (options: UsePartnerReviewsOptions = {}) => {
  const { filters, autoFetch = true } = options;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await partnerReviewsService.getReviews(filters);

      setReviews(response.data);
      setPagination(response.pagination);
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch reviews';
      setError(errorMessage);
      console.error('Error fetching reviews:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const refetch = useCallback(() => {
    return fetchReviews();
  }, [fetchReviews]);

  const createReview = useCallback(async (data: Parameters<typeof partnerReviewsService.createReview>[0]) => {
    try {
      const newReview = await partnerReviewsService.createReview(data);
      toast.success('Review submitted successfully! It will be visible after approval.');

      // Optionally refetch to show pending review
      await refetch();

      return newReview;
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to submit review';
      toast.error(errorMessage);
      throw err;
    }
  }, [refetch]);

  const deleteReview = useCallback(async (id: string) => {
    try {
      await partnerReviewsService.deleteReview(id);
      toast.success('Review deleted successfully');

      // Remove from local state
      setReviews(prev => prev.filter(r => r.id !== id));

      return true;
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to delete review';
      toast.error(errorMessage);
      throw err;
    }
  }, []);

  const markHelpful = useCallback(async (id: string, helpful: boolean) => {
    try {
      const updatedReview = await partnerReviewsService.markHelpful(id, helpful);

      // Update local state
      setReviews(prev => prev.map(r => r.id === id ? updatedReview : r));

      return updatedReview;
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to vote';
      toast.error(errorMessage);
      throw err;
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchReviews();
    }
  }, [autoFetch, fetchReviews]);

  return {
    reviews,
    loading,
    error,
    pagination,
    refetch,
    createReview,
    deleteReview,
    markHelpful
  };
};

export default usePartnerReviews;
