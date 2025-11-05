import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { ReceiptsApi } from '../../api/receipts.api';
import { useTheme } from '../../contexts/ThemeContext';
import type { Receipt, ReceiptStats, ReceiptStatus } from '../../types';

const STATUS_COLORS: Record<string, string> = {
  APPROVED: '#10B981',
  PENDING: '#F59E0B',
  PROCESSING: '#3B82F6',
  VALIDATING: '#6366F1',
  REJECTED: '#EF4444',
  MANUAL_REVIEW: '#8B5CF6',
  EXPIRED: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  APPROVED: 'Approved',
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  VALIDATING: 'Validating',
  REJECTED: 'Rejected',
  MANUAL_REVIEW: 'Review',
  EXPIRED: 'Expired',
};

const ReceiptsScreen = ({ navigation }: any) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [stats, setStats] = useState<ReceiptStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [receiptsResponse, statsResponse] = await Promise.all([
        ReceiptsApi.getReceipts({ limit: 50, page: 1 }),
        ReceiptsApi.getStats(),
      ]);

      if (receiptsResponse.success && receiptsResponse.data) {
        setReceipts(receiptsResponse.data.data || []);
      }

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      }
    } catch (error: any) {
      console.error('Failed to load receipts:', error);
      setError(error.message || 'Failed to load receipts');
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

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number | undefined) => {
    if (!amount) return '0.00';
    return amount.toFixed(2);
  };

  const renderReceiptItem = ({ item }: { item: Receipt }) => (
    <TouchableOpacity
      style={styles.receiptCard}
      onPress={() => navigation.navigate('ReceiptDetails', { receiptId: item.id })}
    >
      {item.imageUrl && (
        <Image source={{ uri: item.imageUrl }} style={styles.receiptImage} />
      )}
      <View style={styles.receiptContent}>
        <View style={styles.receiptHeader}>
          <Text style={styles.merchantName} numberOfLines={1}>
            {item.merchantName || 'Unknown Merchant'}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: STATUS_COLORS[item.status] || '#6B7280' },
            ]}
          >
            <Text style={styles.statusText}>
              {STATUS_LABELS[item.status] || item.status}
            </Text>
          </View>
        </View>

        <View style={styles.receiptDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount:</Text>
            <Text style={styles.detailValue}>
              {formatAmount(item.totalAmount)} BGN
            </Text>
          </View>

          {item.cashbackAmount && item.cashbackAmount > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Cashback:</Text>
              <Text style={[styles.detailValue, styles.cashbackValue]}>
                +{formatAmount(item.cashbackAmount)} BGN
                {item.cashbackPercent && ` (${item.cashbackPercent}%)`}
              </Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date:</Text>
            <Text style={styles.detailValue}>{formatDate(item.receiptDate)}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderStats = () => {
    if (!stats) return null;

    return (
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalReceipts}</Text>
          <Text style={styles.statLabel}>Total Receipts</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, styles.cashbackStat]}>
            {formatAmount(stats.totalCashback)} BGN
          </Text>
          <Text style={styles.statLabel}>Total Cashback</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.pendingReceipts}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>📄</Text>
      <Text style={styles.emptyTitle}>No Receipts Yet</Text>
      <Text style={styles.emptyText}>
        Start scanning receipts to earn cashback
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('ReceiptScanner')}
      >
        <Text style={styles.buttonText}>Scan Receipt</Text>
      </TouchableOpacity>
    </View>
  );

  const styles = getStyles(theme);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading receipts...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorSubtext}>Pull down to refresh</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={receipts}
        renderItem={renderReceiptItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderStats}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={
          receipts.length === 0 ? styles.emptyContainer : styles.listContent
        }
      />
    </View>
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
  errorText: {
    fontSize: 16,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginBottom: 4,
  },
  cashbackStat: {
    color: '#10B981',
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },
  receiptCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: theme.dark ? '#FFFFFF' : '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
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
  merchantName: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  receiptDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  cashbackValue: {
    color: '#10B981',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ReceiptsScreen;
