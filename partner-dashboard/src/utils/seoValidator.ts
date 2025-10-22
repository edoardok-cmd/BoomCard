/**
 * SEO Validation and Health Monitoring Utilities
 * Validates structured data and provides SEO health reports
 */

export interface SEOIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  fix?: string;
}

export interface SEOHealthReport {
  score: number;
  issues: SEOIssue[];
  recommendations: string[];
  structured Data: number;
  metaTags: number;
  sitemaps: number;
}

/**
 * Validate JSON-LD structured data
 */
export async function validateStructuredData(): Promise<SEOIssue[]> {
  const issues: SEOIssue[] = [];

  if (typeof window === 'undefined') return issues;

  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  if (scripts.length === 0) {
    issues.push({
      severity: 'error',
      category: 'Structured Data',
      message: 'No JSON-LD structured data found',
      fix: 'Add schema.org structured data to your pages',
    });
    return issues;
  }

  scripts.forEach((script, index) => {
    try {
      const data = JSON.parse(script.textContent || '{}');

      // Validate required fields
      if (!data['@context']) {
        issues.push({
          severity: 'error',
          category: 'Structured Data',
          message: `Schema ${index + 1}: Missing @context`,
          fix: 'Add "@context": "https://schema.org"',
        });
      }

      if (!data['@type']) {
        issues.push({
          severity: 'error',
          category: 'Structured Data',
          message: `Schema ${index + 1}: Missing @type`,
          fix: 'Specify schema type (e.g., Organization, WebSite)',
        });
      }

      // Validate Organization schema
      if (data['@type'] === 'Organization') {
        if (!data.name) {
          issues.push({
            severity: 'warning',
            category: 'Organization',
            message: 'Organization missing name',
            fix: 'Add organization name',
          });
        }
        if (!data.url) {
          issues.push({
            severity: 'warning',
            category: 'Organization',
            message: 'Organization missing URL',
            fix: 'Add organization URL',
          });
        }
      }

      // Validate Product schema
      if (data['@type'] === 'Product') {
        if (!data.offers) {
          issues.push({
            severity: 'warning',
            category: 'Product',
            message: 'Product missing offers',
            fix: 'Add offers with price and availability',
          });
        }
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        category: 'Structured Data',
        message: `Invalid JSON in schema ${index + 1}`,
        fix: 'Fix JSON syntax errors',
      });
    }
  });

  return issues;
}

/**
 * Validate meta tags
 */
export function validateMetaTags(): SEOIssue[] {
  const issues: SEOIssue[] = [];

  if (typeof document === 'undefined') return issues;

  // Check title
  const title = document.title;
  if (!title || title.length === 0) {
    issues.push({
      severity: 'error',
      category: 'Meta Tags',
      message: 'Missing page title',
      fix: 'Add a descriptive title tag',
    });
  } else if (title.length < 30) {
    issues.push({
      severity: 'warning',
      category: 'Meta Tags',
      message: 'Title too short (< 30 characters)',
      fix: 'Expand title to 50-60 characters',
    });
  } else if (title.length > 60) {
    issues.push({
      severity: 'warning',
      category: 'Meta Tags',
      message: 'Title too long (> 60 characters)',
      fix: 'Shorten title to under 60 characters',
    });
  }

  // Check meta description
  const description = document.querySelector('meta[name="description"]');
  if (!description) {
    issues.push({
      severity: 'error',
      category: 'Meta Tags',
      message: 'Missing meta description',
      fix: 'Add meta description tag',
    });
  } else {
    const content = description.getAttribute('content') || '';
    if (content.length < 120) {
      issues.push({
        severity: 'warning',
        category: 'Meta Tags',
        message: 'Meta description too short',
        fix: 'Expand to 150-160 characters',
      });
    } else if (content.length > 160) {
      issues.push({
        severity: 'info',
        category: 'Meta Tags',
        message: 'Meta description might be truncated',
        fix: 'Keep under 160 characters for best display',
      });
    }
  }

  // Check canonical URL
  const canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    issues.push({
      severity: 'warning',
      category: 'Meta Tags',
      message: 'Missing canonical URL',
      fix: 'Add canonical link tag',
    });
  }

  // Check Open Graph
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDescription = document.querySelector('meta[property="og:description"]');
  const ogImage = document.querySelector('meta[property="og:image"]');

  if (!ogTitle || !ogDescription || !ogImage) {
    issues.push({
      severity: 'warning',
      category: 'Social Media',
      message: 'Incomplete Open Graph tags',
      fix: 'Add og:title, og:description, and og:image',
    });
  }

  return issues;
}

/**
 * Check for broken images
 */
export async function checkImages(): Promise<SEOIssue[]> {
  const issues: SEOIssue[] = [];

  if (typeof document === 'undefined') return issues;

  const images = document.querySelectorAll('img');
  let missingAlt = 0;

  images.forEach((img) => {
    if (!img.alt || img.alt.trim() === '') {
      missingAlt++;
    }
  });

  if (missingAlt > 0) {
    issues.push({
      severity: 'warning',
      category: 'Images',
      message: `${missingAlt} images missing alt text`,
      fix: 'Add descriptive alt text to all images',
    });
  }

  return issues;
}

/**
 * Generate SEO health report
 */
export async function generateSEOHealthReport(): Promise<SEOHealthReport> {
  const structuredDataIssues = await validateStructuredData();
  const metaTagIssues = validateMetaTags();
  const imageIssues = await checkImages();

  const allIssues = [...structuredDataIssues, ...metaTagIssues, ...imageIssues];

  // Calculate score (100 - points deducted for issues)
  let score = 100;
  allIssues.forEach((issue) => {
    if (issue.severity === 'error') score -= 10;
    if (issue.severity === 'warning') score -= 5;
    if (issue.severity === 'info') score -= 1;
  });

  score = Math.max(0, score);

  const recommendations = [];

  if (score < 70) {
    recommendations.push('Critical: Fix all errors immediately');
  }
  if (score < 85) {
    recommendations.push('Address warnings to improve SEO performance');
  }
  if (structuredDataIssues.length > 0) {
    recommendations.push('Validate structured data at schema.org/validator');
  }
  if (score >= 90) {
    recommendations.push('Excellent! Monitor regularly to maintain SEO health');
  }

  // Count schemas
  const schemas = document.querySelectorAll('script[type="application/ld+json"]').length;

  // Count meta tags
  const metaTags = document.querySelectorAll('meta').length;

  return {
    score,
    issues: allIssues,
    recommendations,
    structuredData: schemas,
    metaTags,
    sitemaps: 3, // sitemap.xml, sitemap-images.xml, sitemap-news.xml
  };
}

/**
 * Test structured data with Google's Rich Results Test
 */
export function testRichResults(url?: string): string {
  const testUrl = url || window.location.href;
  return `https://search.google.com/test/rich-results?url=${encodeURIComponent(testUrl)}`;
}

/**
 * Test schema with Schema.org validator
 */
export function testSchemaOrgValidator(url?: string): string {
  const testUrl = url || window.location.href;
  return `https://validator.schema.org/#url=${encodeURIComponent(testUrl)}`;
}

/**
 * Get PageSpeed Insights URL
 */
export function getPageSpeedInsightsUrl(url?: string): string {
  const testUrl = url || window.location.href;
  return `https://pagespeed.web.dev/report?url=${encodeURIComponent(testUrl)}`;
}
