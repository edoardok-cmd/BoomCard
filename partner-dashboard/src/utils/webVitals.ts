/**
 * Core Web Vitals monitoring for SEO
 * Tracks performance metrics that affect Google rankings
 */

// Core Web Vitals thresholds (Google's standards)
const WEB_VITALS_THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 }, // Largest Contentful Paint
  INP: { good: 200, needsImprovement: 500 },   // Interaction to Next Paint (replaces FID)
  CLS: { good: 0.1, needsImprovement: 0.25 },  // Cumulative Layout Shift
  FCP: { good: 1800, needsImprovement: 3000 }, // First Contentful Paint
  TTFB: { good: 800, needsImprovement: 1800 }, // Time to First Byte
};

export interface WebVitalMetric {
  name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType?: string;
}

/**
 * Get rating based on thresholds
 */
function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = WEB_VITALS_THRESHOLDS[name as keyof typeof WEB_VITALS_THRESHOLDS];
  if (!threshold) return 'good';

  if (value <= threshold.good) return 'good';
  if (value <= threshold.needsImprovement) return 'needs-improvement';
  return 'poor';
}

/**
 * Report Web Vital to analytics
 */
function reportWebVital(metric: WebVitalMetric) {
  console.log('📊 Web Vital:', {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
  });

  // Send to Google Analytics 4 if available
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', metric.name, {
      event_category: 'Web Vitals',
      value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      event_label: metric.id,
      non_interaction: true,
    });
  }

  // Send to custom analytics endpoint
  if (process.env.NODE_ENV === 'production') {
    try {
      navigator.sendBeacon?.(
        '/api/analytics/web-vitals',
        JSON.stringify({
          metric: metric.name,
          value: metric.value,
          rating: metric.rating,
          page: window.location.pathname,
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.error('Failed to report web vital:', error);
    }
  }
}

/**
 * Initialize Web Vitals monitoring
 */
export async function initWebVitals() {
  if (typeof window === 'undefined') return;

  try {
    // Dynamically import web-vitals library
    const { onCLS, onLCP, onFCP, onTTFB, onINP } = await import('web-vitals');

    // Monitor Cumulative Layout Shift
    onCLS((metric: any) => {
      reportWebVital({
        ...metric,
        rating: getRating('CLS', metric.value),
      });
    });

    // Monitor Largest Contentful Paint
    onLCP((metric: any) => {
      reportWebVital({
        ...metric,
        rating: getRating('LCP', metric.value),
      });
    });

    // Monitor First Contentful Paint
    onFCP((metric: any) => {
      reportWebVital({
        ...metric,
        rating: getRating('FCP', metric.value),
      });
    });

    // Monitor Time to First Byte
    onTTFB((metric: any) => {
      reportWebVital({
        ...metric,
        rating: getRating('TTFB', metric.value),
      });
    });

    // Monitor Interaction to Next Paint (replaces FID in web-vitals v3+)
    onINP((metric: any) => {
      reportWebVital({
        ...metric,
        rating: getRating('INP', metric.value),
      });
    });

    console.log('✅ Web Vitals monitoring initialized');
  } catch (error) {
    console.warn('Web Vitals library not available:', error);
  }
}

/**
 * Get current Web Vitals summary
 */
export function getWebVitalsSummary(): string {
  const vitals = [
    { name: 'LCP', desc: 'Largest Contentful Paint', threshold: '< 2.5s' },
    { name: 'INP', desc: 'Interaction to Next Paint', threshold: '< 200ms' },
    { name: 'CLS', desc: 'Cumulative Layout Shift', threshold: '< 0.1' },
    { name: 'FCP', desc: 'First Contentful Paint', threshold: '< 1.8s' },
    { name: 'TTFB', desc: 'Time to First Byte', threshold: '< 800ms' },
  ];

  return vitals.map(v => `${v.name}: ${v.desc} (Target: ${v.threshold})`).join('\n');
}

/**
 * Performance observer for navigation timing
 */
export function observeNavigationTiming() {
  if (typeof window === 'undefined' || !window.performance) return;

  window.addEventListener('load', () => {
    const perfData = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

    if (perfData) {
      const metrics = {
        'DNS Lookup': perfData.domainLookupEnd - perfData.domainLookupStart,
        'TCP Connection': perfData.connectEnd - perfData.connectStart,
        'Request Time': perfData.responseStart - perfData.requestStart,
        'Response Time': perfData.responseEnd - perfData.responseStart,
        'DOM Processing': perfData.domComplete - perfData.domInteractive,
        'Load Complete': perfData.loadEventEnd - perfData.loadEventStart,
      };

      console.log('📈 Navigation Timing:', metrics);
    }
  });
}

/**
 * Detect if page is served from cache
 */
export function detectCacheStatus(): void {
  if (typeof window === 'undefined' || !window.performance) return;

  const perfData = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

  if (perfData) {
    const cacheStatus = perfData.transferSize === 0 ? 'cache' : 'network';
    console.log('💾 Cache Status:', cacheStatus);

    if (cacheStatus === 'cache') {
      console.log('✅ Page loaded from cache - excellent for SEO!');
    }
  }
}
