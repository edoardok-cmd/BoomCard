/**
 * Notification Manager
 * Handles in-app notifications, push notifications, and email notifications
 */

export type NotificationType =
  | 'success'
  | 'info'
  | 'warning'
  | 'error'
  | 'transaction'
  | 'offer'
  | 'system';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

export interface NotificationPreferences {
  email: {
    enabled: boolean;
    transactions: boolean;
    offers: boolean;
    system: boolean;
    marketing: boolean;
  };
  push: {
    enabled: boolean;
    transactions: boolean;
    offers: boolean;
    system: boolean;
  };
  inApp: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
  };
}

type NotificationListener = (notification: Notification) => void;

export class NotificationManager {
  private notifications: Notification[] = [];
  private listeners: Set<NotificationListener> = new Set();
  private preferences: NotificationPreferences;

  constructor(preferences?: NotificationPreferences) {
    this.preferences = preferences || this.getDefaultPreferences();
    this.loadNotifications();
    this.requestPermissions();
  }

  /**
   * Get default notification preferences
   */
  private getDefaultPreferences(): NotificationPreferences {
    return {
      email: {
        enabled: true,
        transactions: true,
        offers: true,
        system: true,
        marketing: false,
      },
      push: {
        enabled: true,
        transactions: true,
        offers: true,
        system: true,
      },
      inApp: {
        enabled: true,
        sound: true,
        desktop: true,
      },
    };
  }

