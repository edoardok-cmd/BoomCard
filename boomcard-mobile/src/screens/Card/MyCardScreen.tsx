/**
 * My Card Screen
 *
 * Display user's BoomCard with QR code, benefits, and statistics.
 * Redesigned with premium credit-card aesthetic and dark mode support.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Dimensions,
  Platform,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { cardApi } from '../../api/card.api';
import apiClient from '../../api/client';
import { formatDualCurrency } from '../../utils/format';
import { ShimmerPlaceholder, FadeInView } from '../../components/loading';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 24, 440);
const CARD_ASPECT = 0.63; // Credit card aspect ratio

type CardGradient = [string, string, ...string[]];

const getCardGradient = (cardType: string, isDarkMode: boolean): CardGradient => {
  const type = cardType?.toUpperCase();
  if (isDarkMode) {
    switch (type) {
      case 'PREMIUM': return ['#111827', '#1f2937', '#0f172a']; // Black card
      case 'BASIC': return ['#374151', '#4b5563'];               // Silver card
      case 'LIGHT':
      default: return ['#f9fafb', '#e5e7eb'];                    // Light/white card
    }
  }
  switch (type) {
    case 'PREMIUM': return ['#1a1a1a', '#2d2d2d'];   // Black card
    case 'BASIC': return ['#c0c0c0', '#e8e8e8'];      // Silver card
    case 'LIGHT':
    default: return ['#ffffff', '#f5f5f5'];            // Light/white card
  }
};

const getCardAccent = (cardType: string, isDarkMode: boolean) => {
  const type = cardType?.toUpperCase();
  if (isDarkMode) {
    switch (type) {
      case 'PREMIUM': return { text: '#06b6d4', glow: 'rgba(6, 182, 212, 0.5)', border: '#06b6d4' };
      case 'BASIC': return { text: '#93c5fd', glow: 'rgba(59, 130, 246, 0.3)', border: '#3b82f6' };
      case 'LIGHT':
      default: return { text: '#374151', glow: 'rgba(0, 0, 0, 0.1)', border: 'rgba(55, 65, 81, 0.3)' };
    }
  }
  switch (type) {
    case 'PREMIUM': return { text: '#ffd700', glow: 'rgba(212, 175, 55, 0.3)', border: '#ffd700' };
    case 'BASIC': return { text: '#1a1a1a', glow: 'rgba(0, 0, 0, 0.15)', border: 'rgba(192, 192, 192, 0.5)' };
    case 'LIGHT':
    default: return { text: '#4a4a4a', glow: 'rgba(0, 0, 0, 0.1)', border: 'rgba(200, 200, 200, 0.5)' };
  }
};

export default function MyCardScreen() {
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<any>(null);
  const [statistics, setStatistics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnimation = useRef(new Animated.Value(0)).current;

  const flipCard = () => {
    const toValue = isFlipped ? 0 : 1;
    Animated.spring(flipAnimation, {
      toValue,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const frontRotateY = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotateY = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  const frontOpacity = flipAnimation.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flipAnimation.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  const translateBenefit = (benefit: string): string => {
    const benefitMap: Record<string, string> = {
      'One week Premium access': t('card.benefits.weeklyPremiumAccess'),
      'Up to 20% discount': t('card.benefits.discount20'),
      'Exclusive Premium offers': t('card.benefits.exclusivePremiumOffers'),
      'Limited availability special offers': t('card.benefits.limitedOffers'),
      'Access to exclusive Premium campaigns': t('card.benefits.exclusiveCampaigns'),
      'VIP priority support': t('card.benefits.vipPrioritySupport'),
      'Cashback via the app': t('card.benefits.cashbackViaApp'),
      'One month access': t('card.benefits.monthlyAccess'),
      'Up to 10% discount': t('card.benefits.discount10'),
      'Access to partner offers': t('card.benefits.partnerOffers'),
      'Standard support': t('card.benefits.standardSupport'),
      'One month Premium access': t('card.benefits.monthlyPremiumAccess'),
    };
    return benefitMap[benefit] || benefit;
  };

  const loadCard = async () => {
    setError(null);
    try {
      // Try to get card; if missing but user has an active subscription, auto-provision a LIGHT card
      let cardData = await cardApi.getMyCardOrNull();

      if (!cardData) {
        // Check if there's an active subscription — if so, create the card automatically
        const subResponse = await apiClient.get('/api/subscriptions/current');
        const hasSub = subResponse.success && subResponse.data;
        if (hasSub) {
          try {
            cardData = await cardApi.createCard();
          } catch {
            // Creation failed — show the no-card UI
          }
        }
      }

      setCard(cardData);

      // Load stats only if we have a card
      if (cardData) {
        try {
          const stats = await cardApi.getStatistics();
          setStatistics(stats);
        } catch {
          // Stats are non-critical
        }
      }
    } catch (err: any) {
      console.warn('Failed to load card:', err);
      setError(err.message || 'Failed to load card');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCard();
  }, []);

  const styles = getStyles(theme, isDarkMode);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <ShimmerPlaceholder
            width={CARD_WIDTH}
            height={CARD_WIDTH * CARD_ASPECT}
            borderRadius={20}
            isDarkMode={isDarkMode}
          />
          <View style={{ marginTop: 20, gap: 12, width: CARD_WIDTH }}>
            <ShimmerPlaceholder width={CARD_WIDTH} height={100} borderRadius={16} isDarkMode={isDarkMode} />
            <ShimmerPlaceholder width={CARD_WIDTH} height={120} borderRadius={16} isDarkMode={isDarkMode} />
          </View>
        </View>
      </View>
    );
  }

  if (!card) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.centered, { paddingVertical: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Expired card illustration */}
        <LinearGradient
          colors={isDarkMode ? ['#1f2937', '#111827'] : ['#f9fafb', '#e5e7eb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.noCardPlaceholder}
        >
          <View style={styles.noCardChip} />
          <View style={styles.noCardBottom}>
            <View style={styles.noCardLine} />
            <View style={[styles.noCardLine, { width: '55%' }]} />
          </View>
          <View style={styles.noCardExpiredBadge}>
            <Ionicons name="time-outline" size={14} color={isDarkMode ? '#fbbf24' : '#d97706'} />
            <Text style={styles.noCardExpiredText}>{t('card.expired', 'Expired')}</Text>
          </View>
        </LinearGradient>

        <Text style={styles.emptyTitle}>
          {t('card.noActiveCard', 'No active card')}
        </Text>
        <Text style={styles.emptyDescription}>
          {t('card.noActiveCardDesc', 'Your subscription may have expired or you don\'t have an active plan. Choose a plan to get your BOOM Card.')}
        </Text>

        {/* Renew / upgrade CTA */}
        <TouchableOpacity
          style={styles.choosePlanButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('UpgradePlans', { currentCardType: null })}
        >
          <LinearGradient
            colors={isDarkMode ? ['#1e3a8a', '#3730a3'] : ['#000000', '#1a1a1a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.choosePlanGradient}
          >
            <Ionicons name="arrow-up-circle" size={22} color="#ffd700" />
            <Text style={styles.choosePlanText}>{t('card.choosePlan', 'Choose a Plan')}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.retryButton} onPress={loadCard}>
          <Text style={styles.retryButtonText}>{t('common.retry', 'Try again')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const qrData = JSON.stringify({
    cardNumber: card.cardNumber,
    userId: card.userId,
    type: card.cardType,
    issuedAt: card.issuedAt,
  });

  const gradient = getCardGradient(card.cardType, isDarkMode);
  const accent = getCardAccent(card.cardType, isDarkMode);
  const cardTypeUpper = card.cardType?.toUpperCase();
  const isPremium = cardTypeUpper === 'PREMIUM';
  const isLight = cardTypeUpper === 'LIGHT';

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <FadeInView duration={500}>
        {/* Credit Card - Flippable */}
        <TouchableOpacity activeOpacity={0.95} onPress={flipCard}>
          <View style={styles.cardOuter}>
            <View style={styles.cardFlipContainer}>
              {/* Front Side */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: frontOpacity,
                    transform: [{ perspective: 1200 }, { rotateY: frontRotateY }],
                  },
                ]}
              >
                <LinearGradient
                  colors={gradient}
                  {...(gradient.length === 3 ? { locations: [0, 0.5, 1] } : {})}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.card,
                    {
                      borderColor: accent.border,
                      borderWidth: isPremium ? 2 : 1,
                      shadowColor: accent.border,
                      shadowOpacity: isDarkMode ? 0.5 : 0.25,
                    },
                  ]}
                >
                  {/* Card Header with small QR in top right */}
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Text style={[
                        styles.cardLogo,
                        { color: accent.text },
                        isDarkMode && isPremium && {
                          textShadowColor: accent.glow,
                          textShadowOffset: { width: 0, height: 0 },
                          textShadowRadius: 12,
                        },
                      ]}>BOOM Card</Text>
                    </View>
                    <View style={styles.qrFrameSmall}>
                      <QRCode
                        value={qrData}
                        size={50}
                        backgroundColor="white"
                        color="black"
                      />
                    </View>
                  </View>

                  {/* Spacer */}
                  <View style={{ flex: 1 }} />

                  {/* Card Footer */}
                  <View style={styles.cardFooter}>
                    <Text style={[styles.planName, { color: accent.text }]}>
                      {cardTypeUpper === 'LIGHT' ? 'LITE PREMIUM' : cardTypeUpper === 'BASIC' ? 'BASIC' : 'PREMIUM'}
                    </Text>
                    <Text style={[styles.memberSince, isLight && { color: 'rgba(0,0,0,0.5)' }]}>
                      {t('card.validFrom')} {card.validFrom || card.issuedAt
                        ? new Date(card.validFrom || card.issuedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </Text>
                    {card.validUntil && (
                      <Text style={[styles.memberSince, isLight && { color: 'rgba(0,0,0,0.5)' }]}>
                        {t('card.validUntil')} {new Date(card.validUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    )}
                  </View>

                  {/* Flip Hint */}
                  <View style={styles.flipHintRow}>
                    <Ionicons name="sync-outline" size={14} color={isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)'} />
                    <Text style={[styles.flipHintText, isLight && { color: 'rgba(0,0,0,0.35)' }]}>{t('card.tapToShowQR', 'Tap to show QR')}</Text>
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* Back Side */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: backOpacity,
                    transform: [{ perspective: 1200 }, { rotateY: backRotateY }],
                  },
                ]}
              >
                <LinearGradient
                  colors={gradient}
                  {...(gradient.length === 3 ? { locations: [0, 0.5, 1] } : {})}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.card,
                    {
                      borderColor: accent.border,
                      borderWidth: isPremium ? 2 : 1,
                      shadowColor: accent.border,
                      shadowOpacity: isDarkMode ? 0.5 : 0.25,
                      paddingTop: 16,
                      paddingBottom: 14,
                    },
                  ]}
                >
                  {/* Large QR Code */}
                  <View style={styles.qrCenterSection}>
                    <View style={styles.qrFrameLarge}>
                      <QRCode
                        value={qrData}
                        size={120}
                        backgroundColor="white"
                        color="black"
                      />
                    </View>
                  </View>

                  {/* Back Footer */}
                  <View style={styles.backFooter}>
                    <Text style={[styles.cardNumber, { color: accent.text }]}>
                      {card.cardNumber}
                    </Text>
                  </View>

                  {/* Flip Hint */}
                  <View style={styles.flipHintRow}>
                    <Ionicons name="sync-outline" size={11} color={isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'} />
                    <Text style={[styles.flipHintText, isLight && { color: 'rgba(0,0,0,0.35)' }]}>{t('card.tapToFlipBack', 'Tap to flip back')}</Text>
                  </View>
                </LinearGradient>
              </Animated.View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Benefits Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
              <Ionicons name="star" size={18} color="#22c55e" />
            </View>
            <Text style={styles.sectionTitle}>{t('card.yourBenefits')}</Text>
          </View>
          <View style={styles.benefitsList}>
            {card.benefits?.features?.map((feature: string, index: number) => (
              <View key={index} style={styles.benefitRow}>
                <View style={styles.benefitCheck}>
                  <Ionicons name="checkmark" size={14} color="#22c55e" />
                </View>
                <Text style={styles.benefitText}>{translateBenefit(feature)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Activity Section */}
        {statistics && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)' }]}>
                <Ionicons name="stats-chart" size={18} color="#3b82f6" />
              </View>
              <Text style={styles.sectionTitle}>{t('card.yourActivity')}</Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>
                  {statistics.receiptsScanned || 0}
                </Text>
                <Text style={styles.statLabel}>
                  {t('card.receiptsScanned')}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>
                  {statistics.stickersScanned || 0}
                </Text>
                <Text style={styles.statLabel}>
                  {t('card.stickersScanned')}
                </Text>
              </View>
            </View>

            <LinearGradient
              colors={isDarkMode ? ['#92400e', '#78350f'] : ['#fef3c7', '#fde68a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cashbackBanner}
            >
              <Text style={[styles.cashbackAmount, { color: isDarkMode ? '#fbbf24' : '#92400e' }]}>
                {formatDualCurrency(statistics.totalCashbackEarned || 0)}
              </Text>
              <Text style={[styles.cashbackLabel, { color: isDarkMode ? 'rgba(251, 191, 36, 0.7)' : 'rgba(146, 64, 14, 0.7)' }]}>
                {t('card.totalCashbackEarned')}
              </Text>
            </LinearGradient>
          </View>
        )}

        {/* Upgrade CTA */}
        {card.cardType && cardTypeUpper !== 'PREMIUM' && (
          <View style={[styles.section, { marginBottom: 40 }]}>
            <TouchableOpacity
              style={styles.upgradeButton}
              activeOpacity={0.8}
              onPress={() => {
                navigation.navigate('UpgradePlans', { currentCardType: card.cardType });
              }}
            >
              <LinearGradient
                colors={isDarkMode ? ['#1e3a8a', '#3730a3'] : ['#000000', '#1a1a1a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.upgradeGradient}
              >
                <View style={styles.upgradeContent}>
                  <Ionicons name="arrow-up-circle" size={24} color="#ffd700" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.upgradeTitle}>{t('card.upgradeYourCard')}</Text>
                    <Text style={styles.upgradeDesc}>{t('card.upgradeDescription')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </FadeInView>
    </ScrollView>
  );
}

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },

  // Empty / no-card state
  noCardPlaceholder: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * CARD_ASPECT,
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    opacity: 0.6,
  },
  noCardChip: {
    width: 44,
    height: 32,
    borderRadius: 8,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
  },
  noCardBottom: {
    gap: 8,
  },
  noCardLine: {
    height: 10,
    width: '75%',
    borderRadius: 5,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
  },
  noCardExpiredBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isDarkMode ? 'rgba(251,191,36,0.15)' : 'rgba(217,119,6,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  noCardExpiredText: {
    fontSize: 12,
    fontWeight: '600',
    color: isDarkMode ? '#fbbf24' : '#d97706',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
    paddingHorizontal: 24,
  },
  choosePlanButton: {
    width: CARD_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  choosePlanGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
  },
  choosePlanText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
  },
  retryButtonText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '500',
  },

  // Card
  cardOuter: {
    padding: 16,
    paddingBottom: 8,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * CARD_ASPECT,
    borderRadius: 20,
    padding: 24,
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLogo: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: Platform.select({ web: "'Arial Black', sans-serif", default: undefined }),
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardFlipContainer: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * CARD_ASPECT,
  },
  cardHeaderLeft: {
    flex: 1,
    gap: 8,
  },
  qrFrameSmall: {
    backgroundColor: '#ffffff',
    padding: 5,
    borderRadius: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  qrCenterSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  qrFrameLarge: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  backFooter: {
    alignItems: 'center',
    marginTop: 8,
  },
  flipHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  flipHintText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
  },
  cardFooter: {
    alignItems: 'center',
    gap: 4,
  },
  cardNumber: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  planName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  memberSince: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },

  // Sections
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: isDarkMode ? theme.colors.surface : '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDarkMode ? 0.2 : 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 10,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },

  // Benefits
  benefitsList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 2,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  },
  benefitCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitText: {
    fontSize: 14,
    color: theme.colors.onSurface,
    flex: 1,
    lineHeight: 20,
  },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: isDarkMode ? '#3b82f6' : theme.colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
  },
  cashbackBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cashbackAmount: {
    fontSize: 22,
    fontWeight: '800',
  },
  cashbackLabel: {
    fontSize: 12,
    marginTop: 4,
  },

  // Upgrade
  upgradeButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  upgradeGradient: {
    borderRadius: 16,
  },
  upgradeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  upgradeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  upgradeDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
});
