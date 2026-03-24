// API Configuration for production deployment
export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  graphqlURL: import.meta.env.VITE_GRAPHQL_URL || '',
  wsURL: import.meta.env.VITE_WS_URL || '',

  // API endpoints
  endpoints: {
    auth: {
      login: '/api/auth/login',
      register: '/api/auth/register',
      logout: '/api/auth/logout',
      refresh: '/api/auth/refresh',
      verify: '/api/auth/verify'
    },
    users: {
      profile: '/api/users/profile',
      update: '/api/users/update'
    }
  },

  // Request configuration
  timeout: Number(import.meta.env.VITE_API_TIMEOUT) || 30000,
  withCredentials: true,

  // Retry configuration
  retry: {
    attempts: 3,
    delay: 1000
  }
};

// GraphQL client configuration
export const GRAPHQL_CONFIG = {
  uri: API_CONFIG.graphqlURL,
  wsUri: API_CONFIG.wsURL,
  connectToDevTools: import.meta.env.DEV,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network'
    }
  }
};
