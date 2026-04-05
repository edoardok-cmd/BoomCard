import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { ReceiptsApi } from '../../api/receipts.api';
import { useTheme } from '../../contexts/ThemeContext';
import type { Receipt, ReceiptStats, ReceiptStatus } from '../../types';
import { APP_CONFIG } from '../../constants/config';

// Soft status badge colors matching website design (light bg + dark text)
const STATUS_CONFIG: Record<string, { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  APPROVED: { bg: '#D1FAE5', text: '#065F46', icon: 'checkmark-circle' },
  PENDING_CONFIRMATION: { bg: '#E0F2FE', text: '#0369A1', icon: 'hourglass' },
  PENDING: { bg: '#FEF3C7', text: '#92400E', icon: 'time' },
  PROCESSING: { bg: '#DBEAFE', text: '#1E40AF', icon: 'sync' },
  VALIDATING: { bg: '#E0E7FF', text: '#3730A3', icon: 'shield-checkmark' },
  REJECTED: { bg: '#FEE2E2', text: '#991B1B', icon: 'close-circle' },
  MANUAL_REVIEW: { bg: '#EDE9FE', text: '#5B21B6', icon: 'eye' },
  EXPIRED: { bg: '#F3F4F6', text: '#374151', icon: 'alert-circle' },
};

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms)
    ),
  ]);

const ReceiptsScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [stats, setStats] = useState<ReceiptStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const TIMEOUT_MS = 15000;
      const [receiptsResult, statsResult] = await Promise.allSettled([
        withTimeout(ReceiptsApi.getReceipts({ limit: 50, page: 1 }), TIMEOUT_MS),
        withTimeout(ReceiptsApi.getStats(), TIMEOUT_MS),
      ]);

      const receiptsResponse = receiptsResult.status === 'fulfilled' ? receiptsResult.value : { success: false, data: null };
      const statsResponse = statsResult.status === 'fulfilled' ? statsResult.value : { success: false, data: null };

      if (!mountedRef.current) return;

      let hasData = false;

      if (receiptsResponse.success && receiptsResponse.data) {
        setReceipts(receiptsResponse.data.data || []);
        hasData = true;
      }

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
        hasData = true;
      }

      if (!hasData) {
        const timedOut = receiptsResult.status === 'rejected' || statsResult.status === 'rejected';
        setError(timedOut ? t('common.connectionTimeout') : t('receipts.failedToLoad'));
      }
    } catch (error: any) {
      if (__DEV__) console.warn('Failed to load receipts:', error);
      if (mountedRef.current) setError(error.message || t('receipts.failedToLoad'));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // Refetch whenever the screen comes into focus (e.g. after submitting a receipt)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return t('common.noData');
    const date = new Date(dateString);
    return date.toLocaleDateString('bg-BG', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number | undefined) => {
    if (!amount) return '0.00 лв / €0.00';
    const bgnFormatted = `${amount.toFixed(2)} лв`;
    const eurAmount = amount / APP_CONFIG.EUR_EXCHANGE_RATE;
    const eurFormatted = `€${eurAmount.toFixed(2)}`;
    return `${bgnFormatted} / ${eurFormatted}`;
  };

  const s = getStyles(theme, isDarkMode);

  const renderReceiptItem = ({ item }: { item: Receipt }) => {
    // Auto-approved = APPROVED but not yet admin-confirmed (reviewedBy is absent)
    const isAutoApproved = item.status === 'APPROVED' && !item.reviewedBy;
    const effectiveStatus = isAutoApproved ? 'PENDING_CONFIRMATION' : item.status;
    const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG[item.status] || STATUS_CONFIG.EXPIRED;

    return (
      <TouchableOpacity
        style={s.receiptCard}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ReceiptDetails', { receiptId: item.id })}
      >
        {item.imageUrl && (
          <Image source={{ uri: item.imageUrl }} style={s.receiptImage} />
        )}
        <View style={s.receiptContent}>
          {/* Header: Merchant + Status */}
          <View style={s.receiptHeader}>
            <View style={s.merchantRow}>
              <View style={[s.merchantIconCircle, { backgroundColor: isDarkMode ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.08)' }]}>
                <Ionicons name="storefront" size={16} color="#8B5CF6" />
              </View>
              <Text style={s.merchantName} numberOfLines={1}>
                {item.merchantName || t('receipts.unknownMerchant')}
              </Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: isDarkMode ? `${statusConfig.bg}30` : statusConfig.bg }]}>
              <Ionicons name={statusConfig.icon} size={13} color={isDarkMode ? statusConfig.text.replace('#0', '#6').replace('#1', '#5').replace('#3', '#7').replace('#5', '#9').replace('#9', '#D') : statusConfig.text} />
              <Text style={[s.statusText, { color: isDarkMode ? statusConfig.text.replace('#0', '#6').replace('#1', '#5').replace('#3', '#7').replace('#5', '#9').replace('#9', '#D') : statusConfig.text }]}>
                {isAutoApproved
                  ? t('receipts.status.PENDING_CONFIRMATION')
                  : (t(`receipts.status.${item.status}`) || item.status)}
              </Text>
            </View>
          </View>

          <View style={s.headerDivider} />

          {/* Body: Details */}
          <View style={s.receiptDetails}>
            <View style={s.detailRow}>
              <View style={s.detailLabelRow}>
                <Ionicons name="cash-outline" size={14} color={theme.colors.onSurfaceVariant} />
                <Text style={s.detailLabel}>{t('receipts.amount')}</Text>
              </View>
              <Text style={s.detailValue}>
                {formatAmount(item.totalAmount)}
              </Text>
            </View>

            {item.cashbackAmount && item.cashbackAmount > 0 && (
              <View style={s.detailRow}>
                <View style={s.detailLabelRow}>
                  <Ionicons name="trending-up" size={14} color={isAutoApproved ? '#0369A1' : '#10B981'} />
                  <Text style={s.detailLabel}>{t('receipts.cashback')}</Text>
                </View>
                <View style={[s.cashbackBadge, isAutoApproved ? { backgroundColor: '#E0F2FE' } : undefined]}>
                  <Text style={[s.cashbackValue, isAutoApproved ? { color: '#0369A1' } : undefined]}>
                    {isAutoApproved ? '~' : '+'}{formatAmount(item.cashbackAmount)}
                    {item.cashbackPercent && ` (${item.cashbackPercent}%)`}
                    {isAutoApproved ? ' ⏳' : ''}
                  </Text>
                </View>
              </View>
            )}

            <View style={s.detailRow}>
              <View style={s.detailLabelRow}>
                <Ionicons name="calendar-outline" size={14} color={theme.colors.onSurfaceVariant} />
                <Text style={s.detailLabel}>{t('receipts.date')}</Text>
              </View>
              <Text style={s.detailValue}>{formatDate(item.receiptDate)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderStats = () => {
    if (!stats) return null;

    return (
      <View style={s.statsCard}>
        <View style={s.statItem}>
          <View style={[s.statIconCircle, { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)' }]}>
            <Ionicons name="receipt-outline" size={18} color={isDarkMode ? '#60A5FA' : '#3B82F6'} />
          </View>
          <Text style={s.statValue}>{stats.totalReceipts}</Text>
          <Text style={s.statLabel}>{t('receipts.totalReceipts')}</Text>
        </View>

        <View style={s.statDivider} />

        <View style={s.statItem}>
          <View style={[s.statIconCircle, { backgroundColor: isDarkMode ? 'rgba(212,168,67,0.15)' : 'rgba(212,168,67,0.08)' }]}>
            <Ionicons name="wallet-outline" size={18} color="#D4A843" />
          </View>
          <Text style={s.statValueGold}>
            {formatAmount(stats.totalCashback)}
          </Text>
          <Text style={s.statLabel}>{t('receipts.totalCashback')}</Text>
        </View>

        <View style={s.statDivider} />

        <View style={s.statItem}>
          <View style={[s.statIconCircle, { backgroundColor: isDarkMode ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.08)' }]}>
            <Ionicons name="time-outline" size={18} color={isDarkMode ? '#FCD34D' : '#D97706'} />
          </View>
          <Text style={s.statValue}>{stats.pendingReceipts}</Text>
          <Text style={s.statLabel}>{t('receipts.pendingReceipts')}</Text>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={s.empty}>
      <View style={s.emptyIconCircle}>
        <Ionicons name="document-text-outline" size={40} color={isDarkMode ? '#475569' : '#CBD5E1'} />
      </View>
      <Text style={s.emptyTitle}>{t('receipts.noReceipts')}</Text>
      <Text style={s.emptyText}>
        {t('receipts.startScanning')}
      </Text>
      <TouchableOpacity
        style={s.scanButton}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('ReceiptScanner')}
      >
        <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
        <Text style={s.scanButtonText}>{t('receipts.scanReceipt')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => (
    <View>
      {renderStats()}
      {/* Scan CTA above list */}
      {receipts.length > 0 && (
        <TouchableOpacity
          style={s.scanCta}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('ReceiptScanner')}
        >
          <View style={s.scanCtaLeft}>
            <View style={[s.scanCtaIcon, { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.06)' }]}>
              <Ionicons name="camera-outline" size={20} color={isDarkMode ? '#60A5FA' : '#000000'} />
            </View>
            <View>
              <Text style={s.scanCtaTitle}>{t('receipts.scanReceipt')}</Text>
              <Text style={s.scanCtaSubtitle}>{t('receipts.startScanning')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={s.loadingText}>{t('receipts.loadingReceipts')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.centered}>
        <View style={s.errorIconCircle}>
          <Ionicons name="cloud-offline-outline" size={32} color={isDarkMode ? '#F87171' : '#EF4444'} />
        </View>
        <Text style={s.errorText}>{error}</Text>
        <Text style={s.errorSubtext}>{t('receipts.pullDownToRefresh')}</Text>
        <TouchableOpacity
          style={s.retryButton}
          activeOpacity={0.8}
          onPress={() => {
            setLoading(true);
            setError(null);
            loadData();
          }}
        >
          <Ionicons name="refresh" size={16} color="#FFFFFF" />
          <Text style={s.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <FlatList
        data={receipts}
        renderItem={renderReceiptItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={
          receipts.length === 0 ? s.emptyContainer : s.listContent
        }
      />
    </View>
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
    padding: 24,
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: theme.colors.onSurfaceVariant,
    fontWeight: '500',
  },

  // Error state
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: isDarkMode ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: 6,
  },
  errorSubtext: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: isDarkMode ? '#3B82F6' : '#000000',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  listContent: {
    padding: 16,
    paddingTop: 28,
    paddingBottom: 32,
  },
  emptyContainer: {
    flexGrow: 1,
  },

  // Stats Card — matching Dashboard design
  statsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
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
    paddingVertical: 4,
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
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.onSurface,
    marginBottom: 4,
    textAlign: 'center',
  },
  statValueGold: {
    fontSize: 14,
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

  // Scan CTA
  scanCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
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
  scanCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  scanCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanCtaTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginBottom: 2,
  },
  scanCtaSubtitle: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },

  // Receipt Card — matching website's bordered card style
  receiptCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: isDarkMode ? 1 : 2,
    borderColor: isDarkMode ? theme.colors.outline : '#E5E7EB',
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
  receiptImage: {
    width: '100%',
    height: 120,
    resizeMode: 'cover',
  },
  receiptContent: {
    padding: 16,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 10,
  },
  merchantIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  merchantName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },

  // Status Badge — soft colors matching website
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Divider between header and body
  headerDivider: {
    height: 1,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
    marginBottom: 12,
  },

  // Receipt details
  receiptDetails: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  cashbackBadge: {
    backgroundColor: isDarkMode ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  cashbackValue: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
  },

  // Empty state
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: isDarkMode ? 'rgba(71,85,105,0.15)' : 'rgba(203,213,225,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  scanButton: {
    backgroundColor: isDarkMode ? '#3B82F6' : '#000000',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ReceiptsScreen;
