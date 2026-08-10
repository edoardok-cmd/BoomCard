/**
 * Sync Analysis Screen
 *
 * Compares the mobile app's last-seen data against live server state,
 * surfaces any gaps (new items on the server the user hasn't yet loaded),
 * and lets the user refresh individual categories or everything at once.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../store/AuthContext';
import SyncService, { SyncMetadata, SyncRecord } from '../../services/sync.service';
import ReceiptsApi from '../../api/receipts.api';
import { StickersApi } from '../../api/stickers.api';
import { walletApi } from '../../api/wallet.api';
import { cardApi } from '../../api/card.api';
import apiClient from '../../api/client';

// ─── Types ──────────────────────────────────────────────────────────────────

type SyncStatus = 'loading' | 'synced' | 'stale' | 'gap' | 'never' | 'error';

interface CategoryState {
  status: SyncStatus;
  lastSync: number | null;
  serverCount?: number;
  lastKnownCount?: number;
  displayValue?: string;
  error?: string;
  refreshing: boolean;
}

type CategoryKey = 'profile' | 'subscription' | 'wallet' | 'receipts' | 'stickers' | 'card';

type AllCategoryState = Record<CategoryKey, CategoryState>;

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStatus(
  record: SyncRecord | undefined,
  serverCount?: number
): SyncStatus {
  if (!record) return 'never';
  const age = Date.now() - record.lastSync;
  if (
    serverCount !== undefined &&
    record.serverCount !== undefined &&
    serverCount > record.serverCount
  ) {
    return 'gap';
  }
  if (age > STALE_THRESHOLD_MS) return 'stale';
  return 'synced';
}

function formatAge(ts: number | null): string {
  if (!ts) return '—';
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

// ─── Category Card ───────────────────────────────────────────────────────────

interface CategoryCardProps {
  icon: string;
  label: string;
  state: CategoryState;
  onRefresh: () => void;
  theme: any;
  t: (key: string, opts?: any) => string;
}

const STATUS_CONFIG: Record<
  SyncStatus,
  { icon: string; color: string; bgColor: string; label: string }
> = {
  loading: { icon: 'sync', color: '#6366F1', bgColor: '#EEF2FF', label: 'sync.statusLoading' },
  synced:  { icon: 'checkmark-circle', color: '#10B981', bgColor: '#D1FAE5', label: 'sync.statusSynced' },
  stale:   { icon: 'time', color: '#F59E0B', bgColor: '#FEF3C7', label: 'sync.statusStale' },
  gap:     { icon: 'alert-circle', color: '#EF4444', bgColor: '#FEE2E2', label: 'sync.statusGap' },
  never:   { icon: 'radio-button-off', color: '#9CA3AF', bgColor: '#F3F4F6', label: 'sync.statusNever' },
  error:   { icon: 'close-circle', color: '#EF4444', bgColor: '#FEE2E2', label: 'sync.statusError' },
};

const CategoryCard: React.FC<CategoryCardProps> = ({
  icon,
  label,
  state,
  onRefresh,
  theme,
  t,
}) => {
  const cfg = STATUS_CONFIG[state.status];
  const isDark = theme.colors.background === '#0F172A' || theme.colors.background === '#1E293B';
  const badgeBg = isDark ? `${cfg.color}22` : cfg.bgColor;
  const styles = getStyles(theme);

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, shadowColor: theme.colors.onSurface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.primary}18` }]}>
          <Ionicons name={icon as any} size={22} color={theme.colors.primary} />
        </View>

        <View style={styles.cardInfo}>
          <Text style={[styles.cardLabel, { color: theme.colors.onSurface }]}>{label}</Text>
          {state.displayValue ? (
            <Text style={[styles.cardSub, { color: theme.colors.onSurfaceVariant }]}>
              {state.displayValue}
            </Text>
          ) : null}
          <Text style={[styles.cardAge, { color: theme.colors.onSurfaceVariant }]}>
            {state.lastSync
              ? `${t('sync.lastSynced')}: ${formatAge(state.lastSync)}`
              : t('sync.neverSynced')}
          </Text>
        </View>

        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
          {state.status === 'loading' ? (
            <ActivityIndicator size={14} color={cfg.color} />
          ) : (
            <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
          )}
          <Text style={[styles.statusText, { color: cfg.color }]}>
            {t(cfg.label)}
          </Text>
        </View>
      </View>

      {/* Gap / count row */}
      {state.serverCount !== undefined ? (
        <View style={[styles.countRow, { borderTopColor: theme.colors.outline }]}>
          {state.serverCount !== undefined && (
            <Text style={[styles.countText, { color: theme.colors.onSurfaceVariant }]}>
              {t('sync.serverTotal', { count: state.serverCount })}
            </Text>
          )}
          {state.status === 'gap' && state.serverCount !== undefined && state.lastKnownCount !== undefined && (
            <View style={styles.gapBadge}>
              <Ionicons name="arrow-up-circle" size={13} color="#EF4444" />
              <Text style={styles.gapText}>
                {t('sync.newItems', { count: state.serverCount - state.lastKnownCount })}
              </Text>
            </View>
          )}
          {state.error ? (
            <Text style={[styles.errorText, { color: theme.colors.error }]}>
              {state.error}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Refresh button */}
      <TouchableOpacity
        style={[styles.refreshBtn, { borderTopColor: theme.colors.outline }]}
        onPress={onRefresh}
        disabled={state.refreshing || state.status === 'loading'}
      >
        {state.refreshing ? (
          <ActivityIndicator size={14} color={theme.colors.primary} />
        ) : (
          <Ionicons name="refresh" size={14} color={theme.colors.primary} />
        )}
        <Text style={[styles.refreshBtnText, { color: theme.colors.primary }]}>
          {t('sync.refresh')}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────

const INITIAL_STATE: AllCategoryState = {
  profile:      { status: 'loading', lastSync: null, refreshing: false },
  subscription: { status: 'loading', lastSync: null, refreshing: false },
  wallet:       { status: 'loading', lastSync: null, refreshing: false },
  receipts:     { status: 'loading', lastSync: null, refreshing: false },
  stickers:     { status: 'loading', lastSync: null, refreshing: false },
  card:         { status: 'loading', lastSync: null, refreshing: false },
};

const SyncAnalysisScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user } = useAuth();

  const [categories, setCategories] = useState<AllCategoryState>(INITIAL_STATE);
  const [syncingAll, setSyncingAll] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    navigation.setOptions({ title: t('sync.title') });
    return () => { isMounted.current = false; };
  }, [navigation, t]);

  // ── Fetch helpers ────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async (meta: SyncMetadata): Promise<Partial<CategoryState>> => {
    try {
      // Profile is managed by AuthContext and refreshed every 15 minutes.
      // We record the current time as "last sync" when the screen opens if
      // the user object is present (meaning it was recently loaded).
      const record = meta['profile'];
      if (user) {
        await SyncService.record('profile');
        const now = Date.now();
        return {
          status: computeStatus({ lastSync: now, serverCount: undefined }, undefined),
          lastSync: now,
          displayValue: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
        };
      }
      return { status: record ? 'stale' : 'never', lastSync: record?.lastSync ?? null };
    } catch {
      return { status: 'error', error: t('sync.fetchFailed') };
    }
  }, [user, t]);

  const fetchSubscription = useCallback(async (meta: SyncMetadata): Promise<Partial<CategoryState>> => {
    try {
      const res = await apiClient.get('/api/subscriptions/current');
      // /current returns a flat subscription (with `id`) when active, or
      // {hasSubscription:false,subscription:null} (no `id`) when none exists.
      const subBody = res.success ? (res.data as any) : null;
      const sub = subBody?.id ? subBody : null;
      const displayValue = sub
        ? `${sub.plan ?? sub.planCode ?? '—'} · ${sub.status ?? '—'}`
        : t('sync.noData');
      await SyncService.record('subscription', { lastValue: displayValue });
      const lastSync = Date.now();
      return {
        status: computeStatus({ lastSync, serverCount: undefined }, undefined),
        lastSync,
        displayValue,
      };
    } catch {
      const record = meta['subscription'];
      return {
        status: 'error',
        lastSync: record?.lastSync ?? null,
        error: t('sync.fetchFailed'),
      };
    }
  }, [t]);

  const fetchWallet = useCallback(async (meta: SyncMetadata): Promise<Partial<CategoryState>> => {
    try {
      const balance = await walletApi.getBalance() as any;
      const available: number = balance?.availableBalance ?? balance?.balance ?? 0;
      const displayValue = `EUR ${available.toFixed(2)}`;
      const record = meta['wallet'];
      const prevValue = record?.lastValue;
      await SyncService.record('wallet', { lastValue: displayValue });
      const lastSync = Date.now();
      const hasChanged = prevValue !== undefined && prevValue !== displayValue;
      return {
        status: hasChanged ? 'gap' : computeStatus({ lastSync }, undefined),
        lastSync,
        displayValue,
      };
    } catch {
      const record = meta['wallet'];
      return {
        status: 'error',
        lastSync: record?.lastSync ?? null,
        error: t('sync.fetchFailed'),
      };
    }
  }, [t]);

  const fetchReceipts = useCallback(async (meta: SyncMetadata): Promise<Partial<CategoryState>> => {
    try {
      const res = await ReceiptsApi.getStats();
      if (!res.success || !res.data) throw new Error('no data');
      const serverCount = res.data.totalReceipts;
      const record = meta['receipts'];
      const status = record ? computeStatus(record, serverCount) : 'synced';
      await SyncService.record('receipts', { serverCount });
      return {
        status,
        lastSync: Date.now(),
        serverCount,
        lastKnownCount: record?.serverCount,
      };
    } catch {
      const record = meta['receipts'];
      return {
        status: 'error',
        lastSync: record?.lastSync ?? null,
        serverCount: record?.serverCount,
        error: t('sync.fetchFailed'),
      };
    }
  }, [t]);

  const fetchStickers = useCallback(async (meta: SyncMetadata): Promise<Partial<CategoryState>> => {
    try {
      const res = await StickersApi.getMyScan();
      if (!res.success || !res.data) throw new Error('no data');
      const serverCount: number = (res.data as any).total ?? 0;
      const record = meta['stickers'];
      const status = record ? computeStatus(record, serverCount) : 'synced';
      await SyncService.record('stickers', { serverCount });
      return {
        status,
        lastSync: Date.now(),
        serverCount,
        lastKnownCount: record?.serverCount,
      };
    } catch {
      const record = meta['stickers'];
      return {
        status: 'error',
        lastSync: record?.lastSync ?? null,
        serverCount: record?.serverCount,
        error: t('sync.fetchFailed'),
      };
    }
  }, [t]);

  const fetchCard = useCallback(async (meta: SyncMetadata): Promise<Partial<CategoryState>> => {
    try {
      const card = await cardApi.getMyCardOrNull() as any;
      const displayValue = card
        ? `${card.type ?? '—'} · ${card.status ?? '—'}`
        : t('sync.noCard');
      const record = meta['card'];
      const prevValue = record?.lastValue;
      await SyncService.record('card', { lastValue: displayValue });
      const lastSync = Date.now();
      const hasChanged = prevValue !== undefined && prevValue !== displayValue;
      return {
        status: hasChanged ? 'gap' : computeStatus({ lastSync }, undefined),
        lastSync,
        displayValue,
      };
    } catch {
      const record = meta['card'];
      return {
        status: 'error',
        lastSync: record?.lastSync ?? null,
        error: t('sync.fetchFailed'),
      };
    }
  }, [t]);

  // ── Refresh single category ───────────────────────────────────────────────

  const refreshCategory = useCallback(async (key: CategoryKey) => {
    if (!isMounted.current) return;
    setCategories(prev => ({
      ...prev,
      [key]: { ...prev[key], refreshing: true, status: 'loading' },
    }));

    const meta = await SyncService.load();
    let patch: Partial<CategoryState> = {};

    switch (key) {
      case 'profile':      patch = await fetchProfile(meta); break;
      case 'subscription': patch = await fetchSubscription(meta); break;
      case 'wallet':       patch = await fetchWallet(meta); break;
      case 'receipts':     patch = await fetchReceipts(meta); break;
      case 'stickers':     patch = await fetchStickers(meta); break;
      case 'card':         patch = await fetchCard(meta); break;
    }

    if (isMounted.current) {
      setCategories(prev => ({
        ...prev,
        [key]: { ...prev[key], refreshing: false, ...patch },
      }));
    }
  }, [fetchProfile, fetchSubscription, fetchWallet, fetchReceipts, fetchStickers, fetchCard]);

  // ── Sync all ─────────────────────────────────────────────────────────────

  const syncAll = useCallback(async (silent = false) => {
    if (!isMounted.current) return;
    if (!silent) setSyncingAll(true);

    // Mark all as loading
    setCategories(prev =>
      (Object.keys(prev) as CategoryKey[]).reduce(
        (acc, k) => ({ ...acc, [k]: { ...prev[k], status: 'loading' as SyncStatus, refreshing: true } }),
        {} as AllCategoryState
      )
    );

    const meta = await SyncService.load();

    const [profilePatch, subPatch, walletPatch, receiptsPatch, stickersPatch, cardPatch] =
      await Promise.all([
        fetchProfile(meta),
        fetchSubscription(meta),
        fetchWallet(meta),
        fetchReceipts(meta),
        fetchStickers(meta),
        fetchCard(meta),
      ]);

    if (!isMounted.current) return;

    setCategories({
      profile:      { ...INITIAL_STATE.profile,      refreshing: false, ...profilePatch },
      subscription: { ...INITIAL_STATE.subscription, refreshing: false, ...subPatch },
      wallet:       { ...INITIAL_STATE.wallet,        refreshing: false, ...walletPatch },
      receipts:     { ...INITIAL_STATE.receipts,      refreshing: false, ...receiptsPatch },
      stickers:     { ...INITIAL_STATE.stickers,      refreshing: false, ...stickersPatch },
      card:         { ...INITIAL_STATE.card,          refreshing: false, ...cardPatch },
    });

    if (!silent) setSyncingAll(false);
  }, [fetchProfile, fetchSubscription, fetchWallet, fetchReceipts, fetchStickers, fetchCard]);

  // Initial load: pull stored meta to populate last-sync times, then fetch live
  useEffect(() => {
    (async () => {
      const meta = await SyncService.load();
      // Pre-populate from stored metadata before hitting network
      const prefill = (Object.keys(INITIAL_STATE) as CategoryKey[]).reduce(
        (acc, k) => ({
          ...acc,
          [k]: {
            ...INITIAL_STATE[k],
            lastSync: meta[k]?.lastSync ?? null,
            serverCount: meta[k]?.serverCount,
            lastKnownCount: meta[k]?.serverCount,
            displayValue: meta[k]?.lastValue,
            status: meta[k] ? 'stale' : 'never',
          } as CategoryState,
        }),
        {} as AllCategoryState
      );
      if (isMounted.current) setCategories(prefill);
      await syncAll(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    await syncAll(true);
    setPullRefreshing(false);
  }, [syncAll]);

  // ── Health score ────────────────────────────────────────────────────────
  // Only count resolved (non-loading, non-error) statuses so the health badge
  // doesn't say "0 of 6 current" while a sync is still in flight.

  const statuses = (Object.values(categories) as CategoryState[]).map(c => c.status);
  const loadingCount = statuses.filter(s => s === 'loading').length;
  const resolvedStatuses = statuses.filter(s => s !== 'loading' && s !== 'error');
  const syncedCount = resolvedStatuses.filter(s => s === 'synced').length;
  const gapCount = resolvedStatuses.filter(s => s === 'gap').length;
  const staleCount = resolvedStatuses.filter(s => s === 'stale').length;
  const resolvedTotal = resolvedStatuses.length;

  let healthIcon: string;
  let healthLabel: string;
  let healthColor: string;

  if (loadingCount === statuses.length) {
    healthIcon = 'sync';
    healthLabel = t('sync.statusLoading');
    healthColor = '#6366F1';
  } else if (gapCount > 0) {
    healthIcon = 'alert-circle';
    healthLabel = t('sync.healthNeedsSync');
    healthColor = '#EF4444';
  } else if (staleCount > 2) {
    healthIcon = 'time-outline';
    healthLabel = t('sync.healthStale');
    healthColor = '#F59E0B';
  } else if (syncedCount === resolvedTotal && resolvedTotal > 0) {
    healthIcon = 'shield-checkmark';
    healthLabel = t('sync.healthExcellent');
    healthColor = '#10B981';
  } else {
    healthIcon = 'checkmark-done-circle';
    healthLabel = t('sync.healthGood');
    healthColor = '#3B82F6';
  }

  const styles = useMemo(() => getStyles(theme), [theme]);

  // ── Category definitions ─────────────────────────────────────────────────

  const categoryDefs: { key: CategoryKey; icon: string; label: string }[] = [
    { key: 'profile',      icon: 'person-circle',   label: t('sync.catProfile') },
    { key: 'subscription', icon: 'ribbon',           label: t('sync.catSubscription') },
    { key: 'wallet',       icon: 'wallet',           label: t('sync.catWallet') },
    { key: 'receipts',     icon: 'document-text',    label: t('sync.catReceipts') },
    { key: 'stickers',     icon: 'qr-code',          label: t('sync.catStickers') },
    { key: 'card',         icon: 'card',             label: t('sync.catCard') },
  ];

  return (
    <ScrollView
      style={[styles.container]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={pullRefreshing}
          onRefresh={onPullRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* ── Health summary card ── */}
      <View style={[styles.healthCard, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.healthLeft}>
          <Ionicons name={healthIcon as any} size={36} color={healthColor} />
          <View style={styles.healthText}>
            <Text style={[styles.healthLabel, { color: healthColor }]}>{healthLabel}</Text>
            <Text style={[styles.healthSub, { color: theme.colors.onSurfaceVariant }]}>
              {t('sync.healthDetail', { synced: syncedCount, total: resolvedTotal })}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.syncAllBtn, { backgroundColor: theme.colors.primary }]}
          onPress={() => syncAll(false)}
          disabled={syncingAll}
        >
          {syncingAll ? (
            <ActivityIndicator size={16} color="#FFFFFF" />
          ) : (
            <Ionicons name="sync" size={16} color="#FFFFFF" />
          )}
          <Text style={styles.syncAllText}>{t('sync.syncAll')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Legend ── */}
      <View style={styles.legendRow}>
        {(['synced', 'stale', 'gap', 'never'] as SyncStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s];
          return (
            <View key={s} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: cfg.color }]} />
              <Text style={[styles.legendLabel, { color: theme.colors.onSurfaceVariant }]}>
                {t(cfg.label)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ── Category cards ── */}
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
        {t('sync.dataSources')}
      </Text>

      {categoryDefs.map(({ key, icon, label }) => (
        <CategoryCard
          key={key}
          icon={icon}
          label={label}
          state={categories[key]}
          onRefresh={() => refreshCategory(key)}
          theme={theme}
          t={t}
        />
      ))}

      <Text style={[styles.footerNote, { color: theme.colors.onSurfaceVariant }]}>
        {t('sync.footerNote')}
      </Text>
    </ScrollView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },

    // Health card
    healthCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderRadius: 14,
      marginBottom: 16,
      shadowColor: theme.colors.onSurface,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    healthLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    healthText: {
      flex: 1,
    },
    healthLabel: {
      fontSize: 16,
      fontWeight: '700',
    },
    healthSub: {
      fontSize: 12,
      marginTop: 2,
    },
    syncAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
    },
    syncAllText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '600',
    },

    // Legend
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 16,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendLabel: {
      fontSize: 11,
    },

    // Section title
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 10,
      marginTop: 4,
    },

    // Category card
    card: {
      borderRadius: 12,
      marginBottom: 10,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 1,
      overflow: 'hidden',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      gap: 12,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardInfo: {
      flex: 1,
    },
    cardLabel: {
      fontSize: 15,
      fontWeight: '600',
    },
    cardSub: {
      fontSize: 12,
      marginTop: 1,
    },
    cardAge: {
      fontSize: 11,
      marginTop: 2,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '600',
    },

    // Count / gap row
    countRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    countText: {
      fontSize: 12,
    },
    gapBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    gapText: {
      fontSize: 12,
      color: '#EF4444',
      fontWeight: '600',
    },
    errorText: {
      fontSize: 12,
    },

    // Refresh button
    refreshBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    refreshBtnText: {
      fontSize: 13,
      fontWeight: '500',
    },

    // Footer
    footerNote: {
      fontSize: 11,
      textAlign: 'center',
      marginTop: 16,
      lineHeight: 16,
    },
  });

export default SyncAnalysisScreen;
