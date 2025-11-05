/**
 * Payment Service - Paysera Integration for Mobile
 *
 * Handles payment flow using Paysera web-based gateway.
 * Opens browser for payment, then redirects back to app.
 */

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import apiClient from '../api/client';

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
        '/payments/create',
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
      console.error('Payment initiation error:', error);
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
        // Parse result URL to check if payment was successful
        const url = result.url;

        if (url.includes('success')) {
          return 'success';
        } else if (url.includes('cancel')) {
          return 'cancel';
        }

        // Default to success if redirected back
        return 'success';
      } else if (result.type === 'cancel') {
        return 'cancel';
      }

      return 'cancel';
    } catch (error) {
      console.error('Browser payment error:', error);
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
      console.error('Payment process error:', error);
      throw error;
    }
  }

  /**
   * Check payment status by order ID
   */
  async checkPaymentStatus(orderId: string): Promise<PaymentStatus> {
    try {
      const response = await apiClient.get<{ success: boolean; data: PaymentStatus }>(
        `/payments/${orderId}/status`
      );

      if (!response.data?.success) {
        throw new Error('Failed to get payment status');
      }

      return response.data?.data;
    } catch (error: any) {
      console.error('Payment status check error:', error);
      throw new Error(error.response?.data?.message || 'Failed to check payment status');
    }
  }

  /**
   * Poll payment status until completed or timeout
   */
  async pollPaymentStatus(
    orderId: string,
    maxAttempts: number = 10,
    interval: number = 2000
  ): Promise<PaymentStatus> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const status = await this.checkPaymentStatus(orderId);

        // If payment is completed or failed, return immediately
        if (status.status === 'completed' || status.status === 'failed') {
          return status;
        }

        // Wait before next attempt
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      } catch (error) {
        // Continue polling even if one request fails
        console.warn(`Poll attempt ${attempt + 1} failed:`, error);
      }
    }

    // Timeout - return last known status
    throw new Error('Payment verification timeout');
  }

  /**
   * Get payment history
   */
  async getPaymentHistory(limit: number = 20, offset: number = 0) {
    try {
      const response = await apiClient.get('/payments/history', {
        params: { limit, offset },
      });

      return response.data;
    } catch (error: any) {
      console.error('Payment history error:', error);
      throw new Error(error.response?.data?.message || 'Failed to get payment history');
    }
  }

  /**
   * Get supported payment methods
   */
  async getPaymentMethods() {
    try {
      const response = await apiClient.get('/payments/methods');
      return response.data;
    } catch (error: any) {
      console.error('Payment methods error:', error);
      throw new Error(error.response?.data?.message || 'Failed to get payment methods');
    }
  }
}

export const paymentService = new PaymentService();
