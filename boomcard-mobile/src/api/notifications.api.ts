import apiClient from './client';
import type { ApiResponse } from '../types';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  status: 'unread' | 'read' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
  data?: any;
}

export interface NotificationsResponse {
  data: AppNotification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const notificationsApi = {
  async getNotifications(page = 1, limit = 20): Promise<ApiResponse<NotificationsResponse>> {
    return await apiClient.get(`/api/notifications?page=${page}&limit=${limit}`);
  },

  async getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
    return await apiClient.get('/api/notifications/unread/count');
  },

  async markAsRead(id: string): Promise<ApiResponse<any>> {
    return await apiClient.post(`/api/notifications/${id}/read`);
  },

  async markAllAsRead(): Promise<ApiResponse<any>> {
    return await apiClient.post('/api/notifications/read-all');
  },

  async registerPushToken(token: string, platform: string, deviceId?: string): Promise<ApiResponse<any>> {
    return await apiClient.post('/api/notifications/register-token', { token, platform, deviceId });
  },

  async unregisterPushToken(token: string): Promise<ApiResponse<any>> {
    return await apiClient.post('/api/notifications/unregister-token', { token });
  },

  async getPreferences(): Promise<ApiResponse<any>> {
    return await apiClient.get('/api/notifications/preferences');
  },

  async updatePreferences(preferences: any): Promise<ApiResponse<any>> {
    return await apiClient.put('/api/notifications/preferences', preferences);
  },
};

export default notificationsApi;
