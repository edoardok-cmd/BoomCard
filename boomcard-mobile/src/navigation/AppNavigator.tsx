/**
 * App Navigator
 *
 * Main navigation structure with authentication flow.
 * Handles pending payment detection after registration.
 */

import React, { useState, useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTabVisibility } from '../contexts/TabVisibilityContext';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { ProgressRing } from '../components/loading';
import BoomLogo from '../components/brand/BoomLogo';
import AccountStatusBanner from '../components/AccountStatusBanner';
import { navigationRef } from './navigationRef';
import * as SecureStore from '../utils/secureStore';
import { STORAGE_KEYS } from '../constants/config';

// Auth Screens
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import PlanSelectionScreen from '../screens/Auth/PlanSelectionScreen';
import CheckoutScreen from '../screens/Auth/CheckoutScreen';
import ForgotPasswordScreen from '../screens/Auth/ForgotPasswordScreen';
import CompleteProfileScreen from '../screens/Auth/CompleteProfileScreen';

// Main App Screens
import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import OffersScreen from '../screens/Offers/OffersScreen';
import OfferDetailScreen from '../screens/Offers/OfferDetailScreen';
import ReceiptsScreen from '../screens/Receipts/ReceiptsScreen';
import ReceiptDetailScreen from '../screens/Receipts/ReceiptDetailScreen';

import StickerScannerScreen from '../screens/Stickers/StickerScannerScreen';
import UploadReceiptScreen from '../screens/Stickers/UploadReceiptScreen';
import MyCardScreen from '../screens/Card/MyCardScreen';
import UpgradePlansScreen from '../screens/Card/UpgradePlansScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import EditProfileScreen from '../screens/Profile/EditProfileScreen';
import ChangePasswordScreen from '../screens/Profile/ChangePasswordScreen';
import SettingsScreen from '../screens/Profile/SettingsScreen';
import SyncAnalysisScreen from '../screens/Profile/SyncAnalysisScreen';
import HelpScreen from '../screens/Profile/HelpScreen';
import MyRequestsScreen from '../screens/Profile/MyRequestsScreen';

// Payment Screens
import WalletScreen from '../screens/Payments/WalletScreen';
import TransactionHistoryScreen from '../screens/Payments/TransactionHistoryScreen';
import CashbackHistoryScreen from '../screens/Payments/CashbackHistoryScreen';

// Subscription Screens
import ProcessPaymentScreen from '../screens/Subscription/ProcessPaymentScreen';
import SubscriptionSuccessScreen from '../screens/Subscription/SubscriptionSuccessScreen';
import PaymentCancelledScreen from '../screens/Subscription/PaymentCancelledScreen';
import SubscriptionManagementScreen from '../screens/Subscription/SubscriptionManagementScreen';

import FavoritesScreen from '../screens/Favorites/FavoritesScreen';
import NearbyScreen from '../screens/Nearby/NearbyScreen';
import NotificationsScreen from '../screens/Notifications/NotificationsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Module-level helper — runs once at module load, before any component renders.
// Reads the /complete-profile?token=... URL synchronously so the lazy useState
// initializer (below) has the token available before the first render cycle,
// which is required for React Navigation's initialRouteName to take effect.
function extractDeeplinkToken(): string | null {
  if (typeof window === 'undefined') return null; // SSR guard
  if (Platform.OS !== 'web') return null;
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path.startsWith('/complete-profile')) {
    const t = params.get('token');
    if (t) {
      // Clean the URL so a refresh doesn't re-trigger this routing
      window.history.replaceState({}, '', '/');
      return t;
    }
  }
  return null;
}

