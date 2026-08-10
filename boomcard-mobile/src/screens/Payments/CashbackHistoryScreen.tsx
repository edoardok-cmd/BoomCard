/**
 * Cashback History Screen (Spec §4.4 v1.1)
 *
 * Renders every CASHBACK_CREDIT entry the user has, including Voided rows
 * that show the rejection reason inline so the user has a transparent audit
 * trail per §7.1 ("записът се маркира като Voided / Анулиран с visible
 * причина").
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Card, Chip } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { walletApi } from '../../api/wallet.api';
import { formatEurAmount, formatDateTime } from '../../utils/format';

// W8 §6.7 — period + status filters forwarded to the backend.
type PeriodFilter = 'all' | '7d' | '30d';
type StatusFilter = 'all' | 'PENDING' | 'CLEARED' | 'LOCKED' | 'PAID' | 'EXPIRED' | 'VOIDED';

const PERIOD_FILTERS: { key: PeriodFilter; labelKey: string; fallback: string }[] = [
  { key: 'all', labelKey: 'cashback.periodAll', fallback: 'Всички' },
  { key: '7d',  labelKey: 'cashback.period7d',  fallback: '7 дни' },
  { key: '30d', labelKey: 'cashback.period30d', fallback: '30 дни' },
];

const STATUS_FILTERS: { key: StatusFilter; labelKey: string; fallback: string }[] = [
  { key: 'all',     labelKey: 'cashback.statusAll',     fallback: 'Всички' },
  { key: 'CLEARED', labelKey: 'cashback.statusCleared', fallback: 'Налични' },
  { key: 'PENDING', labelKey: 'cashback.statusPending', fallback: 'Чакащи' },
  { key: 'LOCKED',  labelKey: 'cashback.statusLocked',  fallback: 'В обработка' },
  { key: 'PAID',    labelKey: 'cashback.statusPaid',    fallback: 'Изплатени' },
  { key: 'EXPIRED', labelKey: 'cashback.statusExpired', fallback: 'Изтекли' },
  { key: 'VOIDED',  labelKey: 'cashback.statusVoided',  fallback: 'Анулирани' },
];

type CashbackEntry = {
  id: string;
  amount: number;
  status: string;
  cashbackStatus: string | null;
  cashbackExpiresAt: string | null;
  cashbackPaidAt: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  description: string | null;
  createdAt: string;
};

type LifecycleState = 'Pending' | 'Cleared' | 'Locked' | 'Paid' | 'Expired' | 'Voided';

function deriveLifecycle(entry: CashbackEntry, now: Date): LifecycleState {
  // Authoritative: lifecycle service column wins.
  if (entry.cashbackStatus) {
    if (entry.cashbackStatus === 'VOIDED') return 'Voided';
    if (entry.cashbackStatus === 'PAID') return 'Paid';
    if (entry.cashbackStatus === 'EXPIRED') return 'Expired';
    if (entry.cashbackStatus === 'LOCKED') return 'Locked';
    if (entry.cashbackStatus === 'CLEARED') return 'Cleared';
    if (entry.cashbackStatus === 'PENDING') return 'Pending';
  }
  // Legacy fallback — mirror backend deriveCashbackEntryStatus.
  if (entry.cashbackPaidAt) return 'Paid';
  if (['PENDING', 'TRIAL_PENDING', 'PROCESSING', 'RISK_HOLD'].includes(entry.status)) {
    return 'Pending';
  }
  if (entry.status === 'ANNULLED' || entry.status === 'FAILED') return 'Locked';
  if (entry.cashbackExpiresAt && new Date(entry.cashbackExpiresAt) <= now) return 'Expired';
  return 'Cleared';
}

const STATE_COLOR: Record<LifecycleState, string> = {
  Pending: '#F59E0B',
  Cleared: '#10B981',
  Locked: '#3B82F6',
  Paid: '#6366F1',
  Expired: '#94A3B8',
  Voided: '#EF4444',
};

const STATE_BG: Record<LifecycleState, string> = {
  Pending: 'rgba(245,158,11,0.12)',
  Cleared: 'rgba(16,185,129,0.12)',
  Locked: 'rgba(59,130,246,0.12)',
  Paid: 'rgba(99,102,241,0.12)',
  Expired: 'rgba(148,163,184,0.12)',
  Voided: 'rgba(239,68,68,0.12)',
};

// §2 single source of truth: per-row labels reuse the same cashback.status*
// i18n keys as the filter chips, so a state renders the SAME word everywhere.
const STATE_LABEL_KEY: Record<LifecycleState, string> = {
  Pending: 'cashback.statusPending',
  Cleared: 'cashback.statusCleared',
  Locked: 'cashback.statusLocked',
  Paid: 'cashback.statusPaid',
  Expired: 'cashback.statusExpired',
  Voided: 'cashback.statusVoided',
};

function stateLabel(state: LifecycleState, t: (key: string) => string): string {
  return t(STATE_LABEL_KEY[state]);
}

export default function CashbackHistoryScreen() {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<CashbackEntry[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    try {
      const data = await walletApi.getTransactions({
        type: 'CASHBACK_CREDIT',
        limit: 100,
        ...(period !== 'all' ? { period } : {}),
        ...(status !== 'all' ? { status } : {}),
      });
      setEntries(data?.transactions ?? []);
    } catch (err) {
      console.error('[CashbackHistory] failed to load:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, status]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const renderEntry = ({ item }: { item: CashbackEntry }) => {
    const now = new Date();
    const state = deriveLifecycle(item, now);
    const color = STATE_COLOR[state];
    const bg = STATE_BG[state];
    const isVoided = state === 'Voided';
    const validUntil =
      state === 'Cleared' && item.cashbackExpiresAt
        ? new Date(item.cashbackExpiresAt).toLocaleDateString(
            i18n.language === 'bg' ? 'bg-BG' : 'en-GB'
          )
        : null;

    return (
      <Card style={styles.entryCard}>
        <View style={styles.entryRow}>
          <View style={styles.entryLeft}>
            <Text style={styles.entryDescription} numberOfLines={2}>
              {item.description || t('cashback.fromScan', 'Кешбек от сканиране')}
            </Text>
            <Text style={styles.entryDate}>{formatDateTime(item.createdAt)}</Text>
            {validUntil && (
              <Text style={styles.entryHint}>
                {t('cashback.validUntil', 'Валиден до')}: {validUntil}
              </Text>
            )}
            {isVoided && item.voidedReason && (
              <Text style={styles.voidReason} numberOfLines={3}>
                {t('cashback.voidedReason', 'Причина')}: {item.voidedReason}
              </Text>
            )}
          </View>
          <View style={styles.entryRight}>
            <Text
              style={[
                styles.amount,
                isVoided && styles.amountStruck,
                { color: isVoided ? '#94A3B8' : '#111' },
              ]}
            >
              {isVoided ? '' : '+'}
              {formatEurAmount(item.amount)}
            </Text>
            <Chip
              mode="flat"
              compact
              style={[styles.stateChip, { backgroundColor: bg }]}
              textStyle={[styles.stateChipText, { color }]}
            >
              {stateLabel(state, t)}
            </Chip>
          </View>
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>{t('common.loading')}</Text>
      </View>
    );
  }

  const FilterHeader = (
    <View style={styles.filters}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {PERIOD_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, period === f.key && styles.filterChipActive]}
            onPress={() => setPeriod(f.key)}
          >
            <Text style={[styles.filterChipText, period === f.key && styles.filterChipTextActive]}>{t(f.labelKey, f.fallback)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterRow, { marginTop: 8 }]}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, status === f.key && styles.filterChipActive]}
            onPress={() => setStatus(f.key)}
          >
            <Text style={[styles.filterChipText, status === f.key && styles.filterChipTextActive]}>{t(f.labelKey, f.fallback)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      data={entries}
      keyExtractor={(item) => item.id}
      renderItem={renderEntry}
      ListHeaderComponent={FilterHeader}
      contentContainerStyle={entries.length === 0 ? styles.emptyContainerWithHeader : styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <Text style={styles.emptyText}>
          {t('cashback.emptyFiltered', 'Няма кешбек записи за избраните филтри.')}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  entryCard: { marginBottom: 10, padding: 12, borderRadius: 12 },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start' },
  entryLeft: { flex: 1, paddingRight: 12 },
  entryRight: { alignItems: 'flex-end', justifyContent: 'flex-start' },
  entryDescription: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 4 },
  entryDate: { fontSize: 12, color: '#64748B' },
  entryHint: { fontSize: 11, color: '#10B981', marginTop: 4 },
  voidReason: { fontSize: 12, color: '#B91C1C', marginTop: 6, fontStyle: 'italic' },
  amount: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  amountStruck: { textDecorationLine: 'line-through' },
  stateChip: { height: 22, paddingHorizontal: 2 },
  stateChipText: { fontSize: 10, fontWeight: '700' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyContainerWithHeader: { paddingHorizontal: 16, paddingTop: 16 },
  emptyText: { opacity: 0.6, fontSize: 14, textAlign: 'center', marginTop: 40 },
  filters: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  filterRow: { gap: 8, paddingRight: 16 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0',
  },
  filterChipActive: { backgroundColor: '#111', borderColor: '#111' },
  filterChipText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF' },
});
