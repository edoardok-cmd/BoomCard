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
import { QueryClientProvider } from '@tanstack/react-query';
import * as Font from 'expo-font';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from './src/utils/secureStore';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { TabVisibilityProvider } from './src/contexts/TabVisibilityContext';
import { AuthProvider } from './src/store/AuthContext';
import { MobileConfigProvider } from './src/store/MobileConfigContext';
import { GlobalErrorBoundary } from './src/components/GlobalErrorBoundary';
import AppNavigator from './src/navigation/AppNavigator';
import LanguageSelectionScreen from './src/screens/LanguageSelectionScreen';
import BrandSplash from './src/components/brand/BrandSplash';
import Toast from 'react-native-toast-message';
import { STORAGE_KEYS } from './src/constants/config';
import StorageService from './src/services/storage.service';
import './src/i18n'; // Initialize i18n
import { warmupApi } from './src/utils/apiWarmup';
import { reportError } from './src/utils/errorReporter';
import queryClient from './src/queryClient';

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

    prepareApp();
    // Warm up the API server in the background (helps with cold starts)
    warmupApi().catch(err => console.log('API warmup failed:', err));
  }, []);

  const prepareApp = async () => {
    try {
      // Load icon fonts and check language selection in parallel
      const [hasSelected] = await Promise.all([
        SecureStore.getItemAsync('language_selected'),
        Font.loadAsync({
          ...Ionicons.font,
          ...MaterialCommunityIcons.font,
        }),
      ]);
      setLanguageSelected(hasSelected === 'true');
    } catch (error) {
      console.error('Error preparing app:', error);
      reportError(error, 'unknown');
      // Still allow the app to proceed even if font loading fails
      try {
        const hasSelected = await SecureStore.getItemAsync('language_selected');
        setLanguageSelected(hasSelected === 'true');
      } catch {
        setLanguageSelected(false);
      }
    } finally {
      setAppReady(true);
    }
  };

  const handleLanguageSelected = () => {
    setLanguageSelected(true);
  };

  return (
    <GlobalErrorBoundary>
    <View style={{ flex: 1 }}>
      {/* Render underlying content (loads behind splash overlay) */}
      {languageSelected === false ? (
        <ThemeProvider>
          <LanguageSelectionScreen onLanguageSelected={handleLanguageSelected} />
        </ThemeProvider>
      ) : languageSelected === true ? (
        <QueryClientProvider client={queryClient}>
          <MobileConfigProvider>
            <ThemeProvider>
              <AuthProvider>
                <TabVisibilityProvider>
                  <StatusBar style="auto" />
                  <AppNavigator />
                  <Toast />
                </TabVisibilityProvider>
              </AuthProvider>
            </ThemeProvider>
          </MobileConfigProvider>
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
    </GlobalErrorBoundary>
  );
}
