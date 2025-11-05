/**
 * App Configuration Constants
 */

// API Configuration
export const API_CONFIG = {
  // Base URL for backend API
  BASE_URL: __DEV__
    ? 'http://172.20.10.2:3001' // Development - laptop IP on network
    : 'https://api.boomcard.bg', // Production

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
    },
    // Receipts
    RECEIPTS: {
      BASE: '/api/receipts',
      STATS: '/api/receipts/stats',
      SUBMIT: '/api/receipts/submit',
      UPLOAD: '/api/receipts/upload',
      CHECK_DUPLICATE: '/api/receipts/check-duplicate',
      ANALYTICS: '/api/receipts/analytics',
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
  THEME: 'theme',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  PUSH_NOTIFICATIONS: 'push_notifications',
  EMAIL_NOTIFICATIONS: 'email_notifications',
  LOCATION_SERVICES: 'location_services',
};

// App Configuration
export const APP_CONFIG = {
  NAME: 'BoomCard',
  VERSION: '1.0.0',
  BUNDLE_ID_IOS: 'bg.boomcard.mobile',
  BUNDLE_ID_ANDROID: 'bg.boomcard.mobile',

  // Default language
  DEFAULT_LANGUAGE: 'en',

  // Supported languages
  SUPPORTED_LANGUAGES: ['en', 'bg'],

  // Currency
  CURRENCY: 'BGN',
  CURRENCY_SYMBOL: 'лв',

  // OCR Configuration
  OCR: {
    LANGUAGES: 'bul+eng', // Bulgarian + English
    CONFIDENCE_THRESHOLD: 70, // Minimum confidence for auto-approval
  },

  // Receipt Configuration
  RECEIPT: {
    MAX_FILE_SIZE_MB: 10,
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/jpg'],
    MAX_AGE_DAYS: 7, // Maximum receipt age for submission
    RATE_LIMIT: {
      PER_DAY: 10,
      PER_MONTH: 100,
    },
  },

  // Sticker Scan Configuration
  STICKER: {
    RATE_LIMIT: {
      PER_DAY: 20,
      PER_MONTH: 200,
    },
  },
};

// Card Tier Configuration
export const CARD_TIERS = {
  STANDARD: {
    name: 'Standard',
    color: '#3B82F6',
    cashbackPercent: 5,
  },
  PREMIUM: {
    name: 'Premium',
    color: '#8B5CF6',
    cashbackPercent: 7,
    premiumBonus: 2,
  },
  PLATINUM: {
    name: 'Platinum',
    color: '#F59E0B',
    cashbackPercent: 10,
    platinumBonus: 3,
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