// Auth Stack Navigator
// When `initialToken` is provided (web deeplink: /complete-profile?token=...) the
// stack opens directly on CompleteProfileScreen with the token pre-injected.
const AuthNavigator = ({ initialToken }: { initialToken?: string } = {}) => {
  return (
    <Stack.Navigator
      initialRouteName={initialToken ? 'CompleteProfile' : 'Login'}
      screenOptions={{
        headerShown: false,
        cardStyle: { flex: 1 },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PlanSelection" component={PlanSelectionScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen
        name="CompleteProfile"
        component={CompleteProfileScreen}
        options={{ headerShown: false }}
        initialParams={initialToken ? { token: initialToken } : undefined}
      />
    </Stack.Navigator>
  );
};

// Tab Navigator
const TabNavigator = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { showOffers, showNearby, showFavorites } = useTabVisibility();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.onSurface,
        tabBarActiveTintColor: theme.colors.gold,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: t('dashboard.title'),
          tabBarLabel: t('navigation.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
          headerRight: () => (
            <View style={{ marginRight: 16 }}>
              <BoomLogo size={32} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Receipts"
        component={ReceiptsScreen}
        options={{
          title: t('receipts.title'),
          tabBarLabel: t('navigation.receipts'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
        }}
      />
      {showNearby && (
        <Tab.Screen
          name="Nearby"
          component={NearbyScreen}
          options={{
            title: t('nearby.title', 'Наблизо'),
            tabBarLabel: t('nearby.title', 'Наблизо'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="location" size={size} color={color} />
            ),
          }}
        />
      )}
      {showOffers && (
        <Tab.Screen
          name="Offers"
          component={OffersScreen}
          options={{
            title: t('offers.title'),
            tabBarLabel: t('navigation.offers'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="pricetag" size={size} color={color} />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="Scan"
        component={StickerScannerScreen}
        options={{
          title: t('navigation.scan'),
          tabBarLabel: t('navigation.scan'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code" size={size} color={color} />
          ),
        }}
      />
      {showFavorites && (
        <Tab.Screen
          name="Favorites"
          component={FavoritesScreen}
          options={{
            title: t('favorites.title', 'Любими'),
            tabBarLabel: t('favorites.title', 'Любими'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="heart" size={size} color={color} />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={({ navigation }) => ({
          title: t('profile.title'),
          tabBarLabel: t('navigation.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
          headerLeft: navigation.canGoBack()
            ? () => (
                <TouchableOpacity
                  onPress={() => navigation.goBack()}
                  style={{ marginLeft: 16 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chevron-back" size={24} color={theme.colors.onSurface} />
                </TouchableOpacity>
              )
            : undefined,
        })}
      />
    </Tab.Navigator>
  );
};

// Main App Stack Navigator with nested tabs
const MainNavigator = ({ initialRouteName = 'MainTabs', initialParams }: { initialRouteName?: string; initialParams?: Record<string, any> }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* A2 — global account-status gate (paused / archived / verify-email). */}
      <AccountStatusBanner />
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        cardStyle: { flex: 1 },
        headerTintColor: theme.colors.onSurface,
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
      }}
    >
      {/* Main Tabs */}
      <Stack.Screen
        name="MainTabs"
        component={TabNavigator}
        options={{
          title: t('navigation.home'),
        }}
      />

      {/* Payment Screens */}
      <Stack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          headerShown: true,
          title: 'Wallet'
        }}
      />
      {/* W3: TopUp route removed — the wallet is a cashback-only ledger with no top-up concept (spec §6). */}
      <Stack.Screen
        name="TransactionHistory"
        component={TransactionHistoryScreen}
        options={{
          headerShown: true,
          title: 'Transactions'
        }}
      />
      <Stack.Screen
        name="CashbackHistory"
        component={CashbackHistoryScreen}
        options={{
          headerShown: true,
          title: t('cashback.title', 'Кешбек'),
        }}
      />

      {/* Card Screens */}
      <Stack.Screen
        name="MyCard"
        component={MyCardScreen}
        options={{
          headerShown: true,
          title: 'My Card'
        }}
      />

      {/* Offer Screens */}
      <Stack.Screen
        name="OfferDetail"
        component={OfferDetailScreen}
        options={{
          headerShown: true,
          title: t('offers.detail'),
        }}
      />

      {/* Profile Screens */}
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{
          headerShown: true,
          title: 'Edit Profile'
        }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{
          headerShown: true,
          title: 'Change Password'
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: true,
          title: 'Settings'
        }}
      />
      <Stack.Screen
        name="HelpScreen"
        component={HelpScreen}
        options={{
          headerShown: true,
          title: 'Support'
        }}
      />
      <Stack.Screen
        name="MyRequests"
        component={MyRequestsScreen}
        options={{ headerShown: true, title: 'Моите заявки' }}
      />
      <Stack.Screen
        name="SyncAnalysis"
        component={SyncAnalysisScreen}
        options={{
          headerShown: true,
          title: 'Sync Analysis'
        }}
      />

      {/* Upgrade Plans */}
      <Stack.Screen
        name="UpgradePlans"
        component={UpgradePlansScreen}
        options={{
          headerShown: true,
          title: 'Upgrade Plan',
          presentation: 'modal',
        }}
      />

      {/* Checkout (for authenticated upgrade flow) */}
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{
          headerShown: false,
        }}
      />

      {/* Receipt Detail */}
      <Stack.Screen
        name="ReceiptDetails"
        component={ReceiptDetailScreen}
        options={{
          headerShown: true,
          title: 'Receipt Details'
        }}
      />

      {/* Sticker Screens */}
      <Stack.Screen
        name="UploadReceipt"
        component={UploadReceiptScreen}
        options={{
          headerShown: true,
          title: 'Upload Receipt'
        }}
      />

      {/* Subscription Screens */}
      <Stack.Screen
        name="ProcessPayment"
        component={ProcessPaymentScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="SubscriptionSuccess"
        component={SubscriptionSuccessScreen}
        options={{ headerShown: false }}
        initialParams={initialRouteName === 'SubscriptionSuccess' ? initialParams : undefined}
      />
      <Stack.Screen
        name="SubscriptionCancel"
        component={PaymentCancelledScreen}
        options={{ headerShown: false }}
        initialParams={initialRouteName === 'SubscriptionCancel' ? initialParams : undefined}
      />
      <Stack.Screen
        name="SubscriptionManagement"
        component={SubscriptionManagementScreen}
        options={{ headerShown: true, title: t('subscription.management', 'Абонамент и плащания') }}
      />

      {/* Offers — accessible via deep-link from Nearby/Favorites */}
      <Stack.Screen
        name="Offers"
        component={OffersScreen}
        options={{ headerShown: true, title: t('offers.title') }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
    </View>
  );
};

// Root Navigator with Auth Check
export const AppNavigator = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { isDarkMode, theme } = useTheme();
  const [mainInitialRoute, setMainInitialRoute] = useState<string | null>(null);
  // Token extracted from a /complete-profile?token=... web deeplink.
  // The lazy initializer (extractDeeplinkToken) runs synchronously before the
  // first render so React Navigation's initialRouteName sees the token
  // immediately — no useEffect delay, no Login flash.
  // Cleared once the user is authenticated (so the Auth navigator reverts to
  // Login on a subsequent logout).
  const [completeProfileToken, setCompleteProfileToken] = useState<string | null>(extractDeeplinkToken);

  // Clear the pending deeplink token once the user has successfully authenticated
  useEffect(() => {
    if (isAuthenticated && completeProfileToken) {
      setCompleteProfileToken(null);
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for pending payment or subscription return URL when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && !mainInitialRoute) {
      // On web, check if Paysera redirected back to a subscription result URL.
      // After payment, Paysera redirects to e.g. /subscription/success?orderId=XXX
      if (Platform.OS === 'web') {
        const path = window.location.pathname;
        const params = new URLSearchParams(window.location.search);
        const orderId = params.get('orderId') || undefined;

        if (path.includes('/subscription/success')) {
          // Clean the URL so refreshing doesn't re-trigger this routing
          window.history.replaceState({}, '', '/');
          setMainInitialRoute(`SubscriptionSuccess|${orderId || ''}`);
          return;
        }
        if (path.includes('/subscription/cancel')) {
          window.history.replaceState({}, '', '/');
          setMainInitialRoute(`SubscriptionCancel|${orderId || ''}`);
          return;
        }
      }

      SecureStore.getItemAsync(STORAGE_KEYS.PENDING_PAYMENT)
        .then(data => {
          // If there's a pending payment, start with ProcessPayment screen
          setMainInitialRoute(data ? 'ProcessPayment' : 'MainTabs');
        })
        .catch(() => {
          setMainInitialRoute('MainTabs');
        });
    } else if (!isAuthenticated) {
      // Reset when user logs out
      setMainInitialRoute(null);
    }
  }, [isAuthenticated, mainInitialRoute]);

  if (isLoading || (isAuthenticated && !mainInitialRoute)) {
    return (
      <View style={brandLoadingStyles.container}>
        <View style={brandLoadingStyles.brandRow}>
          <Text style={[brandLoadingStyles.brandBoom, { color: theme.colors.onSurface }]}>BOOM</Text>
          <Text style={[brandLoadingStyles.brandCard, { color: theme.colors.onSurfaceVariant }]}>Card</Text>
        </View>
        <ProgressRing size={48} strokeWidth={3} color={theme.colors.primary} trackColor={isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.08)'} />
      </View>
    );
  }

  // Create custom navigation theme based on dark mode
  const navigationTheme = {
    ...(isDarkMode ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDarkMode ? DarkTheme.colors : DefaultTheme.colors),
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.onSurface,
      border: theme.colors.outline,
    },
  };

  // Parse encoded route (e.g. "SubscriptionSuccess|orderId123") into route name + params
  const resolvedRoute = mainInitialRoute || 'MainTabs';
  const pipeIdx = resolvedRoute.indexOf('|');
  const routeName = pipeIdx >= 0 ? resolvedRoute.slice(0, pipeIdx) : resolvedRoute;
  const routeOrderId = pipeIdx >= 0 ? resolvedRoute.slice(pipeIdx + 1) : undefined;
  const routeParams = routeOrderId ? { orderId: routeOrderId } : undefined;

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} documentTitle={{ formatter: () => 'BOOM Card' }}>
      {isAuthenticated ? (
        <MainNavigator initialRouteName={routeName} initialParams={routeParams} />
      ) : (
        <AuthNavigator initialToken={completeProfileToken ?? undefined} />
      )}
    </NavigationContainer>
  );
};

const brandLoadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandBoom: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },
  brandCard: {
    fontSize: 28,
    fontWeight: '300',
    marginLeft: 5,
  },
});

export default AppNavigator;
