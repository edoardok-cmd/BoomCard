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
      MARKETING_CONSENT: '/api/auth/marketing-consent',
      CHANGE_EMAIL_REQUEST: '/api/auth/change-email/request',
      CHANGE_EMAIL_VERIFY: '/api/auth/change-email/verify',
      RESEND_EMAIL_VERIFICATION: '/api/auth/resend-email-verification',
      REQUEST_EMAIL_VERIFICATION: '/api/auth/request-email-verification',
    },
    HELP: {
      SUBMIT_TICKET: '/api/help/ticket',
      MY_TICKETS: '/api/help/tickets',
      TICKET_BY_ID: '/api/help/tickets/:id',
      TICKET_REPLIES: '/api/help/tickets/:id/replies',
      TICKET_REPLY: '/api/help/tickets/:id/reply',
    },
    // Receipts
    // NOTE: the live receipt-upload path is POST /api/stickers/scan/:scanId/receipt
    // (see StickersApi.uploadReceiptForScan). The legacy /api/receipts/v2/submit and
    // /v2/upload endpoints were RETIRED (410 GONE) and have been removed here (R2).
    RECEIPTS: {
      BASE: '/api/receipts',
      STATS: '/api/receipts/stats',
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
    // Payments — BoomCard is Paysera-only; there is NO tokenized card CRUD endpoint
    // (the Stripe paymentsRouter is imported but never mounted on the backend).
    // Card changes happen exclusively via the subscription change-card redirect.
    // The /cards /intents config keys + payments.api.ts client were removed (S8/S9).
    // Wallet — cashback-only ledger. No top-up (W3) and no /withdraw (W2) concept.
    WALLET: {
      BALANCE: '/api/wallet/balance',
      TRANSACTIONS: '/api/wallet/transactions',
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
      HISTORY: '/api/subscriptions/history',
      // Order-status poll is per-order: /status/:orderId (S7 — path templated by caller)
      STATUS: '/api/subscriptions/status',
      RETRY_PAYMENT: '/api/subscriptions/:id/retry-payment',
      CHANGE_CARD: '/api/subscriptions/:id/change-card',
      CANCEL: '/api/subscriptions/:id/cancel',
      REACTIVATE: '/api/subscriptions/:id/reactivate',
      UPDATE_PLAN: '/api/subscriptions/:id/update-plan',
    },
    // Plans (public — no auth required)
    PLANS: {
      BASE: '/api/plans',
      BY_CODE: '/api/plans/code',
    },
    // Loyalty — only ACCOUNT is served by the backend (GET /api/loyalty/accounts/me → 501).
    // All other loyalty routes (/transactions, /rewards, /redemptions, /summary, /tiers)
    // are not implemented on the server and have been removed (F-4 contract fix).
    LOYALTY: {
      ACCOUNT: '/api/loyalty/accounts/me',
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
  SHOW_OFFERS_TAB: 'show_offers_tab',
  SHOW_NEARBY_TAB: 'show_nearby_tab',
  SHOW_FAVORITES_TAB: 'show_favorites_tab',
};

// App Configuration
export const APP_CONFIG = {
  NAME: 'BoomCard',
  VERSION: '1.0.0',
  MOBILE_APP_URL: process.env.EXPO_PUBLIC_MOBILE_URL || 'https://mobile.boomcard.bg',
  BUNDLE_ID_IOS: 'bg.boomcard.mobile',
  BUNDLE_ID_ANDROID: 'bg.boomcard.mobile',

  // Default language — spec §18.3 mandates Bulgarian for a fresh install (A5/N8).
  DEFAULT_LANGUAGE: 'bg',

  // Supported languages (bg listed first to match the spec-default)
  SUPPORTED_LANGUAGES: ['bg', 'en'],

  // Currency
  CURRENCY: 'BGN',
  CURRENCY_SYMBOL: 'лв',
  EUR_EXCHANGE_RATE: 1.95583, // Fixed rate: 1 EUR = 1.95583 BGN

  // OCR Configuration
  OCR: {
    LANGUAGES: 'bul+eng', // Bulgarian + English
    // Display-only threshold. The server strips any client-supplied confidence and
    // re-runs its own OCR, so this never gates auto-approval (R7). Spec value is 60%.
    CONFIDENCE_THRESHOLD: 60,
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
  // Subscription failed-payment states (S4) — both Stripe PAST_DUE and the
  // canonical FAILED_PAYMENT map to the spec "Failed Payment" red.
  PAST_DUE: '#EF4444',
  FAILED_PAYMENT: '#EF4444',
  ACTIVE: '#10B981',
  TRIALING: '#10B981',
  PAUSED: '#6B7280',
};
