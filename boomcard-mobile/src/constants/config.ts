/**
 * App Configuration Constants
 */

// API Configuration
export const API_CONFIG = {
  // Base URL for backend API
  // Use EXPO_PUBLIC_API_URL from environment if available, otherwise fallback
  BASE_URL: process.env.EXPO_PUBLIC_API_URL || (__DEV__
    ? 'http://172.20.10.2:3001' // Development - laptop IP on network
    : 'https://boomcard-api.fly.dev'), // Production - Fly.io

  // API endpoints
  ENDPOINTS: {
    // Authentication
    AUTH: {
      LOGIN: '/api/auth/login',
      REGISTER: '/api/auth/register',
      REFRESH: '/api/auth/refresh',
      LOGOUT: '/api/auth/logout',
      ME: '/api/auth/me',
      PROFILE: '/api/auth/profile',
      CHANGE_PASSWORD: '/api/auth/change-password',
      DELETE_ACCOUNT: '/api/auth/account',
      CONSENT: '/api/auth/consent',
    },
    HELP: {
      SUBMIT_TICKET: '/api/help/ticket',
      MY_TICKETS: '/api/help/tickets',
    },
    // Receipts
    RECEIPTS: {
      BASE: '/api/receipts',
      STATS: '/api/receipts/stats',
      SUBMIT: '/api/receipts/v2/submit',
      UPLOAD: '/api/receipts/v2/upload',
      CHECK_DUPLICATE: '/api/receipts/v2/check-duplicate',
      ANALYTICS: '/api/receipts/v2/analytics',
    },
    // Stickers
    STICKERS: {
      BASE: '/api/stickers',
      SCAN: '/api/stickers/scan',
      MY_SCANS: '/api/stickers/my-scans',
      VALIDATE: '/api/stickers/validate',
    },
    // Venues
    VENUES: {
      BASE: '/api/venues',
      NEARBY: '/api/venues/nearby',
    },
    // Payments
    PAYMENTS: {
      INTENTS: '/api/payments/intents',
      CARDS: '/api/payments/cards',
      TRANSACTIONS: '/api/payments/transactions',
      STATISTICS: '/api/payments/statistics',
    },
    // Wallet
    WALLET: {
      BALANCE: '/api/wallet/balance',
      TRANSACTIONS: '/api/wallet/transactions',
      TOP_UP: '/api/wallet/topup',
      WITHDRAW: '/api/wallet/withdraw',
    },
    // Offers
    OFFERS: {
      BASE: '/api/offers',
      TOP: '/api/offers/top',
      FEATURED: '/api/offers/featured',
    },
    // Partners
    PARTNERS: {
      BASE: '/api/partners',
      ME: '/api/partners/me',
      TIER_INFO: '/api/partners/:id/tier-info',
    },
    // Cards
    CARDS: {
      BASE: '/api/cards',
      MY_CARD: '/api/cards/my-card',
      BENEFITS: '/api/cards/benefits',
      UPGRADE: '/api/cards/:id/upgrade',
      VALIDATE: '/api/cards/validate',
    },
    // Subscriptions
    SUBSCRIPTIONS: {
      CURRENT: '/api/subscriptions/current',
      CREATE: '/api/subscriptions/create',
      STATUS: '/api/subscriptions/status',
    },
    // Plans (public — no auth required)
    PLANS: {
      BASE: '/api/plans',
      BY_CODE: '/api/plans/code',
    },
    // Loyalty
    LOYALTY: {
      ACCOUNT: '/api/loyalty/accounts/me',
      TRANSACTIONS: '/api/loyalty/transactions',
      REWARDS: '/api/loyalty/rewards',
    },
  },

  // Request timeout in milliseconds
  TIMEOUT: 30000,
};

// GPS Configuration
export const GPS_CONFIG = {
  // Maximum allowed distance from venue for receipt validation (meters)
  MAX_RADIUS_METERS: 60,

  // High accuracy location options
  HIGH_ACCURACY: {
    accuracy: 5, // Expo Location.Accuracy.Highest
    timeInterval: 1000,
    distanceInterval: 0,
  },

  // Standard accuracy location options
  STANDARD_ACCURACY: {
    accuracy: 4, // Expo Location.Accuracy.High
    timeInterval: 5000,
    distanceInterval: 10,
  },
};

