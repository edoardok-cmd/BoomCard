/**
 * Push Notifications Service
 * Handles Web Push API integration for browser notifications.
 *
 * Server wiring: the VAPID public key is fetched from
 * GET /api/notifications/push/vapid-public-key (public, no auth). Active
 * subscriptions are registered via notificationsService.registerPushSubscription,
 * which posts to /api/notifications/push/subscribe and stores the subscription
 * in the pushToken table with platform='web'. Pushes are sent by the backend
 * via lib/webPush.ts whenever the notification service fires.
 */

import { apiService } from './api.service';
import { notificationsService } from './notifications.service';

export type NotificationPermissionState = 'default' | 'granted' | 'denied';

export interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: any;
  tag?: string;
  requireInteraction?: boolean;
  actions?: NotificationAction[];
  vibrate?: number[];
  silent?: boolean;
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export interface NotificationTemplate {
  type: 'new_offer' | 'offer_expiring' | 'card_activated' | 'review_received' | 'partner_message';
  title: string;
  body: string;
  icon?: string;
  image?: string;
  data?: any;
  actions?: NotificationAction[];
}

class PushNotificationService {
  private static instance: PushNotificationService;
  private registration: ServiceWorkerRegistration | null = null;
  private vapidPublicKeyPromise: Promise<string | null> | null = null;

  private constructor() {
    this.init();
  }

