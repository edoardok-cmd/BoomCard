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
    status?: string;   // PENDING|CLEARED|LOCKED|PAID|EXPIRED|VOIDED (W8)
    period?: string;   // 7d|30d|all (W8)
    limit?: number;
    offset?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.period) queryParams.append('period', params.period);
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
   * Save payout bank account details (IBAN + beneficiary name) without initiating a payout.
   * Call this from the profile settings screen.
   *
   * NOTE: there is intentionally NO requestPayout() method (W1). Per spec §7.1 payouts
   * are automatic (nightly scheduler) — the user-facing POST /api/wallet/payout route
   * was removed on the backend (F-013). Likewise there is no createTopUp() (W3): the
   * wallet is a cashback-only ledger with no top-up concept (spec §6).
   */
  async updatePayoutAccount(iban: string, beneficiaryName: string) {
    const response = await apiClient.put('/api/wallet/payout-account', { iban, beneficiaryName });
    if (!response.success) {
      throw new Error(response.error || 'Failed to save payout account');
    }
    return response.data;
  },
};
