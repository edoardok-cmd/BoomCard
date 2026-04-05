/**
 * Plans Service - Mobile
 * Fetches plan data from the API (SERVER-SIDE PRICING - source of truth)
 *
 * SECURITY: Never trust client-side pricing. Always use this service
 * to get pricing from the backend.
 */

import apiClient from '../api/client';
import { APP_CONFIG } from '../constants/config';

export interface PlanPricing {
  weekly: number | null;
  monthly: number | null;
  yearly: number;
  currency: string;
  yearlyDiscountPct: number;
}

export interface PlanBillingOptions {
  hasWeekly: boolean;
  hasMonthly: boolean;
  hasYearly: boolean;
}

export interface PlanBadge {
  text: string;
  textBg: string | null;
}

export interface Plan {
  id: string;
  planCode: string;
  displayName: string;
  displayNameBg: string | null;
  pricing: PlanPricing;
  billingOptions: PlanBillingOptions;
  cashbackRate: number;
  stickerBonus: number;
  payoutThreshold: number | null;
  features: string[];
  featuresBg: string[];
  cardType: 'light' | 'silver' | 'black';
  isFeatured: boolean;
  badge: PlanBadge | null;
}

export interface SubscriptionStatus {
  subscriptionId: string;
  status: string;
  plan: {
    code: string;
    name: string;
    nameBg: string | null;
  };
  billingPeriod: string;
  currentPeriodEnd: string;
  isActive: boolean;
}

export interface SubscriptionPaymentResult {
  orderId: string;
  subscriptionId: string;
  paymentUrl: string;
  plan: { code: string; name: string };
  amount: number;
  currency: string;
  billingPeriod: string;
}


class PlansService {
  /**
   * Get all active plans with pricing (PUBLIC - no auth required)
   */
  async getPlans(): Promise<Plan[]> {
    try {
      const response = await apiClient.get<{ success: boolean; data: Plan[] }>('/api/plans');
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error('Failed to fetch plans');
    } catch (error: any) {
      console.warn('Error fetching plans:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch plans');
    }
  }

  /**
   * Get a single plan by plan code (PUBLIC - no auth required)
   */
  async getPlanByCode(planCode: string): Promise<Plan> {
    try {
      const response = await apiClient.get<{ success: boolean; data: Plan }>(
        `/api/plans/code/${planCode}`
      );
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error('Plan not found');
    } catch (error: any) {
      console.warn('Error fetching plan:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch plan');
    }
  }

  /**
   * Get a single plan by ID (PUBLIC - no auth required)
   */
  async getPlanById(planId: string): Promise<Plan> {
    try {
      const response = await apiClient.get<{ success: boolean; data: Plan }>(
        `/api/plans/${planId}`
      );
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error('Plan not found');
    } catch (error: any) {
      console.warn('Error fetching plan:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch plan');
    }
  }

  /**
   * Check subscription status by order ID (PUBLIC - no auth required)
   * Used after payment redirect to poll for activation
   */
  async checkSubscriptionStatus(orderId: string): Promise<SubscriptionStatus> {
    try {
      const response = await apiClient.get<{ success: boolean; data: SubscriptionStatus }>(
        `/api/subscriptions/status/${orderId}`
      );
      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error('Subscription not found');
    } catch (error: any) {
      console.warn('Error checking subscription status:', error);
      throw new Error(error.response?.data?.message || 'Failed to check subscription status');
    }
  }

  /**
   * Create subscription payment (AUTHENTICATED)
   * Returns payment URL to redirect user to Paysera
   *
   * SECURITY: Only sends planId and billingPeriod.
   * Price is determined SERVER-SIDE from planId lookup.
   */
  async createSubscriptionPayment(
    planId: string,
    billingPeriod: 'weekly' | 'monthly' | 'yearly'
  ): Promise<SubscriptionPaymentResult> {
    try {
      const response = await apiClient.post<{ success: boolean; data: SubscriptionPaymentResult }>(
        '/api/payments/subscription',
        {
          planId,
          billingPeriod,
          successUrl: `${APP_CONFIG.MOBILE_APP_URL}/subscription/success`,
          cancelUrl: `${APP_CONFIG.MOBILE_APP_URL}/subscription/cancel`,
        }
      );

      if (response.data?.success) {
        return response.data.data;
      }
      throw new Error('Failed to create subscription payment');
    } catch (error: any) {
      console.warn('Error creating subscription payment:', error);
      throw new Error(error.response?.data?.message || 'Failed to create subscription payment');
    }
  }

  /**
   * Poll subscription status until active or timeout.
   * Stops early after 3 consecutive network failures; applies exponential backoff on errors.
   */
  async pollSubscriptionStatus(
    orderId: string,
    maxAttempts: number = 15,
    interval: number = 2000
  ): Promise<SubscriptionStatus> {
    const MAX_CONSECUTIVE_FAILURES = 3;
    let consecutiveFailures = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const status = await this.checkSubscriptionStatus(orderId);
        consecutiveFailures = 0;

        if (status.isActive) {
          return status;
        }

        // Stop polling immediately if the subscription reached a terminal failure state
        const terminalFailedStatuses = ['cancelled', 'expired', 'failed', 'suspended'];
        if (status.status && terminalFailedStatuses.includes(status.status.toLowerCase())) {
          return status;
        }

        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      } catch (error) {
        consecutiveFailures++;
        if (__DEV__) console.warn(`Poll attempt ${attempt + 1} failed (${consecutiveFailures} consecutive):`, error);

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw new Error('Subscription verification failed after repeated network errors');
        }

        const backoff = interval * Math.pow(2, consecutiveFailures - 1);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    // Return final status check after exhausting attempts
    return this.checkSubscriptionStatus(orderId);
  }

  /**
   * Get display price based on billing period
   */
  getDisplayPrice(plan: Plan, billingPeriod: 'weekly' | 'monthly' | 'yearly'): number | null {
    switch (billingPeriod) {
      case 'weekly':
        return plan.pricing.weekly;
      case 'monthly':
        return plan.pricing.monthly;
      case 'yearly':
        return plan.pricing.yearly;
      default:
        return null;
    }
  }

  /**
   * Format price for display
   */
  formatPrice(price: number | null, currency: string = 'EUR'): string {
    if (price === null) return 'N/A';
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency,
    }).format(price);
  }

  /**
   * Get billing period label
   */
  getBillingPeriodLabel(
    period: 'weekly' | 'monthly' | 'yearly',
    language: 'en' | 'bg' = 'en'
  ): string {
    const labels = {
      weekly: { en: 'Weekly', bg: 'Седмичен' },
      monthly: { en: 'Monthly', bg: 'Месечен' },
      yearly: { en: 'Yearly', bg: 'Годишен' },
    };
    return labels[period][language];
  }
}

export const plansService = new PlansService();
