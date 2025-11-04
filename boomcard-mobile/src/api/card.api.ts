/**
 * Card API
 *
 * API client for BoomCard operations
 */

import apiClient from './client';

export const cardApi = {
  /**
   * Get user's card
   */
  async getMyCard() {
    const response = await apiClient.get('/api/cards/my-card');
    if (!response.success) {
      throw new Error(response.error || 'Failed to get card');
    }
    return response.data;
  },

  /**
   * Get card benefits
   */
  async getBenefits() {
    const response = await apiClient.get('/api/cards/benefits');
    if (!response.success) {
      throw new Error(response.error || 'Failed to get benefits');
    }
    return response.data;
  },

  /**
   * Get card statistics
   */
  async getStatistics() {
    // First get the card to get the ID
    const card = await this.getMyCard();
    const response = await apiClient.get(`/api/cards/${card.id}/statistics`);
    if (!response.success) {
      throw new Error(response.error || 'Failed to get statistics');
    }
    return response.data;
  },

  /**
   * Validate card
   */
  async validateCard(cardNumber: string) {
    const response = await apiClient.post('/api/cards/validate', { cardNumber });
    if (!response.success) {
      throw new Error(response.error || 'Failed to validate card');
    }
    return response.data;
  },
};
