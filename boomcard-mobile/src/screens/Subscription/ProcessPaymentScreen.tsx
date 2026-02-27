/**
 * Process Payment Screen
 *
 * Thin gateway screen that processes a pending subscription payment.
 * Shows a loading state while creating the payment and opening Paysera.
 *
 * This screen exists because after registration, the auth state changes
 * and AppNavigator switches from AuthNavigator to MainNavigator.
 * The payment intent is saved to SecureStore before registration,
 * then processed here when MainNavigator loads.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as SecureStore from '../../utils/secureStore';
import { STORAGE_KEYS } from '../../constants/config';
import { plansService } from '../../services/plans.service';
import { paymentService } from '../../services/payment.service';
import { useTheme } from '../../contexts/ThemeContext';

const ProcessPaymentScreen = ({ navigation }: any) => {
  const { i18n } = useTranslation();
  const { theme } = useTheme();
  const language = i18n.language === 'bg' ? 'bg' : 'en';
  const processed = useRef(false);

  const styles = getStyles(theme);

  useEffect(() => {
    const processPayment = async () => {
      if (processed.current) return;
      processed.current = true;

      try {
        const pendingData = await SecureStore.getItemAsync(STORAGE_KEYS.PENDING_PAYMENT);
        if (!pendingData) {
          // No pending payment, go to dashboard
          navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
          return;
        }

        // Clear the pending payment immediately
        await SecureStore.deleteItemAsync(STORAGE_KEYS.PENDING_PAYMENT);

        const { planId, billingPeriod } = JSON.parse(pendingData);

        // Create subscription payment on server
        const payment = await plansService.createSubscriptionPayment(planId, billingPeriod);

        // Open Paysera in browser
        const browserResult = await paymentService.openSubscriptionPaymentBrowser(
          payment.paymentUrl,
          payment.orderId
        );

        // Navigate to success or cancel screen
        if (browserResult === 'success') {
          navigation.replace('SubscriptionSuccess', { orderId: payment.orderId });
        } else {
          navigation.replace('SubscriptionCancel', { orderId: payment.orderId });
        }
      } catch (error) {
        console.warn('Payment processing error:', error);
        // On error, just go to dashboard — user can retry later
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      }
    };

    processPayment();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.title}>
          {language === 'bg' ? 'Обработка на плащането...' : 'Processing Payment...'}
        </Text>
        <Text style={styles.subtitle}>
          {language === 'bg'
            ? 'Моля, изчакайте. Ще бъдете пренасочени към страницата за плащане.'
            : 'Please wait. You will be redirected to the payment page.'}
        </Text>
      </View>
    </View>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.onSurface,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default ProcessPaymentScreen;
