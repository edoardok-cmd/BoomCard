/**
 * Analytics Hooks
 *
 * React hooks for integrating analytics tracking into components
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import analyticsService, {
  EventAction,
  ConversionEvent,
  PartnerAnalytics,
  OfferAnalytics,
  VenueAnalytics,
  AnalyticsMetrics,
} from '../services/analytics.service';

/**
 * Hook to automatically track page views
 * Use this in your main App component or layout
 */
export function usePageTracking() {
  const location = useLocation();
  const previousPath = useRef<string>('');

  useEffect(() => {
    // Only track if path actually changed
    if (location.pathname !== previousPath.current) {
      previousPath.current = location.pathname;

      // Get page title from document
      const title = document.title;

      // Track page view
      analyticsService.trackPageView(location.pathname, title);
    }
  }, [location]);
}

/**
 * Hook to track custom events
 * Returns a function to track events
 */
export function useTrackEvent() {
  return useCallback((action: EventAction, label: string, value?: number, metadata?: Record<string, any>) => {
    analyticsService.trackAction(action, label, value, metadata);
  }, []);
}

/**
 * Hook to track clicks
 * Returns a function that tracks click and executes callback
 */
export function useTrackClick(label: string, callback?: () => void) {
  const trackEvent = useTrackEvent();

  return useCallback(() => {
    trackEvent('click', label);
    callback?.();
  }, [trackEvent, label, callback]);
}

/**
 * Hook to track element visibility
 * Tracks when an element becomes visible in viewport
 */
export function useTrackVisibility(label: string, threshold = 0.5) {
  const trackEvent = useTrackEvent();
  const hasTracked = useRef(false);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || hasTracked.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasTracked.current) {
            trackEvent('view', label);
            hasTracked.current = true;
            observer.disconnect();
          }
        });
      },
      { threshold }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [label, threshold, trackEvent]);

  return elementRef;
}

/**
 * Hook to track search
 */
export function useTrackSearch() {
  return useCallback((query: string, resultCount: number, filters?: Record<string, any>) => {
    analyticsService.trackSearch(query, resultCount, filters);
  }, []);
}

/**
 * Hook to track offer views
 */
export function useTrackOfferView(offerId?: string, offerTitle?: string) {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (offerId && offerTitle && !hasTracked.current) {
      analyticsService.trackOfferView(offerId, offerTitle);
      hasTracked.current = true;
    }
  }, [offerId, offerTitle]);
}

/**
 * Hook to track offer redemption
 */
export function useTrackOfferRedemption() {
  return useCallback((offerId: string, value: number) => {
    analyticsService.trackOfferRedemption(offerId, value);
  }, []);
}

/**
 * Hook to track venue views
 */
export function useTrackVenueView(venueId?: string, venueName?: string) {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (venueId && venueName && !hasTracked.current) {
      analyticsService.trackVenueView(venueId, venueName);
      hasTracked.current = true;
    }
  }, [venueId, venueName]);
}

/**
 * Hook to track bookings
 */
export function useTrackBooking() {
  return useCallback((venueId: string, offerId: string, value: number) => {
    analyticsService.trackBooking(venueId, offerId, value);
  }, []);
}

/**
 * Hook to track conversions
 */
export function useTrackConversion() {
  return useCallback((conversion: ConversionEvent) => {
    analyticsService.trackConversion(conversion);
  }, []);
}

/**
 * Hook to track errors
 */
export function useTrackError() {
  return useCallback((error: Error, context?: string) => {
    analyticsService.trackError(error, context);
  }, []);
}

/**
 * Hook to track form submissions
 */
