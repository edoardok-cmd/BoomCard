/**
 * App Navigator
 *
 * Main navigation structure with authentication flow
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../store/AuthContext';
import { ActivityIndicator, View } from 'react-native';

// Auth Screens
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';

// Main App Screens
import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import ReceiptsScreen from '../screens/Receipts/ReceiptsScreen';
import ReceiptScannerScreen from '../screens/Receipts/ReceiptScannerScreen';
import StickerScannerScreen from '../screens/Stickers/StickerScannerScreen';
import UploadReceiptScreen from '../screens/Stickers/UploadReceiptScreen';
import CardWalletScreen from '../screens/Card/CardWalletScreen';
import MyCardScreen from '../screens/Card/MyCardScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';

// Payment Screens
import WalletScreen from '../screens/Payments/WalletScreen';
import TopUpScreen from '../screens/Payments/TopUpScreen';
import PaymentMethodsScreen from '../screens/Payments/PaymentMethodsScreen';
import TransactionHistoryScreen from '../screens/Payments/TransactionHistoryScreen';
import AddCardScreen from '../screens/Payments/AddCardScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Auth Stack Navigator
const AuthNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
};

// Tab Navigator
const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#6B7280',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'BoomCard',
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Receipts"
        component={ReceiptsScreen}
        options={{
          title: 'Receipts',
          tabBarLabel: 'Receipts',
        }}
      />
      <Tab.Screen
        name="Scan"
        component={StickerScannerScreen}
        options={{
          title: 'Scan QR',
          tabBarLabel: 'Scan',
        }}
      />
      <Tab.Screen
        name="Card"
        component={CardWalletScreen}
        options={{
          title: 'My Card',
          tabBarLabel: 'Card',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

// Main App Stack Navigator with nested tabs
const MainNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* Main Tabs */}
      <Stack.Screen name="MainTabs" component={TabNavigator} />

      {/* Payment Screens */}
      <Stack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          headerShown: true,
          title: 'My Wallet'
        }}
      />
      <Stack.Screen
        name="TopUp"
        component={TopUpScreen}
        options={{
          headerShown: true,
          title: 'Top Up Wallet'
        }}
      />
      <Stack.Screen
        name="PaymentMethods"
        component={PaymentMethodsScreen}
        options={{
          headerShown: true,
          title: 'Payment Methods'
        }}
      />
      <Stack.Screen
        name="AddCard"
        component={AddCardScreen}
        options={{
          headerShown: true,
          title: 'Add Card'
        }}
      />
      <Stack.Screen
        name="TransactionHistory"
        component={TransactionHistoryScreen}
        options={{
          headerShown: true,
          title: 'Transaction History'
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

      {/* Sticker Screens */}
      <Stack.Screen
        name="UploadReceipt"
        component={UploadReceiptScreen}
        options={{
          headerShown: true,
          title: 'Upload Receipt'
        }}
      />
    </Stack.Navigator>
  );
};

// Root Navigator with Auth Check
export const AppNavigator = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default AppNavigator;
