/**
 * Payment Service
 * Handles Paysera payment integration
 */

import { apiService } from './api.service';

export interface CreatePaymentRequest {
  amount: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface CreatePaymentResponse {
  success: boolean;
  data: {
    orderId: string;
    transactionId: string;
    paymentUrl: string;
    amount: number;
    currency: string;
    status: string;
  };
}

export interface PaymentStatusResponse {
  success: boolean;
  data: {
    orderId: string;
    status: 'pending' | 'completed' | 'failed' | 'cancelled';
    amount: number;
    currency: string;
    description: string;
    createdAt: string;
    metadata?: Record<string, any>;
  };
}

export interface PaymentHistoryResponse {
  success: boolean;
  data: Array<{
    id: string;
    orderId: string;
    amount: number;
    currency: string;
    status: string;
    description: string;
    createdAt: string;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface PaymentMethodsResponse {
  success: boolean;
  data: {
    methods: string[];
    currencies: string[];
  };
}

class PaymentService {
  /**
   * Create a new payment
   * Returns payment URL to redirect user to
   */
  async createPayment(params: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    return apiService.post<CreatePaymentResponse>('/payments/create', params);
  }

  /**
   * Check payment status by order ID
   */
  async checkPaymentStatus(orderId: string): Promise<PaymentStatusResponse> {
    return apiService.get<PaymentStatusResponse>(`/payments/${orderId}/status`);
  }

  /**
   * Get user's payment history
   */
  async getPaymentHistory(limit = 20, offset = 0): Promise<PaymentHistoryResponse> {
    return apiService.get<PaymentHistoryResponse>('/payments/history', {
      limit,
      offset,
    });
  }

  /**
   * Get supported payment methods and currencies
   */
  async getPaymentMethods(): Promise<PaymentMethodsResponse> {
    return apiService.get<PaymentMethodsResponse>('/payments/methods');
  }

  /**
   * Initiate payment and redirect to Paysera
   * Helper method that creates payment and redirects
   */
  async initiatePayment(params: CreatePaymentRequest): Promise<void> {
    try {
      const response = await this.createPayment(params);

      if (response.success && response.data.paymentUrl) {
        // Redirect to Paysera payment page
        window.location.href = response.data.paymentUrl;
      } else {
        throw new Error('Failed to create payment');
      }
    } catch (error) {
      console.error('Payment initiation failed:', error);
      throw error;
    }
  }

  /**
   * Poll payment status until completed or failed
   * Useful for payment success page
   */
  async pollPaymentStatus(
    orderId: string,
    maxAttempts = 10,
    interval = 2000
  ): Promise<PaymentStatusResponse> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await this.checkPaymentStatus(orderId);

      // If payment is completed or failed, return
      if (response.data.status === 'completed' || response.data.status === 'failed') {
        return response;
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Payment status check timeout');
  }
}

export const paymentService = new PaymentService();
