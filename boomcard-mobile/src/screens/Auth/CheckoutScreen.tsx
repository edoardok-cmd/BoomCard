/**
 * Checkout Screen
 *
 * Mirrors the website's /checkout page:
 * - Payment form (display-only, actual payment via Paysera)
 * - Order summary with credit card visual
 * - Features list
 * - Login prompt if not authenticated
 *
 * SECURITY: Only planId and billing period are passed — pricing comes from API.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../store/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { plansService, Plan } from '../../services/plans.service';
import { paymentService } from '../../services/payment.service';
import apiClient from '../../api/client';
import { APP_CONFIG } from '../../constants/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 340);
const CARD_HEIGHT = 200;


// Credit card visual colors — brand elements, stay constant regardless of theme
const CARD_COLORS = {
  light: {
    bg: '#ffffff',
    text: '#4a4a4a',
    price: '#4a4a4a',
    number: 'rgba(100, 100, 100, 0.8)',
    border: 'rgba(200, 200, 200, 0.5)',
  },
  silver: {
    bg: '#c0c0c0',
    text: '#1a1a1a',
    price: '#1a1a1a',
    number: 'rgba(26, 26, 26, 0.9)',
    border: 'rgba(255, 255, 255, 0.3)',
  },
  black: {
    bg: '#1a1a1a',
    text: '#ffd700',
    price: '#ffd700',
    number: 'rgba(255, 255, 255, 0.9)',
    border: '#ffd700',
  },
};

const CheckoutScreen = ({ navigation, route }: any) => {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { theme, isDarkMode } = useTheme();
  const language = i18n.language === 'bg' ? 'bg' : 'en';

  const planId: string = route?.params?.planId;
  const billingPeriod: 'weekly' | 'monthly' | 'yearly' = route?.params?.billing || 'monthly';
  // Passed from UpgradePlansScreen when this is an upgrade flow (light/silver/black)
  const currentCardType: string | undefined = route?.params?.currentCardType;
  // Price of the user's current subscription (EUR) — used to compute the credit deduction.
  // Passed by UpgradePlansScreen; null means we can't show a breakdown (still show % notice).
  const currentPlanPrice: number | null = route?.params?.currentPlanPrice ?? null;

  // Mirrors the credit logic in UpgradePlansScreen
  const getUpgradeCreditPercent = (targetCardType: string): number | null => {
    if (!currentCardType) return null;
    if (currentCardType === 'light' && targetCardType === 'black') return 100;
    if (currentCardType === 'silver' && targetCardType === 'black') return 60;
    return null;
  };

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const styles = getStyles(theme, isDarkMode);

  useEffect(() => {
    const fetchPlan = async () => {
      if (!planId) { setLoading(false); return; }
      try {
        const response = await apiClient.get<{ success: boolean; data: Plan }>(`/api/plans/${planId}`);
        if (response.data?.success && response.data.data) {
          setPlan(response.data.data);
        } else {
          setPlan(null);
        }
      } catch {
        setPlan(null);
      } finally {
        setLoading(false);
      }
    };
    fetchPlan();
  }, [planId]);

  const convertEURToBGN = (eur: number) => +(eur * APP_CONFIG.EUR_EXCHANGE_RATE).toFixed(2);

  const getPrice = (): number | null => {
    if (!plan) return null;
    if (billingPeriod === 'weekly') return plan.pricing.weekly;
    if (billingPeriod === 'monthly') return plan.pricing.monthly;
    return plan.pricing.yearly;
  };

  const getPeriodLabel = (): string => {
    if (billingPeriod === 'weekly') return language === 'bg' ? 'Седмичен' : 'Weekly';
    if (billingPeriod === 'monthly') return language === 'bg' ? 'Месечен' : 'Monthly';
    return language === 'bg' ? 'Годишен' : 'Yearly';
  };

  const getPeriodSuffix = (): string => {
    if (billingPeriod === 'weekly') return language === 'bg' ? '/седмица' : '/week';
    if (billingPeriod === 'monthly') return language === 'bg' ? '/месец' : '/month';
    return language === 'bg' ? '/година' : '/year';
  };

  const handlePay = async () => {
    if (!isAuthenticated) {
      // Not authenticated — navigate to Register with plan params
      navigation.navigate('Register', { planId, billing: billingPeriod });
      return;
    }

    // Authenticated — process payment directly
    setIsProcessing(true);
    try {
      const paymentResult = await plansService.createSubscriptionPayment(planId, billingPeriod);
      // Open Paysera in browser
      const browserResult = await paymentService.openSubscriptionPaymentBrowser(
        paymentResult.paymentUrl,
        paymentResult.orderId
      );

      if (browserResult === 'success') {
        navigation.navigate('SubscriptionSuccess', { orderId: paymentResult.orderId });
      } else {
        navigation.navigate('SubscriptionCancel', { orderId: paymentResult.orderId });
      }
    } catch (err) {
      console.warn('Payment error:', err);
      setIsProcessing(false);
    }
  };

  const priceEUR = getPrice();
  const priceBGN = priceEUR ? convertEURToBGN(priceEUR) : 0;
  const upgradeCreditPct = plan ? getUpgradeCreditPercent(plan.cardType) : null;
  // Credit amount deducted from the upgrade price, and the net amount the user actually pays.
  // Only available when the current plan price was passed from UpgradePlansScreen.
  const creditAmount = (upgradeCreditPct !== null && currentPlanPrice !== null)
    ? (currentPlanPrice * upgradeCreditPct / 100)
    : null;
  // Clamp to 0 — defensive against edge-case where credit would exceed target price.
  const netAmount = (priceEUR !== null && creditAmount !== null)
    ? Math.max(0, priceEUR - creditAmount)
    : null;
  const colors = plan ? CARD_COLORS[plan.cardType] : CARD_COLORS.light;
  const planName = plan ? (language === 'bg' ? plan.displayNameBg : plan.displayName) : '';
  const features = plan ? (language === 'bg' ? plan.featuresBg : plan.features) : [];

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>
            {language === 'bg' ? 'Планът не е намерен' : 'Plan not found'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {language === 'bg' ? 'Завършете поръчката' : 'Complete your order'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Login Prompt (if not authenticated) */}
        {!isAuthenticated && (
          <View style={styles.loginPrompt}>
            <Text style={styles.loginPromptText}>
              {language === 'bg'
                ? 'Имате акаунт? Влезте за по-бърз checkout.'
                : 'Have an account? Log in for faster checkout.'}
            </Text>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.loginButtonText}>
                {language === 'bg' ? 'Вход' : 'Log in'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Payment Section */}
        <View style={styles.paymentSection}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="card" size={20} color={theme.colors.onSurface} />
            <Text style={styles.sectionTitle}>
              {language === 'bg' ? 'Плащане' : 'Payment'}
            </Text>
          </View>

          {/* Paysera redirect notice */}
          <View style={styles.payseraNotice}>
            <Ionicons name="shield-checkmark" size={20} color="#10b981" />
            <Text style={styles.payseraNoticeText}>
              {language === 'bg'
                ? 'Ще бъдете пренасочени към Paysera за сигурно завършване на плащането.'
                : 'You will be redirected to Paysera to securely complete your payment.'}
            </Text>
          </View>

          {/* Pay Button */}
          <TouchableOpacity
            style={[styles.payButton, isProcessing && styles.payButtonDisabled]}
            onPress={handlePay}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <View style={styles.processingRow}>
                <ActivityIndicator size="small" color="#000" />
                <Text style={styles.payButtonText}>
                  {language === 'bg' ? 'Обработка...' : 'Processing...'}
                </Text>
              </View>
            ) : upgradeCreditPct !== null ? (
              <Text style={styles.payButtonText}>
                {netAmount !== null
                  ? (language === 'bg' ? `Надградете — Платете €${netAmount.toFixed(2)}` : `Upgrade — Pay €${netAmount.toFixed(2)}`)
                  : t('subscription.upgradePayButton')}
              </Text>
            ) : (
              <Text style={styles.payButtonText}>
                {language === 'bg'
                  ? `Плати €${priceEUR} ${getPeriodSuffix()}`
                  : `Pay €${priceEUR} ${getPeriodSuffix()}`}
              </Text>
            )}
          </TouchableOpacity>

          {/* Security Note */}
          <View style={styles.securityNote}>
            <Ionicons name="lock-closed" size={14} color="#10b981" />
            <Text style={styles.securityText}>
              {language === 'bg'
                ? 'Вашето плащане е защитено с 256-bit SSL криптиране'
                : 'Your payment is secured with 256-bit SSL encryption'}
            </Text>
          </View>
        </View>

        {/* Order Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            {language === 'bg' ? 'Обобщение на поръчката' : 'Order Summary'}
          </Text>

          {/* Credit Card Visual */}
          <View style={styles.cardContainer}>
            <View style={[
              styles.creditCard,
              { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: plan.cardType === 'black' ? 3 : 2 },
            ]}>
              <Text style={[styles.cardLogo, { color: colors.text }]}>BOOM Card</Text>
              <View style={styles.cardNumberRow}>
                {['••••', '••••', '••••', '••••'].map((dots, i) => (
                  <Text key={i} style={[styles.cardDots, { color: colors.number }]}>{dots}</Text>
                ))}
              </View>
              <View style={styles.cardBottom}>
                <Text style={[styles.cardHolder, { color: colors.text }]}>{planName}</Text>
                <View style={styles.cardPriceArea}>
                  <Text style={[styles.cardPriceBGN, { color: colors.price, opacity: 0.85 }]}>
                    {priceBGN.toFixed(2)} {language === 'bg' ? 'лв.' : 'BGN'} /
                  </Text>
                  <Text style={[styles.cardPriceEUR, { color: colors.price }]}>€{priceEUR}</Text>
                  <Text style={[styles.cardPricePeriod, { color: colors.price, opacity: 0.8 }]}>
                    {getPeriodSuffix()}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{language === 'bg' ? 'План' : 'Plan'}</Text>
            <Text style={styles.summaryValue}>{planName}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {language === 'bg' ? 'Период на фактуриране' : 'Billing Period'}
            </Text>
            <Text style={styles.summaryValue}>{getPeriodLabel()}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {language === 'bg' ? 'Кешбек процент' : 'Cashback Rate'}
            </Text>
            <Text style={styles.summaryValue}>
              {language === 'bg' ? 'до ' : 'up to '}{plan.cashbackRate < 1 ? Math.round(plan.cashbackRate * 100) : plan.cashbackRate}%
            </Text>
          </View>

          {plan.payoutThreshold != null && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {language === 'bg' ? 'Мин. изплащане' : 'Min. payout'}
              </Text>
              <Text style={styles.summaryValue}>
                €{plan.payoutThreshold}
              </Text>
            </View>
          )}

          {upgradeCreditPct !== null && (
            <View style={styles.creditNotice}>
              <Ionicons name="gift-outline" size={15} color="#16a34a" />
              <View style={{ flex: 1 }}>
                <Text style={styles.creditNoticeText}>
                  {t('subscription.upgradeCredit', { percent: upgradeCreditPct })}
                </Text>
                {creditAmount !== null && netAmount !== null && (
                  <Text style={[styles.creditNoticeText, { marginTop: 4, fontWeight: '700' }]}>
                    {t('subscription.upgradeCreditBreakdown', {
                      credit: creditAmount.toFixed(2),
                      net: netAmount.toFixed(2),
                    })}
                  </Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>{language === 'bg' ? 'Общо' : 'Total'}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              {netAmount !== null ? (
                <>
                  <Text style={[styles.totalPrice, { textDecorationLine: 'line-through', opacity: 0.4, fontSize: 16 }]}>
                    €{priceEUR}
                  </Text>
                  <Text style={styles.totalPrice}>€{netAmount.toFixed(2)}</Text>
                  <Text style={styles.totalPriceBGN}>
                    {convertEURToBGN(netAmount).toFixed(2)} {language === 'bg' ? 'лв.' : 'BGN'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.totalPrice}>€{priceEUR}</Text>
                  <Text style={styles.totalPriceBGN}>
                    {priceBGN.toFixed(2)} {language === 'bg' ? 'лв.' : 'BGN'}
                  </Text>
                </>
              )}
              <Text style={styles.totalPricePeriod}>{getPeriodSuffix()}</Text>
            </View>
          </View>

          {/* Features List */}
          {features.length > 0 && (
            <View style={styles.featuresList}>
              {features.map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  <Ionicons name="checkmark" size={16} color="#10b981" />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Back to plans link */}
        <TouchableOpacity
          style={styles.backToPlansTouchable}
          onPress={() => navigation.navigate('PlanSelection')}
        >
          <Ionicons name="arrow-back" size={16} color={theme.colors.primary} />
          <Text style={styles.backToPlansText}>
            {language === 'bg' ? 'Обратно към плановете' : 'Back to plans'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },

  // Login Prompt
  loginPrompt: {
    backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0, 0, 0, 0.04)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  loginPromptText: {
    color: isDarkMode ? '#93C5FD' : '#1E40AF',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  loginButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  loginButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Payment Section
  paymentSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
    marginBottom: 20,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  payseraNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: isDarkMode ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.08)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  payseraNoticeText: {
    flex: 1,
    fontSize: 14,
    color: isDarkMode ? '#6EE7B7' : '#065F46',
    lineHeight: 20,
  },

  // Pay Button
  payButton: {
    backgroundColor: '#d4af37',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#c9a237',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
    marginTop: 4,
  },
  payButtonDisabled: {
    opacity: 0.7,
  },
  payButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Security Note
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceVariant,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },

  // Order Summary
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginBottom: 16,
  },

  // Credit Card Visual
  cardContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  creditCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    padding: 20,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardLogo: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  cardNumberRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardDots: {
    fontSize: 18,
    fontFamily: 'Courier',
    letterSpacing: 2,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardHolder: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '400',
  },
  cardPriceArea: {
    alignItems: 'flex-end',
  },
  cardPriceBGN: {
    fontSize: 11,
  },
  cardPriceEUR: {
    fontSize: 24,
    fontWeight: '400',
  },
  cardPricePeriod: {
    fontSize: 10,
  },

  // Summary Rows
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryLabel: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  divider: {
    height: 2,
    backgroundColor: theme.colors.surfaceVariant,
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  totalPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  totalPriceBGN: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  totalPricePeriod: {
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    marginTop: 1,
  },

  // Upgrade credit notice
  creditNotice: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
  },
  creditNoticeText: {
    flex: 1,
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '500' as const,
  },

  // Features List
  featuresList: {
    marginTop: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  featureText: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },

  // Back to Plans
  backToPlansTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  backToPlansText: {
    fontSize: 14,
    color: theme.colors.primary,
  },
});

export default CheckoutScreen;
