/**
 * Google Analytics 4 with SEO Event Tracking
 * Tracks user interactions that affect SEO performance
 */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

/**
 * Initialize Google Analytics 4
 */
export function initGA4(measurementId: string) {
  if (typeof window === 'undefined') return;

  // Create gtag script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer!.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: true,
    cookie_flags: 'SameSite=None;Secure',
  });

  console.log('✅ Google Analytics 4 initialized:', measurementId);
}

/**
 * Track page view (for SPA navigation)
 */
export function trackPageView(path: string, title?: string) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title || document.title,
    page_location: window.location.href,
  });
}

/**
 * Track search queries (important for SEO)
 */
export function trackSearch(searchTerm: string, results: number) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'search', {
    search_term: searchTerm,
    search_results: results,
    event_category: 'SEO',
    event_label: 'Site Search',
  });
}

/**
 * Track outbound links (backlink opportunities)
 */
export function trackOutboundLink(url: string, label?: string) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'click', {
    event_category: 'Outbound Link',
    event_label: label || url,
    value: url,
    transport_type: 'beacon',
  });
}

/**
 * Track file downloads
 */
export function trackDownload(fileName: string, fileType: string) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'file_download', {
    file_name: fileName,
    file_extension: fileType,
    link_url: fileName,
  });
}

/**
 * Track social shares (important for backlinks)
 */
export function trackSocialShare(platform: string, url: string) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'share', {
    method: platform,
    content_type: 'page',
    item_id: url,
    event_category: 'Social',
    event_label: `Share on ${platform}`,
  });
}

/**
 * Track form submissions
 */
export function trackFormSubmission(formName: string, success: boolean) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'form_submit', {
    form_name: formName,
    form_success: success,
    event_category: 'Forms',
  });
}

/**
 * Track video engagement
 */
export function trackVideoPlay(videoTitle: string, videoUrl: string) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'video_start', {
    video_title: videoTitle,
    video_url: videoUrl,
    event_category: 'Video',
  });
}

/**
 * Track scroll depth (engagement metric)
 */
export function trackScrollDepth(depth: number) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'scroll', {
    percent_scrolled: depth,
    event_category: 'Engagement',
    non_interaction: true,
  });
}

/**
 * Initialize scroll depth tracking
 */
export function initScrollTracking() {
  if (typeof window === 'undefined') return;

  let tracked = { 25: false, 50: false, 75: false, 100: false };

  window.addEventListener('scroll', () => {
    const scrollPercent =
      ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100;

    Object.keys(tracked).forEach((threshold) => {
      const num = parseInt(threshold);
      if (scrollPercent >= num && !tracked[num as keyof typeof tracked]) {
        tracked[num as keyof typeof tracked] = true;
        trackScrollDepth(num);
      }
    });
  });
}

/**
 * Track 404 errors (important for SEO health)
 */
export function track404(path: string) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'page_404', {
    page_path: path,
    page_location: window.location.href,
    event_category: 'SEO',
    event_label: '404 Error',
  });
}

/**
 * Track site speed (Core Web Vitals affect SEO)
 */
export function trackSiteSpeed(metric: string, value: number) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', 'timing_complete', {
    name: metric,
    value: Math.round(value),
    event_category: 'Web Vitals',
  });
}

/**
 * Track conversion events
 */
export function trackConversion(eventName: string, value?: number, currency?: string) {
  if (typeof window === 'undefined' || !window.gtag) return;

  window.gtag('event', eventName, {
    value: value,
    currency: currency || 'BGN',
    event_category: 'Conversions',
  });
}
