/**
 * Notification Service
 *
 * Handles push notifications using Expo Notifications
 * Manages permissions, tokens, and notification delivery
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface NotificationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  ios?: {
    status: Notifications.IosAuthorizationStatus;
    allowsAlert: boolean;
    allowsBadge: boolean;
    allowsSound: boolean;
  };
}

export interface PushToken {
  token: string;
  type: 'expo' | 'fcm' | 'apns';
}

// Configure how notifications should be handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class NotificationService {
  private static instance: NotificationService;
  private pushToken: string | null = null;
  private notificationListener: Notifications.Subscription | null = null;
  private responseListener: Notifications.Subscription | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize notification service
   * Call this on app startup to set up listeners
   */
  async initialize(): Promise<void> {
    try {
      // Set up notification listeners
      this.setupNotificationListeners();

      // Request permissions if granted
      const permissions = await this.checkPermissions();
      if (permissions.granted) {
        await this.registerForPushNotifications();
      }
    } catch (error) {
      console.error('Failed to initialize notification service:', error);
    }
  }

  /**
   * Set up listeners for incoming notifications and user responses
   */
  private setupNotificationListeners(): void {
    // Listener for notifications received while app is in foreground
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification);
        // You can add custom handling here
      }
    );

    // Listener for user tapping on notifications
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification response:', response);
        // Handle navigation based on notification data
        const data = response.notification.request.content.data;
        // You can emit events or call navigation handlers here
      }
    );
  }

  /**
   * Check current notification permission status
   */
  async checkPermissions(): Promise<NotificationPermissionStatus> {
    try {
      const settings = await Notifications.getPermissionsAsync();

      const result: NotificationPermissionStatus = {
        granted: settings.granted,
        canAskAgain: settings.canAskAgain,
      };

      if (Platform.OS === 'ios' && settings.ios) {
        result.ios = {
          status: settings.ios.status,
          allowsAlert: settings.ios.allowsAlert ?? false,
          allowsBadge: settings.ios.allowsBadge ?? false,
          allowsSound: settings.ios.allowsSound ?? false,
        };
      }

      return result;
    } catch (error) {
      console.error('Error checking notification permissions:', error);
      return {
        granted: false,
        canAskAgain: false,
      };
    }
  }

  /**
   * Request notification permissions from user
   */
  async requestPermissions(): Promise<NotificationPermissionStatus> {
    try {
      const settings = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });

      const result: NotificationPermissionStatus = {
        granted: settings.granted,
        canAskAgain: settings.canAskAgain,
      };

      if (Platform.OS === 'ios' && settings.ios) {
        result.ios = {
          status: settings.ios.status,
          allowsAlert: settings.ios.allowsAlert ?? false,
          allowsBadge: settings.ios.allowsBadge ?? false,
          allowsSound: settings.ios.allowsSound ?? false,
        };
      }

      return result;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return {
        granted: false,
        canAskAgain: false,
      };
    }
  }

  /**
   * Register for push notifications and get token
   * This should be called after permissions are granted
   */
  async registerForPushNotifications(): Promise<PushToken | null> {
    try {
      // Check permissions
      const permissions = await this.checkPermissions();
      if (!permissions.granted) {
        console.warn('Notification permissions not granted');
        return null;
      }

      // Get push token
      // Note: On simulators, this may fail. That's expected.
      const tokenData = await Notifications.getExpoPushTokenAsync();

      this.pushToken = tokenData.data;

      console.log('Push token obtained:', this.pushToken);

      return {
        token: this.pushToken,
        type: 'expo',
      };
    } catch (error) {
      console.error('Failed to register for push notifications:', error);
      // On simulator or without proper setup, this is expected
      console.warn('Note: Push notifications require a physical device and proper EAS configuration');
      return null;
    }
  }

  /**
   * Get the current push token
   */
  getPushToken(): string | null {
    return this.pushToken;
  }

  /**
   * Schedule a local notification (not from server)
   */
  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: Record<string, any>,
    triggerSeconds?: number
  ): Promise<string | null> {
    try {
      const permissions = await this.checkPermissions();
      if (!permissions.granted) {
        throw new Error('Notification permissions not granted');
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: triggerSeconds
          ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: triggerSeconds }
          : null, // null means show immediately
      });

      return notificationId;
    } catch (error) {
      console.error('Failed to schedule local notification:', error);
      return null;
    }
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('Failed to cancel notification:', error);
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Failed to cancel all notifications:', error);
    }
  }

  /**
   * Get badge count (iOS)
   */
  async getBadgeCount(): Promise<number> {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Failed to get badge count:', error);
      return 0;
    }
  }

  /**
   * Set badge count (iOS)
   */
  async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('Failed to set badge count:', error);
    }
  }

  /**
   * Clear badge count (iOS)
   */
  async clearBadgeCount(): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      console.error('Failed to clear badge count:', error);
    }
  }

  /**
   * Dismiss a notification
   */
  async dismissNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.dismissNotificationAsync(notificationId);
    } catch (error) {
      console.error('Failed to dismiss notification:', error);
    }
  }

  /**
   * Dismiss all notifications
   */
  async dismissAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      console.error('Failed to dismiss all notifications:', error);
    }
  }

  /**
   * Get all present notifications
   */
  async getPresentedNotifications(): Promise<Notifications.Notification[]> {
    try {
      return await Notifications.getPresentedNotificationsAsync();
    } catch (error) {
      console.error('Failed to get presented notifications:', error);
      return [];
    }
  }

  /**
   * Clean up listeners when service is destroyed
   */
  cleanup(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
  }
}

// Export singleton instance
export default NotificationService.getInstance();
