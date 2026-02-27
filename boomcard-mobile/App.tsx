/**
 * BoomCard Mobile App
 *
 * React Native app with full web feature parity
 * CRITICAL FEATURE: GPS-based receipt validation (60-meter radius)
 * PAYMENT: Paysera web-based payment gateway
 */

import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SecureStore from './src/utils/secureStore';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { AuthProvider } from './src/store/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import LanguageSelectionScreen from './src/screens/LanguageSelectionScreen';
import BrandSplash from './src/components/brand/BrandSplash';
import Toast from 'react-native-toast-message';
import { STORAGE_KEYS } from './src/constants/config';
import StorageService from './src/services/storage.service';
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
  const [splashComplete, setSplashComplete] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [initialDarkMode, setInitialDarkMode] = useState(false);

  useEffect(() => {
    // Read theme preference early for splash theming
    StorageService.getTheme()
      .then(t => setInitialDarkMode(t === 'dark'))
      .catch(() => {});

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
    } finally {
      setAppReady(true);
    }
  };

  const handleLanguageSelected = () => {
    setLanguageSelected(true);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Render underlying content (loads behind splash overlay) */}
      {languageSelected === false ? (
        <ThemeProvider>
          <LanguageSelectionScreen onLanguageSelected={handleLanguageSelected} />
        </ThemeProvider>
      ) : languageSelected === true ? (
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <StatusBar style="auto" />
              <AppNavigator />
              <Toast />
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      ) : (
        // While language check is pending, render nothing (splash covers it)
        <View style={{ flex: 1 }} />
      )}

      {/* Brand splash overlay - covers everything until animation completes */}
      {!splashComplete && (
        <BrandSplash
          isAppReady={appReady}
          isDarkMode={initialDarkMode}
          showCardReveal={languageSelected !== false}
          onComplete={() => setSplashComplete(true)}
        />
      )}
    </View>
  );
}
