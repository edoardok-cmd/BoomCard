import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { walletApi } from '../../api/wallet.api';
import apiClient from '../../api/client';
import { useFocusEffect } from '@react-navigation/native';
import { notificationsApi } from '../../api/notifications.api';
import { formatEurAmount } from '../../utils/format';
import { toCanonicalStatus } from '../../utils/receiptStatus';
import { DashboardSkeleton, AnimatedCounter, FadeInView } from '../../components/loading';
import type { ReceiptStats, Receipt } from '../../types';

// §5.1: last 3 individual transactions with merchant, date, status, cashback
interface RecentTransaction {
  id: string;
  merchantName: string;
  date: string;
  status: string;
  cashbackAmount: number;
  totalAmount: number;
}

// R5 §3.2 — keyed by the canonical status vocabulary (toCanonicalStatus). Internal
// pipeline states (PROCESSING/VALIDATING/MANUAL_REVIEW/PENDING_CONFIRMATION/PENDING)
// collapse to IN_REVIEW and never leak to the user, so color and label always agree.
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  APPROVED:  { bg: 'rgba(16,185,129,0.12)', text: '#10B981' },
  IN_REVIEW: { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6' },
  REJECTED:  { bg: 'rgba(239,68,68,0.12)',  text: '#EF4444' },
  EXPIRED:   { bg: 'rgba(107,114,128,0.12)', text: '#6B7280' },
};

const DashboardScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme, isDarkMode } = useTheme();
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [stats, setStats] = useState<ReceiptStats | null>(null);
  const [cardStats, setCardStats] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [cardMissing, setCardMissing] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  // W6 — spec §6.6 cashback breakdown (Available / Pending / Expiring).
  const [walletBalance, setWalletBalance] = useState<{
    availableBalance: number;
    pendingBalance: number;
    expiringBalance: number;
  } | null>(null);

  useFocusEffect(useCallback(() => {
    notificationsApi.getUnreadCount().then(res => {
      if (res.success && res.data) {
        const payload = (res.data as any).count ?? (res.data as any).data?.count ?? 0;
        setUnreadCount(typeof payload === 'number' ? payload : 0);
      }
    });
  }, []));

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
          // GET /api/subscriptions/current returns the subscription flat at the
          // top level ({ ...subscription, paymentMethod, benefits }) when one
          // exists, or { hasSubscription: false, subscription: null } when none
          // does. Coalesce the no-subscription envelope (which has no `id`) to
          // null so the plan card isn't rendered for a never-subscribed user.
          const subBody = subResponse.data as any;
          setSubscription(subBody?.id ? subBody : (subBody?.subscription ?? null));
          anySucceeded = true;
        }
      }).catch((err) => { if (__DEV__) console.warn('Dashboard: subscription fetch failed', err); anyFailed = true; });

      const receiptsStatsPromise = ReceiptsApi.getStats().then((response) => {
        if (!mountedRef.current) return;
        if (response.success && response.data) {
          setStats(response.data);
          anySucceeded = true;
        }
      }).catch((err) => { if (__DEV__) console.warn('Dashboard: receipt stats fetch failed', err); anyFailed = true; });

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
      }).catch((err) => { if (__DEV__) console.warn('Dashboard: card stats fetch failed', err); anyFailed = true; });

      // §5.1: fetch most recent 3 individual transactions (sorted by date desc)
      // Fetch 50 and sort client-side — backend sort order is not guaranteed
      const receiptsPromise = ReceiptsApi.getReceipts({ limit: 50 }).then((response) => {
        if (!mountedRef.current) return;
        if (response.success && response.data) {
          const receipts: Receipt[] = response.data.data || [];
          const transactions: RecentTransaction[] = receipts
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 3)
            .map(r => ({
              id: r.id,
              merchantName: r.merchantName || t('receipts.unknownMerchant', 'Непознат търговец'),
              date: r.receiptDate || r.createdAt,
              status: r.status,
              cashbackAmount: r.cashbackAmount || 0,
              totalAmount: r.totalAmount || 0,
            }));
          setRecentTransactions(transactions);
          anySucceeded = true;
        }
      }).catch((err) => { if (__DEV__) console.warn('Dashboard: receipts fetch failed', err); anyFailed = true; });

      // W6 — wallet cashback breakdown for the dashboard 3-line display
      const walletPromise = walletApi.getBalance().then((bal: any) => {
        if (!mountedRef.current || !bal) return;
        setWalletBalance({
          availableBalance: bal.availableBalance ?? 0,
          pendingBalance: bal.pendingBalance ?? 0,
          expiringBalance: bal.expiringBalance ?? 0,
        });
        anySucceeded = true;
      }).catch((err) => { if (__DEV__) console.warn('Dashboard: wallet balance fetch failed', err); anyFailed = true; });

      await Promise.allSettled([subscriptionPromise, receiptsStatsPromise, cardStatsPromise, receiptsPromise, walletPromise]);

      // Show error banner only when no request yielded data (complete outage)
      if (mountedRef.current && anyFailed && !anySucceeded) {
        setLoadError(true);
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to load dashboard data:', error);
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
    if (planCode === 'PREMIUM') return 20; // max per cashback matrix (25% partner → 20% user)
    if (planCode === 'BASIC') return 10;   // hard cap per cashback matrix
    if (planCode === 'LIGHT') return 20;   // Premium Weekly: same max as Premium Monthly
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
          <TouchableOpacity style={s.notificationBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={24} color="rgba(255,255,255,0.9)" />
            {unreadCount > 0 && (
              <View style={s.notificationBadge}>
                <Text style={s.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
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
              formatFn={formatEurAmount}
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

        {/* W6 §6.6 — Available / Pending / Expiring breakdown. Each line renders
            only when that state has a non-zero balance. */}
        {walletBalance && (walletBalance.availableBalance > 0 || walletBalance.pendingBalance > 0 || walletBalance.expiringBalance > 0) && (
          <View style={s.cashbackBreakdown}>
            {walletBalance.availableBalance > 0 && (
              <View style={s.cashbackBreakdownRow}>
                <Text style={s.cashbackBreakdownLabel}>{t('dashboard.cashbackAvailable', 'Налично')}</Text>
                <Text style={s.cashbackBreakdownValue}>{formatEurAmount(walletBalance.availableBalance)}</Text>
              </View>
            )}
            {walletBalance.pendingBalance > 0 && (
              <View style={s.cashbackBreakdownRow}>
                <Text style={s.cashbackBreakdownLabel}>{t('dashboard.cashbackPending', 'В преглед')}</Text>
                <Text style={s.cashbackBreakdownValue}>{formatEurAmount(walletBalance.pendingBalance)}</Text>
              </View>
            )}
            {walletBalance.expiringBalance > 0 && (
              <View style={s.cashbackBreakdownRow}>
                <Text style={[s.cashbackBreakdownLabel, s.cashbackExpiringLabel]}>{t('dashboard.cashbackExpiring', 'Изтича скоро')}</Text>
                <Text style={[s.cashbackBreakdownValue, s.cashbackExpiringValue]}>{formatEurAmount(walletBalance.expiringBalance)}</Text>
              </View>
            )}
          </View>
        )}
      </LinearGradient>

      {/* No card warning — subscription exists but card was never provisioned */}
      {subscription && cardMissing && (
        <FadeInView delay={0}>
          <TouchableOpacity
            style={[s.planBanner, { borderColor: 'rgba(239,68,68,0.35)', marginBottom: 12 }]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('MyCard')}
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
          onPress={() => navigation.navigate('MyCard')}
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
                          : subscription.status === 'EXPIRED'
                          ? t('dashboard.cardExpired')
                          : (subscription.status === 'PAST_DUE' || subscription.status === 'FAILED_PAYMENT')
                          ? t('dashboard.cardFailedPayment', 'Неуспешно плащане')
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
          onPress={() => navigation.navigate('Scan')}
        >
          <View style={[s.actionIconCircle, { backgroundColor: isDarkMode ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.1)' }]}>
            <Ionicons name="cloud-upload-outline" size={22} color="#10B981" />
          </View>
          <Text style={s.actionTitle}>{t('dashboard.uploadReceipt', 'Качи бележка')}</Text>
          <Text style={s.actionSubtitle}>{t('dashboard.uploadReceiptSub', 'Спечели кешбек')}</Text>
        </TouchableOpacity>
      </View>
      </FadeInView>

      {/* Stats Card */}
      <FadeInView delay={200}>
      <View style={s.statsCard}>
        <TouchableOpacity
          style={s.statItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('CashbackHistory')}
        >
          <View style={[s.statIconCircle, { backgroundColor: isDarkMode ? 'rgba(212,168,67,0.15)' : 'rgba(212,168,67,0.1)' }]}>
            <Ionicons name="wallet-outline" size={18} color="#D4A843" />
          </View>
          <AnimatedCounter
            targetValue={stats?.totalCashback || cardStats?.totalCashbackEarned || 0}
            formatFn={formatEurAmount}
            style={s.statValueGold}
          />
          <Text style={s.statLabel}>{t('dashboard.totalCashback')}</Text>
        </TouchableOpacity>

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
            targetValue={stats?.approvedReceipts || 0}
            style={s.statValue}
          />
          <Text style={s.statLabel}>{t('receipts.approved', 'Approved')}</Text>
        </View>
      </View>
      </FadeInView>

      {/* Upgrade Banner */}
      {subscription && planCode !== 'PREMIUM' && (
        <FadeInView delay={250}>
        <TouchableOpacity
          style={s.upgradeBanner}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('MyCard')}
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

      {/* §5.1 Last 3 Transactions */}
      {recentTransactions.length > 0 && (
        <FadeInView delay={300}>
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{t('dashboard.recentTransactions', 'Последни транзакции')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Receipts')}>
              <Text style={s.seeAll}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>

          {recentTransactions.map((tx) => {
            // R5 §3.2 — collapse internal pipeline statuses to the canonical vocabulary
            // for BOTH the color lookup and the label so they always agree.
            const canonical = toCanonicalStatus(tx.status);
            const sc = STATUS_COLORS[canonical] || STATUS_COLORS.IN_REVIEW;
            return (
              <View key={tx.id} style={s.txCard}>
                <View style={[s.txIconCircle, { backgroundColor: isDarkMode ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.08)' }]}>
                  <Ionicons name="storefront" size={18} color="#8B5CF6" />
                </View>
                <View style={s.txInfo}>
                  <Text style={s.txMerchant} numberOfLines={1}>{tx.merchantName}</Text>
                  <Text style={s.txDate}>{formatDate(tx.date)}</Text>
                </View>
                <View style={s.txRight}>
                  <View style={[s.txStatusBadge, { backgroundColor: isDarkMode ? `${sc.bg}` : sc.bg }]}>
                    <Text style={[s.txStatusText, { color: sc.text }]}>
                      {t(`receipts.status.${canonical}`, t(`receipts.status.${tx.status}`, tx.status))}
                    </Text>
                  </View>
                  {tx.cashbackAmount > 0 && (
                    <View style={s.txCashbackRow}>
                      <Ionicons name="trending-up" size={12} color="#10B981" />
                      <Text style={s.txCashback}>{formatEurAmount(tx.cashbackAmount)}</Text>
                    </View>
                  )}
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
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
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

  // W6 — cashback breakdown (Available / Pending / Expiring)
  cashbackBreakdown: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
    gap: 6,
  },
  cashbackBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashbackBreakdownLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  cashbackBreakdownValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cashbackExpiringLabel: {
    color: '#FCD34D',
  },
  cashbackExpiringValue: {
    color: '#FCD34D',
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

  // Transaction Cards (§5.1 last 3 transactions)
  txCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 18,
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
      android: { elevation: 2 },
    }),
  },
  txIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txInfo: { flex: 1 },
  txMerchant: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginBottom: 3,
  },
  txDate: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  txStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  txCashbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  txCashback: {
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
