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

// Kept in sync with backend-api/prisma/schema.prisma NotificationType enum
// (UPPER_SNAKE → lower_snake). The frontend-only values (booking_reminder,
// payment_received, new_review, review_reply, partner_message,
// system_announcement, promotion, account_update) are retained for components
// that subscribe pre-emptively to types the backend doesn't emit yet.
export type NotificationType =
  // Backend-emitted (must match Prisma NotificationType enum)
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'payment_success'
  | 'payment_failed'
  | 'loyalty_points'
  | 'reward_available'
  | 'new_message'
  | 'review_received'
  | 'offer_expiring'
  | 'receipt_approved'
  | 'receipt_rejected'
  | 'receipt_manual_review'
  | 'cashback_credited'
  | 'sticker_scan_approved'
  | 'fraud_alert'
  | 'system'
  // Frontend-only / future backend types
  | 'booking_reminder'
  | 'new_offer'
  | 'payment_received'
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
  metadata?: Record<string, unknown>;
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
  private listeners: Map<string, Set<(notification: Notification) => void>> = new Map();
  private connectionListeners: Set<(connected: boolean) => void> = new Set();

  /**
   * Realtime is intentionally disabled in partner-dashboard.
   *
   * The backend speaks Socket.IO (see backend-api/src/websocket/server.ts) but
   * partner-dashboard doesn't depend on socket.io-client. Rather than ship a
   * raw WebSocket against a Socket.IO endpoint (which the original code did
   * and which always 400'd), we no-op here and rely on TanStack Query polling
   * in useUnreadCount (refetchInterval: 60s). To enable live push later:
   *   npm i socket.io-client
   *   replace this with `io(WS_URL, { auth: { token } })` and emit
   *   'subscribe_notifications', then forward 'notification' events into
   *   handleNotification().
   */
  connectWebSocket(_userId: string): void {
    // Mark as "connected" so any UI bound to onConnectionChange shows the
    // healthy state — the polling fallback covers the actual data path.
    this.notifyConnectionListeners(true);
  }

  disconnectWebSocket(): void {
    this.notifyConnectionListeners(false);
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
