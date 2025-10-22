/**
 * SEO utility functions with bilingual support (Bulgarian/English)
 */

export interface SEOConfig {
  title?: string;
  titleBg?: string;
  description?: string;
  descriptionBg?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'profile';
  language?: 'bg' | 'en';
}

const DEFAULT_SEO_BG: SEOConfig = {
  title: 'BoomCard - Промоции, Изживявания, Карта за Намаления',
  description: 'Открийте ексклузивни оферти и топ изживявания с вашата BoomCard карта за намаления. Подарете си незабравими преживявания!',
  keywords: [
    'промоции', 'изживявания', 'карта за намаления', 'ексклузивни оферти',
    'подарък', 'топ изживявания', 'отстъпки', 'България', 'София',
    'Пловдив', 'Варна', 'промоции ресторанти', 'промоции хотели'
  ],
  image: '/og-image.png',
  type: 'website',
  language: 'bg',
};

const DEFAULT_SEO_EN: SEOConfig = {
  title: 'BoomCard - Promotions, Experiences, Discount Card',
  description: 'Discover exclusive offers and top experiences with your BoomCard discount card. Gift yourself unforgettable experiences!',
  keywords: [
    'promotions', 'experiences', 'discount card', 'exclusive offers',
    'gift', 'top experiences', 'discounts', 'Bulgaria', 'Sofia',
    'Plovdiv', 'Varna', 'restaurant promotions', 'hotel promotions'
  ],
  image: '/og-image.png',
  type: 'website',
  language: 'en',
};

const DEFAULT_SEO = DEFAULT_SEO_BG;

/**
 * Update document meta tags for SEO with bilingual support
 */
export const updateSEO = (config: SEOConfig = {}) => {
  const defaultSEO = config.language === 'en' ? DEFAULT_SEO_EN : DEFAULT_SEO_BG;
  const seo = { ...defaultSEO, ...config };

  // Update title
  document.title = seo.title || defaultSEO.title!;

  // Update HTML lang attribute
  document.documentElement.lang = seo.language || 'bg';

  // Update or create meta tags
  const metaTags: Record<string, string> = {
    description: seo.description || '',
    keywords: seo.keywords?.join(', ') || '',
    'og:title': seo.title || '',
    'og:description': seo.description || '',
    'og:image': seo.image || '',
    'og:url': seo.url || window.location.href,
    'og:type': seo.type || 'website',
    'og:locale': seo.language === 'en' ? 'en_US' : 'bg_BG',
    'twitter:card': 'summary_large_image',
    'twitter:title': seo.title || '',
    'twitter:description': seo.description || '',
    'twitter:image': seo.image || '',
  };

  Object.entries(metaTags).forEach(([name, content]) => {
    if (!content) return;

    const property = name.startsWith('og:') || name.startsWith('twitter:') ? 'property' : 'name';
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

/**
 * Offer/Promotion structured data
 */
export const generateOfferSchema = (offer: {
  name: string;
  description: string;
  discount?: number;
  originalPrice?: number;
  discountedPrice?: number;
  validUntil?: string;
  category?: string;
  image?: string;
}) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Offer',
    name: offer.name,
    description: offer.description,
    category: offer.category,
    image: offer.image,
    ...(offer.originalPrice && {
      price: offer.discountedPrice || offer.originalPrice,
      priceCurrency: 'BGN',
    }),
    ...(offer.validUntil && {
      priceValidUntil: offer.validUntil,
    }),
    ...(offer.discount && {
      eligibleQuantity: {
        '@type': 'QuantitativeValue',
        value: offer.discount,
        unitText: 'PERCENT',
      },
    }),
    availability: 'https://schema.org/InStock',
    seller: {
      '@type': 'Organization',
      name: 'BoomCard Bulgaria',
    },
  };

  let script = document.querySelector('script[data-type="offer"]') as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-type', 'offer');
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(structuredData);
};

/**
 * Local Business structured data
 */
export const generateLocalBusinessSchema = (business: {
  name: string;
  description?: string;
  image?: string;
  address?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  phone?: string;
  priceRange?: string;
  rating?: number;
  reviewCount?: number;
}) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    description: business.description,
    image: business.image,
    ...(business.address && {
      address: {
        '@type': 'PostalAddress',
        streetAddress: business.address.street,
        addressLocality: business.address.city,
        postalCode: business.address.postalCode,
        addressCountry: business.address.country,
      },
    }),
    ...(business.phone && { telephone: business.phone }),
    ...(business.priceRange && { priceRange: business.priceRange }),
    ...(business.rating && business.reviewCount && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: business.rating,
        reviewCount: business.reviewCount,
      },
    }),
  };

  let script = document.querySelector('script[data-type="local-business"]') as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-type', 'local-business');
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(structuredData);
};

