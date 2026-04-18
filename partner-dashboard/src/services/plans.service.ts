/**
 * Plans Service
 * Fetches plan data from the API (SERVER-SIDE PRICING - source of truth)
 *
 * SECURITY: Never trust client-side pricing. Always use this service
 * to get pricing from the backend.
 */

import axios from 'axios';
import * as authStorage from '../lib/auth/authStorage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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

export interface PayseraPaymentMethod {
  key: string;
  title: string;
  titleBg: string;
  titleEn: string;
  logoUrl: string;
  logoRoundUrl?: string;
  minAmount?: number;
  maxAmount?: number;
  currency: string;
  group: string;
  groupTitle: string;
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

class PlansService {
  private baseUrl: string;
  private timeout: number = 5000; // 5 second timeout for API calls

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  /**
   * Get all active plans with pricing (PUBLIC - no auth required)
   */
  async getPlans(): Promise<Plan[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/plans`, {
        timeout: this.timeout,
      });
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error('Failed to fetch plans');
    } catch (error) {
      console.error('Error fetching plans:', error);
      throw error;
    }
  }

  /**
   * Get a single plan by plan code (PUBLIC - no auth required)
   */
  async getPlanByCode(planCode: string): Promise<Plan> {
    try {
      const response = await axios.get(`${this.baseUrl}/plans/code/${planCode}`, {
        timeout: this.timeout,
      });
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error('Plan not found');
    } catch (error) {
      console.error('Error fetching plan:', error);
      throw error;
    }
  }

  /**
   * Get a single plan by ID (PUBLIC - no auth required)
   */
  async getPlanById(planId: string): Promise<Plan> {
    try {
      const response = await axios.get(`${this.baseUrl}/plans/${planId}`, {
        timeout: this.timeout,
      });
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error('Plan not found');
    } catch (error) {
      console.error('Error fetching plan:', error);
      throw error;
    }
  }

  /**
   * Check subscription status by order ID (PUBLIC - no auth required)
   * Used after payment redirect to poll for activation
   */
  async checkSubscriptionStatus(orderId: string): Promise<SubscriptionStatus> {
    try {
      const response = await axios.get(`${this.baseUrl}/subscriptions/status/${orderId}`);
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error('Subscription not found');
    } catch (error) {
      console.error('Error checking subscription status:', error);
      throw error;
    }
  }

  /**
   * Verify Paysera redirect data (PUBLIC - no auth required)
   * Used as fallback for guest checkout when no subscription record exists
   */
  async verifyPaymentRedirect(data: string, ss1: string): Promise<{
    orderId: string;
    status: string;
    amount: number | null;
    currency: string;
    paymentMethod: string;
    isSuccess: boolean;
  }> {
    try {
      const response = await axios.post(`${this.baseUrl}/payments/verify-redirect`, { data, ss1 });
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error('Verification failed');
    } catch (error) {
      console.error('Error verifying payment redirect:', error);
      throw error;
    }
  }

  /**
   * Get available payment methods from Paysera (PUBLIC - no auth required)
   */
  async getPaymentMethods(
    country: string = 'bg',
    currency: string = 'EUR',
    amountInCents?: number
  ): Promise<PayseraPaymentMethod[]> {
    try {
      const params = new URLSearchParams({ country, currency });
      if (amountInCents) params.set('amount', amountInCents.toString());

      const response = await axios.get(
        `${this.baseUrl}/payments/methods?${params.toString()}`,
        { timeout: this.timeout }
      );
      if (response.data.success) {
        return response.data.data.methods;
      }
      throw new Error('Failed to fetch payment methods');
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      throw error;
    }
  }

  /**
   * Create subscription payment
   * Returns payment URL to redirect user to Paysera
   */
  async createSubscriptionPayment(
    planId: string,
    billingPeriod: 'weekly' | 'monthly' | 'yearly',
    email?: string,
    name?: string,
    phone?: string,
    paymentMethod?: string
  ): Promise<{
    orderId: string;
    subscriptionId: string | null;
    paymentUrl: string;
    plan: { code: string; name: string };
    amount: number;
    currency: string;
    billingPeriod: string;
  }> {
    try {
      const token = authStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await axios.post(
        `${this.baseUrl}/payments/subscription`,
        {
          planId,
          billingPeriod,
          email,
          name,
          phone,
          paymentMethod,
          successUrl: `${window.location.origin}/subscription/success`,
          cancelUrl: `${window.location.origin}/subscription/cancel`,
        },
        { headers }
      );

      if (response.data.success) {
        return response.data.data;
      }
      throw new Error('Failed to create subscription payment');
    } catch (error) {
      console.error('Error creating subscription payment:', error);
      throw error;
    }
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
}

export const plansService = new PlansService();
