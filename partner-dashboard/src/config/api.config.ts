// API Configuration for production deployment
export const API_CONFIG = {
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000',
  graphqlURL: process.env.REACT_APP_GRAPHQL_URL || 'http://localhost:4000/graphql',
  wsURL: process.env.REACT_APP_WS_URL || 'ws://localhost:4000/graphql',
  
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
  timeout: 30000,
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
  connectToDevTools: process.env.NODE_ENV === 'development',
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network'
    }
  }
};