/**
 * FAQ Page structured data
 */
export const generateFAQSchema = (faqs: Array<{ question: string; answer: string }>) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  let script = document.querySelector('script[data-type="faq"]') as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-type', 'faq');
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(structuredData);
};

/**
 * HowTo structured data
 */
export const generateHowToSchema = (howTo: {
  name: string;
  description: string;
  image?: string;
  totalTime?: string;
  steps: Array<{ name: string; text: string; image?: string }>;
}) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: howTo.name,
    description: howTo.description,
    image: howTo.image,
    totalTime: howTo.totalTime || 'PT5M',
    step: howTo.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      image: step.image,
    })),
  };

  let script = document.querySelector('script[data-type="howto"]') as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-type', 'howto');
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(structuredData);
};

/**
 * ItemList structured data for category pages
 */
export const generateItemListSchema = (items: Array<{
  name: string;
  url: string;
  image?: string;
  description?: string;
}>) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: item.url,
      name: item.name,
      image: item.image,
      description: item.description,
    })),
  };

  let script = document.querySelector('script[data-type="itemlist"]') as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-type', 'itemlist');
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(structuredData);
};

/**
 * Review/Rating structured data
 */
export const generateReviewSchema = (review: {
  itemName: string;
  itemType?: string;
  author: string;
  reviewRating: number;
  reviewBody: string;
  datePublished: string;
}) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: {
      '@type': review.itemType || 'Product',
      name: review.itemName,
    },
    author: {
      '@type': 'Person',
      name: review.author,
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: review.reviewRating,
      bestRating: 5,
      worstRating: 1,
    },
    reviewBody: review.reviewBody,
    datePublished: review.datePublished,
  };

  let script = document.querySelector('script[data-type="review"]') as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-type', 'review');
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(structuredData);
};

/**
 * Event structured data for time-limited promotions
 */
export const generateEventSchema = (event: {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  location?: string;
  image?: string;
  offers?: {
    price: number;
    priceCurrency: string;
    availability: string;
  };
}) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    description: event.description,
    startDate: event.startDate,
    endDate: event.endDate,
    image: event.image,
    location: event.location ? {
      '@type': 'Place',
      name: event.location,
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'Bulgaria',
      },
    } : undefined,
    offers: event.offers ? {
      '@type': 'Offer',
      price: event.offers.price,
      priceCurrency: event.offers.priceCurrency,
      availability: event.offers.availability,
      url: window.location.href,
    } : undefined,
    organizer: {
      '@type': 'Organization',
      name: 'BoomCard Bulgaria',
      url: 'https://boomcard.bg',
    },
  };

  let script = document.querySelector('script[data-type="event"]') as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-type', 'event');
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(structuredData);
};
/**
 * VideoObject structured data for video SEO
 */
export const generateVideoSchema = (video: {
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string;
  duration?: string;
  contentUrl?: string;
  embedUrl?: string;
}) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.name,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    uploadDate: video.uploadDate,
    duration: video.duration,
    contentUrl: video.contentUrl,
    embedUrl: video.embedUrl,
    publisher: {
      '@type': 'Organization',
      name: 'BoomCard Bulgaria',
      logo: {
        '@type': 'ImageObject',
        url: 'https://boomcard.bg/logo.png',
      },
    },
  };

  let script = document.querySelector('script[data-type="video"]') as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-type', 'video');
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(structuredData);
};

/**
 * Article schema for blog content  
 */
export const generateArticleSchema = (article: {
  headline: string;
  description: string;
  image: string;
  datePublished: string;
  author: string;
}) => {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.headline,
    description: article.description,
    image: article.image,
    datePublished: article.datePublished,
    author: { '@type': 'Person', name: article.author },
    publisher: {
      '@type': 'Organization',
      name: 'BoomCard Bulgaria',
      logo: { '@type': 'ImageObject', url: 'https://boomcard.bg/logo.png' },
    },
  };
  let script = document.querySelector('script[data-type="article"]') as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-type', 'article');
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(structuredData);
};
