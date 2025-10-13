/**
 * Loyalty & Rewards Service
 *
 * Complete loyalty program management with:
 * - Points earning and redemption
 * - Tier/level system
 * - Achievements and badges
 * - Reward catalog
 * - Points history and expiration
 * - Partner-specific rewards
 * - Referral bonuses
 * - Special promotions
 */

import { apiService } from './api.service';

export type PointsTransactionType =
  | 'earn'
  | 'redeem'
  | 'bonus'
  | 'referral'
  | 'purchase'
  | 'review'
  | 'booking'
  | 'signup'
  | 'birthday'
  | 'expired'
  | 'refund'
  | 'adjustment';

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export type RewardType =
  | 'discount'
  | 'free_item'
  | 'upgrade'
  | 'voucher'
  | 'experience'
  | 'cashback'
  | 'gift_card';

export type BadgeCategory =
  | 'experience'
  | 'social'
  | 'loyalty'
  | 'special'
  | 'seasonal'
  | 'achievement';

export interface PointsTransaction {
  id: string;
  userId: string;
  type: PointsTransactionType;
  points: number;
  balance: number; // Balance after transaction

  // Description
  description: string;
  descriptionBg: string;

  // Related entities
  bookingId?: string;
  reviewId?: string;
  offerId?: string;
  partnerId?: string;
  rewardId?: string;

  // Expiration (for earned points)
  expiresAt?: string;

  // Metadata
  metadata?: Record<string, any>;

  createdAt: string;
}

export interface LoyaltyAccount {
  userId: string;

  // Points
  totalPoints: number;
  availablePoints: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;

  // Tier information
  tier: LoyaltyTier;
  tierProgress: number; // Progress to next tier (0-100)
  tierExpiresAt?: string;

  // Next tier info
  nextTier?: LoyaltyTier;
  pointsToNextTier?: number;

  // Statistics
  totalTransactions: number;
  totalBookings: number;
  totalReviews: number;
  totalReferrals: number;

  // Badges
  badges: Badge[];

  // Status
  isActive: boolean;
  joinedAt: string;
  lastActivityAt: string;
}

export interface TierBenefits {
  tier: LoyaltyTier;
  name: string;
  nameBg: string;
  description: string;
  descriptionBg: string;
  color: string;
  icon: string;

  // Requirements
  pointsRequired: number;

  // Benefits
  pointsMultiplier: number; // e.g., 1.5x for gold
  discountPercentage: number;
  prioritySupport: boolean;
  earlyAccess: boolean;
  freeDelivery: boolean;
  birthdayBonus: number;

  // Perks
  perks: Array<{
    name: string;
    nameBg: string;
    description: string;
    descriptionBg: string;
    icon: string;
  }>;
}

export interface Reward {
  id: string;

  // Basic info
  name: string;
  nameBg: string;
  title: string;
  titleBg: string;
  description: string;
  descriptionBg: string;

  // Type and value
  type: RewardType;
  pointsCost: number;
  monetaryValue?: number;

  // Availability
  isActive: boolean;
  stock?: number;
  unlimited: boolean;

  // Restrictions
  minTier?: LoyaltyTier;
  maxRedemptionsPerUser?: number;
  validFrom?: string;
  validUntil?: string;

  // Partner info
  partnerId?: string;
  partnerName?: string;
  partnerLogo?: string;

  // Categories
  categories: string[];
  tags: string[];

  // Media
  imageUrl: string;
  images?: string[];

  // Terms
  terms: string;
  termsBg: string;

  // Stats
  totalRedemptions: number;
  popularityScore: number;

  createdAt: string;
  updatedAt: string;
}

export interface RewardRedemption {
  id: string;
  userId: string;
  rewardId: string;
  reward: Reward;

  // Points
  pointsSpent: number;

  // Status
  status: 'pending' | 'confirmed' | 'used' | 'expired' | 'cancelled';

  // Code/voucher
  code?: string;
  qrCode?: string;

  // Validity
  validFrom: string;
  validUntil: string;
  usedAt?: string;

  // Usage location
  usedAtPartnerId?: string;
  usedAtPartnerName?: string;

  // Metadata
  notes?: string;

  createdAt: string;
}

export interface Badge {
  id: string;

  // Basic info
  name: string;
  nameBg: string;
  description: string;
  descriptionBg: string;

  // Visual
  icon: string;
  color: string;
  imageUrl?: string;

  // Category
  category: BadgeCategory;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';

  // Requirements
  requirement: string;
  requirementBg: string;

  // Rewards
  pointsReward?: number;

  // Stats
  totalAwarded: number;

  // User progress (if applicable)
  progress?: number;
  progressMax?: number;
  earnedAt?: string;
  isUnlocked?: boolean;
}

export interface ReferralProgram {
  id: string;

  // Basic info
  name: string;
  nameBg: string;
  description: string;
  descriptionBg: string;

  // Rewards
  referrerPoints: number;
  refereePoints: number;

  // Conditions
  minPurchaseAmount?: number;
  validityDays?: number;

  // Status
  isActive: boolean;

  // Stats
  totalReferrals: number;
  successfulReferrals: number;
}

