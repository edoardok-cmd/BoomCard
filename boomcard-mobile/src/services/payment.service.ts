/**
 * Payment Service - Paysera Integration for Mobile
 *
 * Handles payment flow using Paysera web-based gateway.
 * Opens browser for payment, then redirects back to app.
 */

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import apiClient from '../api/client';
import { plansService, SubscriptionStatus } from './plans.service';

// Configure WebBrowser for authentication flows
WebBrowser.maybeCompleteAuthSession();

export interface CreatePaymentParams {
  amount: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  orderId: string;
  transactionId: string;
  paymentUrl: string;
  amount: number;
  currency: string;
  status: string;
}

export interface PaymentStatus {
  orderId: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  description: string;
  createdAt: string;
}

class PaymentService {
  /**
   * Create payment and open Paysera in browser
   */
  async initiatePayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      // Create payment on backend
      const response = await apiClient.post<{ success: boolean; data: PaymentResult }>(
        '/api/payments/create',
        {
          amount: params.amount,
          currency: params.currency || 'BGN',
          description: params.description || 'Wallet top-up',
          metadata: params.metadata,
        }
      );

      if (!response.data?.success) {
        throw new Error('Failed to create payment');
      }

      return response.data?.data;
    } catch (error: any) {
      if (__DEV__) console.error('Payment initiation error:', error);
      throw new Error(error.response?.data?.message || 'Failed to initiate payment');
    }
  }

  /**
   * Open Paysera payment page in browser
   */
  async openPaymentBrowser(paymentUrl: string, orderId: string): Promise<'success' | 'cancel'> {
    try {
      // Create redirect URLs
      const appScheme = Linking.createURL('');
      const redirectUrl = `${appScheme}payment-result`;

      // Open Paysera in browser
      const result = await WebBrowser.openAuthSessionAsync(
        paymentUrl,
        redirectUrl,
        {
          showInRecents: false,
          createTask: false,
        }
      );

      if (result.type === 'success') {
        // Parse result URL properly to avoid loose string-matching
        const parsed = Linking.parse(result.url);
        const status = parsed.queryParams?.status as string | undefined;
        const path = parsed.path ?? '';

        const isCancel = status === 'cancel' || path === 'cancel' || path.endsWith('/cancel');
        const isSuccess = status === 'success' || path === 'success' || path.endsWith('/success');

        if (isCancel) return 'cancel';
        if (isSuccess) return 'success';

        // Default to success if browser redirected back without explicit status
        return 'success';
      } else if (result.type === 'cancel') {
        return 'cancel';
      }

      return 'cancel';
    } catch (error) {
      if (__DEV__) console.error('Browser payment error:', error);
      throw new Error('Failed to open payment browser');
    }
  }

  /**
   * Complete payment flow: create + open browser + verify
   */
  async processPayment(params: CreatePaymentParams): Promise<{
    success: boolean;
    orderId: string;
    status: PaymentStatus | null;
  }> {
    try {
      // Step 1: Create payment
      const payment = await this.initiatePayment(params);

      // Step 2: Open browser for payment
      const browserResult = await this.openPaymentBrowser(
        payment.paymentUrl,
        payment.orderId
      );

      if (browserResult === 'cancel') {
        return {
          success: false,
          orderId: payment.orderId,
          status: null,
        };
      }

      // Step 3: Wait a moment for webhook to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 4: Verify payment status
      const status = await this.checkPaymentStatus(payment.orderId);

      return {
        success: status.status === 'completed',
        orderId: payment.orderId,
        status,
      };
    } catch (error: any) {
      if (__DEV__) console.error('Payment process error:', error);
      throw error;
    }
  }

  /**
   * Check payment status by order ID
   */
  async checkPaymentStatus(orderId: string): Promise<PaymentStatus> {
    try {
      const response = await apiClient.get<{ success: boolean; data: PaymentStatus }>(
        `/api/payments/${orderId}/status`
      );

      if (!response.data?.success) {
        throw new Error('Failed to get payment status');
      }

      return response.data?.data;
    } catch (error: any) {
      if (__DEV__) console.error('Payment status check error:', error);
      throw new Error(error.response?.data?.message || 'Failed to check payment status');
    }
  }

  /**
   * Poll payment status until completed or timeout.
   * Stops early after 3 consecutive network failures; applies exponential backoff on errors.
   */
  async pollPaymentStatus(
    orderId: string,
    maxAttempts: number = 10,
    interval: number = 2000
  ): Promise<PaymentStatus> {
    const MAX_CONSECUTIVE_FAILURES = 3;
    let consecutiveFailures = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const status = await this.checkPaymentStatus(orderId);
        consecutiveFailures = 0;

        if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
          return status;
        }

        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      } catch (error) {
        consecutiveFailures++;
        if (__DEV__) console.warn(`Poll attempt ${attempt + 1} failed (${consecutiveFailures} consecutive):`, error);

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw new Error('Payment verification failed after repeated network errors');
        }

        // Exponential backoff on failures
        const backoff = interval * Math.pow(2, consecutiveFailures - 1);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw new Error('Payment verification timeout');
  }

  /**
   * Get payment history
   */
  async getPaymentHistory(limit: number = 20, offset: number = 0) {
    try {
      const response = await apiClient.get('/api/payments/history', {
        params: { limit, offset },
      });

      return response.data;
    } catch (error: any) {
      if (__DEV__) console.error('Payment history error:', error);
      throw new Error(error.response?.data?.message || 'Failed to get payment history');
    }
  }

  /**
   * Get supported payment methods
   */
  async getPaymentMethods() {
    try {
      const response = await apiClient.get('/api/payments/methods');
      return response.data;
    } catch (error: any) {
      if (__DEV__) console.error('Payment methods error:', error);
      throw new Error(error.response?.data?.message || 'Failed to get payment methods');
    }
  }

  // ============================================
  // SUBSCRIPTION PAYMENTS (Secure)
  // ============================================

  /**
   * Process subscription payment flow
   * SECURITY: Only planId and billingPeriod are sent - price comes from server
   *
   * Flow:
   * 1. Create subscription payment on backend (server determines price)
   * 2. Open Paysera in browser
   * 3. Poll for subscription activation (webhook activates it)
   */
  async processSubscriptionPayment(
    planId: string,
    billingPeriod: 'weekly' | 'monthly' | 'yearly'
  ): Promise<{
    success: boolean;
    orderId: string;
    status: SubscriptionStatus | null;
  }> {
    try {
      // Step 1: Create subscription payment (SECURE - price from server)
      const payment = await plansService.createSubscriptionPayment(planId, billingPeriod);

      // Step 2: Open browser for payment
      const browserResult = await this.openSubscriptionPaymentBrowser(
        payment.paymentUrl,
        payment.orderId
      );

      if (browserResult === 'cancel') {
        return {
          success: false,
          orderId: payment.orderId,
          status: null,
        };
      }

      // Step 3: Wait a moment for webhook to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 4: Poll subscription status (webhook activates subscription)
      const status = await plansService.pollSubscriptionStatus(payment.orderId);

      return {
        success: status.isActive,
        orderId: payment.orderId,
        status,
      };
    } catch (error: any) {
      if (__DEV__) console.error('Subscription payment process error:', error);
      throw error;
    }
  }

  /**
   * Open Paysera subscription payment page in browser
   */
  async openSubscriptionPaymentBrowser(
    paymentUrl: string,
    orderId: string
  ): Promise<'success' | 'cancel'> {
    try {
      // Create redirect URLs for subscription flow
      const appScheme = Linking.createURL('');
      const redirectUrl = `${appScheme}subscription-result`;

      // Open Paysera in browser
      const result = await WebBrowser.openAuthSessionAsync(
        paymentUrl,
        redirectUrl,
        {
          showInRecents: false,
          createTask: false,
        }
      );

      if (result.type === 'success') {
        // Parse result URL properly to avoid loose string-matching
        const parsed = Linking.parse(result.url);
        const status = parsed.queryParams?.status as string | undefined;
        const path = parsed.path ?? '';

        const isCancel = status === 'cancel' || path === 'cancel' || path.endsWith('/cancel');
        const isSuccess = status === 'success' || path === 'success' || path.endsWith('/success');

        if (isCancel) return 'cancel';
        if (isSuccess) return 'success';

        // Default to success if browser redirected back without explicit status
        return 'success';
      } else if (result.type === 'cancel') {
        return 'cancel';
      }

      return 'cancel';
    } catch (error) {
      if (__DEV__) console.error('Subscription browser payment error:', error);
      throw new Error('Failed to open subscription payment browser');
    }
  }

  /**
   * Check subscription status (wrapper for plansService)
   */
  async checkSubscriptionStatus(orderId: string): Promise<SubscriptionStatus> {
    return plansService.checkSubscriptionStatus(orderId);
  }
}

export const paymentService = new PaymentService();