export function useTrackForm(formName: string) {
  const trackEvent = useTrackEvent();

  const trackFormStart = useCallback(() => {
    trackEvent('view', `form_start_${formName}`);
  }, [trackEvent, formName]);

  const trackFormSubmit = useCallback((success: boolean, errorMessage?: string) => {
    trackEvent('submit', `form_${success ? 'success' : 'error'}_${formName}`, undefined, {
      success,
      errorMessage,
    });
  }, [trackEvent, formName]);

  const trackFieldFocus = useCallback((fieldName: string) => {
    trackEvent('click', `field_focus_${formName}_${fieldName}`);
  }, [trackEvent, formName]);

  return {
    trackFormStart,
    trackFormSubmit,
    trackFieldFocus,
  };
}

/**
 * Hook to track video/media interactions
 */
export function useTrackMedia(mediaType: 'video' | 'audio' | 'image', mediaId: string) {
  const trackEvent = useTrackEvent();

  const trackPlay = useCallback(() => {
    trackEvent('click', `${mediaType}_play`, undefined, { mediaId });
  }, [trackEvent, mediaType, mediaId]);

  const trackPause = useCallback(() => {
    trackEvent('click', `${mediaType}_pause`, undefined, { mediaId });
  }, [trackEvent, mediaType, mediaId]);

  const trackComplete = useCallback(() => {
    trackEvent('view', `${mediaType}_complete`, undefined, { mediaId });
  }, [trackEvent, mediaType, mediaId]);

  const trackProgress = useCallback((percentage: number) => {
    if ([25, 50, 75, 100].includes(Math.round(percentage))) {
      trackEvent('view', `${mediaType}_progress_${Math.round(percentage)}`, undefined, { mediaId });
    }
  }, [trackEvent, mediaType, mediaId]);

  return {
    trackPlay,
    trackPause,
    trackComplete,
    trackProgress,
  };
}

/**
 * Hook to track filter changes
 */
export function useTrackFilters() {
  const trackEvent = useTrackEvent();

  return useCallback((filters: Record<string, any>) => {
    trackEvent('filter', 'apply', undefined, { filters });
  }, [trackEvent]);
}

/**
 * Hook to track social shares
 */
export function useTrackShare() {
  const trackEvent = useTrackEvent();

  return useCallback((platform: string, contentType: string, contentId: string) => {
    trackEvent('share', `${platform}_${contentType}`, undefined, { contentId });
  }, [trackEvent]);
}

/**
 * Hook to track downloads
 */
export function useTrackDownload() {
  const trackEvent = useTrackEvent();

  return useCallback((fileName: string, fileType: string) => {
    trackEvent('download', fileName, undefined, { fileType });
  }, [trackEvent]);
}

/**
 * Hook to get analytics metrics
 */
export function useAnalyticsMetrics(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['analytics', 'metrics', startDate, endDate],
    queryFn: () => analyticsService.getMetrics(startDate, endDate),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!startDate && !!endDate,
  });
}

/**
 * Hook to get partner analytics
 */
export function usePartnerAnalytics(partnerId: string | undefined, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['analytics', 'partner', partnerId, startDate, endDate],
    queryFn: () => analyticsService.getPartnerAnalytics(partnerId!, startDate, endDate),
    staleTime: 5 * 60 * 1000,
    enabled: !!partnerId && !!startDate && !!endDate,
  });
}

/**
 * Hook to get offer analytics
 */
export function useOfferAnalytics(offerId: string | undefined, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['analytics', 'offer', offerId, startDate, endDate],
    queryFn: () => analyticsService.getOfferAnalytics(offerId!, startDate, endDate),
    staleTime: 5 * 60 * 1000,
    enabled: !!offerId && !!startDate && !!endDate,
  });
}

/**
 * Hook to get venue analytics
 */
export function useVenueAnalytics(venueId: string | undefined, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['analytics', 'venue', venueId, startDate, endDate],
    queryFn: () => analyticsService.getVenueAnalytics(venueId!, startDate, endDate),
    staleTime: 5 * 60 * 1000,
    enabled: !!venueId && !!startDate && !!endDate,
  });
}

/**
 * Hook for A/B testing
 * Automatically tracks variant assignment
 */
