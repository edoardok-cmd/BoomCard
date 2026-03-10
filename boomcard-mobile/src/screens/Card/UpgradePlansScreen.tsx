/**
 * Upgrade Plans Screen
 *
 * Shows available plan upgrades above the user's current tier.
 * Reuses credit card styled plan cards from PlanSelectionScreen.
 * Navigates to Checkout screen for payment.
 */

import React, { useState, useEffect, useLayoutEffect } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import apiClient from '../../api/client';
import { Plan } from '../../services/plans.service';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 340);
const CARD_HEIGHT = 200;

// Tier order for filtering — cardType values from plan definitions
const TIER_ORDER = ['light', 'silver', 'black'] as const;

// Map backend card types (LIGHT/BASIC/PREMIUM) to plan card types (light/silver/black)
const BACKEND_TO_PLAN_CARD_TYPE: Record<string, string> = {
  light: 'light',
  basic: 'silver',
  premium: 'black',
};

// Fallback plans when API is unavailable
const getFallbackPlans = (): Plan[] => [
  {
    id: 'lite-premium',
    planCode: 'LITE_PREMIUM',
    displayName: 'LITE PREMIUM',
    displayNameBg: 'ЛАЙТ ПРЕМИУМ',
    pricing: { weekly: 4.99, monthly: null, yearly: 52, currency: 'EUR', yearlyDiscountPct: 20 },
    billingOptions: { hasWeekly: true, hasMonthly: false, hasYearly: false },
    cashbackRate: 20,
    stickerBonus: 0,
    features: [
      'One week Premium access',
      'Up to 20% discount',
      'Exclusive Premium offers',
      'Limited availability special offers',
      'Access to exclusive Premium campaigns',
      'VIP priority support',
      'Cashback via the app',
    ],
    featuresBg: [
      'Едноседмичен Premium достъп',
      'До 20% отстъпка',
      'Ексклузивни Premium оферти',
      'Специални предложения с ограничена наличност',
      'Достъп до затворени Premium кампании',
      'VIP приоритетна поддръжка',
      'Връщане на пари чрез приложението',
    ],
    cardType: 'light',
    isFeatured: false,
    badge: { text: 'Most Bought', textBg: 'Най-купуван' },
  },
  {
    id: 'basic',
    planCode: 'BASIC',
    displayName: 'BASIC',
    displayNameBg: 'ОСНОВЕН',
    pricing: { weekly: null, monthly: 7.99, yearly: 84, currency: 'EUR', yearlyDiscountPct: 20 },
    billingOptions: { hasWeekly: false, hasMonthly: true, hasYearly: true },
    cashbackRate: 10,
    stickerBonus: 0,
    features: [
      'One month access',
      'Up to 10% discount',
      'Cashback via the app',
      'Access to partner offers',
      'Standard support',
    ],
    featuresBg: [
      'Едномесечен достъп',
      'До 10% отстъпка',
      'Връщане на пари чрез приложението',
      'Достъп до партньорски оферти',
      'Стандартна поддръжка',
    ],
    cardType: 'silver',
    isFeatured: false,
    badge: null,
  },
  {
    id: 'premium',
    planCode: 'PREMIUM',
    displayName: 'PREMIUM',
    displayNameBg: 'ПРЕМИУМ',
    pricing: { weekly: null, monthly: 12.99, yearly: 136, currency: 'EUR', yearlyDiscountPct: 20 },
    billingOptions: { hasWeekly: false, hasMonthly: true, hasYearly: true },
    cashbackRate: 20,
    stickerBonus: 0,
    features: [
      'One month Premium access',
      'Up to 20% discount',
      'Exclusive Premium offers',
      'Limited availability special offers',
      'Access to exclusive Premium campaigns',
      'VIP priority support',
      'Cashback via the app',
    ],
    featuresBg: [
      'Едномесечен Premium достъп',
      'До 20% отстъпка',
      'Ексклузивни Premium оферти',
      'Специални предложения с ограничена наличност',
      'Достъп до затворени Premium кампании',
      'VIP приоритетна поддръжка',
      'Връщане на пари чрез приложението',
    ],
    cardType: 'black',
    isFeatured: true,
    badge: { text: 'Most Popular', textBg: 'Най-популярен' },
  },
];

