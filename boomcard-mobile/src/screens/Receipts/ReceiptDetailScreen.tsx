import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ReceiptsApi } from '../../api/receipts.api';
import { useTheme } from '../../contexts/ThemeContext';
import { toCanonicalStatus } from '../../utils/receiptStatus';
import { formatEurAmount } from '../../utils/format';
import type { Receipt } from '../../types';

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

const ReceiptDetailScreen = ({ route, navigation }: any) => {
  const { receiptId } = route.params;
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();
  const mountedRef = useRef(true);

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    loadReceipt();
  }, [receiptId]);

  const loadReceipt = async () => {
    try {
      setError(null);
      setLoading(true);
      const response = await ReceiptsApi.getReceiptById(receiptId);
      if (!mountedRef.current) return;
      if (response.success && response.data) {
        setReceipt(response.data);
      } else {
        setError(t('receipts.failedToLoad'));
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message || t('receipts.failedToLoad'));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return t('common.noData');
    return new Date(dateString).toLocaleDateString('bg-BG', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // AC#5 — single shared EUR formatter, no per-screen reimplementation.
  const formatAmount = (amount: number | undefined) => formatEurAmount(amount || 0);

  const s = getStyles(theme, isDarkMode);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !receipt) {
    return (
      <View style={s.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
        <Text style={s.errorText}>{error || t('receipts.failedToLoad')}</Text>
        <TouchableOpacity style={s.retryButton} onPress={loadReceipt}>
          <Ionicons name="refresh" size={16} color="#FFFFFF" />
          <Text style={s.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusConfig = STATUS_CONFIG[receipt.status] || STATUS_CONFIG.EXPIRED;
  // R5 §3.2 — collapse internal pipeline states so detail matches the list.
  const canonicalStatus = toCanonicalStatus(receipt.status);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Receipt image */}
      {receipt.imageUrl && (
        <Image source={{ uri: receipt.imageUrl }} style={s.receiptImage} />
      )}

      {/* Status banner */}
      <View style={[s.statusBanner, { backgroundColor: isDarkMode ? `${statusConfig.bg}30` : statusConfig.bg }]}>
        <Ionicons name={statusConfig.icon} size={20} color={statusConfig.text} />
        <Text style={[s.statusText, { color: statusConfig.text }]}>
          {t(`receipts.status.${canonicalStatus}`, t(`receipts.status.${receipt.status}`, receipt.status))}
        </Text>
      </View>

      {/* Details card */}
      <View style={s.card}>
        <DetailRow
          icon="storefront"
          label={t('receipts.merchant')}
          value={receipt.merchantName || t('receipts.unknownMerchant')}
          theme={theme}
          isDarkMode={isDarkMode}
        />
        <View style={s.divider} />
        <DetailRow
          icon="cash-outline"
          label={t('receipts.amount')}
          value={formatAmount(receipt.totalAmount)}
          theme={theme}
          isDarkMode={isDarkMode}
        />
        {receipt.cashbackAmount != null && receipt.cashbackAmount > 0 && (
          <>
            <View style={s.divider} />
            <DetailRow
              icon="trending-up"
              label={t('receipts.cashback')}
              value={`+${formatAmount(receipt.cashbackAmount)}${receipt.cashbackPercent ? ` (${receipt.cashbackPercent}%)` : ''}`}
              valueColor="#10B981"
              theme={theme}
              isDarkMode={isDarkMode}
            />
          </>
        )}
        <View style={s.divider} />
        <DetailRow
          icon="calendar-outline"
          label={t('receipts.date')}
          value={formatDate(receipt.receiptDate)}
          theme={theme}
          isDarkMode={isDarkMode}
        />
        <View style={s.divider} />
        <DetailRow
          icon="time-outline"
          label={t('receipts.submittedAt')}
          value={formatDate(receipt.createdAt)}
          theme={theme}
          isDarkMode={isDarkMode}
        />
      </View>

      {/* Rejection reason */}
      {receipt.status === 'REJECTED' && receipt.rejectionReason && (
        <View style={[s.card, s.rejectionCard]}>
          <View style={s.rejectionHeader}>
            <Ionicons name="information-circle" size={20} color="#991B1B" />
            <Text style={s.rejectionTitle}>{t('receipts.rejectionReason')}</Text>
          </View>
          <Text style={s.rejectionText}>{receipt.rejectionReason}</Text>
        </View>
      )}
    </ScrollView>
  );
};

const DetailRow = ({
  icon,
  label,
  value,
  valueColor,
  theme,
  isDarkMode,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
  theme: any;
  isDarkMode: boolean;
}) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
      <Ionicons name={icon} size={18} color={theme.colors.onSurfaceVariant} />
      <Text style={{ fontSize: 14, color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>{label}</Text>
    </View>
    <Text
      style={{ fontSize: 14, fontWeight: '600', color: valueColor || theme.colors.onSurface, textAlign: 'right', flex: 1 }}
      numberOfLines={2}
    >
      {value}
    </Text>
  </View>
);

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: theme.colors.background,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.error,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  retryButton: {
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
  receiptImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    resizeMode: 'cover',
    marginBottom: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 12,
    borderWidth: isDarkMode ? 1 : 2,
    borderColor: isDarkMode ? theme.colors.outline : '#E5E7EB',
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
  divider: {
    height: 1,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3F4F6',
  },
  rejectionCard: {
    borderColor: isDarkMode ? '#7F1D1D' : '#FCA5A5',
  },
  rejectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 8,
  },
  rejectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#991B1B',
  },
  rejectionText: {
    fontSize: 14,
    color: isDarkMode ? '#FCA5A5' : '#7F1D1D',
    paddingBottom: 12,
    lineHeight: 20,
  },
});

export default ReceiptDetailScreen;
