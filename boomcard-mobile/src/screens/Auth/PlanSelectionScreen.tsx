/**
 * Plan Selection Screen
 *
 * In-app plan selection with credit card styled plan cards.
 * Fetches plans from API with fallback to static data.
 * Navigates to Checkout screen with planId & billing params.
 * Follows app theme (light/dark mode).
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
import { useTheme } from '../../contexts/ThemeContext';
import apiClient from '../../api/client';
import { Plan } from '../../services/plans.service';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 340);
const CARD_HEIGHT = 200;

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

// Credit card colors stay the same regardless of theme
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

const PlanSelectionScreen = ({ navigation }: any) => {
  const { t, i18n } = useTranslation();
  const { theme, isDarkMode } = useTheme();
  const language = i18n.language === 'bg' ? 'bg' : 'en';

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAnnual, setIsAnnual] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), 5000);
        });
        const response = await Promise.race([
          apiClient.get<{ success: boolean; data: Plan[] }>('/plans'),
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

  const handleSelectPlan = (plan: Plan, billingPeriod: 'weekly' | 'monthly' | 'yearly') => {
    navigation.navigate('Checkout', {
      planId: plan.id,
      billing: billingPeriod,
    });
  };

  const convertEURToBGN = (eur: number) => +(eur * 1.9558).toFixed(2);

  const styles = getStyles(theme, isDarkMode);

  const renderPlanCard = (plan: Plan, index: number) => {
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
    const colors = CARD_COLORS[plan.cardType];
    const features = language === 'bg' ? plan.featuresBg : plan.features;
    const planName = language === 'bg' ? plan.displayNameBg : plan.displayName;
    const badgeText = plan.badge ? (language === 'bg' ? plan.badge.textBg : plan.badge.text) : null;

    return (
      <View
        key={plan.id}
        style={[styles.planWrapper, isDisabled && styles.planDisabled]}
      >
        {badgeText ? (
          <View style={[
            styles.badge,
            plan.isFeatured ? styles.featuredBadge : styles.mostBoughtBadge,
          ]}>
            <Text style={[
              styles.badgeText,
              plan.isFeatured ? styles.featuredBadgeText : styles.mostBoughtBadgeText,
            ]}>
              {badgeText}
            </Text>
          </View>
        ) : (
          <View style={styles.badgeSpacer} />
        )}

        <View style={[
          styles.creditCard,
          {
            backgroundColor: colors.bg,
            borderColor: colors.border,
            borderWidth: plan.cardType === 'black' ? 3 : 2,
          },
        ]}>
          <Text style={[styles.cardLogo, { color: colors.text }]}>BOOM Card</Text>
          <View style={styles.cardNumber}>
            {['••••', '••••', '••••', '••••'].map((dots, i) => (
              <Text key={i} style={[styles.cardDots, { color: colors.number }]}>{dots}</Text>
            ))}
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
        </View>

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{t('subscription.title')}</Text>
        <Text style={styles.subtitle}>{t('subscription.subtitle')}</Text>
        <Text style={styles.trialText}>{t('subscription.trialText')}</Text>

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

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>{t('subscription.loadingPlans')}</Text>
          </View>
        ) : (
          plans.map((plan, index) => renderPlanCard(plan, index))
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.alreadyHaveAccount')} </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.footerLink}>{t('auth.login')}</Text>
          </TouchableOpacity>
        </View>
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
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
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
    marginBottom: 12,
  },
  trialText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10b981',
    textAlign: 'center',
    marginBottom: 24,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 30,
    padding: 4,
    marginBottom: 32,
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
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
  },
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
    backgroundColor: '#d4af37',
  },
  mostBoughtBadge: {
    backgroundColor: 'transparent',
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
  cardNumber: {
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
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
    paddingVertical: 12,
    marginTop: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceVariant,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    paddingBottom: 20,
  },
  footerText: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  footerLink: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});

export default PlanSelectionScreen;