// Credit card colors & gradients per theme
type GradientColors = [string, string, ...string[]];
const getCardColors = (isDarkMode: boolean) => isDarkMode ? {
  light: {
    gradientColors: ['#f9fafb', '#e5e7eb'] as GradientColors,
    text: '#1a1a1a',
    price: '#1a1a1a',
    number: 'rgba(26, 26, 26, 0.8)',
    border: 'rgba(156, 163, 175, 0.5)',
    borderWidth: 2,
  },
  silver: {
    gradientColors: ['#374151', '#4b5563'] as GradientColors,
    text: '#f8fafc',
    price: '#f8fafc',
    number: 'rgba(248, 250, 252, 0.9)',
    border: '#3b82f6',
    borderWidth: 3,
  },
  black: {
    gradientColors: ['#111827', '#1f2937', '#0f172a'] as GradientColors,
    text: '#06b6d4',
    price: '#06b6d4',
    number: 'rgba(248, 250, 252, 0.9)',
    border: '#06b6d4',
    borderWidth: 3,
  },
} : {
  light: {
    gradientColors: ['#ffffff', '#f5f5f5'] as GradientColors,
    text: '#4a4a4a',
    price: '#4a4a4a',
    number: 'rgba(100, 100, 100, 0.8)',
    border: 'rgba(200, 200, 200, 0.5)',
    borderWidth: 2,
  },
  silver: {
    gradientColors: ['#c0c0c0', '#939393'] as GradientColors,
    text: '#1a1a1a',
    price: '#1a1a1a',
    number: 'rgba(26, 26, 26, 0.9)',
    border: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 2,
  },
  black: {
    gradientColors: ['#1a1a1a', '#2d2d2d'] as GradientColors,
    text: '#ffd700',
    price: '#ffd700',
    number: 'rgba(255, 255, 255, 0.9)',
    border: '#ffd700',
    borderWidth: 3,
  },
};

