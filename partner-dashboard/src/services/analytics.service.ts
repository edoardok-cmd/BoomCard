/**
 * Analytics Service
 *
 * Comprehensive analytics tracking service supporting:
 * - Google Analytics 4 (GA4)
 * - Custom backend analytics
 * - User behavior tracking
 * - Conversion tracking
 * - Performance monitoring
 */

import { apiService } from './api.service';

// Analytics event types
export type EventCategory =
  | 'page_view'
  | 'user_action'
  | 'engagement'
  | 'conversion'
  | 'error'
  | 'performance';

export type EventAction =
  | 'view'
  | 'click'
  | 'submit'
  | 'search'
  | 'filter'
  | 'share'
  | 'favorite'
  | 'book'
  | 'redeem'
  | 'upload'
  | 'download'
  | 'expand'
  | 'collapse';

export interface AnalyticsEvent {
  category: EventCategory;
  action: EventAction;
  label?: string;
  value?: number;
  timestamp?: number;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface PageViewEvent {
  page: string;
  title: string;
  referrer?: string;
  duration?: number;
  scrollDepth?: number;
}

export interface ConversionEvent {
  type: 'booking' | 'redemption' | 'signup' | 'subscription';
  value: number;
  currency?: string;
  offerId?: string;
  venueId?: string;
}

export interface UserBehavior {
  userId?: string;
  sessionId: string;
  events: AnalyticsEvent[];
  pageViews: PageViewEvent[];
  conversions: ConversionEvent[];
  startTime: number;
  endTime?: number;
}

export interface AnalyticsMetrics {
  pageViews: number;
  uniqueVisitors: number;
  averageSessionDuration: number;
  bounceRate: number;
  conversionRate: number;
  topPages: Array<{ page: string; views: number }>;
  topActions: Array<{ action: string; count: number }>;
  deviceBreakdown: { mobile: number; tablet: number; desktop: number };
  browserBreakdown: Record<string, number>;
}

export interface PartnerAnalytics {
  partnerId: string;
  totalViews: number;
  uniqueVisitors: number;
  offerViews: number;
  offerRedemptions: number;
  conversionRate: number;
  revenue: number;
  averageRating: number;
  totalReviews: number;
  favoriteCount: number;
  clickThroughRate: number;
  timeRange: { start: string; end: string };
}

export interface OfferAnalytics {
  offerId: string;
  views: number;
  clicks: number;
  redemptions: number;
  conversionRate: number;
  revenue: number;
  averageValue: number;
  popularTimes: Array<{ hour: number; count: number }>;
  deviceBreakdown: { mobile: number; tablet: number; desktop: number };
}

export interface VenueAnalytics {
  venueId: string;
  views: number;
  uniqueVisitors: number;
  directionsClicked: number;
  phoneClicked: number;
  websiteClicked: number;
  photosViewed: number;
  reviewsRead: number;
  offersViewed: number;
  bookings: number;
}

class AnalyticsService {
  private sessionId: string;
  private userId?: string;
  private isEnabled: boolean = true;
  private queue: AnalyticsEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private pageStartTime: number = Date.now();

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeGA4();
    this.startQueueProcessor();
    this.setupPageViewTracking();
    this.setupPerformanceTracking();
  }

