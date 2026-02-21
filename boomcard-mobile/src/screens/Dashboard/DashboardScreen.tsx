import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
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
import { formatDualCurrency } from '../../utils/format';
import type { ReceiptStats, Receipt } from '../../types';

interface VenueVisit {
  venueId: string;
  merchantName: string;
  visitCount: number;
  totalSpent: number;
  totalCashback: number;
  lastVisit: string;
}

const DashboardScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme, isDarkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<ReceiptStats | null>(null);
  const [cardStats, setCardStats] = useState<any>(null);
  const [recentVisits, setRecentVisits] = useState<VenueVisit[]>([]);

  const loadData = async () => {
    try {
      const [receiptsStatsResult, cardStatsResult, receiptsResult] = await Promise.allSettled([
        ReceiptsApi.getStats(),
        cardApi.getStatistics(),
        ReceiptsApi.getReceipts({ limit: 50 }),
      ]);

      const receiptsStatsResponse = receiptsStatsResult.status === 'fulfilled' ? receiptsStatsResult.value : { success: false, data: null };
      const cardStatsResponse = cardStatsResult.status === 'fulfilled' ? cardStatsResult.value : null;
      const receiptsResponse = receiptsResult.status === 'fulfilled' ? receiptsResult.value : { success: false, data: null };

      if (receiptsStatsResponse.success && receiptsStatsResponse.data) {
        setStats(receiptsStatsResponse.data);
      }

      if (cardStatsResponse) {
        setCardStats(cardStatsResponse);
      }

      if (receiptsResponse.success && receiptsResponse.data) {
        const receipts = receiptsResponse.data.data || [];
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
      }
    } catch (error) {
      console.warn('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const s = getStyles(theme, isDarkMode);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={s.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Hero Header */}
      <LinearGradient
        colors={isDarkMode ? ['#1E3A8A', '#5B21B6'] : ['#3B82F6', '#8B5CF6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <View style={s.heroContent}>
          <View style={s.heroTextContainer}>
            <Text style={s.heroGreeting}>{t('dashboard.welcome')},</Text>
            <Text style={s.heroName}>{user?.firstName || user?.email}!</Text>
          </View>
          <TouchableOpacity style={s.notificationBtn}>
            <Ionicons name="notifications-outline" size={24} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Quick Actions - overlapping hero */}
      <View style={s.quickActions}>
        <TouchableOpacity
          style={s.actionCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('ReceiptScanner')}
        >
          <View style={[s.actionIconCircle, { backgroundColor: isDarkMode ? 'rgba(96,165,250,0.15)' : 'rgba(59,130,246,0.1)' }]}>
            <Ionicons name="camera-outline" size={24} color={theme.colors.primary} />
          </View>
          <Text style={s.actionTitle}>{t('dashboard.scanReceipt')}</Text>
          <Text style={s.actionSubtitle}>{t('dashboard.uploadEarnCashback')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.actionCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Scan')}
        >
          <View style={[s.actionIconCircle, { backgroundColor: isDarkMode ? 'rgba(167,139,250,0.15)' : 'rgba(139,92,246,0.1)' }]}>
            <Ionicons name="qr-code-outline" size={24} color={isDarkMode ? '#A78BFA' : '#8B5CF6'} />
          </View>
          <Text style={s.actionTitle}>{t('dashboard.scanSticker')}</Text>
          <Text style={s.actionSubtitle}>{t('dashboard.qrCodeAtVenue')}</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <View style={[s.statIconCircle, { backgroundColor: isDarkMode ? 'rgba(52,211,153,0.15)' : 'rgba(16,185,129,0.1)' }]}>
            <Ionicons name="wallet-outline" size={20} color={isDarkMode ? '#34D399' : '#10B981'} />
          </View>
          <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatDualCurrency(stats?.totalCashback || cardStats?.totalCashbackEarned || 0)}
          </Text>
          <Text style={s.statLabel}>{t('dashboard.totalCashback')}</Text>
        </View>

        <View style={s.statCard}>
          <View style={[s.statIconCircle, { backgroundColor: isDarkMode ? 'rgba(96,165,250,0.15)' : 'rgba(59,130,246,0.1)' }]}>
            <Ionicons name="receipt-outline" size={20} color={theme.colors.primary} />
          </View>
          <Text style={s.statValue}>{stats?.totalReceipts || 0}</Text>
          <Text style={s.statLabel}>{t('dashboard.receipts')}</Text>
        </View>

        <View style={s.statCard}>
          <View style={[s.statIconCircle, { backgroundColor: isDarkMode ? 'rgba(167,139,250,0.15)' : 'rgba(139,92,246,0.1)' }]}>
            <Ionicons name="storefront-outline" size={20} color={isDarkMode ? '#A78BFA' : '#8B5CF6'} />
          </View>
          <Text style={s.statValue}>{recentVisits.length}</Text>
          <Text style={s.statLabel}>{t('dashboard.venues')}</Text>
        </View>
      </View>

      {/* Recent Venues */}
      {recentVisits.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{t('dashboard.recentVenues')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Receipts')}>
              <Text style={s.seeAll}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>

          {recentVisits.map((visit, index) => (
            <View key={index} style={s.venueCard}>
              <View style={s.venueIconCircle}>
                <Ionicons name="storefront-outline" size={22} color={theme.colors.primary} />
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
                  <Ionicons name="arrow-up-circle-outline" size={14} color={isDarkMode ? '#34D399' : '#10B981'} />
                  <Text style={s.venueCashback}>
                    {formatDualCurrency(visit.totalCashback)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
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
      <View style={{ height: 24 }} />
    </ScrollView>
  );
};

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.onSurfaceVariant,
  },

  // Hero Header
  hero: {
    paddingTop: Platform.OS === 'ios' ? 16 : 12,
    paddingBottom: 48,
    paddingHorizontal: 20,
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
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 2,
  },
  heroName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: -28,
    marginBottom: 16,
  },
  actionCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDarkMode ? 0.3 : 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  actionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 4,
    textAlign: 'center',
  },
  actionSubtitle: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
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
  statIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginBottom: 2,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },

  // Section
  section: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  seeAll: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },

  // Venue Cards
  venueCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDarkMode ? 0.15 : 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  venueIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDarkMode ? 'rgba(96,165,250,0.12)' : 'rgba(59,130,246,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 3,
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
    color: isDarkMode ? '#34D399' : '#10B981',
    fontWeight: '500',
  },

  // Pending Alert
  pendingCard: {
    flexDirection: 'row',
    backgroundColor: isDarkMode ? '#3E3412' : '#FFFBEB',
    padding: 16,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 8,
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