export interface UserReferral {
  id: string;
  referrerId: string;
  refereeId: string;

  // Status
  status: 'pending' | 'completed' | 'expired';

  // Rewards
  referrerPointsAwarded: number;
  refereePointsAwarded: number;

  // Tracking
  referralCode: string;
  completedAt?: string;

  createdAt: string;
}

export interface PointsExpiration {
  points: number;
  expiresAt: string;
}

export interface LoyaltyStatistics {
  // User stats
  totalUsers: number;
  activeUsers: number;

  // Points stats
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsExpired: number;
  averagePointsPerUser: number;

  // Tier distribution
  tierDistribution: Record<LoyaltyTier, number>;

  // Activity
  transactionsThisMonth: number;
  redemptionsThisMonth: number;

  // Top performers
  topEarners: Array<{
    userId: string;
    userName: string;
    points: number;
  }>;

  topRewards: Array<{
    rewardId: string;
    rewardName: string;
    redemptions: number;
  }>;

  // Engagement
  averageTransactionsPerUser: number;
  referralConversionRate: number;
}

export interface CreateRewardData {
  name: string;
  nameBg: string;
  title: string;
  titleBg: string;
  description: string;
  descriptionBg: string;
  type: RewardType;
  pointsCost: number;
  monetaryValue?: number;
  stock?: number;
  unlimited?: boolean;
  minTier?: LoyaltyTier;
  maxRedemptionsPerUser?: number;
  validFrom?: string;
  validUntil?: string;
  partnerId?: string;
  categories: string[];
  tags: string[];
  imageUrl: string;
  images?: string[];
  terms: string;
  termsBg: string;
}

class LoyaltyService {
  private readonly baseUrl = '/loyalty';

  /**
   * Get user's loyalty account
   */
  async getLoyaltyAccount(userId?: string): Promise<LoyaltyAccount> {
    const url = userId ? `${this.baseUrl}/accounts/${userId}` : `${this.baseUrl}/accounts/me`;
    return apiService.get<LoyaltyAccount>(url);
  }

