/**
 * Notification Service
 *
 * Handles push notifications using Expo Notifications (native) or Web Notifications API (web).
 *
 * NOTE: Push notifications are NOT available in Expo Go SDK 53+
 * Use a development build for full notification functionality
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Conditional import - notifications are not available in Expo Go
let Notifications: any = null;
let isNotificationsAvailable = false;
const isWeb = Platform.OS === 'web';

if (isWeb) {
  // On web, use the browser's Notification API
  isNotificationsAvailable = typeof window !== 'undefined' && 'Notification' in window;
} else {
  try {
    const executionEnvironment = Constants.executionEnvironment;
    if (executionEnvironment !== 'storeClient') {
      Notifications = require('expo-notifications');
      isNotificationsAvailable = true;

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
      console.log('Notifications not available');
      return;
    }

    try {
      if (!isWeb) {
        this.setupNotificationListeners();
      }

      const permissions = await this.checkPermissions();
      if (permissions.granted) {
        await this.registerForPushNotifications();
      }
    } catch (error) {
      console.error('Failed to initialize notification service:', error);
    }
  }

  /**
   * Set up listeners for incoming notifications and user responses (native only)
   */
  private setupNotificationListeners(): void {
    if (!isNotificationsAvailable || !Notifications || isWeb) return;

    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification: any) => {
        console.log('Notification received:', notification);
      }
    );

    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        console.log('Notification response:', response);
      }
    );
  }

  /**
   * Check current notification permission status
   */
  async checkPermissions(): Promise<NotificationPermissionStatus> {
    if (!isNotificationsAvailable) {
      return { granted: false, canAskAgain: false };
    }

    // Web: use browser Notification API
    if (isWeb) {
      const permission = (window as any).Notification?.permission;
      return {
        granted: permission === 'granted',
        canAskAgain: permission !== 'denied',
      };
    }

    // Native: use expo-notifications
    if (!Notifications) {
      return { granted: false, canAskAgain: false };
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
      return { granted: false, canAskAgain: false };
    }
  }

  /**
   * Request notification permissions from user
   */
  async requestPermissions(): Promise<NotificationPermissionStatus> {
    if (!isNotificationsAvailable) {
      return { granted: false, canAskAgain: false };
    }

    // Web: use browser Notification.requestPermission()
    if (isWeb) {
      try {
        const permission = await (window as any).Notification.requestPermission();
        return {
          granted: permission === 'granted',
          canAskAgain: permission !== 'denied',
        };
      } catch (error) {
        console.error('Error requesting web notification permission:', error);
        return { granted: false, canAskAgain: false };
      }
    }

    // Native: use expo-notifications
    if (!Notifications) {
      return { granted: false, canAskAgain: false };
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
      return { granted: false, canAskAgain: false };
    }
  }

  /**
   * Register for push notifications and get token
   */
  async registerForPushNotifications(): Promise<PushToken | null> {
    if (!isNotificationsAvailable) return null;

    // Web: no push token needed for basic browser notifications
    if (isWeb) {
      const permissions = await this.checkPermissions();
      if (permissions.granted) {
        this.pushToken = 'web-notifications-enabled';
        return { token: this.pushToken, type: 'expo' };
      }
      return null;
    }

    // Native: use expo-notifications
    if (!Notifications) return null;

    try {
      const permissions = await this.checkPermissions();
      if (!permissions.granted) {
        console.warn('Notification permissions not granted');
        return null;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        '77543a0c-e238-4616-9fc4-22dcc565080b';
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      this.pushToken = tokenData.data;

      if (!this.pushToken) return null;

      return { token: this.pushToken, type: 'expo' };
    } catch (error) {
      console.error('Failed to register for push notifications:', error);
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
    if (!isNotificationsAvailable) return null;

    // Web: use browser Notification API
    if (isWeb) {
      try {
        const permissions = await this.checkPermissions();
        if (!permissions.granted) {
          throw new Error('Notification permissions not granted');
        }

        const showNotification = () => {
          new (window as any).Notification(title, { body, data });
        };

        if (triggerSeconds) {
          setTimeout(showNotification, triggerSeconds * 1000);
        } else {
          showNotification();
        }

        return `web-${Date.now()}`;
      } catch (error) {
        console.error('Failed to show web notification:', error);
        return null;
      }
    }

    // Native
    if (!Notifications) return null;

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
          : null,
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
