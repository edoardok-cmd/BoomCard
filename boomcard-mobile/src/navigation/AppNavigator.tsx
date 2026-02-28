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
import { View, Text, StyleSheet } from 'react-native';
import { ProgressRing } from '../components/loading';
import BoomLogo from '../components/brand/BoomLogo';
import * as SecureStore from '../utils/secureStore';
import { STORAGE_KEYS } from '../constants/config';

// Auth Screens
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import PlanSelectionScreen from '../screens/Auth/PlanSelectionScreen';
import CheckoutScreen from '../screens/Auth/CheckoutScreen';

// Main App Screens
import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import ReceiptsScreen from '../screens/Receipts/ReceiptsScreen';
import ReceiptScannerScreen from '../screens/Receipts/ReceiptScannerScreen';
import StickerScannerScreen from '../screens/Stickers/StickerScannerScreen';
import UploadReceiptScreen from '../screens/Stickers/UploadReceiptScreen';
import CardWalletScreen from '../screens/Card/CardWalletScreen';
import MyCardScreen from '../screens/Card/MyCardScreen';
import UpgradePlansScreen from '../screens/Card/UpgradePlansScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import EditProfileScreen from '../screens/Profile/EditProfileScreen';
import ChangePasswordScreen from '../screens/Profile/ChangePasswordScreen';
import SettingsScreen from '../screens/Profile/SettingsScreen';

// Payment Screens
import WalletScreen from '../screens/Payments/WalletScreen';
import TopUpScreen from '../screens/Payments/TopUpScreen';
import TransactionHistoryScreen from '../screens/Payments/TransactionHistoryScreen';

// Subscription Screens
import ProcessPaymentScreen from '../screens/Subscription/ProcessPaymentScreen';
import SubscriptionSuccessScreen from '../screens/Subscription/SubscriptionSuccessScreen';
import SubscriptionCancelScreen from '../screens/Subscription/SubscriptionCancelScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Auth Stack Navigator
const AuthNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { flex: 1 },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="PlanSelection" component={PlanSelectionScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
};

// Tab Navigator
const TabNavigator = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
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
      <Tab.Screen
        name="Card"
        component={MyCardScreen}
        options={{
          title: t('card.title'),
          tabBarLabel: t('navigation.card'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="card" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: t('profile.title'),
          tabBarLabel: t('navigation.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// Main App Stack Navigator with nested tabs
const MainNavigator = ({ initialRouteName = 'MainTabs' }: { initialRouteName?: string }) => {
  const { t } = useTranslation();

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
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
      <Stack.Screen
        name="TopUp"
        component={TopUpScreen}
        options={{
          headerShown: true,
          title: 'Top Up'
        }}
      />
      <Stack.Screen
        name="TransactionHistory"
        component={TransactionHistoryScreen}
        options={{
          headerShown: true,
          title: 'Transactions'
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

      {/* Receipt Screens */}
      <Stack.Screen
        name="ReceiptScanner"
        component={ReceiptScannerScreen}
        options={{
          headerShown: true,
          title: 'Scan Receipt',
          presentation: 'modal'
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
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="SubscriptionCancel"
        component={SubscriptionCancelScreen}
        options={{
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
};

// Root Navigator with Auth Check
export const AppNavigator = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { isDarkMode, theme } = useTheme();
  const [mainInitialRoute, setMainInitialRoute] = useState<string | null>(null);

  // Check for pending payment when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && !mainInitialRoute) {
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

  return (
    <NavigationContainer theme={navigationTheme}>
      {isAuthenticated ? (
        <MainNavigator initialRouteName={mainInitialRoute || 'MainTabs'} />
      ) : (
        <AuthNavigator />
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