const UpgradePlansScreen = ({ navigation, route }: any) => {
  const { t, i18n } = useTranslation();
  const { theme, isDarkMode } = useTheme();
  const language = i18n.language === 'bg' ? 'bg' : 'en';

  const currentCardType: string = route?.params?.currentCardType || 'light';

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAnnual, setIsAnnual] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('card.upgradePlansTitle'),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginRight: 16, padding: 4 }}
        >
          <Ionicons name="close-circle" size={26} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, theme, t]);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), 5000);
        });
        const response = await Promise.race([
          apiClient.get<{ success: boolean; data: Plan[] }>('/api/plans'),
          timeoutPromise,
        ]);
        if (response.data?.success && response.data.data?.length) {
          setPlans(response.data.data);
        } else {
          setPlans(getFallbackPlans());
        }
      } catch {
        setPlans(getFallbackPlans());
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  // Filter to only show plans above current tier
  // Map backend card type (LIGHT/BASIC/PREMIUM) to plan card type (light/silver/black)
  const mappedCardType = BACKEND_TO_PLAN_CARD_TYPE[currentCardType.toLowerCase()] || currentCardType.toLowerCase();
  const currentTierIndex = TIER_ORDER.indexOf(mappedCardType as typeof TIER_ORDER[number]);
  const upgradePlans = plans.filter(plan => {
    const planTierIndex = TIER_ORDER.indexOf(plan.cardType);
    return planTierIndex > currentTierIndex;
  });

  const handleSelectPlan = (plan: Plan, billingPeriod: 'weekly' | 'monthly' | 'yearly') => {
    navigation.push('Checkout', {
      planId: plan.id,
      billing: billingPeriod,
    });
  };

  const convertEURToBGN = (eur: number) => +(eur * 1.9558).toFixed(2);

  const styles = getStyles(theme, isDarkMode);

  const renderPlanCard = (plan: Plan) => {
    const isWeeklyOnly = plan.billingOptions.hasWeekly && !plan.billingOptions.hasMonthly;
    const isDisabled = isWeeklyOnly && isAnnual;

    let priceEUR: number | null;
    let billingPeriod: 'weekly' | 'monthly' | 'yearly';
    let periodLabel: string;

    if (isWeeklyOnly) {
      priceEUR = plan.pricing.weekly;
      billingPeriod = 'weekly';
      periodLabel = t('subscription.perWeek');
    } else if (isAnnual) {
      priceEUR = plan.pricing.yearly;
      billingPeriod = 'yearly';
      periodLabel = t('subscription.perYear');
    } else {
      priceEUR = plan.pricing.monthly;
      billingPeriod = 'monthly';
      periodLabel = t('subscription.perMonth');
    }

    const priceBGN = priceEUR ? convertEURToBGN(priceEUR) : 0;
    const colors = getCardColors(isDarkMode)[plan.cardType];
    const features = language === 'bg' ? plan.featuresBg : plan.features;
    const planName = language === 'bg' ? plan.displayNameBg : plan.displayName;
    const badgeText = plan.badge ? (language === 'bg' ? plan.badge.textBg : plan.badge.text) : null;

    return (
      <View
        key={plan.id}
        style={[styles.planWrapper, isDisabled && styles.planDisabled]}
      >
        {badgeText ? (
          plan.isFeatured ? (
            <LinearGradient
              colors={['#ffd700', '#ffed4e']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.badge, styles.featuredBadge]}
            >
              <Text style={[styles.badgeText, styles.featuredBadgeText]}>
                {badgeText}
              </Text>
            </LinearGradient>
          ) : (
            <View style={[styles.badge, styles.mostBoughtBadge]}>
              <Text style={[styles.badgeText, styles.mostBoughtBadgeText]}>
                {badgeText}
              </Text>
            </View>
          )
        ) : (
          <View style={styles.badgeSpacer} />
        )}

        <LinearGradient
          colors={colors.gradientColors}
          {...(colors.gradientColors.length === 3 ? { locations: [0, 0.5, 1] } : {})}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.creditCard,
            {
              borderColor: colors.border,
              borderWidth: colors.borderWidth,
              shadowColor: isDarkMode
                ? (plan.cardType === 'black' ? '#06b6d4' : plan.cardType === 'silver' ? '#3b82f6' : '#000')
                : '#000',
              shadowOpacity: isDarkMode
                ? (plan.cardType === 'black' ? 0.6 : plan.cardType === 'silver' ? 0.4 : 0.2)
                : 0.3,
            },
          ]}
        >
          <Text style={[
            styles.cardLogo,
            { color: colors.text },
            isDarkMode && plan.cardType === 'black' && {
              textShadowColor: 'rgba(6, 182, 212, 0.6)',
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 15,
            },
            isDarkMode && plan.cardType === 'silver' && {
              textShadowColor: 'rgba(59, 130, 246, 0.3)',
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 8,
            },
          ]}>BOOM Card</Text>
          <View style={styles.cardMiddle}>
            <View style={styles.cardNumber}>
              {['••••', '••••', '••••', '••••'].map((dots, i) => (
                <Text key={i} style={[styles.cardDots, { color: colors.number }]}>{dots}</Text>
              ))}
            </View>
            <View style={styles.cashbackBadge}>
              <Ionicons name="wallet-outline" size={13} color={colors.text} style={{ opacity: 0.8 }} />
              <Text style={[styles.cashbackBadgeText, { color: colors.text }]}>
                {plan.cashbackRate < 1 ? Math.round(plan.cashbackRate * 100) : plan.cashbackRate}% cashback
              </Text>
            </View>
          </View>
          <View style={styles.cardBottom}>
            <Text style={[styles.cardHolder, { color: colors.text }]}>{planName}</Text>
            <View style={styles.cardPriceContainer}>
              <Text style={[styles.cardPriceBGN, { color: colors.price, opacity: 0.85 }]}>
                {priceBGN.toFixed(2)} {language === 'bg' ? 'лв.' : 'BGN'} /
              </Text>
              <Text style={[styles.cardPriceEUR, { color: colors.price }]}>
                €{priceEUR}
              </Text>
              <Text style={[styles.cardPricePeriod, { color: colors.price, opacity: 0.8 }]}>
                {periodLabel}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.featuresList}>
          {features.map((feature, i) => (
            <View key={i} style={styles.featureItem}>
              <View style={styles.featureCheck}>
                <Ionicons name="checkmark" size={14} color="#22c55e" />
              </View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {isDisabled ? (
          <View style={[styles.choosePlanButton, styles.choosePlanButtonDisabled]}>
            <Text style={[styles.choosePlanButtonText, { opacity: 0.5 }]}>
              {t('subscription.weeklyOnly')}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.choosePlanButton}
            onPress={() => handleSelectPlan(plan, billingPeriod)}
          >
            <Text style={styles.choosePlanButtonText}>{t('subscription.choosePlan')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('card.upgradePlansTitle')}</Text>
        <Text style={styles.subtitle}>{t('card.upgradePlansSubtitle')}</Text>

        {/* Current Plan Indicator */}
        <View style={styles.currentPlanChip}>
          <Ionicons name="card" size={14} color={theme.colors.onSurfaceVariant} />
          <Text style={styles.currentPlanText}>
            {language === 'bg' ? 'Текущ план: ' : 'Current plan: '}
            {mappedCardType === 'light'
              ? (language === 'bg' ? 'Лайт Премиум' : 'Lite Premium')
              : mappedCardType === 'silver'
                ? (language === 'bg' ? 'Основен' : 'Basic')
                : (language === 'bg' ? 'Премиум' : 'Premium')}
          </Text>
        </View>

        {/* Billing Toggle */}
        <View style={styles.toggleWrapper}>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleOption, isAnnual && styles.toggleOptionActive]}
              onPress={() => setIsAnnual(true)}
            >
              <Text style={[styles.toggleText, isAnnual && styles.toggleTextActive]}>
                {t('subscription.yearly')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleOption, !isAnnual && styles.toggleOptionActive]}
              onPress={() => setIsAnnual(false)}
            >
              <Text style={[styles.toggleText, !isAnnual && styles.toggleTextActive]}>
                {t('subscription.monthlyWeekly')}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.savingsBadge}>
            <Text style={styles.savingsBadgeText}>-20%</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>{t('subscription.loadingPlans')}</Text>
          </View>
        ) : upgradePlans.length > 0 ? (
          upgradePlans.map(plan => renderPlanCard(plan))
        ) : (
          <View style={styles.loadingContainer}>
            <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
            <Text style={styles.noUpgradesText}>
              {language === 'bg'
                ? 'Вече имате най-високия план!'
                : 'You already have the highest plan!'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 16,
  },

  // Current Plan Chip
  currentPlanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 20,
  },
  currentPlanText: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    fontWeight: '500',
  },

  // Billing Toggle
  toggleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 32,
  },
  toggleContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 30,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 26,
    alignItems: 'center',
  },
  toggleOptionActive: {
    backgroundColor: theme.colors.primary,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.onSurfaceVariant,
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  savingsBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  savingsBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Loading
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
  },
  noUpgradesText: {
    color: theme.colors.onSurface,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },

  // Plan Card
  planWrapper: {
    marginBottom: 40,
    alignItems: 'center',
  },
  planDisabled: {
    opacity: 0.4,
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  badgeSpacer: {
    height: 0,
  },
  featuredBadge: {
    shadowColor: '#c9a237',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  mostBoughtBadge: {
    backgroundColor: isDarkMode ? 'rgba(201, 162, 55, 0.15)' : 'transparent',
    borderWidth: 2,
    borderColor: '#c9a237',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  featuredBadgeText: {
    color: '#000',
  },
  mostBoughtBadgeText: {
    color: '#c9a237',
  },
  creditCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    padding: 20,
    justifyContent: 'space-between',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 10,
  },
  cardLogo: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  cardMiddle: {
    gap: 6,
  },
  cardNumber: {
    flexDirection: 'row',
    gap: 12,
  },
  cashbackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cashbackBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.8,
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
  cardPriceContainer: {
    alignItems: 'flex-end',
  },
  cardPriceBGN: {
    fontSize: 12,
  },
  cardPriceEUR: {
    fontSize: 22,
    fontWeight: '400',
  },
  cardPricePeriod: {
    fontSize: 11,
  },
  featuresList: {
    width: CARD_WIDTH,
    backgroundColor: isDarkMode ? theme.colors.surface : theme.colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    paddingVertical: 12,
    marginTop: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
    gap: 12,
  },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    flex: 1,
  },
  choosePlanButton: {
    width: CARD_WIDTH,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    backgroundColor: '#d4af37',
    shadowColor: '#c9a237',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  choosePlanButtonDisabled: {
    backgroundColor: theme.colors.surfaceVariant,
    shadowOpacity: 0,
  },
  choosePlanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
});

export default UpgradePlansScreen;
