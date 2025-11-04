/**
 * BoomCard Mobile App
 *
 * React Native app with full web feature parity
 * CRITICAL FEATURE: GPS-based receipt validation (60-meter radius)
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { AuthProvider } from './src/store/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import Toast from 'react-native-toast-message';

// Stripe publishable key
const STRIPE_PUBLISHABLE_KEY = Constants.expoConfig?.extra?.stripePublishableKey ||
  'pk_test_51SPa5NFFte7x2hqqQrZJf25fX8yHIfZOrO7vvc11LFvWcPoDGonM0ggtIp2c3QVJCC2z0QqnMSlnf0RbqDT8pMqu00gDH6DuZc';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="auto" />
          <AppNavigator />
          <Toast />
        </AuthProvider>
      </QueryClientProvider>
    </StripeProvider>
  );
}
