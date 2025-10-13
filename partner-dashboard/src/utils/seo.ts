/**
 * SEO utility functions
 */

export interface SEOConfig {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'profile';
}

const DEFAULT_SEO: SEOConfig = {
  title: 'BoomCard - Digital Business Cards',
  description: 'Transform how you share your business identity with QR-powered digital cards. Connect with professionals instantly.',
  keywords: ['digital business cards', 'QR code', 'networking', 'professional', 'contact sharing'],
  image: '/og-image.png',
  type: 'website',
};

/**
 * Update document meta tags for SEO
 */
export const updateSEO = (config: SEOConfig = {}) => {
  const seo = { ...DEFAULT_SEO, ...config };

  // Update title
  document.title = seo.title || DEFAULT_SEO.title!;

  // Update or create meta tags
  const metaTags: Record<string, string> = {
    description: seo.description || '',
    keywords: seo.keywords?.join(', ') || '',
    'og:title': seo.title || '',
    'og:description': seo.description || '',
    'og:image': seo.image || '',
    'og:url': seo.url || window.location.href,
    'og:type': seo.type || 'website',
    'twitter:card': 'summary_large_image',
    'twitter:title': seo.title || '',
    'twitter:description': seo.description || '',
    'twitter:image': seo.image || '',
  };

  Object.entries(metaTags).forEach(([name, content]) => {
    if (!content) return;

    const property = name.startsWith('og:') ? 'property' : 'name';
    let element = document.querySelector(`meta[${property}="${name}"]`);

    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(property, name);
      document.head.appendChild(element);
    }

    element.setAttribute('content', content);
  });
};

/**
 * Generate structured data for rich snippets
 */
export const generateStructuredData = (type: 'Organization' | 'WebSite' | 'Person', data: any) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': type,
    ...data,
  };

  let script = document.querySelector('script[type="application/ld+json"]') as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(structuredData);
};

/**
 * Organization structured data
 */
export const addOrganizationSchema = () => {
  generateStructuredData('Organization', {
    name: 'BoomCard',
    url: window.location.origin,
    logo: `${window.location.origin}/logo.png`,
    description: 'Digital business card platform for modern professionals',
    sameAs: [
      // Add social media links
    ],
  });
};

/**
 * WebSite structured data
 */
export const addWebSiteSchema = () => {
  generateStructuredData('WebSite', {
    name: 'BoomCard',
    url: window.location.origin,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${window.location.origin}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  });
};

/**
 * Breadcrumb structured data
 */
export const generateBreadcrumbs = (items: Array<{ name: string; url: string }>) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${window.location.origin}${item.url}`,
    })),
  };

  let script = document.querySelector('script[data-type="breadcrumbs"]') as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-type', 'breadcrumbs');
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(structuredData);
};
