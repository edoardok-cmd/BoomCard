/**
 * Notifications Service
 *
 * Real-time notification system with:
 * - WebSocket support for live updates
 * - Push notifications
 * - In-app notifications
 * - Email notifications
 * - SMS notifications (optional)
 * - Notification preferences
 */

import { apiService } from './api.service';

export type NotificationType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_reminder'
  | 'new_offer'
  | 'offer_expiring'
  | 'payment_received'
  | 'payment_failed'
  | 'new_review'
  | 'review_reply'
  | 'partner_message'
  | 'system_announcement'
  | 'promotion'
  | 'account_update';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export type NotificationStatus = 'unread' | 'read' | 'archived';

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  status: NotificationStatus;

  // Content
  title: string;
  titleBg: string;
  message: string;
  messageBg: string;

  // Metadata
  userId: string;
  relatedEntityType?: 'booking' | 'offer' | 'venue' | 'partner' | 'review';
  relatedEntityId?: string;

  // Action
  actionUrl?: string;
  actionText?: string;
  actionTextBg?: string;

  // Timestamps
  createdAt: string;
  readAt?: string;
  archivedAt?: string;
  expiresAt?: string;

  // Additional data
  imageUrl?: string;
  metadata?: Record<string, any>;
}

export interface NotificationPreferences {
  userId: string;
  email: {
    enabled: boolean;
    bookingConfirmations: boolean;
    bookingReminders: boolean;
    newOffers: boolean;
    promotions: boolean;
    reviews: boolean;
    systemAnnouncements: boolean;
  };
  push: {
    enabled: boolean;
    bookingConfirmations: boolean;
    bookingReminders: boolean;
    newOffers: boolean;
    promotions: boolean;
    reviews: boolean;
    systemAnnouncements: boolean;
  };
  inApp: {
    enabled: boolean;
    showBadge: boolean;
    playSound: boolean;
    showDesktopNotifications: boolean;
  };
  sms: {
    enabled: boolean;
    bookingConfirmations: boolean;
    bookingReminders: boolean;
  };
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:mm
    endTime: string; // HH:mm
  };
}

export interface NotificationFilters {
  type?: NotificationType;
  priority?: NotificationPriority;
  status?: NotificationStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedNotifications {
  data: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

class NotificationsService {
  private readonly baseUrl = '/notifications';
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private listeners: Map<string, Set<(notification: Notification) => void>> = new Map();
  private connectionListeners: Set<(connected: boolean) => void> = new Set();

  /**
   * Initialize WebSocket connection for real-time notifications
   */
  connectWebSocket(userId: string): void {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
    const token = localStorage.getItem('token');

    if (!token) {
      console.warn('No auth token found, skipping WebSocket connection');
      return;
    }

    try {
      this.ws = new WebSocket(`${wsUrl}/notifications?token=${token}&userId=${userId}`);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.notifyConnectionListeners(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const notification: Notification = JSON.parse(event.data);
          this.handleNotification(notification);
        } catch (error) {
          console.error('Failed to parse notification:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.notifyConnectionListeners(false);
        this.attemptReconnect(userId);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.attemptReconnect(userId);
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Attempt to reconnect WebSocket
   */
  private attemptReconnect(userId: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connectWebSocket(userId);
    }, delay);
  }

  /**
   * Handle incoming notification
   */
  private handleNotification(notification: Notification): void {
    // Show desktop notification if enabled
    this.showDesktopNotification(notification);

    // Play sound if enabled
    this.playNotificationSound(notification);

    // Notify listeners
    const typeListeners = this.listeners.get(notification.type);
    const allListeners = this.listeners.get('*');

    if (typeListeners) {
      typeListeners.forEach(listener => listener(notification));
    }

    if (allListeners) {
      allListeners.forEach(listener => listener(notification));
    }
  }

  /**
   * Subscribe to notifications
   */
  subscribe(type: NotificationType | '*', callback: (notification: Notification) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);

    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  /**
   * Notify connection listeners
   */
  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach(listener => listener(connected));
  }

  /**
   * Show desktop notification
   */
  private async showDesktopNotification(notification: Notification): Promise<void> {
    if (!('Notification' in window)) return;

    const preferences = await this.getPreferences();
    if (!preferences.inApp.showDesktopNotifications) return;

    if (Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: notification.imageUrl || '/logo.png',
        tag: notification.id,
        requireInteraction: notification.priority === 'urgent',
      });
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        this.showDesktopNotification(notification);
      }
    }
  }

  /**
   * Play notification sound
   */
  private async playNotificationSound(notification: Notification): Promise<void> {
    const preferences = await this.getPreferences();
    if (!preferences.inApp.playSound) return;

    try {
      const audio = new Audio('/notification-sound.mp3');
      audio.volume = notification.priority === 'urgent' ? 1.0 : 0.5;
      await audio.play();
    } catch (error) {
      console.error('Failed to play notification sound:', error);
    }
  }

  /**
   * Get all notifications
   */
  async getNotifications(filters?: NotificationFilters): Promise<PaginatedNotifications> {
    return apiService.get<PaginatedNotifications>(this.baseUrl, filters);
  }

  /**
   * Get notification by ID
   */
  async getNotificationById(id: string): Promise<Notification> {
    return apiService.get<Notification>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get unread count
   */
  async getUnreadCount(): Promise<number> {
    const response = await apiService.get<{ count: number }>(`${this.baseUrl}/unread/count`);
    return response.count;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string): Promise<Notification> {
    return apiService.post<Notification>(`${this.baseUrl}/${id}/read`);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/read-all`);
  }

  /**
   * Archive notification
   */
  async archiveNotification(id: string): Promise<Notification> {
    return apiService.post<Notification>(`${this.baseUrl}/${id}/archive`);
  }

  /**
   * Delete notification
   */
  async deleteNotification(id: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * Delete all notifications
   */
  async deleteAllNotifications(): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/all`);
  }

  /**
   * Get notification preferences
   */
  async getPreferences(): Promise<NotificationPreferences> {
    return apiService.get<NotificationPreferences>(`${this.baseUrl}/preferences`);
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    return apiService.put<NotificationPreferences>(`${this.baseUrl}/preferences`, preferences);
  }

  /**
   * Request push notification permission
   */
  async requestPushPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  /**
   * Register push subscription (for PWA)
   */
  async registerPushSubscription(subscription: PushSubscription): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/push/subscribe`, {
      subscription: subscription.toJSON(),
    });
  }

  /**
   * Unregister push subscription
   */
  async unregisterPushSubscription(): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/push/unsubscribe`);
  }

  /**
   * Send test notification
   */
  async sendTestNotification(): Promise<Notification> {
    return apiService.post<Notification>(`${this.baseUrl}/test`);
  }

  /**
   * Get notification statistics
   */
  async getStatistics(startDate?: string, endDate?: string): Promise<{
    total: number;
    unread: number;
    byType: Record<NotificationType, number>;
    byPriority: Record<NotificationPriority, number>;
  }> {
    return apiService.get(`${this.baseUrl}/statistics`, {
      startDate,
      endDate,
    });
  }
}

// Export singleton instance
export const notificationsService = new NotificationsService();
export default notificationsService;
