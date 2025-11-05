import apiClient from './client';
import { API_CONFIG } from '../constants/config';

export const notificationsApi = {
  /**
   * Register push notification token with backend
   */
  async registerPushToken(token: string, platform: string, deviceId?: string) {
    try {
      const headers = await getAuthHeaders();
      const response = await axios.post(
        `${API_URL}/api/notifications/register-token`,
        {
          token,
          platform,
          deviceId,
        },
        { headers }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      console.error('Failed to register push token:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Unregister push notification token
   */
  async unregisterPushToken(token: string) {
    try {
      const headers = await getAuthHeaders();
      const response = await axios.post(
        `${API_URL}/api/notifications/unregister-token`,
        { token },
        { headers }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      console.error('Failed to unregister push token:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Get notification preferences
   */
  async getPreferences() {
    try {
      const headers = await getAuthHeaders();
      const response = await axios.get(
        `${API_URL}/api/notifications/preferences`,
        { headers }
      );
      return { success: true, data: response.data.preferences };
    } catch (error: any) {
      console.error('Failed to get notification preferences:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  },

  /**
   * Update notification preferences
   */
  async updatePreferences(preferences: any) {
    try {
      const headers = await getAuthHeaders();
      const response = await axios.put(
        `${API_URL}/api/notifications/preferences`,
        preferences,
        { headers }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      console.error('Failed to update notification preferences:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  },
};

export default notificationsApi;
