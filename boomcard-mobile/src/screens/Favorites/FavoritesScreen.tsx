/**
 * Favorites Screen — §5.5
 *
 * Shows list of favorited partners/venues added via the heart icon.
 * "Виж" opens the internal partner page (OfferDetail/partner view).
 * Empty state shows "Разгледай BOOM места" → Offers tab.
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
import { favoritesApi, FavoriteRef } from '../../api/favorites.api';
import { PartnersApi } from '../../api/partners.api';
import { OffersApi } from '../../api/offers.api';
import { VenuesApi } from '../../api/venues.api';
import type { Partner } from '../../types';

interface FavoritePartner extends FavoriteRef {
  partner?: Partner;
  // Generic display fields resolved for offer/venue kinds (N5).
  title?: string;
  subtitle?: string;
  entity?: any; // resolved offer/venue object for navigation
}

const FavoritesScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<FavoritePartner[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setError(null);
    try {
      const res = await favoritesApi.list();
      if (!res.success) throw new Error('Failed to load favorites');

      const refs: FavoriteRef[] = res.data || [];

      // N5 — resolve display info for all three favorite kinds in parallel.
      const enriched = await Promise.all(
        refs.map(async (ref): Promise<FavoritePartner> => {
          try {
            if (ref.entityKind === 'partner') {
              const pRes = await PartnersApi.getPartnerById(ref.entityId);
              const p = pRes.success ? pRes.data : undefined;
              return { ...ref, partner: p, title: p?.businessName, subtitle: [p?.category, p?.city].filter(Boolean).join(' · ') };
            }
            if (ref.entityKind === 'offer') {
              const oRes = await OffersApi.getOfferById(ref.entityId);
              const o: any = oRes.success ? oRes.data : undefined;
              return { ...ref, entity: o, title: o?.title, subtitle: o?.partner?.businessName || o?.category };
            }
            // venue
            const vRes = await VenuesApi.getVenueById(ref.entityId);
            const v: any = vRes.success ? vRes.data : undefined;
            return { ...ref, entity: v, title: v?.name, subtitle: [v?.category, v?.city].filter(Boolean).join(' · ') };
          } catch {
            return ref;
          }
        })
      );

      setFavorites(enriched);
    } catch (e: any) {
      setError(e.message || t('common.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleRemove = async (fav: FavoritePartner) => {
    const res = await favoritesApi.remove(fav.entityKind, fav.entityId);
    if (res.success) {
      setFavorites(prev => prev.filter(f => f.id !== fav.id));
    }
  };

  const s = getStyles(theme, isDarkMode);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.centered}>
        <Ionicons name="cloud-offline-outline" size={36} color={theme.colors.error} />
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity style={s.btn} onPress={() => { setLoading(true); loadData(); }}>
          <Text style={s.btnText}>{t('common.retry', 'Опитай пак')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderEmpty = () => (
    <View style={s.empty}>
      <View style={s.emptyIconCircle}>
        <Ionicons name="heart-outline" size={40} color={isDarkMode ? '#475569' : '#CBD5E1'} />
      </View>
      <Text style={s.emptyTitle}>{t('favorites.empty', 'Няма любими места')}</Text>
      <Text style={s.emptyText}>{t('favorites.emptyDesc', 'Добавете любими BOOM места с иконката на сърцето')}</Text>
      <TouchableOpacity
        style={s.btn}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Offers')}
      >
        <Ionicons name="map-outline" size={18} color="#FFFFFF" />
        <Text style={s.btnText}>{t('favorites.explorePlaces', 'Разгледай BOOM места')}</Text>
      </TouchableOpacity>
    </View>
  );

  const KIND_ICON: Record<string, any> = { partner: 'storefront', offer: 'pricetag', venue: 'location' };

  const renderItem = ({ item }: { item: FavoritePartner }) => {
    const p = item.partner;
    const name = item.title || p?.businessName || t('favorites.unknownPlace', 'BOOM място');
    const subtitle = item.subtitle || '';

    const onView = () => {
      if (item.entityKind === 'offer' && item.entity) {
        navigation.navigate('OfferDetail', { offer: item.entity });
      } else if (item.entityKind === 'partner' && (p?.id || item.entityId)) {
        // Partner favorites jump to that partner's offers list.
        navigation.navigate('Offers', { partnerId: p?.id || item.entityId });
      } else if (item.entityKind === 'venue') {
        navigation.navigate('Offers', { venueId: item.entityId });
      }
    };

    return (
      <View style={s.card}>
        <View style={s.cardLeft}>
          <View style={s.iconCircle}>
            <Ionicons name={KIND_ICON[item.entityKind] || 'heart'} size={22} color={isDarkMode ? '#A78BFA' : '#8B5CF6'} />
          </View>
          <View style={s.cardInfo}>
            <Text style={s.cardName} numberOfLines={1}>{name}</Text>
            {subtitle ? (
              <Text style={s.cardMeta} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </View>
        </View>
        <View style={s.cardActions}>
          <TouchableOpacity style={s.viewBtn} activeOpacity={0.7} onPress={onView}>
            <Text style={s.viewBtnText}>{t('favorites.view', 'Виж')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.heartBtn}
            onPress={() => handleRemove(item)}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="heart" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={favorites}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      ListEmptyComponent={renderEmpty}
      contentContainerStyle={favorites.length === 0 ? s.emptyContainer : s.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadData(); }}
        />
      }
      style={{ backgroundColor: theme.colors.background }}
    />
  );
};

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 24, backgroundColor: theme.colors.background },
  errorText: { fontSize: 15, color: theme.colors.error, textAlign: 'center' },

  listContent: { padding: 16, paddingTop: 20, paddingBottom: 32 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', padding: 32 },

  empty: { alignItems: 'center' },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: isDarkMode ? 'rgba(71,85,105,0.15)' : 'rgba(203,213,225,0.3)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 8 },
  emptyText: { fontSize: 14, color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 28, lineHeight: 20 },

  btn: {
    backgroundColor: isDarkMode ? '#3B82F6' : '#000000',
    paddingHorizontal: 28, paddingVertical: 12,
    borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 20, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.04)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDarkMode ? 0.15 : 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: isDarkMode ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.08)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 2 },
  cardMeta: { fontSize: 12, color: theme.colors.onSurfaceVariant },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  viewBtn: {
    backgroundColor: isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.07)',
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14,
  },
  viewBtnText: { fontSize: 13, fontWeight: '600', color: isDarkMode ? '#60A5FA' : '#000000' },
  heartBtn: { padding: 4 },
});

export default FavoritesScreen;
