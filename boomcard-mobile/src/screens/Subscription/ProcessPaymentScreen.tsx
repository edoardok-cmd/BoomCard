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

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as SecureStore from '../../utils/secureStore';
import { STORAGE_KEYS } from '../../constants/config';
import { plansService } from '../../services/plans.service';
import { paymentService } from '../../services/payment.service';
import { useTheme } from '../../contexts/ThemeContext';
import { captureError } from '../../utils/sentry';

const ProcessPaymentScreen = ({ navigation }: any) => {
  const { i18n } = useTranslation();
  const { theme } = useTheme();
  const language = i18n.language === 'bg' ? 'bg' : 'en';
  const processed = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<{ planId: string; billingPeriod: string } | null>(null);

  const styles = getStyles(theme);

  const processPayment = async () => {
    setError(null);

    try {
      let pending = pendingRef.current;

      if (!pending) {
        const pendingData = await SecureStore.getItemAsync(STORAGE_KEYS.PENDING_PAYMENT);
        if (!pendingData) {
          navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
          return;
        }
        pending = JSON.parse(pendingData);
        pendingRef.current = pending;
        await SecureStore.deleteItemAsync(STORAGE_KEYS.PENDING_PAYMENT);
      }

      const { planId, billingPeriod } = pending!;

      const payment = await plansService.createSubscriptionPayment(
        planId,
        billingPeriod as 'weekly' | 'monthly' | 'yearly'
      );

      const browserResult = await paymentService.openSubscriptionPaymentBrowser(
        payment.paymentUrl,
        payment.orderId
      );

      if (browserResult === 'success') {
        navigation.replace('SubscriptionSuccess', { orderId: payment.orderId });
      } else {
        navigation.replace('SubscriptionCancel', { orderId: payment.orderId });
      }
    } catch (err: any) {
      captureError(err, { screen: 'ProcessPaymentScreen', planId: pendingRef.current?.planId });
      console.warn('Payment processing error:', err);
      setError(
        err?.response?.data?.message ||
        (language === 'bg'
          ? 'Грешка при обработка на плащането. Моля, опитайте отново.'
          : 'Error processing payment. Please try again.')
      );
    }
  };

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    processPayment();
  }, []);

  const handleRetry = () => {
    setError(null);
    processPayment();
  };

  const handleGoToDashboard = () => {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
            <Ionicons name="alert-circle" size={40} color="#ef4444" />
          </View>
          <Text style={styles.title}>
            {language === 'bg' ? 'Грешка при плащане' : 'Payment Error'}
          </Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleRetry}>
            <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>
              {language === 'bg' ? 'Опитай отново' : 'Try Again'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleGoToDashboard}>
            <Text style={styles.secondaryButtonText}>
              {language === 'bg' ? 'Към профила' : 'Go to Dashboard'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
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
  errorText: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  secondaryButtonText: {
    color: theme.colors.onSurface,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ProcessPaymentScreen;
