import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewsService, Review, ReviewFilters, CreateReviewData, ReviewEntityType, ReviewResponse } from '../services/reviews.service';
import toast from 'react-hot-toast';

/**
 * Hook to fetch reviews with filters
 */
export function useReviews(filters?: ReviewFilters) {
  return useQuery({
    queryKey: ['reviews', filters],
    queryFn: () => reviewsService.getReviews(filters),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch a single review
 */
export function useReview(id: string | undefined) {
  return useQuery({
    queryKey: ['review', id],
    queryFn: () => reviewsService.getReviewById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to fetch reviews for an entity (venue, offer, partner)
 */
export function useEntityReviews(
  entityType: ReviewEntityType,
  entityId: string | undefined,
  filters?: Omit<ReviewFilters, 'entityType' | 'entityId'>
) {
  return useQuery({
    queryKey: ['reviews', entityType, entityId, filters],
    queryFn: () => reviewsService.getEntityReviews(entityType, entityId!, filters),
    enabled: !!entityId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch user's reviews
 */
export function useUserReviews(userId: string | undefined, filters?: ReviewFilters) {
  return useQuery({
    queryKey: ['reviews', 'user', userId, filters],
    queryFn: () => reviewsService.getUserReviews(userId!, filters),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to get featured reviews
 */
export function useFeaturedReviews(
  entityType: ReviewEntityType,
  entityId: string | undefined,
  limit: number = 5
) {
  return useQuery({
    queryKey: ['reviews', 'featured', entityType, entityId, limit],
    queryFn: () => reviewsService.getFeaturedReviews(entityType, entityId!, limit),
    enabled: !!entityId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to get review statistics
 */
export function useReviewStatistics(
  entityType: ReviewEntityType,
  entityId: string | undefined,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: ['reviews', 'statistics', entityType, entityId, startDate, endDate],
    queryFn: () => reviewsService.getStatistics(entityType, entityId!, startDate, endDate),
    enabled: !!entityId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to get review summary
 */
export function useReviewSummary(entityType: ReviewEntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: ['reviews', 'summary', entityType, entityId],
    queryFn: () => reviewsService.getReviewSummary(entityType, entityId!),
    enabled: !!entityId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to get review insights
 */
export function useReviewInsights(entityType: ReviewEntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: ['reviews', 'insights', entityType, entityId],
    queryFn: () => reviewsService.getReviewInsights(entityType, entityId!),
    enabled: !!entityId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to check if user can review
 */
export function useCanUserReview(
  userId: string | undefined,
  entityType: ReviewEntityType,
  entityId: string | undefined
) {
  return useQuery({
    queryKey: ['reviews', 'can-review', userId, entityType, entityId],
    queryFn: () => reviewsService.canUserReview(userId!, entityType, entityId!),
    enabled: !!userId && !!entityId,
  });
}

/**
 * Hook to get pending reviews (for moderation)
 */
export function usePendingReviews(page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: ['reviews', 'pending', page, limit],
    queryFn: () => reviewsService.getPendingReviews(page, limit),
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to get flagged reviews (for moderation)
 */
export function useFlaggedReviews(page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: ['reviews', 'flagged', page, limit],
    queryFn: () => reviewsService.getFlaggedReviews(page, limit),
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to get similar reviews
 */
export function useSimilarReviews(id: string | undefined, limit: number = 5) {
  return useQuery({
    queryKey: ['reviews', id, 'similar', limit],
    queryFn: () => reviewsService.getSimilarReviews(id!, limit),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to create review
 */
export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateReviewData) => reviewsService.createReview(data),
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['reviews', review.entityType, review.entityId] });
      toast.success('Review submitted successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to submit review');
    },
  });
}

/**
 * Hook to update review
 */
export function useUpdateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CreateReviewData> }) =>
      reviewsService.updateReview(id, updates),
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['review', review.id] });
      toast.success('Review updated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update review');
    },
  });
}

/**
 * Hook to delete review
 */
export function useDeleteReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reviewsService.deleteReview(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete review');
    },
  });
}

/**
 * Hook to add response to review
 */
export function useAddResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, response }: { id: string; response: ReviewResponse }) =>
      reviewsService.addResponse(id, response),
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['review', review.id] });
      toast.success('Response added successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add response');
    },
  });
}

/**
 * Hook to update response
 */
export function useUpdateResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, response }: { id: string; response: ReviewResponse }) =>
      reviewsService.updateResponse(id, response),
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: ['review', review.id] });
      toast.success('Response updated!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update response');
    },
  });
}

/**
 * Hook to delete response
 */
export function useDeleteResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reviewsService.deleteResponse(id),
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: ['review', review.id] });
      toast.success('Response deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete response');
    },
  });
}

/**
 * Hook to vote review as helpful
 */
export function useVoteHelpful() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, helpful }: { id: string; helpful: boolean }) =>
      reviewsService.voteHelpful(id, helpful),
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: ['review', review.id] });
    },
  });
}

/**
 * Hook to remove vote
 */
export function useRemoveVote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reviewsService.removeVote(id),
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: ['review', review.id] });
    },
  });
}

/**
 * Hook to flag review
 */
export function useFlagReview() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      reviewsService.flagReview(id, reason),
    onSuccess: () => {
      toast.success('Review flagged for moderation');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to flag review');
    },
  });
}

/**
 * Hook to moderate review
 */
export function useModerateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, action, reason }: {
      id: string;
      action: 'approve' | 'reject' | 'hide';
      reason?: string;
    }) => reviewsService.moderateReview(id, action, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review moderated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to moderate review');
    },
  });
}

/**
 * Hook to feature review
 */
export function useFeatureReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reviewsService.featureReview(id),
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['review', review.id] });
      toast.success('Review featured!');
    },
  });
}

/**
 * Hook to unfeature review
 */
export function useUnfeatureReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reviewsService.unfeatureReview(id),
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['review', review.id] });
      toast.success('Review unfeatured');
    },
  });
}

/**
 * Hook to bulk approve reviews
 */
export function useBulkApproveReviews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reviewIds: string[]) => reviewsService.bulkApproveReviews(reviewIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success(`${result.approved} reviews approved`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to approve reviews');
    },
  });
}

/**
 * Hook to bulk reject reviews
 */
export function useBulkRejectReviews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewIds, reason }: { reviewIds: string[]; reason: string }) =>
      reviewsService.bulkRejectReviews(reviewIds, reason),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      toast.success(`${result.rejected} reviews rejected`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to reject reviews');
    },
  });
}

/**
 * Hook to request review from customer
 */
export function useRequestReview() {
  return useMutation({
    mutationFn: ({
      entityType,
      entityId,
      userId,
      bookingId,
    }: {
      entityType: ReviewEntityType;
      entityId: string;
      userId: string;
      bookingId?: string;
    }) => reviewsService.requestReview(entityType, entityId, userId, bookingId),
    onSuccess: () => {
      toast.success('Review request sent!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send review request');
    },
  });
}
