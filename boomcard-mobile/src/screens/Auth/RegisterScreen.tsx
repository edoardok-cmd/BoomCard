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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import { crossPlatformAlert } from '../../utils/alert';
import { useAuth } from '../../store/AuthContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import type { RegisterRequest } from '../../types';
import { getErrorMessage } from '../../utils/error';
import { validateEmail, validatePhone, validatePassword, validateName, normalizePhone, filterPhoneInput } from '../../utils/validation';
import { plansService, Plan } from '../../services/plans.service';
import apiClient from '../../api/client';
import * as SecureStore from '../../utils/secureStore';
import { STORAGE_KEYS } from '../../constants/config';


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
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Fetch plan details from API when planId is present
  // SECURITY: Get pricing from server, never from route params
  // Uses apiClient directly to avoid console.error in plansService triggering Expo error overlay
  useEffect(() => {
    const fetchPlan = async () => {
      if (!planId) {
        setSelectedPlan(null);
        return;
      }

      try {
        setPlanLoading(true);
        setPlanError(null);
        const response = await apiClient.get<{ success: boolean; data: Plan }>(`/api/plans/${planId}`);
        if (response.data?.success && response.data.data) {
          setSelectedPlan(response.data.data);
        } else {
          setPlanError(t('subscription.planLoadError'));
          setSelectedPlan(null);
        }
      } catch (err) {
        if (__DEV__) console.warn('Plan fetch failed:', planId);
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

  const openTerms = () => Linking.openURL('https://boomcard.bg/terms');
  const openPrivacy = () => Linking.openURL('https://boomcard.bg/privacy');

  const handleRegister = async () => {
    // Validation
    if (validateName(formData.firstName)) {
      crossPlatformAlert(t('common.error'), t('auth.fillRequiredFields'));
      return;
    }
    if (validateName(formData.lastName)) {
      crossPlatformAlert(t('common.error'), t('auth.fillRequiredFields'));
      return;
    }

    if (!acceptTerms) {
      crossPlatformAlert(
        t('common.error'),
        language === 'bg'
          ? 'Трябва да приемете Общите условия и Политиката за поверителност'
          : 'You must accept the Terms & Conditions and Privacy Policy'
      );
      return;
    }

    if (validateEmail(formData.email)) {
      crossPlatformAlert(t('common.error'), t('auth.invalidEmail'));
      return;
    }

    const phoneResult = validatePhone(formData.phone || '');
    if (phoneResult === 'required') {
      crossPlatformAlert(t('common.error'), t('auth.fillRequiredFields'));
      return;
    }
    if (phoneResult === 'invalid') {
      crossPlatformAlert(t('common.error'), t('auth.invalidPhone'));
      return;
    }

    if (validatePassword(formData.password)) {
      crossPlatformAlert(t('common.error'), t('auth.invalidPassword'));
      return;
    }

    if (formData.password !== confirmPassword) {
      crossPlatformAlert(t('common.error'), t('auth.passwordMismatch'));
      return;
    }

    setIsLoading(true);
    try {
      // If a plan is selected, save payment intent to storage BEFORE registration.
      // After registration, isAuthenticated becomes true and AppNavigator switches
      // to MainNavigator (unmounting this screen). The MainNavigator will detect
      // the pending payment and process it via ProcessPaymentScreen.
      if (selectedPlan && planId) {
        setIsProcessingPayment(true);
        await SecureStore.setItemAsync(
          STORAGE_KEYS.PENDING_PAYMENT,
          JSON.stringify({ planId, billingPeriod })
        );
      }

      // Normalize phone before sending (strip spaces/dashes)
      const registrationData = {
        ...formData,
        phone: normalizePhone(formData.phone || '') || formData.phone,
      };

      if (__DEV__) console.log('Starting registration with data:', { ...registrationData, password: '***' });
      await register(registrationData);
      if (__DEV__) console.log('Registration successful!');

      // After registration:
      // - If plan selected: AppNavigator switches to MainNavigator → ProcessPaymentScreen
      //   (reads pending payment from storage, opens Paysera, navigates to Success/Cancel)
      // - If no plan: AppNavigator switches to MainNavigator → Dashboard
    } catch (error: any) {
      // Clean up pending payment if registration failed
      await SecureStore.deleteItemAsync(STORAGE_KEYS.PENDING_PAYMENT).catch(() => {});
      setIsProcessingPayment(false);

      if (__DEV__) {
        console.warn('Registration error:', error);
        console.warn('Error type:', typeof error);
        console.warn('Error keys:', error ? Object.keys(error) : 'null');
      }

      let errorMessage = getErrorMessage(error);
      if (__DEV__) console.log('Formatted error message:', errorMessage);

      // Final safety check: never show "[object Object]"
      if (!errorMessage || errorMessage.includes('[object Object]') || errorMessage.includes('[object') || errorMessage === '{}') {
        errorMessage = t('auth.registrationFailedMessage');
      }

      crossPlatformAlert(
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
          <Image source={require('../../../assets/icon.png')} style={styles.logo} />
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

        {/* Payment Info Note */}
        {selectedPlan && displayPrice !== null && (
          <View style={styles.paymentInfo}>
            <Text style={styles.paymentInfoText}>
              <Text style={styles.paymentInfoBold}>
                {language === 'bg' ? 'Плащане: ' : 'Payment: '}
              </Text>
              {language === 'bg'
                ? 'След регистрация ще бъдете пренасочени към защитена страница на Paysera за завършване на плащането.'
                : 'After registration, you will be redirected to Paysera secure payment page to complete your payment.'}
            </Text>
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
              setFormData({ ...formData, phone: filterPhoneInput(text) })
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
            {language === 'bg'
              ? 'Мин. 8 символа, главна и малка буква, цифра и специален символ'
              : 'Min. 8 chars, uppercase & lowercase letter, number, and special character'}
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

          {/* Terms & Privacy Acceptance */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAcceptTerms(!acceptTerms)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, acceptTerms && styles.checkboxChecked]}>
              {acceptTerms && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              {language === 'bg' ? (
                <>
                  {'Приемам '}
                  <Text style={styles.termsLink} onPress={openTerms}>Общите условия</Text>
                  {' и '}
                  <Text style={styles.termsLink} onPress={openPrivacy}>Политиката за поверителност</Text>
                </>
              ) : (
                <>
                  {'I agree to the '}
                  <Text style={styles.termsLink} onPress={openTerms}>Terms & Conditions</Text>
                  {' and '}
                  <Text style={styles.termsLink} onPress={openPrivacy}>Privacy Policy</Text>
                </>
              )}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (isLoading || isProcessingPayment || planLoading || !acceptTerms) && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading || isProcessingPayment || planLoading || !acceptTerms}
          >
            {isLoading || isProcessingPayment ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.buttonText}>
                  {isProcessingPayment
                    ? (language === 'bg' ? 'Обработка на плащането...' : 'Processing Payment...')
                    : (language === 'bg' ? 'Регистрация...' : 'Registering...')}
                </Text>
              </View>
            ) : (
              <Text style={[styles.buttonText, (planLoading || !acceptTerms) && styles.buttonTextDisabled]}>
                {selectedPlan
                  ? (language === 'bg' ? 'Създай профил и продължи към плащане' : 'Create Account & Continue to Payment')
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
    width: 80,
    height: 80,
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
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  planErrorText: {
    color: '#7F1D1D',
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
    color: theme.colors.gold,
  },
  paymentInfo: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: (theme.colors as any).info || '#3B82F6',
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
  },
  paymentInfoText: {
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  paymentInfoBold: {
    fontWeight: '700',
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
    backgroundColor: theme.colors.surface,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.gold,
    borderColor: theme.colors.gold,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 20,
  },
  termsLink: {
    color: theme.colors.gold,
    fontWeight: '600',
    textDecorationLine: 'underline' as const,
  },
  button: {
    backgroundColor: theme.colors.gold,
    borderRadius: 28,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#C49B38',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.surfaceVariant,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: theme.colors.onGold,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  buttonTextDisabled: {
    color: '#FFFFFF',
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
    color: theme.colors.gold,
    fontWeight: '600',
  },
});

export default RegisterScreen;
