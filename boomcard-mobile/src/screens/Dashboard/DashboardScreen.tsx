import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../store/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ReceiptsApi } from '../../api/receipts.api';
import { cardApi } from '../../api/card.api';
import apiClient from '../../api/client';
import { formatDualCurrency } from '../../utils/format';
import { DashboardSkeleton, AnimatedCounter, FadeInView } from '../../components/loading';
import type { ReceiptStats, Receipt } from '../../types';

interface VenueVisit {
  venueId: string;
  merchantName: string;
  visitCount: number;
  totalSpent: number;
  totalCashback: number;
  lastVisit: string;
}

const RANK_COLORS = [
  { bg: 'rgba(212,168,67,0.15)', text: '#D4A843' },   // #1 gold
  { bg: 'rgba(156,163,175,0.15)', text: '#9CA3AF' },   // #2 silver
  { bg: 'rgba(205,127,50,0.15)', text: '#CD7F32' },    // #3 bronze
];

const DashboardScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme, isDarkMode } = useTheme();
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [stats, setStats] = useState<ReceiptStats | null>(null);
  const [cardStats, setCardStats] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [cardMissing, setCardMissing] = useState(false);
  const [recentVisits, setRecentVisits] = useState<VenueVisit[]>([]);

  const loadData = async () => {
    // Leave subscription null until the API responds — no hardcoded values
    // Don't block the whole screen — show UI after a short delay even if APIs are slow
    if (mountedRef.current) setLoadError(false);
    const loadingTimeout = setTimeout(() => {
      if (mountedRef.current) setLoading(false);
    }, 2000);

    try {
      // Local flags track actual results — React state is async and stale inside this closure
      let anySucceeded = false;
      let anyFailed = false;

      // Fire all requests in parallel, each updates state independently
      const subscriptionPromise = apiClient.get('/api/subscriptions/current').then((subResponse) => {
        if (!mountedRef.current) return;
        if (subResponse.success && subResponse.data) {
          setSubscription(subResponse.data);
          anySucceeded = true;
        }
      }).catch((err) => { console.warn('Dashboard: subscription fetch failed', err); anyFailed = true; });

      const receiptsStatsPromise = ReceiptsApi.getStats().then((response) => {
        if (!mountedRef.current) return;
        if (response.success && response.data) {
          setStats(response.data);
          anySucceeded = true;
        }
      }).catch((err) => { console.warn('Dashboard: receipt stats fetch failed', err); anyFailed = true; });

      const cardStatsPromise = cardApi.getMyCardOrNull().then((card) => {
        if (!mountedRef.current) return;
        if (!card) {
          setCardMissing(true);
          anySucceeded = true; // card check itself succeeded (no card is a valid result)
          return;
        }
        setCardMissing(false);
        anySucceeded = true;
        return apiClient.get(`/api/cards/${card.id}/statistics`).then((res) => {
          if (!mountedRef.current) return;
          if (res.success && res.data) setCardStats(res.data);
        });
      }).catch((err) => { console.warn('Dashboard: card stats fetch failed', err); anyFailed = true; });

      const receiptsPromise = ReceiptsApi.getReceipts({ limit: 50 }).then((response) => {
        if (!mountedRef.current) return;
        if (response.success && response.data) {
          const receipts = response.data.data || [];
          const venueMap = new Map<string, VenueVisit>();

          receipts.forEach((receipt: Receipt) => {
            const key = receipt.venueId || receipt.merchantName || 'unknown';
            const existing = venueMap.get(key);

            if (existing) {
              existing.visitCount++;
              existing.totalSpent += receipt.totalAmount || 0;
              existing.totalCashback += receipt.cashbackAmount || 0;
              if (receipt.receiptDate && receipt.receiptDate > existing.lastVisit) {
                existing.lastVisit = receipt.receiptDate;
              }
            } else {
              venueMap.set(key, {
                venueId: receipt.venueId || key,
                merchantName: receipt.merchantName || 'Unknown Venue',
                visitCount: 1,
                totalSpent: receipt.totalAmount || 0,
                totalCashback: receipt.cashbackAmount || 0,
                lastVisit: receipt.receiptDate || new Date().toISOString(),
              });
            }
          });

          const visits = Array.from(venueMap.values())
            .sort((a, b) => b.visitCount - a.visitCount)
            .slice(0, 5);

          setRecentVisits(visits);
          anySucceeded = true;
        }
      }).catch((err) => { console.warn('Dashboard: receipts fetch failed', err); anyFailed = true; });

      await Promise.allSettled([subscriptionPromise, receiptsStatsPromise, cardStatsPromise, receiptsPromise]);

      // Show error banner only when no request yielded data (complete outage)
      if (mountedRef.current && anyFailed && !anySucceeded) {
        setLoadError(true);
      }
    } catch (error) {
      console.warn('Failed to load dashboard data:', error);
      if (mountedRef.current) setLoadError(true);
    } finally {
      clearTimeout(loadingTimeout);
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('bg-BG', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Normalize plan code — API may return plan as a string ('BASIC') or as an object ({ code: 'BASIC', ... })
  // UploadReceiptScreen uses the same defensive pattern for the same endpoint.
  const planCode: string | null = (() => {
    if (!subscription?.plan) return null;
    const p = subscription.plan;
    return typeof p === 'object' ? (p?.code?.toUpperCase() ?? null) : String(p).toUpperCase();
  })();

  const getCashbackRate = (): number | null => {
    // Prioritise plan code per master doc — API cashbackRate may carry a legacy value (e.g. 0.20
    // for PREMIUM before the seeder was corrected). MyCardScreen handles the same issue via
    // translateBenefit(); keeping both screens consistent requires plan code to win here.
    if (planCode === 'PREMIUM') return 24; // max per cashback matrix (30% partner → 24% user)
    if (planCode === 'BASIC') return 10;   // hard cap per cashback matrix
    if (planCode === 'LIGHT') return 24;   // Premium Weekly: same max as Premium Monthly
    // Fall back to API value only when plan code is unknown
    if (subscription?.benefits?.cashbackRate) {
      return Math.round(subscription.benefits.cashbackRate * 100);
    }
    return null; // plan code unknown — don't display a rate
  };

  const s = getStyles(theme, isDarkMode);

  if (loading) {
    return <DashboardSkeleton isDarkMode={isDarkMode} />;
  }

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Error banner — shown only when all APIs failed */}
      {loadError && (
        <TouchableOpacity style={s.errorBanner} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="wifi-outline" size={16} color="#92400E" />
          <Text style={s.errorBannerText}>{t('common.loadError', 'Could not load data. Tap to retry.')}</Text>
        </TouchableOpacity>
      )}
      {/* Hero Header */}
      <LinearGradient
        colors={isDarkMode ? ['#0F172A', '#1E293B'] : ['#000000', '#0A0A0A', '#111111']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <View style={s.heroBrandRow}>
          <Text style={s.brandLogo}>BOOM Card</Text>
          <TouchableOpacity style={s.notificationBtn}>
            <Ionicons name="notifications-outline" size={24} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
        <View style={s.heroContent}>
          <View style={s.heroTextContainer}>
            <Text style={s.heroGreeting}>{t('dashboard.welcome')}</Text>
            <Text style={s.heroName}>{user?.firstName || user?.email}!</Text>
          </View>
        </View>

        {/* Cashback Card */}
        <View style={s.heroCashbackCard}>
          <View style={s.heroCashbackLeft}>
            <Text style={s.heroCashbackLabel}>{t('dashboard.totalCashback')}</Text>
            <AnimatedCounter
              targetValue={stats?.totalCashback || cardStats?.totalCashbackEarned || 0}
              formatFn={formatDualCurrency}
              style={s.heroCashbackAmount}
            />
          </View>
          {subscription && getCashbackRate() !== null && (
            <View style={s.heroCashbackRate}>
              <Ionicons name="trending-up" size={16} color={isDarkMode ? '#60A5FA' : '#D4A843'} />
              <Text style={s.heroCashbackRateText}>
                {t('dashboard.cashbackRate', { rate: getCashbackRate() })}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* No card warning — subscription exists but card was never provisioned */}
      {subscription && cardMissing && (
        <FadeInView delay={0}>
          <TouchableOpacity
            style={[s.planBanner, { borderColor: 'rgba(239,68,68,0.35)', marginBottom: 12 }]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Card')}
          >
            <LinearGradient
              colors={isDarkMode ? ['#7f1d1d', '#991b1b'] : ['#dc2626', '#b91c1c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.planGradient}
            >
              <View style={s.planLeft}>
                <Ionicons name="warning-outline" size={28} color="#fca5a5" />
                <View style={s.planTextGroup}>
                  <Text style={[s.planLabel, { color: '#fca5a5' }]}>{t('dashboard.noCardTitle', 'Card not activated')}</Text>
                  <Text style={[s.planName, { color: '#ffffff', fontSize: 14 }]}>
                    {t('dashboard.noCardDesc', 'Tap to activate your BOOM Card')}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
            </LinearGradient>
          </TouchableOpacity>
        </FadeInView>
      )}

      {/* Card Plan Info */}
      {subscription && !cardMissing && (
        <FadeInView delay={0}>
        <TouchableOpacity
          style={[
            s.planBanner,
            {
              borderColor: planCode === 'BASIC'
                ? 'rgba(192,192,192,0.4)'
                : planCode === 'PREMIUM'
                ? 'rgba(255,215,0,0.3)'
                : 'rgba(255,255,255,0.1)',
            },
          ]}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Card')}
        >
          <LinearGradient
            colors={
              planCode === 'BASIC'
                ? ['#9CA3AF', '#D1D5DB', '#E5E7EB'] as const
                : planCode === 'PREMIUM'
                ? ['#C49B38', '#D4AF37', '#FFD700'] as const
                : ['#2D3748', '#4A5568', '#2D3748'] as const
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.planGradient}
          >
            <View style={s.planLeft}>
              <Ionicons name="card" size={32} color={planCode === 'PREMIUM' ? 'rgba(0,0,0,0.6)' : '#FFFFFF'} />
              <View style={s.planTextGroup}>
                <Text style={[s.planLabel, planCode === 'PREMIUM' && { color: 'rgba(0,0,0,0.5)' }]}>{t('dashboard.yourPlan')}</Text>
                <Text style={[s.planName, planCode === 'PREMIUM' && { color: 'rgba(0,0,0,0.8)', textShadowColor: 'transparent' }]}>
                  {planCode === 'PREMIUM'
                    ? t('dashboard.planPremium')
                    : planCode === 'BASIC'
                    ? t('dashboard.planBasic')
                    : t('dashboard.planLitePremium')}
                </Text>
              </View>
            </View>
            <View style={s.planRight}>
              {(() => {
                const isYellowCard = planCode === 'PREMIUM';
                const textColor = isYellowCard ? 'rgba(0,0,0,0.75)' : '#FFFFFF';
                const subtextColor = isYellowCard ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.8)';
                const isActive = subscription.status === 'ACTIVE' || subscription.status === 'TRIALING';
                return (
                  <>
                    <View style={[
                      s.statusBadge,
                      { backgroundColor: isActive
                          ? (isYellowCard ? 'rgba(0,0,0,0.15)' : 'rgba(16,185,129,0.25)')
                          : (isYellowCard ? 'rgba(0,0,0,0.15)' : 'rgba(239,68,68,0.25)') },
                    ]}>
                      <View style={[
                        s.statusDot,
                        { backgroundColor: isActive ? '#10B981' : '#EF4444' },
                      ]} />
                      <Text style={[s.statusText, { color: textColor }]}>
                        {isActive
                          ? t('dashboard.cardActive')
                          : subscription.status === 'CANCELLED'
                          ? t('dashboard.cardExpired')
                          : t('dashboard.cardSuspended')}
                      </Text>
                    </View>
                    {subscription.currentPeriodEnd && (
                      <Text style={[s.planValidity, { color: subtextColor }]}>
                        {t('dashboard.validUntil')}: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                      </Text>
                    )}
                    {isActive && subscription.currentPeriodEnd && (() => {
                      const daysLeft = Math.ceil(
                        (new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                      );
                      if (daysLeft > 0 && daysLeft <= 90) {
                        return (
                          <Text style={[s.daysRemaining, { color: isYellowCard ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.65)' }]}>
                            {t('dashboard.daysRemaining', { days: daysLeft })}
                          </Text>
                        );
                      }
                      return null;
                    })()}
                  </>
                );
              })()}
            </View>
            <Ionicons name="chevron-forward" size={18} color={planCode === 'PREMIUM' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)'} style={{ marginLeft: 4 }} />
          </LinearGradient>
        </TouchableOpacity>
        </FadeInView>
      )}

      {/* Quick Actions */}
      <FadeInView delay={100}>
      <View style={[s.quickActions, !subscription && { marginTop: -32 }]}>
        <TouchableOpacity
          style={s.actionCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('ReceiptScanner')}
        >
          <View style={[s.actionIconCircle, { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)' }]}>
            <Ionicons name="camera-outline" size={22} color={theme.colors.primary} />
          </View>
          <Text style={s.actionTitle}>{t('dashboard.scanReceipt')}</Text>
          <Text style={s.actionSubtitle}>{t('dashboard.uploadEarnCashback')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.actionCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Scan')}
        >
          <View style={[s.actionIconCircle, { backgroundColor: isDarkMode ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.1)' }]}>
            <Ionicons name="qr-code-outline" size={22} color="#8B5CF6" />
          </View>
          <Text style={s.actionTitle}>{t('dashboard.scanSticker')}</Text>
          <Text style={s.actionSubtitle}>{t('dashboard.qrCodeAtVenue')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.actionCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Wallet')}
        >
          <View style={[s.actionIconCircle, { backgroundColor: isDarkMode ? 'rgba(212,168,67,0.15)' : 'rgba(212,168,67,0.1)' }]}>
            <Ionicons name="wallet-outline" size={22} color="#D4A843" />
          </View>
          <Text style={s.actionTitle}>{t('wallet.title')}</Text>
          <Text style={s.actionSubtitle}>{t('wallet.balance')}</Text>
        </TouchableOpacity>
      </View>
      </FadeInView>

      {/* Stats Card */}
      <FadeInView delay={200}>
      <View style={s.statsCard}>
        <View style={s.statItem}>
          <View style={[s.statIconCircle, { backgroundColor: isDarkMode ? 'rgba(212,168,67,0.15)' : 'rgba(212,168,67,0.1)' }]}>
            <Ionicons name="wallet-outline" size={18} color="#D4A843" />
          </View>
          <AnimatedCounter
            targetValue={stats?.totalCashback || cardStats?.totalCashbackEarned || 0}
            formatFn={formatDualCurrency}
            style={s.statValueGold}
          />
          <Text style={s.statLabel}>{t('dashboard.totalCashback')}</Text>
        </View>

        <View style={s.statDivider} />

        <View style={s.statItem}>
          <View style={[s.statIconCircle, { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)' }]}>
            <Ionicons name="receipt-outline" size={18} color={theme.colors.primary} />
          </View>
          <AnimatedCounter
            targetValue={stats?.totalReceipts || 0}
            style={s.statValue}
          />
          <Text style={s.statLabel}>{t('dashboard.receipts')}</Text>
        </View>

        <View style={s.statDivider} />

        <View style={s.statItem}>
          <View style={[s.statIconCircle, { backgroundColor: isDarkMode ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.1)' }]}>
            <Ionicons name="storefront-outline" size={18} color="#8B5CF6" />
          </View>
          <AnimatedCounter
            targetValue={recentVisits.length}
            style={s.statValue}
          />
          <Text style={s.statLabel}>{t('dashboard.venues')}</Text>
        </View>
      </View>
      </FadeInView>

      {/* Upgrade Banner */}
      {subscription && planCode !== 'PREMIUM' && (
        <FadeInView delay={250}>
        <TouchableOpacity
          style={s.upgradeBanner}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Card')}
        >
          <LinearGradient
            colors={isDarkMode ? ['#1E3A8A', '#3730A3'] : ['#000000', '#1A1A1A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.upgradeGradient}
          >
            <Ionicons name="arrow-up-circle" size={28} color="#FFD700" />
            <View style={s.upgradeTextGroup}>
              <Text style={s.upgradeTitle}>{t('dashboard.upgradeYourPlan')}</Text>
              <Text style={s.upgradeSubtitle}>{t('dashboard.unlockHigherCashback')}</Text>
            </View>
            <View style={s.upgradeArrow}>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
        </FadeInView>
      )}

      {/* Recent Venues */}
      {recentVisits.length > 0 && (
        <FadeInView delay={300}>
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{t('dashboard.recentVenues')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Receipts')}>
              <Text style={s.seeAll}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>

          {recentVisits.map((visit, index) => {
            const rankColor = index < 3
              ? RANK_COLORS[index]
              : { bg: isDarkMode ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)', text: theme.colors.primary };

            return (
              <View key={index} style={s.venueCard}>
                <View style={[s.venueRankBadge, { backgroundColor: rankColor.bg }]}>
                  <Text style={[s.venueRankText, { color: rankColor.text }]}>
                    {index + 1}
                  </Text>
                </View>
                <View style={s.venueInfo}>
                  <Text style={s.venueName} numberOfLines={1}>
                    {visit.merchantName}
                  </Text>
                  <Text style={s.venueDetails}>
                    {visit.visitCount} {visit.visitCount > 1 ? t('dashboard.visits') : t('dashboard.visit')} • {t('dashboard.lastVisit')}:{' '}
                    {formatDate(visit.lastVisit)}
                  </Text>
                </View>
                <View style={s.venueStats}>
                  <Text style={s.venueAmount}>{formatDualCurrency(visit.totalSpent)}</Text>
                  <View style={s.venueCashbackRow}>
                    <Ionicons name="trending-up" size={14} color="#10B981" />
                    <Text style={s.venueCashback}>
                      {formatDualCurrency(visit.totalCashback)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
        </FadeInView>
      )}

      {/* Pending Receipts Alert */}
      {stats && stats.pendingReceipts > 0 && (
        <View style={s.pendingCard}>
          <View style={s.pendingIconCircle}>
            <Ionicons name="time-outline" size={24} color={isDarkMode ? '#FCD34D' : '#D97706'} />
          </View>
          <View style={s.pendingContent}>
            <Text style={s.pendingTitle}>
              {stats.pendingReceipts} {t('dashboard.pendingReceipts')}
            </Text>
            <Text style={s.pendingText}>
              {t('dashboard.receiptsBeingReviewed')}
            </Text>
          </View>
        </View>
      )}

      {/* Bottom spacer */}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#92400E',
    flex: 1,
  },

  // Hero Header
  hero: {
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: 56,
    paddingHorizontal: 24,
  },
  heroBrandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandLogo: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    fontFamily: Platform.select({ web: "'Arial Black', sans-serif", default: undefined }),
  },
  heroContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTextContainer: {
    flex: 1,
  },
  heroGreeting: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  heroName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Hero Cashback Card
  heroCashbackCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 20,
    backgroundColor: isDarkMode ? 'rgba(59,130,246,0.12)' : 'rgba(212,168,67,0.12)',
    borderRadius: 16,
    padding: 16,
  },
  heroCashbackLeft: {
    flex: 1,
  },
  heroCashbackLabel: {
    fontSize: 12,
    color: isDarkMode ? '#93C5FD' : '#D4A843',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  heroCashbackAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: isDarkMode ? '#FFFFFF' : '#FFD700',
  },
  heroCashbackRate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDarkMode ? 'rgba(59,130,246,0.2)' : 'rgba(212,168,67,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  heroCashbackRateText: {
    fontSize: 13,
    fontWeight: '700',
    color: isDarkMode ? '#93C5FD' : '#D4A843',
  },

  // Card Plan Banner
  planBanner: {
    marginHorizontal: 16,
    marginTop: -32,
    marginBottom: 20,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDarkMode ? 0.4 : 0.12,
        shadowRadius: 24,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  planGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  planLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  planTextGroup: {
    gap: 2,
  },
  planLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  planRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  planValidity: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
  daysRemaining: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
    fontStyle: 'italic',
  },

  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.04)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDarkMode ? 0.25 : 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginBottom: 4,
    textAlign: 'center',
  },
  actionSubtitle: {
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 15,
  },

  // Stats Card (unified)
  statsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.04)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDarkMode ? 0.25 : 0.08,
        shadowRadius: 16,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.onSurface,
    marginBottom: 4,
    textAlign: 'center',
  },
  statValueGold: {
    fontSize: 20,
    fontWeight: '800',
    color: '#D4A843',
    marginBottom: 4,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },

  // Upgrade Banner
  upgradeBanner: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: isDarkMode ? '#3B82F6' : '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isDarkMode ? 0.3 : 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  upgradeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
  },
  upgradeTextGroup: {
    flex: 1,
  },
  upgradeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  upgradeSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  upgradeArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Section
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  seeAll: {
    fontSize: 14,
    color: '#D4A843',
    fontWeight: '600',
  },

  // Venue Cards
  venueCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 20,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.04)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDarkMode ? 0.15 : 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  venueRankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  venueRankText: {
    fontSize: 14,
    fontWeight: '800',
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginBottom: 4,
  },
  venueDetails: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  venueStats: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  venueAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 3,
  },
  venueCashbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  venueCashback: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },

  // Pending Alert
  pendingCard: {
    flexDirection: 'row',
    backgroundColor: isDarkMode ? '#3E3412' : '#FFFBEB',
    padding: 18,
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(252,211,77,0.2)' : 'rgba(217,119,6,0.15)',
  },
  pendingIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDarkMode ? 'rgba(252,211,77,0.15)' : 'rgba(217,119,6,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pendingContent: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: isDarkMode ? '#FCD34D' : '#92400E',
    marginBottom: 2,
  },
  pendingText: {
    fontSize: 13,
    color: isDarkMode ? '#FDE68A' : '#78350F',
  },
});

export default DashboardScreen;