  /**
   * Request browser notification permissions
   */
  private async requestPermissions(): Promise<void> {
    if (!this.preferences.push.enabled) return;

    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  /**
   * Load notifications from storage
   */
  private loadNotifications(): void {
    try {
      const stored = localStorage.getItem('notifications');
      if (stored) {
        this.notifications = JSON.parse(stored, (key, value) => {
          if (key === 'timestamp' || key === 'expiresAt') {
            return value ? new Date(value) : undefined;
          }
          return value;
        });
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  /**
   * Save notifications to storage
   */
  private saveNotifications(): void {
    try {
      localStorage.setItem('notifications', JSON.stringify(this.notifications));
    } catch (error) {
      console.error('Failed to save notifications:', error);
    }
  }

  /**
   * Create a new notification
   */
  create(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Notification {
    const newNotification: Notification = {
      id: this.generateId(),
      timestamp: new Date(),
      read: false,
      ...notification,
    };

    this.notifications.unshift(newNotification);
    this.saveNotifications();
    this.notifyListeners(newNotification);

    // Show browser notification if enabled
    if (this.preferences.push.enabled && this.shouldShowPush(notification.type)) {
      this.showBrowserNotification(newNotification);
    }

    // Play sound if enabled
    if (this.preferences.inApp.sound) {
      this.playNotificationSound();
    }

    return newNotification;
  }

  /**
   * Generate unique notification ID
   */
  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if push notification should be shown
   */
  private shouldShowPush(type: NotificationType): boolean {
    const { push } = this.preferences;

    switch (type) {
      case 'transaction':
        return push.transactions;
      case 'offer':
        return push.offers;
      case 'system':
        return push.system;
      default:
        return true;
    }
  }

  /**
   * Show browser notification
   */
  private showBrowserNotification(notification: Notification): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const browserNotif = new Notification(notification.title, {
      body: notification.message,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: notification.id,
      requireInteraction: notification.priority === 'urgent',
    });

    browserNotif.onclick = () => {
      window.focus();
      if (notification.actionUrl) {
        window.location.href = notification.actionUrl;
      }
      this.markAsRead(notification.id);
    };
  }

  /**
   * Play notification sound
   */
  private playNotificationSound(): void {
    try {
      const audio = new Audio('/sounds/notification.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {
        // Ignore autoplay errors
      });
    } catch (error) {
      console.error('Failed to play notification sound:', error);
    }
  }

  /**
   * Get all notifications
   */
  getAll(): Notification[] {
    return this.notifications.filter(n => {
      if (n.expiresAt && n.expiresAt < new Date()) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get unread notifications
   */
  getUnread(): Notification[] {
    return this.getAll().filter(n => !n.read);
  }

  /**
   * Get unread count
   */
  getUnreadCount(): number {
    return this.getUnread().length;
  }

  /**
   * Get notification by ID
   */
  getById(id: string): Notification | undefined {
    return this.notifications.find(n => n.id === id);
  }

  /**
   * Mark notification as read
   */
  markAsRead(id: string): void {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      this.saveNotifications();
    }
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): void {
    this.notifications.forEach(n => n.read = true);
    this.saveNotifications();
  }

  /**
   * Delete notification
   */
  delete(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.saveNotifications();
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notifications = [];
    this.saveNotifications();
  }

  /**
   * Clear read notifications
   */
  clearRead(): void {
    this.notifications = this.notifications.filter(n => !n.read);
    this.saveNotifications();
  }

  /**
   * Subscribe to notifications
   */
  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(notification: Notification): void {
    this.listeners.forEach(listener => {
      try {
        listener(notification);
      } catch (error) {
        console.error('Notification listener error:', error);
      }
    });
  }

  /**
   * Update preferences
   */
  updatePreferences(preferences: Partial<NotificationPreferences>): void {
    this.preferences = {
      email: { ...this.preferences.email, ...preferences.email },
      push: { ...this.preferences.push, ...preferences.push },
      inApp: { ...this.preferences.inApp, ...preferences.inApp },
    };

    // Save to storage
    try {
      localStorage.setItem('notificationPreferences', JSON.stringify(this.preferences));
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  }

  /**
   * Get preferences
   */
  getPreferences(): NotificationPreferences {
    return this.preferences;
  }

  /**
   * Helper: Create transaction notification
   */
  notifyTransaction(amount: number, venueName: string, status: 'success' | 'failed'): Notification {
    return this.create({
      type: 'transaction',
      priority: 'high',
      title: status === 'success' ? 'Transaction Successful' : 'Transaction Failed',
      message: status === 'success'
        ? `Payment of $${(amount / 100).toFixed(2)} at ${venueName} completed`
        : `Payment of $${(amount / 100).toFixed(2)} at ${venueName} failed`,
      actionUrl: '/transactions',
      actionLabel: 'View Details',
    });
  }

  /**
   * Helper: Create offer notification
   */
  notifyOffer(offerTitle: string, venueName: string): Notification {
    return this.create({
      type: 'offer',
      priority: 'medium',
      title: 'New Offer Available',
      message: `${offerTitle} at ${venueName}`,
      actionUrl: '/offers',
      actionLabel: 'View Offer',
    });
  }

  /**
   * Helper: Create system notification
   */
  notifySystem(title: string, message: string, priority: NotificationPriority = 'medium'): Notification {
    return this.create({
      type: 'system',
      priority,
      title,
      message,
    });
  }

  /**
   * Helper: Create success notification
   */
  notifySuccess(title: string, message: string): Notification {
    return this.create({
      type: 'success',
      priority: 'low',
      title,
      message,
    });
  }

  /**
   * Helper: Create error notification
   */
  notifyError(title: string, message: string): Notification {
    return this.create({
      type: 'error',
      priority: 'high',
      title,
      message,
    });
  }

  /**
   * Helper: Create warning notification
   */
  notifyWarning(title: string, message: string): Notification {
    return this.create({
      type: 'warning',
      priority: 'medium',
      title,
      message,
    });
  }
}

// Singleton instance
let globalNotificationManager: NotificationManager | null = null;

export function initNotificationManager(preferences?: NotificationPreferences): NotificationManager {
  if (!globalNotificationManager) {
    globalNotificationManager = new NotificationManager(preferences);
  }
  return globalNotificationManager;
}

export function getNotificationManager(): NotificationManager {
  if (!globalNotificationManager) {
    globalNotificationManager = new NotificationManager();
  }
  return globalNotificationManager;
}

export default NotificationManager;