  /**
   * Get points transactions
   */
  async getPointsTransactions(filters?: {
    userId?: string;
    type?: PointsTransactionType;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: PointsTransaction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return apiService.get(`${this.baseUrl}/transactions`, filters);
  }

  /**
   * Earn points
   */
  async earnPoints(data: {
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
  }): Promise<PointsTransaction> {
    return apiService.post<PointsTransaction>(`${this.baseUrl}/earn`, data);
  }

  /**
   * Redeem points for reward
   */
  async redeemReward(rewardId: string): Promise<RewardRedemption> {
    return apiService.post<RewardRedemption>(`${this.baseUrl}/redeem/${rewardId}`);
  }

  /**
   * Get available rewards
   */
  async getRewards(filters?: {
    type?: RewardType;
    partnerId?: string;
    minPoints?: number;
    maxPoints?: number;
    category?: string;
    tag?: string;
    tier?: LoyaltyTier;
    page?: number;
    limit?: number;
  }): Promise<{
    data: Reward[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return apiService.get(`${this.baseUrl}/rewards`, filters);
  }

  /**
   * Get reward by ID
   */
  async getRewardById(id: string): Promise<Reward> {
    return apiService.get<Reward>(`${this.baseUrl}/rewards/${id}`);
  }

  /**
   * Create reward (partner/admin)
   */
  async createReward(data: CreateRewardData): Promise<Reward> {
    return apiService.post<Reward>(`${this.baseUrl}/rewards`, data);
  }

  /**
   * Update reward
   */
  async updateReward(id: string, updates: Partial<CreateRewardData>): Promise<Reward> {
    return apiService.patch<Reward>(`${this.baseUrl}/rewards/${id}`, updates);
  }

  /**
   * Delete reward
   */
  async deleteReward(id: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/rewards/${id}`);
  }

  /**
   * Get user's redemptions
   */
  async getRedemptions(filters?: {
    userId?: string;
    status?: RewardRedemption['status'];
    rewardId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: RewardRedemption[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return apiService.get(`${this.baseUrl}/redemptions`, filters);
  }

  /**
   * Get redemption by ID
   */
  async getRedemptionById(id: string): Promise<RewardRedemption> {
    return apiService.get<RewardRedemption>(`${this.baseUrl}/redemptions/${id}`);
  }

  /**
   * Use/redeem voucher
   */
  async useRedemption(id: string, partnerId: string): Promise<RewardRedemption> {
    return apiService.post<RewardRedemption>(`${this.baseUrl}/redemptions/${id}/use`, {
      partnerId,
    });
  }

  /**
   * Get tier benefits
   */
  async getTierBenefits(): Promise<TierBenefits[]> {
    return apiService.get<TierBenefits[]>(`${this.baseUrl}/tiers`);
  }

  /**
   * Get specific tier benefits
   */
  async getTierBenefitsByTier(tier: LoyaltyTier): Promise<TierBenefits> {
    return apiService.get<TierBenefits>(`${this.baseUrl}/tiers/${tier}`);
  }

  /**
   * Get user's badges
   */
  async getUserBadges(userId?: string): Promise<Badge[]> {
    const url = userId ? `${this.baseUrl}/badges/${userId}` : `${this.baseUrl}/badges/me`;
    return apiService.get<Badge[]>(url);
  }

  /**
   * Get all available badges
   */
  async getAllBadges(): Promise<Badge[]> {
    return apiService.get<Badge[]>(`${this.baseUrl}/badges/all`);
  }

  /**
   * Get badge progress
   */
  async getBadgeProgress(badgeId: string): Promise<Badge> {
    return apiService.get<Badge>(`${this.baseUrl}/badges/${badgeId}/progress`);
  }

  /**
   * Get referral program details
   */
  async getReferralProgram(): Promise<ReferralProgram> {
    return apiService.get<ReferralProgram>(`${this.baseUrl}/referrals/program`);
  }

  /**
   * Get user's referral code
   */
  async getReferralCode(): Promise<{ code: string; url: string }> {
    return apiService.get(`${this.baseUrl}/referrals/my-code`);
  }

  /**
   * Get user's referrals
   */
  async getUserReferrals(): Promise<UserReferral[]> {
    return apiService.get<UserReferral[]>(`${this.baseUrl}/referrals/my-referrals`);
  }

  /**
   * Apply referral code (for new users)
   */
  async applyReferralCode(code: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/referrals/apply`, { code });
  }

  /**
   * Get points expiration schedule
   */
  async getPointsExpiration(): Promise<PointsExpiration[]> {
    return apiService.get<PointsExpiration[]>(`${this.baseUrl}/points/expiration`);
  }

  /**
   * Transfer points to another user
   */
  async transferPoints(data: {
    recipientId: string;
    points: number;
    message?: string;
  }): Promise<PointsTransaction> {
    return apiService.post<PointsTransaction>(`${this.baseUrl}/points/transfer`, data);
  }

  /**
   * Get loyalty statistics (admin)
   */
  async getLoyaltyStatistics(startDate?: string, endDate?: string): Promise<LoyaltyStatistics> {
    return apiService.get<LoyaltyStatistics>(`${this.baseUrl}/statistics`, {
      startDate,
      endDate,
    });
  }

  /**
   * Get featured rewards
   */
  async getFeaturedRewards(limit: number = 10): Promise<Reward[]> {
    return apiService.get<Reward[]>(`${this.baseUrl}/rewards/featured`, { limit });
  }

  /**
   * Get personalized reward recommendations
   */
  async getRecommendedRewards(limit: number = 10): Promise<Reward[]> {
    return apiService.get<Reward[]>(`${this.baseUrl}/rewards/recommended`, { limit });
  }

  /**
   * Search rewards
   */
  async searchRewards(query: string, filters?: {
    type?: RewardType;
    partnerId?: string;
    minPoints?: number;
    maxPoints?: number;
  }): Promise<Reward[]> {
    return apiService.get<Reward[]>(`${this.baseUrl}/rewards/search`, {
      query,
      ...filters,
    });
  }

  /**
   * Check if reward is available for redemption
   */
  async checkRewardAvailability(rewardId: string): Promise<{
    available: boolean;
    reason?: string;
    reasonBg?: string;
    userPoints: number;
    requiredPoints: number;
    userTier: LoyaltyTier;
    requiredTier?: LoyaltyTier;
  }> {
    return apiService.get(`${this.baseUrl}/rewards/${rewardId}/availability`);
  }

  /**
   * Award badge to user (system/admin)
   */
  async awardBadge(userId: string, badgeId: string): Promise<Badge> {
    return apiService.post<Badge>(`${this.baseUrl}/badges/award`, {
      userId,
      badgeId,
    });
  }

  /**
   * Get points earning opportunities
   */
  async getEarningOpportunities(): Promise<
    Array<{
      type: PointsTransactionType;
      points: number;
      description: string;
      descriptionBg: string;
      action: string;
      icon: string;
    }>
  > {
    return apiService.get(`${this.baseUrl}/earning-opportunities`);
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(period: 'week' | 'month' | 'year' | 'all' = 'month', limit: number = 50): Promise<
    Array<{
      rank: number;
      userId: string;
      userName: string;
      avatar?: string;
      points: number;
      tier: LoyaltyTier;
      badges: number;
    }>
  > {
    return apiService.get(`${this.baseUrl}/leaderboard`, { period, limit });
  }

  /**
   * Get user's rank
   */
  async getUserRank(period: 'week' | 'month' | 'year' | 'all' = 'month'): Promise<{
    rank: number;
    totalUsers: number;
    percentile: number;
  }> {
    return apiService.get(`${this.baseUrl}/my-rank`, { period });
  }

  /**
   * Celebrate milestone (UI helper)
   */
  async getMilestones(): Promise<
    Array<{
      type: 'points' | 'tier' | 'badge' | 'referral';
      achieved: boolean;
      progress: number;
      target: number;
      reward?: string;
      rewardBg?: string;
      icon: string;
    }>
  > {
    return apiService.get(`${this.baseUrl}/milestones`);
  }
}

// Export singleton instance
export const loyaltyService = new LoyaltyService();
export default loyaltyService;
