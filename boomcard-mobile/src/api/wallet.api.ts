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
    const response = await apiClient.get('/api/wallet/balance');
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

    const url = `/api/wallet/transactions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
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
    const response = await apiClient.get('/api/wallet/statistics');
    if (!response.success) {
      throw new Error(response.error || 'Failed to get statistics');
    }
    return response.data;
  },

  /**
   * Create top-up payment intent
   */
  async createTopUp(amount: number, paymentMethodId?: string) {
    const response = await apiClient.post('/api/wallet/topup', {
      amount,
      paymentMethodId,
    });
    if (!response.success) {
      throw new Error(response.error || 'Failed to create top-up');
    }
    return response.data;
  },

  /**
   * Save payout bank account details (IBAN + beneficiary name) without initiating a payout.
   * Call this from the profile settings screen.
   */
  async updatePayoutAccount(iban: string, beneficiaryName: string) {
    const response = await apiClient.put('/api/wallet/payout-account', { iban, beneficiaryName });
    if (!response.success) {
      throw new Error(response.error || 'Failed to save payout account');
    }
    return response.data;
  },

  /**
   * Request cashback payout.
   * Backend validates plan threshold and fires the Paysera B2C Transfer API.
   * iban and beneficiaryName are stored on the wallet and reused on subsequent requests.
   */
  async requestPayout(opts: { iban?: string; beneficiaryName?: string } = {}) {
    const response = await apiClient.post('/api/wallet/payout', opts);
    if (!response.success) {
      throw new Error(response.error || 'Failed to request payout');
    }
    return response.data;
  },
};
