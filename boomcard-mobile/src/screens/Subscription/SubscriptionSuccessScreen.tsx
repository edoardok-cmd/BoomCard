/**
 * Subscription Success Screen
 *
 * Displays subscription verification status after payment redirect from Paysera.
 * Mirrors the website's /subscription/success page.
 *
 * SECURITY: This screen NEVER activates the subscription.
 * Activation happens ONLY via webhook. This screen only displays status.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { plansService, SubscriptionStatus } from '../../services/plans.service';
import { useTheme } from '../../contexts/ThemeContext';

const POLLING_INTERVAL = 2000; // 2 seconds
const MAX_POLLING_TIME = 30000; // 30 seconds before showing warning
const MAX_TOTAL_TIME = 120000; // 2 minutes before giving up

type StatusType = 'loading' | 'success' | 'pending' | 'error';

const SubscriptionSuccessScreen = ({ navigation, route }: any) => {
  const { i18n } = useTranslation();
  const { theme, isDarkMode } = useTheme();
  const language = i18n.language === 'bg' ? 'bg' : 'en';

  const orderId: string | null = route?.params?.orderId || null;

  const [status, setStatus] = useState<StatusType>('loading');
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPolling, setIsPolling] = useState(true);
  const elapsedRef = useRef(0);

  const styles = getStyles(theme, isDarkMode);

  const checkStatus = useCallback(async () => {
    if (!orderId) {
      setStatus('error');
      return;
    }

    try {
      const result = await plansService.checkSubscriptionStatus(orderId);
      setSubscription(result);

      if (result.isActive) {
        setStatus('success');
        setIsPolling(false);
      } else {
        setStatus('pending');
      }
    } catch (error) {
      console.warn('Error checking subscription status:', error);
      if (elapsedRef.current > MAX_TOTAL_TIME) {
        setStatus('error');
        setIsPolling(false);
      }
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      setStatus('error');
      return;
    }

    // Initial check
    checkStatus();

    const pollInterval = setInterval(() => {
      if (isPolling && status !== 'success') {
        checkStatus();
        elapsedRef.current += POLLING_INTERVAL;
        setElapsedTime(elapsedRef.current);
      }
    }, POLLING_INTERVAL);

    const timeoutId = setTimeout(() => {
      setIsPolling(false);
    }, MAX_TOTAL_TIME);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeoutId);
    };
  }, [orderId, checkStatus, isPolling, status]);

  const handleRetry = () => {
    elapsedRef.current = 0;
    setElapsedTime(0);
    setIsPolling(true);
    setStatus('loading');
    checkStatus();
  };

  const handleGoToDashboard = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  };

  const showTimeoutWarning = elapsedTime >= MAX_POLLING_TIME && status !== 'success';

  const getIcon = (): { name: keyof typeof Ionicons.glyphMap; color: string; bgColor: string } => {
    switch (status) {
      case 'success':
        return { name: 'checkmark-circle', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.1)' };
      case 'pending':
        return { name: 'time', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' };
      case 'error':
        return { name: 'alert-circle', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)' };
      default:
        return { name: 'hourglass', color: theme.colors.primary, bgColor: `${theme.colors.primary}1A` };
    }
  };

  const getTitle = (): string => {
    switch (status) {
      case 'success':
        return language === 'bg' ? 'Плащането е успешно!' : 'Payment Successful!';
      case 'pending':
        return language === 'bg' ? 'Проверка на плащането...' : 'Verifying Payment...';
      case 'error':
        return language === 'bg' ? 'Нещо се обърка' : 'Something Went Wrong';
      default:
        return language === 'bg' ? 'Обработка...' : 'Processing...';
    }
  };

  const getSubtitle = (): string => {
    switch (status) {
      case 'success':
        return language === 'bg'
          ? 'Вашият абонамент е активен. Можете да започнете да използвате Premium функциите веднага.'
          : 'Your subscription is now active. You can start using Premium features right away.';
      case 'pending':
        return language === 'bg'
          ? 'Моля, изчакайте докато потвърдим вашето плащане. Това обикновено отнема няколко секунди.'
          : 'Please wait while we confirm your payment. This usually takes a few seconds.';
      case 'error':
        return language === 'bg'
          ? 'Не успяхме да потвърдим вашето плащане. Моля, свържете се с поддръжката ако проблемът продължава.'
          : 'We could not confirm your payment. Please contact support if the issue persists.';
      default:
        return language === 'bg' ? 'Зареждане...' : 'Loading...';
    }
  };

  const getBillingPeriodLabel = (period: string | undefined): string => {
    if (!period) return '-';
    switch (period) {
      case 'weekly':
        return language === 'bg' ? 'Седмичен' : 'Weekly';
      case 'monthly':
        return language === 'bg' ? 'Месечен' : 'Monthly';
      case 'yearly':
        return language === 'bg' ? 'Годишен' : 'Yearly';
      default:
        return period;
    }
  };

  const icon = getIcon();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: icon.bgColor }]}>
          {status === 'loading' ? (
            <ActivityIndicator size="large" color={theme.colors.primary} />
          ) : (
            <Ionicons name={icon.name as any} size={40} color={icon.color} />
          )}
        </View>

        {/* Title & Subtitle */}
        <Text style={styles.title}>{getTitle()}</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>

        {/* Timeout Warning */}
        {showTimeoutWarning && (
          <View style={styles.timeoutWarning}>
            <Text style={styles.timeoutText}>
              {language === 'bg'
                ? 'Обработката отнема повече време от очакваното. Вашето плащане може да бъде все още в процес на обработка.'
                : 'Processing is taking longer than expected. Your payment may still be processing.'}
            </Text>
          </View>
        )}

        {/* Subscription Details */}
        {subscription && (
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {language === 'bg' ? 'План' : 'Plan'}
              </Text>
              <Text style={styles.detailValue}>
                {language === 'bg' ? subscription.plan.nameBg : subscription.plan.name}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {language === 'bg' ? 'Период' : 'Billing Period'}
              </Text>
              <Text style={styles.detailValue}>
                {getBillingPeriodLabel(subscription.billingPeriod)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {language === 'bg' ? 'Статус' : 'Status'}
              </Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: subscription.isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)' },
              ]}>
                <Text style={[
                  styles.statusBadgeText,
                  { color: subscription.isActive ? '#10b981' : '#f59e0b' },
                ]}>
                  {subscription.isActive
                    ? (language === 'bg' ? 'Активен' : 'Active')
                    : (language === 'bg' ? 'Обработва се' : 'Processing')}
                </Text>
              </View>
            </View>
            {subscription.currentPeriodEnd && subscription.isActive && (
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.detailLabel}>
                  {language === 'bg' ? 'Валиден до' : 'Valid Until'}
                </Text>
                <Text style={styles.detailValue}>
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString(
                    language === 'bg' ? 'bg-BG' : 'en-US',
                    { year: 'numeric', month: 'long', day: 'numeric' }
                  )}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Buttons */}
        {status === 'success' ? (
          <TouchableOpacity style={styles.primaryButton} onPress={handleGoToDashboard}>
            <Text style={styles.primaryButtonText}>
              {language === 'bg' ? 'Към Профила' : 'Go to Dashboard'}
            </Text>
          </TouchableOpacity>
        ) : (status === 'error' || (showTimeoutWarning && !isPolling)) ? (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
              <Ionicons name="refresh" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>
                {language === 'bg' ? 'Опитай отново' : 'Try Again'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleGoToDashboard}>
              <Text style={styles.secondaryButtonText}>
                {language === 'bg' ? 'Свържи се с поддръжката' : 'Contact Support'}
              </Text>
            </TouchableOpacity>
          </>
        ) : null}

        {/* Polling Indicator */}
        {isPolling && status !== 'success' && (
          <View style={styles.pollingIndicator}>
            <ActivityIndicator size="small" color={theme.colors.onSurfaceVariant} />
            <Text style={styles.pollingText}>
              {language === 'bg' ? 'Проверка на статуса...' : 'Checking status...'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
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

  // Icon
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },

  // Title & Subtitle
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },

  // Timeout Warning
  timeoutWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    width: '100%',
  },
  timeoutText: {
    fontSize: 13,
    color: '#fbbf24',
    textAlign: 'center',
  },

  // Subscription Details
  detailsCard: {
    width: '100%',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceVariant,
  },
  detailLabel: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },

  // Status Badge
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Buttons
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onSurfaceVariant,
  },

  // Polling
  pollingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  pollingText: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
});

export default SubscriptionSuccessScreen;
