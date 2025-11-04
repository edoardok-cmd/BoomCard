/**
 * Wallet API
 *
 * API client for wallet operations
 */

import apiClient from './client';

export const walletApi = {
  /**
   * Get wallet balance
   */
  async getBalance() {
    const response = await apiClient.get('/api/payments/wallet/balance');
    if (!response.success) {
      throw new Error(response.error || 'Failed to get wallet balance');
    }
    return response.data;
  },

  /**
   * Get wallet transactions
   */
  async getTransactions(params?: {
    type?: string;
    limit?: number;
    offset?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const url = `/api/payments/wallet/transactions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiClient.get(url);
    if (!response.success) {
      throw new Error(response.error || 'Failed to get transactions');
    }
    return response.data;
  },

  /**
   * Get wallet statistics
   */
  async getStatistics() {
    const response = await apiClient.get('/api/payments/wallet/statistics');
    if (!response.success) {
      throw new Error(response.error || 'Failed to get statistics');
    }
    return response.data;
  },

  /**
   * Create top-up payment intent
   */
  async createTopUp(amount: number, paymentMethodId?: string) {
    const response = await apiClient.post('/api/payments/wallet/topup', {
      amount,
      paymentMethodId,
    });
    if (!response.success) {
      throw new Error(response.error || 'Failed to create top-up');
    }
    return response.data;
  },
};