// Storage Keys for SecureStore
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
  LANGUAGE: 'language',
  LANGUAGE_SELECTED: 'language_selected',
  THEME: 'theme',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  PUSH_NOTIFICATIONS: 'push_notifications',
  EMAIL_NOTIFICATIONS: 'email_notifications',
  LOCATION_SERVICES: 'location_services',
  PENDING_PAYMENT: 'pending_payment',
};

// App Configuration
export const APP_CONFIG = {
  NAME: 'BoomCard',
  VERSION: '1.0.0',
  MOBILE_APP_URL: process.env.EXPO_PUBLIC_MOBILE_URL || 'https://mobile.boomcard.bg',
  BUNDLE_ID_IOS: 'bg.boomcard.mobile',
  BUNDLE_ID_ANDROID: 'bg.boomcard.mobile',

  // Default language
  DEFAULT_LANGUAGE: 'en',

  // Supported languages
  SUPPORTED_LANGUAGES: ['en', 'bg'],

  // Currency
  CURRENCY: 'BGN',
  CURRENCY_SYMBOL: 'лв',
  EUR_EXCHANGE_RATE: 1.95583, // Fixed rate: 1 EUR = 1.95583 BGN

  // OCR Configuration
  OCR: {
    LANGUAGES: 'bul+eng', // Bulgarian + English
    CONFIDENCE_THRESHOLD: 70, // Minimum confidence for auto-approval
  },

  // Receipt Configuration
  RECEIPT: {
    MAX_FILE_SIZE_MB: 10,
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/jpg'],
    MAX_AGE_DAYS: 1, // Receipts must be submitted the same day (until 6am the following day per policy)
    RATE_LIMIT: {
      PER_DAY: Infinity,
      PER_MONTH: Infinity,
    },
  },

  // Sticker Scan Configuration
  STICKER: {
    RATE_LIMIT: {
      PER_DAY: Infinity,
      PER_MONTH: Infinity,
    },
  },
};

/**
 * Card Tier Configuration — display-only properties for the LIGHT, BASIC, PREMIUM tiers.
 *
 * Cashback rates, sticker bonuses, and redeemable partner tiers are served by the backend
 * and must be read from plansService.getPlans() — do NOT hardcode them here.
 */
export const CARD_TIERS = {
  LIGHT: {
    name: 'Premium Weekly',
    color: '#FFFFFF',
    cardStyle: 'light' as const,
  },
  BASIC: {
    name: 'Basic',
    color: '#C0C0C0',
    cardStyle: 'silver' as const,
  },
  PREMIUM: {
    name: 'Premium',
    color: '#1A1A2E',
    cardStyle: 'black' as const,
  },
};

// Loyalty Tiers
export const LOYALTY_TIERS = {
  BRONZE: {
    name: 'Bronze',
    color: '#CD7F32',
    minPoints: 0,
  },
  SILVER: {
    name: 'Silver',
    color: '#C0C0C0',
    minPoints: 1000,
  },
  GOLD: {
    name: 'Gold',
    color: '#FFD700',
    minPoints: 5000,
  },
  PLATINUM: {
    name: 'Platinum',
    color: '#E5E4E2',
    minPoints: 10000,
  },
  DIAMOND: {
    name: 'Diamond',
    color: '#B9F2FF',
    minPoints: 25000,
  },
};

// Status Colors
export const STATUS_COLORS = {
  PENDING: '#F59E0B',
  PROCESSING: '#3B82F6',
  VALIDATING: '#8B5CF6',
  APPROVED: '#10B981',
  REJECTED: '#EF4444',
  MANUAL_REVIEW: '#F59E0B',
  EXPIRED: '#6B7280',
  COMPLETED: '#10B981',
  FAILED: '#EF4444',
  CANCELLED: '#6B7280',
};
