/**
 * Notification Service
 *
 * Handles push notifications using Expo Notifications
 * Manages permissions, tokens, and notification delivery
 *
 * NOTE: Push notifications are NOT available in Expo Go SDK 53+
 * Use a development build for full notification functionality
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Conditional import - notifications are not available in Expo Go
let Notifications: any = null;
let isNotificationsAvailable = false;

try {
  // Only import if not in Expo Go
  // Check if we're running in Expo Go by checking the executionEnvironment
  const executionEnvironment = Constants.executionEnvironment;

  // In Expo Go, executionEnvironment is 'storeClient' or 'standalone' for production builds
  if (executionEnvironment !== 'storeClient') {
    Notifications = require('expo-notifications');
    isNotificationsAvailable = true;

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
  }
} catch (error) {
  console.log('Notifications not available (Expo Go detected)');
  isNotificationsAvailable = false;
}

export interface NotificationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  ios?: {
    status: any;
    allowsAlert: boolean;
    allowsBadge: boolean;
    allowsSound: boolean;
  };
}

export interface PushToken {
  token: string;
  type: 'expo' | 'fcm' | 'apns';
}

export class NotificationService {
  private static instance: NotificationService;
  private pushToken: string | null = null;
  private notificationListener: any = null;
  private responseListener: any = null;

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
   * Check if notifications are available (not in Expo Go)
   */
  public isAvailable(): boolean {
    return isNotificationsAvailable;
  }

  /**
   * Initialize notification service
   * Call this on app startup to set up listeners
   */
  async initialize(): Promise<void> {
    if (!isNotificationsAvailable) {
      console.log('Notifications not available in Expo Go - use development build for notifications');
      return;
    }

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
    if (!isNotificationsAvailable || !Notifications) return;

    // Listener for notifications received while app is in foreground
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification: any) => {
        console.log('Notification received:', notification);
        // You can add custom handling here
      }
    );

    // Listener for user tapping on notifications
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        console.log('Notification response:', response);
        // Handle navigation based on notification data
        // You can emit events or call navigation handlers here
        // const data = response.notification.request.content.data;
      }
    );
  }

  /**
   * Check current notification permission status
   */
  async checkPermissions(): Promise<NotificationPermissionStatus> {
    if (!isNotificationsAvailable || !Notifications) {
      return {
        granted: false,
        canAskAgain: false,
      };
    }

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
    if (!isNotificationsAvailable || !Notifications) {
      console.log('Notifications not available in Expo Go');
      return {
        granted: false,
        canAskAgain: false,
      };
    }

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
    if (!isNotificationsAvailable || !Notifications) {
      console.log('Notifications not available in Expo Go - use development build');
      return null;
    }

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

      if (!this.pushToken) {
        return null;
      }

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
    if (!isNotificationsAvailable || !Notifications) {
      console.log('Notifications not available in Expo Go');
      return null;
    }

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
    if (!isNotificationsAvailable || !Notifications) return;

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
    if (!isNotificationsAvailable || !Notifications) return;

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
    if (!isNotificationsAvailable || !Notifications) return 0;

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
    if (!isNotificationsAvailable || !Notifications) return;

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
    if (!isNotificationsAvailable || !Notifications) return;

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
    if (!isNotificationsAvailable || !Notifications) return;

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
    if (!isNotificationsAvailable || !Notifications) return;

    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      console.error('Failed to dismiss all notifications:', error);
    }
  }

  /**
   * Get all present notifications
   */
  async getPresentedNotifications(): Promise<any[]> {
    if (!isNotificationsAvailable || !Notifications) return [];

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
