/**
 * BoomCard Mobile App
 *
 * React Native app with full web feature parity
 * CRITICAL FEATURE: GPS-based receipt validation (60-meter radius)
 * PAYMENT: Paysera web-based payment gateway
 */

import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { AuthProvider } from './src/store/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import LanguageSelectionScreen from './src/screens/LanguageSelectionScreen';
import Toast from 'react-native-toast-message';
import { STORAGE_KEYS } from './src/constants/config';
import './src/i18n'; // Initialize i18n
import { warmupApi } from './src/utils/apiWarmup';

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
  const [languageSelected, setLanguageSelected] = useState<boolean | null>(null);

  useEffect(() => {
    checkLanguageSelection();
    // Warm up the API server in the background (helps with Render cold starts)
    warmupApi().catch(err => console.log('API warmup failed:', err));
  }, []);

  const checkLanguageSelection = async () => {
    try {
      const hasSelected = await SecureStore.getItemAsync('language_selected');
      setLanguageSelected(hasSelected === 'true');
    } catch (error) {
      console.error('Error checking language selection:', error);
      setLanguageSelected(false);
    }
  };

  const handleLanguageSelected = () => {
    setLanguageSelected(true);
  };

  // Show loading while checking language selection
  if (languageSelected === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  // Show language selection screen if not selected yet
  if (!languageSelected) {
    return <LanguageSelectionScreen onLanguageSelected={handleLanguageSelected} />;
  }

  // Show main app
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <AppNavigator />
          <Toast />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