export function useABTest(testName: string, variants: string[]) {
  const trackEvent = useTrackEvent();
  const [assignedVariant, setAssignedVariant] = useState<string | null>(null);

  useEffect(() => {
    if (!assignedVariant) {
      // Simple random assignment (in production, use proper A/B testing service)
      const variant = variants[Math.floor(Math.random() * variants.length)];
      setAssignedVariant(variant);

      // Track variant assignment
      trackEvent('view', `ab_test_${testName}`, undefined, {
        variant,
      });
    }
  }, [testName, variants, trackEvent, assignedVariant]);

  const trackConversion = useCallback(() => {
    trackEvent('submit', `ab_conversion_${testName}`, undefined, {
      variant: assignedVariant,
    });
  }, [testName, trackEvent, assignedVariant]);

  return {
    variant: assignedVariant,
    trackConversion,
  };
}

/**
 * Hook to track time spent on page
 */
export function useTrackTimeOnPage(pageName: string) {
  const trackEvent = useTrackEvent();
  const startTime = useRef(Date.now());

  useEffect(() => {
    return () => {
      const timeSpent = Date.now() - startTime.current;
      trackEvent('view', `time_on_page_${pageName}`, timeSpent);
    };
  }, [pageName, trackEvent]);
}

/**
 * Hook to track session duration
 */
export function useTrackSession() {
  const trackEvent = useTrackEvent();
  const sessionStart = useRef(Date.now());

  useEffect(() => {
    const trackSessionEnd = () => {
      const duration = Date.now() - sessionStart.current;
      trackEvent('view', 'session_end', duration);
    };

    window.addEventListener('beforeunload', trackSessionEnd);

    return () => {
      window.removeEventListener('beforeunload', trackSessionEnd);
      trackSessionEnd();
    };
  }, [trackEvent]);
}

/**
 * Hook to track user engagement
 * Tracks various engagement metrics automatically
 */
export function useTrackEngagement() {
  const trackEvent = useTrackEvent();
  const lastInteraction = useRef(Date.now());
  const isEngaged = useRef(true);

  useEffect(() => {
    const trackInteraction = () => {
      const now = Date.now();
      const timeSinceLastInteraction = now - lastInteraction.current;

      // User was idle for > 30 seconds, now active again
      if (timeSinceLastInteraction > 30000 && !isEngaged.current) {
        trackEvent('engagement', 're_engaged');
        isEngaged.current = true;
      }

      lastInteraction.current = now;
    };

    const checkIdle = () => {
      const now = Date.now();
      const timeSinceLastInteraction = now - lastInteraction.current;

      // User idle for > 30 seconds
      if (timeSinceLastInteraction > 30000 && isEngaged.current) {
        trackEvent('engagement', 'idle');
        isEngaged.current = false;
      }
    };

    // Track interactions
    window.addEventListener('click', trackInteraction);
    window.addEventListener('scroll', trackInteraction);
    window.addEventListener('keypress', trackInteraction);
    window.addEventListener('mousemove', trackInteraction);

    // Check for idle every 10 seconds
    const idleInterval = setInterval(checkIdle, 10000);

    return () => {
      window.removeEventListener('click', trackInteraction);
      window.removeEventListener('scroll', trackInteraction);
      window.removeEventListener('keypress', trackInteraction);
      window.removeEventListener('mousemove', trackInteraction);
      clearInterval(idleInterval);
    };
  }, [trackEvent]);
}

export default {
  usePageTracking,
  useTrackEvent,
  useTrackClick,
  useTrackVisibility,
  useTrackSearch,
  useTrackOfferView,
  useTrackOfferRedemption,
  useTrackVenueView,
  useTrackBooking,
  useTrackConversion,
  useTrackError,
  useTrackForm,
  useTrackMedia,
  useTrackFilters,
  useTrackShare,
  useTrackDownload,
  useAnalyticsMetrics,
  usePartnerAnalytics,
  useOfferAnalytics,
  useVenueAnalytics,
  useABTest,
  useTrackTimeOnPage,
  useTrackSession,
  useTrackEngagement,
};
