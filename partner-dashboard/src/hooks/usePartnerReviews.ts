import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partnerReviewsService } from '../services/partnerReviews.service';
import type { ReviewFilters } from '../types/review.types';
import toast from 'react-hot-toast';

interface UsePartnerReviewsOptions {
  filters?: ReviewFilters;
}

export const usePartnerReviews = (options: UsePartnerReviewsOptions = {}) => {
  const { filters } = options;
  const queryClient = useQueryClient();

  // Fetch reviews with React Query
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reviews', filters],
    queryFn: () => partnerReviewsService.getReviews(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create review mutation
  const createReviewMutation = useMutation({
    mutationFn: (reviewData: Parameters<typeof partnerReviewsService.createReview>[0]) =>
      partnerReviewsService.createReview(reviewData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review submitted successfully! It will be visible after approval.');
    },
    onError: (err: any) => {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to submit review';
      toast.error(errorMessage);
    },
  });

  // Delete review mutation
  const deleteReviewMutation = useMutation({
    mutationFn: (id: string) => partnerReviewsService.deleteReview(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review deleted successfully');
    },
    onError: (err: any) => {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to delete review';
      toast.error(errorMessage);
    },
  });

  // Mark helpful mutation
  const markHelpfulMutation = useMutation({
    mutationFn: ({ id, helpful }: { id: string; helpful: boolean }) =>
      partnerReviewsService.markHelpful(id, helpful),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: (err: any) => {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to vote';
      toast.error(errorMessage);
    },
  });

  return {
    reviews: data?.data || [],
    loading: isLoading,
    error: error ? (error as any).message : null,
    pagination: data?.pagination || {
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0
    },
    refetch,
    createReview: createReviewMutation.mutateAsync,
    deleteReview: deleteReviewMutation.mutateAsync,
    markHelpful: (id: string, helpful: boolean) => markHelpfulMutation.mutateAsync({ id, helpful })
  };
};

export default usePartnerReviews;
