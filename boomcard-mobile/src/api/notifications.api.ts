import apiClient from './client';
import type { ApiResponse } from '../types';

export const notificationsApi = {
  /**
   * Register push notification token with backend
   */
  async registerPushToken(token: string, platform: string, deviceId?: string): Promise<ApiResponse<any>> {
    return await apiClient.post('/api/notifications/register-token', {
      token,
      platform,
      deviceId,
    });
  },

  /**
   * Unregister push notification token
   */
  async unregisterPushToken(token: string): Promise<ApiResponse<any>> {
    return await apiClient.post('/api/notifications/unregister-token', { token });
  },

  /**
   * Get notification preferences
   */
  async getPreferences(): Promise<ApiResponse<any>> {
    return await apiClient.get('/api/notifications/preferences');
  },

  /**
   * Update notification preferences
   */
  async updatePreferences(preferences: any): Promise<ApiResponse<any>> {
    return await apiClient.put('/api/notifications/preferences', preferences);
  },
};

export default notificationsApi;
