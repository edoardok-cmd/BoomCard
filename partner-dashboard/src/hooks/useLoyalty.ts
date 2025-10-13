import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  loyaltyService,
  LoyaltyAccount,
  PointsTransaction,
  Reward,
  RewardRedemption,
  Badge,
  TierBenefits,
  ReferralProgram,
  UserReferral,
  CreateRewardData,
  PointsTransactionType,
  LoyaltyTier,
  RewardType,
} from '../services/loyalty.service';
import toast from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Hook to fetch user's loyalty account
 */
export function useLoyaltyAccount(userId?: string) {
  return useQuery({
    queryKey: ['loyalty', 'account', userId || 'me'],
    queryFn: () => loyaltyService.getLoyaltyAccount(userId),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch points transactions
 */
export function usePointsTransactions(filters?: {
  userId?: string;
  type?: PointsTransactionType;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['loyalty', 'transactions', filters],
    queryFn: () => loyaltyService.getPointsTransactions(filters),
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to earn points
 */
export function useEarnPoints() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      userId: string;
      points: number;
      type: PointsTransactionType;
      description: string;
      descriptionBg: string;
      bookingId?: string;
      reviewId?: string;
      offerId?: string;
      partnerId?: string;
      expiresAt?: string;
    }) => loyaltyService.earnPoints(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'account'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'transactions'] });
      toast.success(
        language === 'bg'
          ? `Спечелихте ${data.points} точки!`
          : `You earned ${data.points} points!`
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно добавяне на точки' : 'Failed to earn points')
      );
    },
  });
}

/**
 * Hook to redeem reward
 */
export function useRedeemReward() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rewardId: string) => loyaltyService.redeemReward(rewardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'account'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'redemptions'] });
      toast.success(
        language === 'bg'
          ? 'Наградата е активирана успешно!'
          : 'Reward redeemed successfully!'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешна активация на награда' : 'Failed to redeem reward')
      );
    },
  });
}

/**
 * Hook to fetch available rewards
 */
export function useRewards(filters?: {
  type?: RewardType;
  partnerId?: string;
  minPoints?: number;
  maxPoints?: number;
  category?: string;
  tag?: string;
  tier?: LoyaltyTier;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['loyalty', 'rewards', filters],
    queryFn: () => loyaltyService.getRewards(filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch reward by ID
 */
export function useReward(id: string | undefined) {
  return useQuery({
    queryKey: ['loyalty', 'reward', id],
    queryFn: () => loyaltyService.getRewardById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to create reward (partner/admin)
 */
export function useCreateReward() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRewardData) => loyaltyService.createReward(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'rewards'] });
      toast.success(
        language === 'bg' ? 'Наградата е създадена' : 'Reward created successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно създаване на награда' : 'Failed to create reward')
      );
    },
  });
}

/**
 * Hook to update reward
 */
export function useUpdateReward() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CreateRewardData> }) =>
      loyaltyService.updateReward(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'rewards'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'reward', variables.id] });
      toast.success(
        language === 'bg' ? 'Наградата е актуализирана' : 'Reward updated successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешна актуализация на награда' : 'Failed to update reward')
      );
    },
  });
}

/**
 * Hook to delete reward
 */
export function useDeleteReward() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => loyaltyService.deleteReward(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'rewards'] });
      toast.success(
        language === 'bg' ? 'Наградата е изтрита' : 'Reward deleted successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно изтриване на награда' : 'Failed to delete reward')
      );
    },
  });
}

/**
 * Hook to fetch user's redemptions
 */
export function useRedemptions(filters?: {
  userId?: string;
  status?: RewardRedemption['status'];
  rewardId?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['loyalty', 'redemptions', filters],
    queryFn: () => loyaltyService.getRedemptions(filters),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch redemption by ID
 */
export function useRedemption(id: string | undefined) {
  return useQuery({
    queryKey: ['loyalty', 'redemption', id],
    queryFn: () => loyaltyService.getRedemptionById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to use/redeem voucher
 */
export function useUseRedemption() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, partnerId }: { id: string; partnerId: string }) =>
      loyaltyService.useRedemption(id, partnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'redemptions'] });
      toast.success(
        language === 'bg' ? 'Ваучерът е използван' : 'Voucher used successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно използване на ваучер' : 'Failed to use voucher')
      );
    },
  });
}

/**
 * Hook to fetch tier benefits
 */
