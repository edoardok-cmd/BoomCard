export const APP_NAME = 'Discount Platform';

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    LOGOUT: '/api/auth/logout',
    ME: '/api/auth/me',
  },
  VENUES: {
    LIST: '/api/venues',
    SEARCH: '/api/venues/search',
    NEARBY: '/api/venues/nearby',
  },
  QR: {
    GENERATE: '/api/qr/generate',
    VALIDATE: '/api/qr/validate',
  }
};

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  PROFILE: '/profile',
  SEARCH: '/search',
};

export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'user_data',
  LOCALE: 'locale',
};

export const DEFAULT_LOCALE = 'bg';
export const SUPPORTED_LOCALES = ['bg', 'en'];