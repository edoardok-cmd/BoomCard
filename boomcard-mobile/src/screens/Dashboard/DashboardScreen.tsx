import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../store/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ReceiptsApi } from '../../api/receipts.api';
import { cardApi } from '../../api/card.api';
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
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<ReceiptStats | null>(null);
  const [cardStats, setCardStats] = useState<any>(null);
  const [recentVisits, setRecentVisits] = useState<VenueVisit[]>([]);

  const loadData = async () => {
    try {
      const [receiptsStatsResponse, cardStatsResponse, receiptsResponse] = await Promise.all([
        ReceiptsApi.getStats().catch(() => ({ success: false, data: null })),
        cardApi.getStatistics().catch(() => null),
        ReceiptsApi.getReceipts({ limit: 50 }).catch(() => ({ success: false, data: null })),
      ]);

      if (receiptsStatsResponse.success && receiptsStatsResponse.data) {
        setStats(receiptsStatsResponse.data);
      }

      if (cardStatsResponse) {
        setCardStats(cardStatsResponse);
      }

      // Group receipts by venue/merchant to show visits
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

        // Convert to array and sort by visit count
        const visits = Array.from(venueMap.values())
          .sort((a, b) => b.visitCount - a.visitCount)
          .slice(0, 5); // Top 5 venues

        setRecentVisits(visits);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
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

  const formatAmount = (amount: number | undefined) => {
    if (!amount) return '0.00 лв / €0.00';
    // Convert to dual currency format
    const bgnFormatted = `${amount.toFixed(2)} лв`;
    const eurAmount = amount / 1.95583; // BGN to EUR conversion
    const eurFormatted = `€${eurAmount.toFixed(2)}`;
    return `${bgnFormatted} / ${eurFormatted}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('bg-BG', {
      month: 'short',
      day: 'numeric',
    });
  };

  const styles = getStyles(theme);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>{t('dashboard.welcome')},</Text>
        <Text style={styles.name}>{user?.firstName || user?.email}!</Text>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('ReceiptScanner')}
        >
          <Text style={styles.actionIcon}>📸</Text>
          <Text style={styles.actionTitle}>{t('dashboard.scanReceipt')}</Text>
          <Text style={styles.actionSubtitle}>{t('dashboard.uploadEarnCashback')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Scan')}
        >
          <Text style={styles.actionIcon}>💥</Text>
          <Text style={styles.actionTitle}>{t('dashboard.scanSticker')}</Text>
          <Text style={styles.actionSubtitle}>{t('dashboard.qrCodeAtVenue')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stats}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {formatAmount(stats?.totalCashback || cardStats?.totalCashbackEarned || 0)}
          </Text>
          <Text style={styles.statLabel}>{t('dashboard.totalCashback')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.totalReceipts || 0}</Text>
          <Text style={styles.statLabel}>{t('dashboard.receipts')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{recentVisits.length}</Text>
          <Text style={styles.statLabel}>{t('dashboard.venues')}</Text>
        </View>
      </View>

      {recentVisits.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('dashboard.recentVenues')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Receipts')}>
              <Text style={styles.seeAll}>{t('dashboard.seeAll')}</Text>
            </TouchableOpacity>
          </View>

          {recentVisits.map((visit, index) => (
            <View key={index} style={styles.venueCard}>
              <View style={styles.venueIcon}>
                <Text style={styles.venueIconText}>🏪</Text>
              </View>
              <View style={styles.venueInfo}>
                <Text style={styles.venueName} numberOfLines={1}>
                  {visit.merchantName}
                </Text>
                <Text style={styles.venueDetails}>
                  {visit.visitCount} {visit.visitCount > 1 ? t('dashboard.visits') : t('dashboard.visit')} • {t('dashboard.lastVisit')}:{' '}
                  {formatDate(visit.lastVisit)}
                </Text>
              </View>
              <View style={styles.venueStats}>
                <Text style={styles.venueAmount}>{formatAmount(visit.totalSpent)}</Text>
                <Text style={styles.venueCashback}>
                  +{formatAmount(visit.totalCashback)} {t('dashboard.cashback')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {stats && stats.pendingReceipts > 0 && (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingIcon}>⏳</Text>
          <View style={styles.pendingContent}>
            <Text style={styles.pendingTitle}>
              {stats.pendingReceipts} {t('dashboard.pendingReceipts')}
            </Text>
            <Text style={styles.pendingText}>
              {t('dashboard.receiptsBeingReviewed')}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
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
  header: {
    padding: 24,
    backgroundColor: theme.colors.surface,
    marginBottom: 16,
  },
  greeting: {
    fontSize: 16,
    color: theme.colors.onSurfaceVariant,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 16,
    marginBottom: 16,
  },
  actionCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },
  stats: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 80,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 4,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  seeAll: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  venueCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  venueIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  venueIconText: {
    fontSize: 24,
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 4,
  },
  venueDetails: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  venueStats: {
    alignItems: 'flex-end',
  },
  venueAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 2,
  },
  venueCashback: {
    fontSize: 12,
    color: theme.colors.tertiary,
    fontWeight: '500',
  },
  pendingCard: {
    flexDirection: 'row',
    backgroundColor: theme.dark ? '#3E3412' : '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    margin: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  pendingIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  pendingContent: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.dark ? '#FCD34D' : '#92400E',
    marginBottom: 4,
  },
  pendingText: {
    fontSize: 14,
    color: theme.dark ? '#FDE68A' : '#78350F',
  },
});

export default DashboardScreen;
