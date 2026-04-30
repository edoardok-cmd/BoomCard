/**
 * Nearby Screen — §5.4
 *
 * Spec marks this feature as "under question for MVP" and suggests:
 *   a) dynamic list by user location
 *   b) fallback to BOOM места list
 *   c) temporary removal from menu
 *
 * Implementation: option (b) — static BOOM Places list (all partners),
 * with a "location coming soon" banner. Full location-based filtering
 * is a future enhancement once the feature is confirmed.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { PartnersApi } from '../../api/partners.api';
import type { Partner } from '../../types';

const NearbyScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setError(null);
    try {
      const res = await PartnersApi.getPartners({ limit: 50 });
      if (res.success && res.data) {
        setPartners(res.data.data || []);
      } else {
        setPartners([]);
      }
    } catch (e: any) {
      setError(e.message || t('common.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const s = getStyles(theme, isDarkMode);

  const renderItem = ({ item }: { item: Partner }) => {
    const name = (item as any).businessName || (item as any).name || 'BOOM място';
    const category = (item as any).category || '';
    const city = (item as any).city || '';
    const cashbackRate = (item as any).cashbackRate;

    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('OfferDetail', { partnerId: item.id, partner: item })}
      >
        <View style={s.iconCircle}>
          <Ionicons name="storefront" size={22} color={isDarkMode ? '#A78BFA' : '#8B5CF6'} />
        </View>
        <View style={s.info}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          {(category || city) ? (
            <Text style={s.meta} numberOfLines={1}>{[category, city].filter(Boolean).join(' · ')}</Text>
          ) : null}
        </View>
        <View style={s.right}>
          {cashbackRate ? (
            <View style={s.cashbackBadge}>
              <Text style={s.cashbackText}>до {Math.round(cashbackRate * 100)}%</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={theme.colors.onSurfaceVariant} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>
      {/* Location notice — full GPS filtering is a future feature */}
      <View style={s.locationBanner}>
        <Ionicons name="location-outline" size={18} color={isDarkMode ? '#60A5FA' : '#3B82F6'} />
        <Text style={s.locationBannerText}>
          {t('nearby.locationSoon', 'Локационното филтриране ще бъде налично скоро. Показани са всички BOOM места.')}
        </Text>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="cloud-offline-outline" size={36} color={theme.colors.error} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); loadData(); }}>
            <Text style={s.retryBtnText}>{t('common.retry', 'Опитай пак')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={partners}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={partners.length === 0 ? s.emptyContainer : s.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadData(); }}
            />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="map-outline" size={40} color={isDarkMode ? '#475569' : '#CBD5E1'} />
              <Text style={s.emptyText}>{t('nearby.noPlaces', 'Няма налични места')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 24 },
  errorText: { fontSize: 15, color: theme.colors.error, textAlign: 'center' },
  retryBtn: {
    backgroundColor: isDarkMode ? '#3B82F6' : '#000',
    paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20,
  },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  locationBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: isDarkMode ? 'rgba(59,130,246,0.1)' : '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: isDarkMode ? 'rgba(59,130,246,0.2)' : '#BFDBFE',
    padding: 14,
  },
  locationBannerText: { flex: 1, fontSize: 13, color: isDarkMode ? '#93C5FD' : '#1D4ED8', lineHeight: 18 },

  listContent: { padding: 16, paddingTop: 12, paddingBottom: 32 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  empty: { alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: theme.colors.onSurfaceVariant },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 18, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.04)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDarkMode ? 0.12 : 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  iconCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: isDarkMode ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.08)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 2 },
  meta: { fontSize: 12, color: theme.colors.onSurfaceVariant },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cashbackBadge: {
    backgroundColor: isDarkMode ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.1)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  cashbackText: { fontSize: 12, fontWeight: '600', color: '#10B981' },
});

export default NearbyScreen;