export function useTierBenefits() {
  return useQuery({
    queryKey: ['loyalty', 'tiers'],
    queryFn: () => loyaltyService.getTierBenefits(),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook to fetch specific tier benefits
 */
export function useTierBenefitsByTier(tier: LoyaltyTier | undefined) {
  return useQuery({
    queryKey: ['loyalty', 'tier', tier],
    queryFn: () => loyaltyService.getTierBenefitsByTier(tier!),
    enabled: !!tier,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Hook to fetch user's badges
 */
export function useUserBadges(userId?: string) {
  return useQuery({
    queryKey: ['loyalty', 'badges', userId || 'me'],
    queryFn: () => loyaltyService.getUserBadges(userId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch all available badges
 */
export function useAllBadges() {
  return useQuery({
    queryKey: ['loyalty', 'badges', 'all'],
    queryFn: () => loyaltyService.getAllBadges(),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Hook to fetch badge progress
 */
export function useBadgeProgress(badgeId: string | undefined) {
  return useQuery({
    queryKey: ['loyalty', 'badge-progress', badgeId],
    queryFn: () => loyaltyService.getBadgeProgress(badgeId!),
    enabled: !!badgeId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch referral program details
 */
export function useReferralProgram() {
  return useQuery({
    queryKey: ['loyalty', 'referral-program'],
    queryFn: () => loyaltyService.getReferralProgram(),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Hook to fetch user's referral code
 */
export function useReferralCode() {
  return useQuery({
    queryKey: ['loyalty', 'referral-code'],
    queryFn: () => loyaltyService.getReferralCode(),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

/**
 * Hook to fetch user's referrals
 */
export function useUserReferrals() {
  return useQuery({
    queryKey: ['loyalty', 'user-referrals'],
    queryFn: () => loyaltyService.getUserReferrals(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to apply referral code
 */
export function useApplyReferralCode() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) => loyaltyService.applyReferralCode(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'account'] });
      toast.success(
        language === 'bg'
          ? 'Референтният код е приложен успешно!'
          : 'Referral code applied successfully!'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно прилагане на референтен код'
            : 'Failed to apply referral code')
      );
    },
  });
}

/**
 * Hook to fetch points expiration schedule
 */
export function usePointsExpiration() {
  return useQuery({
    queryKey: ['loyalty', 'points-expiration'],
    queryFn: () => loyaltyService.getPointsExpiration(),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to transfer points
 */
export function useTransferPoints() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { recipientId: string; points: number; message?: string }) =>
      loyaltyService.transferPoints(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'account'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'transactions'] });
      toast.success(
        language === 'bg'
          ? 'Точките са прехвърлени успешно'
          : 'Points transferred successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно прехвърляне на точки'
            : 'Failed to transfer points')
      );
    },
  });
}

/**
 * Hook to fetch loyalty statistics (admin)
 */
export function useLoyaltyStatistics(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['loyalty', 'statistics', startDate, endDate],
    queryFn: () => loyaltyService.getLoyaltyStatistics(startDate, endDate),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch featured rewards
 */
export function useFeaturedRewards(limit: number = 10) {
  return useQuery({
    queryKey: ['loyalty', 'rewards', 'featured', limit],
    queryFn: () => loyaltyService.getFeaturedRewards(limit),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to fetch recommended rewards
 */
export function useRecommendedRewards(limit: number = 10) {
  return useQuery({
    queryKey: ['loyalty', 'rewards', 'recommended', limit],
    queryFn: () => loyaltyService.getRecommendedRewards(limit),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to search rewards
 */
export function useSearchRewards(
  query: string,
  filters?: {
    type?: RewardType;
    partnerId?: string;
    minPoints?: number;
    maxPoints?: number;
  }
) {
  return useQuery({
    queryKey: ['loyalty', 'rewards', 'search', query, filters],
    queryFn: () => loyaltyService.searchRewards(query, filters),
    enabled: query.length >= 2,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to check reward availability
 */
export function useRewardAvailability(rewardId: string | undefined) {
  return useQuery({
    queryKey: ['loyalty', 'reward-availability', rewardId],
    queryFn: () => loyaltyService.checkRewardAvailability(rewardId!),
    enabled: !!rewardId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to award badge (system/admin)
 */
export function useAwardBadge() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, badgeId }: { userId: string; badgeId: string }) =>
      loyaltyService.awardBadge(userId, badgeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'badges'] });
      toast.success(
        language === 'bg' ? 'Значката е присъдена!' : 'Badge awarded successfully!'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно присъждане на значка' : 'Failed to award badge')
      );
    },
  });
}

/**
 * Hook to fetch earning opportunities
 */
export function useEarningOpportunities() {
  return useQuery({
    queryKey: ['loyalty', 'earning-opportunities'],
    queryFn: () => loyaltyService.getEarningOpportunities(),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Hook to fetch leaderboard
 */
export function useLeaderboard(
  period: 'week' | 'month' | 'year' | 'all' = 'month',
  limit: number = 50
) {
  return useQuery({
    queryKey: ['loyalty', 'leaderboard', period, limit],
    queryFn: () => loyaltyService.getLeaderboard(period, limit),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch user's rank
 */
export function useUserRank(period: 'week' | 'month' | 'year' | 'all' = 'month') {
  return useQuery({
    queryKey: ['loyalty', 'user-rank', period],
    queryFn: () => loyaltyService.getUserRank(period),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch milestones
 */
export function useMilestones() {
  return useQuery({
    queryKey: ['loyalty', 'milestones'],
    queryFn: () => loyaltyService.getMilestones(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch active redemptions
 */
export function useActiveRedemptions() {
  return useQuery({
    queryKey: ['loyalty', 'redemptions', 'active'],
    queryFn: () =>
      loyaltyService.getRedemptions({
        status: 'confirmed',
      }),
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to fetch points balance with real-time updates
 */
export function usePointsBalance() {
  return useQuery({
    queryKey: ['loyalty', 'points-balance'],
    queryFn: async () => {
      const account = await loyaltyService.getLoyaltyAccount();
      return {
        available: account.availablePoints,
        total: account.totalPoints,
        lifetime: account.lifetimeEarned,
      };
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refresh every minute
  });
}

/**
 * Hook to check if user can redeem reward
 */
export function useCanRedeemReward(rewardId: string | undefined) {
  const { data: availability } = useRewardAvailability(rewardId);
  return {
    canRedeem: availability?.available || false,
    reason: availability?.reason,
    reasonBg: availability?.reasonBg,
  };
}