  /**
   * Initialize Google Analytics 4
   */
  private initializeGA4(): void {
    const GA4_MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID;

    if (!GA4_MEASUREMENT_ID) {
      console.warn('GA4 Measurement ID not found. Analytics will only use backend tracking.');
      return;
    }

    // Load GA4 script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    // Initialize gtag
    (window as any).dataLayer = (window as any).dataLayer || [];
    function gtag(...args: any[]) {
      (window as any).dataLayer.push(args);
    }
    (window as any).gtag = gtag;

    gtag('js', new Date());
    gtag('config', GA4_MEASUREMENT_ID, {
      send_page_view: false, // We'll handle page views manually
    });
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set user ID for tracking
   */
  setUserId(userId: string): void {
    this.userId = userId;

    // Update GA4 user ID
    if ((window as any).gtag) {
      (window as any).gtag('set', { user_id: userId });
    }
  }

  /**
   * Enable or disable analytics
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;

    // Update GA4
    if ((window as any).gtag) {
      (window as any).gtag('consent', 'update', {
        analytics_storage: enabled ? 'granted' : 'denied',
      });
    }
  }

  /**
   * Track page view
   */
  trackPageView(page: string, title: string, referrer?: string): void {
    if (!this.isEnabled) return;

    const pageView: PageViewEvent = {
      page,
      title,
      referrer: referrer || document.referrer,
      duration: Date.now() - this.pageStartTime,
    };

    // Reset page start time
    this.pageStartTime = Date.now();

    // Track in GA4
    if ((window as any).gtag) {
      (window as any).gtag('event', 'page_view', {
        page_path: page,
        page_title: title,
        page_referrer: referrer,
      });
    }

    // Track in backend
    this.trackEvent({
      category: 'page_view',
      action: 'view',
      label: page,
      metadata: pageView,
    });
  }

  /**
   * Track custom event
   */
  trackEvent(event: AnalyticsEvent): void {
    if (!this.isEnabled) return;

    // Add session and user info
    const enrichedEvent: AnalyticsEvent = {
      ...event,
      timestamp: event.timestamp || Date.now(),
      userId: event.userId || this.userId,
      sessionId: event.sessionId || this.sessionId,
    };

    // Track in GA4
    if ((window as any).gtag) {
      (window as any).gtag('event', event.action, {
        event_category: event.category,
        event_label: event.label,
        value: event.value,
        ...event.metadata,
      });
    }

    // Add to queue for backend tracking
    this.queue.push(enrichedEvent);
  }

  /**
   * Track user action
   */
  trackAction(action: EventAction, label: string, value?: number, metadata?: Record<string, any>): void {
    this.trackEvent({
      category: 'user_action',
      action,
      label,
      value,
      metadata,
    });
  }

  /**
   * Track conversion
   */
  trackConversion(conversion: ConversionEvent): void {
    if (!this.isEnabled) return;

    // Track in GA4
    if ((window as any).gtag) {
      (window as any).gtag('event', 'conversion', {
        transaction_id: `${conversion.type}-${Date.now()}`,
        value: conversion.value,
        currency: conversion.currency || 'BGN',
        ...conversion,
      });
    }

    // Track in backend
    this.trackEvent({
      category: 'conversion',
      action: 'book',
      label: conversion.type,
      value: conversion.value,
      metadata: conversion,
    });
  }

  /**
   * Track search
   */
  trackSearch(query: string, resultCount: number, filters?: Record<string, any>): void {
    this.trackAction('search', query, resultCount, { filters });
  }

  /**
   * Track offer view
   */
  trackOfferView(offerId: string, offerTitle: string): void {
    this.trackAction('view', 'offer', undefined, { offerId, offerTitle });
  }

  /**
   * Track offer redemption
   */
  trackOfferRedemption(offerId: string, value: number): void {
    this.trackConversion({
      type: 'redemption',
      value,
      offerId,
    });
  }

  /**
   * Track venue view
   */
  trackVenueView(venueId: string, venueName: string): void {
    this.trackAction('view', 'venue', undefined, { venueId, venueName });
  }

  /**
   * Track booking
   */
  trackBooking(venueId: string, offerId: string, value: number): void {
    this.trackConversion({
      type: 'booking',
      value,
      venueId,
      offerId,
    });
  }

  /**
   * Track error
   */
  trackError(error: Error, context?: string): void {
    this.trackEvent({
      category: 'error',
      action: 'submit',
      label: error.message,
      metadata: {
        stack: error.stack,
        context,
      },
    });
  }

  /**
   * Track performance metric
   */
  trackPerformance(metric: string, value: number, metadata?: Record<string, any>): void {
    this.trackEvent({
      category: 'performance',
      action: 'view',
      label: metric,
      value,
      metadata,
    });
  }

  /**
   * Setup automatic page view tracking
   */
  private setupPageViewTracking(): void {
    // Track initial page view
    this.trackPageView(window.location.pathname, document.title);

    // Track scroll depth
    let maxScrollDepth = 0;
    const trackScroll = () => {
      const scrollDepth = Math.round(
        ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100
      );

      if (scrollDepth > maxScrollDepth) {
        maxScrollDepth = scrollDepth;

        // Track milestone scroll depths
        if ([25, 50, 75, 100].includes(scrollDepth)) {
          this.trackAction('scroll', `${scrollDepth}%`);
        }
      }
    };

    window.addEventListener('scroll', trackScroll, { passive: true });
  }

  /**
   * Setup performance tracking
   */
  private setupPerformanceTracking(): void {
    // Track page load time
    window.addEventListener('load', () => {
      setTimeout(() => {
        if (window.performance && window.performance.timing) {
          const timing = window.performance.timing;
          const loadTime = timing.loadEventEnd - timing.navigationStart;
          const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
          const firstPaint = timing.responseStart - timing.navigationStart;

          this.trackPerformance('page_load', loadTime, { domReady, firstPaint });
        }
      }, 0);
    });

    // Track Core Web Vitals (if available)
    if ('PerformanceObserver' in window) {
      try {
        // Largest Contentful Paint (LCP)
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.trackPerformance('lcp', lastEntry.startTime);
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // First Input Delay (FID)
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            this.trackPerformance('fid', entry.processingStart - entry.startTime);
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

        // Cumulative Layout Shift (CLS)
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
            }
          }
          this.trackPerformance('cls', clsValue);
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        console.warn('Performance observers not fully supported:', e);
      }
    }
  }

  /**
   * Start queue processor to batch send events
   */
  private startQueueProcessor(): void {
    // Flush queue every 10 seconds
    this.flushInterval = setInterval(() => {
      this.flushQueue();
    }, 10000);

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flushQueue();
    });

    // Flush on visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.flushQueue();
      }
    });
  }

  /**
   * Flush event queue to backend
   */
  private async flushQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    try {
      await apiService.post('/analytics/events', { events });
    } catch (error) {
      console.error('Failed to send analytics events:', error);
      // Re-add events to queue on failure (up to a limit)
      if (this.queue.length < 100) {
        this.queue.unshift(...events);
      }
    }
  }

  /**
   * Get analytics metrics
   */
  async getMetrics(startDate: string, endDate: string): Promise<AnalyticsMetrics> {
    const response = await apiService.get<AnalyticsMetrics>('/analytics/metrics', {
      startDate,
      endDate,
    });
    return response;
  }

  /**
   * Get partner analytics
   */
  async getPartnerAnalytics(partnerId: string, startDate: string, endDate: string): Promise<PartnerAnalytics> {
    const response = await apiService.get<PartnerAnalytics>(`/analytics/partners/${partnerId}`, {
      startDate,
      endDate,
    });
    return response;
  }

  /**
   * Get offer analytics
   */
  async getOfferAnalytics(offerId: string, startDate: string, endDate: string): Promise<OfferAnalytics> {
    const response = await apiService.get<OfferAnalytics>(`/analytics/offers/${offerId}`, {
      startDate,
      endDate,
    });
    return response;
  }

  /**
   * Get venue analytics
   */
  async getVenueAnalytics(venueId: string, startDate: string, endDate: string): Promise<VenueAnalytics> {
    const response = await apiService.get<VenueAnalytics>(`/analytics/venues/${venueId}`, {
      startDate,
      endDate,
    });
    return response;
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(startDate: string, endDate: string, format: 'csv' | 'json' | 'pdf' = 'csv'): Promise<Blob> {
    const response = await apiService.get<Blob>('/analytics/export', {
      startDate,
      endDate,
      format,
    }, {
      responseType: 'blob',
    });
    return response;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushQueue();
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
export default analyticsService;