  /**
   * Fetch the server's VAPID public key once and cache the promise.
   * Returns null if the backend returned 503 (web push not configured) or
   * the network call failed — callers should treat null as "not available".
   */
  private async getVapidPublicKey(): Promise<string | null> {
    if (!this.vapidPublicKeyPromise) {
      this.vapidPublicKeyPromise = apiService
        .get<{ publicKey: string }>('/notifications/push/vapid-public-key')
        .then((res) => res.publicKey || null)
        .catch((err) => {
          console.error('Failed to fetch VAPID public key:', err);
          return null;
        });
    }
    return this.vapidPublicKeyPromise;
  }

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Initialize the service
   */
  private async init(): Promise<void> {
    if (!this.isSupported()) {
      console.warn('Push notifications are not supported in this browser');
      return;
    }

    // Register service worker if supported
    if ('serviceWorker' in navigator) {
      try {
        this.registration = await navigator.serviceWorker.ready;
        console.log('Service Worker registered for push notifications');
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  /**
   * Check if push notifications are supported
   */
  public isSupported(): boolean {
    return (
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  }

  /**
   * Get current permission state
   */
  public getPermission(): NotificationPermissionState {
    if (!this.isSupported()) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Request permission to show notifications
   */
  public async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.isSupported()) {
      return 'denied';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      return 'denied';
    }

    const permission = await Notification.requestPermission();
    return permission;
  }

  /**
   * Subscribe to push notifications
   */
  public async subscribe(): Promise<PushSubscription | null> {
    if (!this.registration) {
      console.error('Service Worker not registered');
      return null;
    }

    if (Notification.permission !== 'granted') {
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        return null;
      }
    }

    try {
      const vapidPublicKey = await this.getVapidPublicKey();
      if (!vapidPublicKey) {
        console.warn('Web push not configured on server');
        return null;
      }

      const applicationServerKey = this.urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as any,
      });

      await this.sendSubscriptionToServer(subscription);

      return subscription;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      return null;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  public async unsubscribe(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    try {
      const subscription = await this.registration.pushManager.getSubscription();
      if (subscription) {
        const success = await subscription.unsubscribe();

        if (success) {
          // Notify server to remove subscription
          await this.removeSubscriptionFromServer(subscription);
        }

        return success;
      }
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
      return false;
    }
  }

  /**
   * Check if currently subscribed
   */
  public async isSubscribed(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }

    try {
      const subscription = await this.registration.pushManager.getSubscription();
      return subscription !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Show a local notification (doesn't require subscription)
   */
  public async showNotification(options: PushNotificationOptions): Promise<void> {
    if (Notification.permission !== 'granted') {
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }
    }

    if (this.registration) {
      // Use service worker to show notification
      await this.registration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || '/logo.png',
        badge: options.badge || '/badge.png',
        // image: options.image, // Not supported in all browsers
        data: options.data,
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
        actions: options.actions || [],
        vibrate: options.vibrate || [200, 100, 200],
        silent: options.silent || false,
      } as NotificationOptions);
    } else {
      // Fallback to regular notification
      new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/logo.png',
        badge: options.badge || '/badge.png',
        // image: options.image, // Not supported in all browsers
        data: options.data,
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
        vibrate: options.vibrate || [200, 100, 200],
        silent: options.silent || false,
      } as NotificationOptions);
    }
  }

  /**
   * Show notification from template
   */
  public async showTemplateNotification(
    template: NotificationTemplate
  ): Promise<void> {
    const options: PushNotificationOptions = {
      title: template.title,
      body: template.body,
      icon: template.icon,
      image: template.image,
      data: { ...template.data, type: template.type },
      tag: template.type,
      actions: template.actions,
    };

    await this.showNotification(options);
  }

  /**
   * Notification templates for different types
   */
  public getTemplate(
    type: NotificationTemplate['type'],
    data: any
  ): NotificationTemplate {
    switch (type) {
      case 'new_offer':
        return {
          type: 'new_offer',
          title: '🎉 New Offer Available!',
          body: `${data.venueName} is offering ${data.discount}% off!`,
          icon: '/icons/offer.png',
          image: data.image,
          data: { offerId: data.offerId, venueId: data.venueId },
          actions: [
            { action: 'view', title: 'View Offer', icon: '/icons/view.png' },
            { action: 'dismiss', title: 'Dismiss', icon: '/icons/dismiss.png' },
          ],
        };

      case 'offer_expiring':
        return {
          type: 'offer_expiring',
          title: '⏰ Offer Expiring Soon!',
          body: `${data.offerTitle} expires ${data.expiresIn}. Don't miss out!`,
          icon: '/icons/clock.png',
          data: { offerId: data.offerId },
          actions: [
            { action: 'view', title: 'Use Now', icon: '/icons/use.png' },
            { action: 'dismiss', title: 'Remind Later', icon: '/icons/remind.png' },
          ],
        };

      case 'card_activated':
        return {
          type: 'card_activated',
          title: '✅ BoomCard Activated!',
          body: `Your ${data.cardType} card is now active. Start saving!`,
          icon: '/icons/card.png',
          data: { cardId: data.cardId },
          actions: [
            { action: 'view', title: 'View Card', icon: '/icons/view.png' },
          ],
        };

      case 'review_received':
        return {
          type: 'review_received',
          title: '⭐ New Review!',
          body: `${data.userName} left a ${data.rating}-star review`,
          icon: '/icons/star.png',
          data: { reviewId: data.reviewId, offerId: data.offerId },
          actions: [
            { action: 'view', title: 'View Review', icon: '/icons/view.png' },
            { action: 'reply', title: 'Reply', icon: '/icons/reply.png' },
          ],
        };

      case 'partner_message':
        return {
          type: 'partner_message',
          title: '💬 Message from Partner',
          body: `${data.partnerName}: ${data.message}`,
          icon: '/icons/message.png',
          data: { messageId: data.messageId, partnerId: data.partnerId },
          actions: [
            { action: 'reply', title: 'Reply', icon: '/icons/reply.png' },
            { action: 'dismiss', title: 'Dismiss', icon: '/icons/dismiss.png' },
          ],
        };

      default:
        return {
          type: 'new_offer',
          title: 'BoomCard Notification',
          body: 'You have a new notification',
          icon: '/logo.png',
          data: {},
        };
    }
  }

  /**
   * Send subscription to the backend. Delegates to notificationsService which
   * handles auth + base URL via apiService. The `_subscription` arg is unused
   * here (the server reads the full subscription from the call) but kept for
   * signature parity with `removeSubscriptionFromServer`.
   */
  private async sendSubscriptionToServer(
    subscription: PushSubscription
  ): Promise<void> {
    try {
      await notificationsService.registerPushSubscription(subscription);
    } catch (error) {
      console.error('Failed to send subscription to server:', error);
    }
  }

  /**
   * Remove subscription from server. The backend unsubscribe route deactivates
   * every active web token for the user rather than matching by endpoint, so
   * the `_subscription` arg is intentionally ignored.
   */
  private async removeSubscriptionFromServer(
    _subscription: PushSubscription
  ): Promise<void> {
    try {
      await notificationsService.unregisterPushSubscription();
    } catch (error) {
      console.error('Failed to remove subscription from server:', error);
    }
  }

  /**
   * Convert base64 string to Uint8Array for VAPID keys
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  /**
   * Test notification (for debugging)
   */
  public async testNotification(): Promise<void> {
    await this.showNotification({
      title: '🧪 Test Notification',
      body: 'This is a test notification from BoomCard',
      icon: '/logo.png',
      requireInteraction: false,
      actions: [
        { action: 'ok', title: 'OK' },
        { action: 'cancel', title: 'Cancel' },
      ],
    });
  }

  /**
   * Schedule a notification (mock implementation)
   */
  public scheduleNotification(
    options: PushNotificationOptions,
    delay: number
  ): number {
    const timeoutId = window.setTimeout(() => {
      this.showNotification(options);
    }, delay);

    return timeoutId;
  }

  /**
   * Cancel scheduled notification
   */
  public cancelScheduledNotification(timeoutId: number): void {
    window.clearTimeout(timeoutId);
  }
}

// Export singleton instance
export const pushNotificationService = PushNotificationService.getInstance();

// Convenience functions
export const requestNotificationPermission = () =>
  pushNotificationService.requestPermission();

export const subscribeToPushNotifications = () =>
  pushNotificationService.subscribe();

export const unsubscribeFromPushNotifications = () =>
  pushNotificationService.unsubscribe();

export const showNotification = (options: PushNotificationOptions) =>
  pushNotificationService.showNotification(options);

export const showTemplateNotification = (template: NotificationTemplate) =>
  pushNotificationService.showTemplateNotification(template);

export default pushNotificationService;
