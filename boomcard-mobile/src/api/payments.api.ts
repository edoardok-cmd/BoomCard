/**
 * Payments API
 *
 * API client for payment methods and card management
 */

import apiClient from './client';

export const paymentsApi = {
  /**
   * Get saved payment methods
   */
  async getPaymentMethods() {
    const response = await apiClient.get('/api/payments/cards');
    if (!response.success) {
      throw new Error(response.error || 'Failed to get payment methods');
    }
    return response.data;
  },

  /**
   * Add payment method
   */
  async addPaymentMethod(paymentMethodId: string) {
    const response = await apiClient.post('/api/payments/cards', {
      paymentMethodId,
    });
    if (!response.success) {
      throw new Error(response.error || 'Failed to add payment method');
    }
    return response.data;
  },

  /**
   * Remove payment method
   */
  async removePaymentMethod(paymentMethodId: string) {
    const response = await apiClient.delete(`/api/payments/cards/${paymentMethodId}`);
    if (!response.success) {
      throw new Error(response.error || 'Failed to remove payment method');
    }
    return response.data;
  },

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(paymentMethodId: string) {
    const response = await apiClient.post(
      `/api/payments/cards/${paymentMethodId}/default`
    );
    if (!response.success) {
      throw new Error(response.error || 'Failed to set default payment method');
    }
    return response.data;
  },

  /**
   * Create payment intent
   */
  async createPaymentIntent(amount: number, paymentMethodId?: string) {
    const response = await apiClient.post('/api/payments/intents', {
      amount,
      paymentMethodId,
    });
    if (!response.success) {
      throw new Error(response.error || 'Failed to create payment intent');
    }
    return response.data;
  },
};
