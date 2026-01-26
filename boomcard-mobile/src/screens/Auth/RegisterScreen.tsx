/**
 * Register Screen
 *
 * User registration form with optional subscription payment flow
 *
 * SECURITY: If planId is passed, price comes from server (not URL params)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../../store/AuthContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import type { RegisterRequest } from '../../types';
import { getErrorMessage } from '../../utils/error';
import { plansService, Plan } from '../../services/plans.service';
import { paymentService } from '../../services/payment.service';

interface RouteParams {
  planId?: string;
  billing?: 'weekly' | 'monthly' | 'yearly';
}

const RegisterScreen = ({ navigation, route }: any) => {
  const { register } = useAuth();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();

  // SECURITY: Extract ONLY planId and billing from route params - NO PRICE!
  const params: RouteParams = route?.params || {};
  const planId = params.planId;
  const billingPeriod = params.billing || 'monthly';

  // Plan state - fetched from API (server-side pricing)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [formData, setFormData] = useState<RegisterRequest>({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Fetch plan details from API when planId is present
  // SECURITY: Get pricing from server, never from route params
  useEffect(() => {
    const fetchPlan = async () => {
      if (!planId) {
        setSelectedPlan(null);
        return;
      }

      try {
        setPlanLoading(true);
        setPlanError(null);
        const plan = await plansService.getPlanById(planId);
        setSelectedPlan(plan);
      } catch (err) {
        console.error('Error fetching plan:', err);
        setPlanError(t('subscription.planLoadError'));
        setSelectedPlan(null);
      } finally {
        setPlanLoading(false);
      }
    };

    fetchPlan();
  }, [planId, t]);

  // Get display price from server-side plan data
  const getDisplayPrice = (): number | null => {
    if (!selectedPlan) return null;
    return plansService.getDisplayPrice(selectedPlan, billingPeriod);
  };

  const displayPrice = getDisplayPrice();
  const language = i18n.language === 'bg' ? 'bg' : 'en';

  const handleRegister = async () => {
    // Validation
    if (!formData.email || !formData.password || !formData.firstName || !formData.lastName) {
      Alert.alert(t('common.error'), t('auth.fillRequiredFields'));
      return;
    }

    if (!formData.email.includes('@')) {
      Alert.alert(t('common.error'), t('auth.invalidEmail'));
      return;
    }

    if (formData.password.length < 8) {
      Alert.alert(t('common.error'), t('auth.invalidPassword'));
      return;
    }

    if (formData.password !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.passwordMismatch'));
      return;
    }

    setIsLoading(true);
    try {
      console.log('Starting registration with data:', { ...formData, password: '***' });
      await register(formData);
      console.log('Registration successful!');

      // If a plan is selected, process subscription payment
      // SECURITY: Only pass planId and billingPeriod - price comes from server!
      if (selectedPlan && planId) {
        setIsProcessingPayment(true);
        try {
          console.log('Processing subscription payment for plan:', planId);
          const paymentResult = await paymentService.processSubscriptionPayment(
            planId,
            billingPeriod
          );

          if (paymentResult.success) {
            Alert.alert(
              t('subscription.success'),
              t('subscription.activatedMessage'),
              [{ text: 'OK' }]
            );
          } else {
            // Payment cancelled or failed - user can retry later from dashboard
            Alert.alert(
              t('subscription.paymentCancelled'),
              t('subscription.canRetryLater'),
              [{ text: 'OK' }]
            );
          }
        } catch (paymentError: any) {
          console.error('Payment error:', paymentError);
          // Show error but don't block - user status will be PENDING_PAYMENT
          Alert.alert(
            t('subscription.paymentError'),
            t('subscription.canRetryLater'),
            [{ text: 'OK' }]
          );
        } finally {
          setIsProcessingPayment(false);
        }
      }

      // Navigation will be handled automatically by AppNavigator
    } catch (error: any) {
      console.error('Registration error:', error);
      console.error('Error type:', typeof error);
      console.error('Error keys:', error ? Object.keys(error) : 'null');

      let errorMessage = getErrorMessage(error);
      console.log('Formatted error message:', errorMessage);

      // Final safety check: never show "[object Object]"
      if (!errorMessage || errorMessage.includes('[object Object]') || errorMessage.includes('[object') || errorMessage === '{}') {
        errorMessage = t('auth.registrationFailedMessage');
      }

      Alert.alert(
        t('auth.registerError'),
        errorMessage
      );
    } finally {
      setIsLoading(false);
    }
  };

  const styles = getStyles(theme);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>💥</Text>
          <Text style={styles.title}>{t('auth.createAccount')}</Text>
          <Text style={styles.subtitle}>{t('auth.joinBoomCard')}</Text>
        </View>

        {/* Selected Plan Summary - pricing from API (server-side) */}
        {planLoading && (
          <View style={styles.planSummary}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}

        {planError && (
          <View style={[styles.planSummary, styles.planError]}>
            <Text style={styles.planErrorText}>{planError}</Text>
          </View>
        )}

        {selectedPlan && displayPrice !== null && (
          <View style={styles.planSummary}>
            <Text style={styles.planSummaryTitle}>
              {language === 'bg' ? 'Избран План' : 'Selected Plan'}
            </Text>
            <View style={styles.planDetail}>
              <Text style={styles.planLabel}>
                {language === 'bg' ? 'План' : 'Plan'}
              </Text>
              <Text style={styles.planValue}>
                {language === 'bg' ? selectedPlan.displayNameBg : selectedPlan.displayName}
              </Text>
            </View>
            <View style={styles.planDetail}>
              <Text style={styles.planLabel}>
                {language === 'bg' ? 'Период' : 'Billing'}
              </Text>
              <Text style={styles.planValue}>
                {plansService.getBillingPeriodLabel(billingPeriod, language)}
              </Text>
            </View>
            <View style={[styles.planDetail, styles.planPriceRow]}>
              <Text style={styles.planPriceLabel}>
                {language === 'bg' ? 'Сума' : 'Total'}
              </Text>
              <Text style={styles.planPriceValue}>
                {plansService.formatPrice(displayPrice, selectedPlan.pricing.currency)}
              </Text>
            </View>
          </View>
        )}

        {/* Registration Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t('auth.firstNamePlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.firstName}
            onChangeText={(text) =>
              setFormData({ ...formData, firstName: text })
            }
            autoCapitalize="words"
            editable={!isLoading}
          />

          <TextInput
            style={styles.input}
            placeholder={t('auth.lastNamePlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.lastName}
            onChangeText={(text) =>
              setFormData({ ...formData, lastName: text })
            }
            autoCapitalize="words"
            editable={!isLoading}
          />

          <TextInput
            style={styles.input}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.email}
            onChangeText={(text) =>
              setFormData({ ...formData, email: text.toLowerCase() })
            }
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <TextInput
            style={styles.input}
            placeholder={t('auth.phonePlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.phone}
            onChangeText={(text) =>
              setFormData({ ...formData, phone: text })
            }
            keyboardType="phone-pad"
            editable={!isLoading}
          />

          <TextInput
            style={styles.input}
            placeholder={t('auth.passwordPlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.password}
            onChangeText={(text) =>
              setFormData({ ...formData, password: text })
            }
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <Text style={styles.passwordRequirement}>
            {t('profile.requirement8Chars')}
          </Text>

          <TextInput
            style={styles.input}
            placeholder={t('auth.confirmPasswordPlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <TouchableOpacity
            style={[styles.button, (isLoading || isProcessingPayment || planLoading) && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading || isProcessingPayment || planLoading}
          >
            {isLoading || isProcessingPayment ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.buttonText}>
                  {isProcessingPayment
                    ? (language === 'bg' ? 'Обработка...' : 'Processing...')
                    : (language === 'bg' ? 'Регистрация...' : 'Registering...')}
                </Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>
                {selectedPlan
                  ? (language === 'bg' ? 'Регистрирай и продължи' : 'Register & Continue')
                  : t('auth.createAccount')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Login Link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.alreadyHaveAccount')} </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.link}>{t('auth.login')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 48,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.onSurfaceVariant,
  },
  // Plan Summary Styles
  planSummary: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  planError: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
  },
  planErrorText: {
    color: '#991b1b',
    fontSize: 14,
    textAlign: 'center',
  },
  planSummaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 12,
  },
  planDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  planLabel: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  planValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  planPriceRow: {
    borderBottomWidth: 0,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: theme.colors.outline,
  },
  planPriceLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  planPriceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  form: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
    color: theme.colors.onSurface,
  },
  passwordRequirement: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: -8,
    marginBottom: 12,
    marginLeft: 4,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.surfaceVariant,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 24,
  },
  footerText: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  link: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});

export default RegisterScreen;
