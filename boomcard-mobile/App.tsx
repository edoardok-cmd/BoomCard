/**
 * BoomCard Mobile App
 *
 * React Native app with full web feature parity
 * CRITICAL FEATURE: GPS-based receipt validation (60-meter radius)
 * PAYMENT: Paysera web-based payment gateway
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/store/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import Toast from 'react-native-toast-message';

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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="auto" />
        <AppNavigator />
        <Toast />
      </AuthProvider>
    </QueryClientProvider>
  );
}
