/**
 * Offers Screen
 *
 * Browse partner offers and deals with search, category filtering,
 * and a featured section. Toggle between Places and Experiences tabs
 * to mirror the categories available on the public boomcard.bg site.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { Text, Searchbar, Chip, ActivityIndicator, Menu, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { OffersApi } from '../../api/offers.api';
import type { Offer } from '../../types';
import { OfferType } from '../../types';

type Tab = 'places' | 'experiences';

const PLACES_CATEGORIES = [
  { key: '', labelKey: 'offers.categoryAll' },
  { key: 'restaurants', labelKey: 'offers.categoryRestaurants' },
  { key: 'accommodation', labelKey: 'offers.categoryAccommodation' },
  { key: 'spa', labelKey: 'offers.categorySpa' },
  { key: 'panoramic', labelKey: 'offers.categoryPanoramic' },
  { key: 'clubs', labelKey: 'offers.categoryClubs' },
  { key: 'cafes', labelKey: 'offers.categoryCafes' },
];

const EXPERIENCES_CATEGORIES = [
  { key: '', labelKey: 'offers.categoryAll' },
  { key: 'gastronomic', labelKey: 'offers.categoryGastronomic' },
  { key: 'historical-cultural', labelKey: 'offers.categoryHistoricalCultural' },
  { key: 'active-adventure', labelKey: 'offers.categoryActiveAdventure' },
  { key: 'extreme', labelKey: 'offers.categoryExtreme' },
  { key: 'educational-creative', labelKey: 'offers.categoryEducationalCreative' },
  { key: 'relax-wellness', labelKey: 'offers.categoryRelaxWellness' },
];

const PLACES_KEYS = new Set(PLACES_CATEGORIES.filter(c => c.key).map(c => c.key));
const EXPERIENCES_KEYS = new Set(EXPERIENCES_CATEGORIES.filter(c => c.key).map(c => c.key));

function getTypeBadgeColor(type: OfferType, theme: any): string {
  switch (type) {
    case OfferType.CASHBACK: return theme.colors.gold;
    case OfferType.DISCOUNT: return theme.colors.info;
    case OfferType.POINTS: return '#8B5CF6';
    case OfferType.BUNDLE: return theme.colors.tertiary;
    case OfferType.SEASONAL: return '#F97316';
    default: return theme.colors.info;
  }
}

function getDiscountLabel(offer: Offer): string {
  if (offer.discountPercent) return `${offer.discountPercent}% off`;
  if (offer.cashbackPercent) return `${offer.cashbackPercent}% cashback`;
  if (offer.discountAmount) return `${offer.discountAmount} лв. off`;
  return '';
}

interface OfferCardProps {
  offer: Offer;
  onPress: () => void;
  theme: any;
  t: (key: string) => string;
  lang: string;
}

const OfferCard = ({ offer, onPress, theme, t, lang }: OfferCardProps) => {
  const title = lang === 'bg' && offer.titleBg ? offer.titleBg : offer.title;
  const partnerName =
    (lang === 'bg' && offer.partner?.businessNameBg)
      ? offer.partner.businessNameBg
      : offer.partner?.businessName ?? '';
  const discountLabel = getDiscountLabel(offer);
  const badgeColor = getTypeBadgeColor(offer.type, theme);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}
    >
      {offer.image ? (
        <Image source={{ uri: offer.image }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImagePlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Ionicons name="pricetag-outline" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
      )}

      <View style={[styles.typeBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.typeBadgeText}>{t(`offers.type.${offer.type}`)}</Text>
      </View>

      <View style={styles.cardContent}>
        {partnerName ? (
          <Text
            style={[styles.partnerName, { color: theme.colors.onSurfaceVariant }]}
            numberOfLines={1}
          >
            {partnerName}
          </Text>
        ) : null}

        <Text
          style={[styles.offerTitle, { color: theme.colors.onSurface }]}
          numberOfLines={2}
        >
          {title}
        </Text>

        {discountLabel ? (
          <Text style={[styles.discountText, { color: theme.colors.gold }]}>
            {discountLabel}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          {offer.partner?.city ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={12} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>
                {offer.partner.city}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={12} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>
              {new Date(offer.endDate).toLocaleDateString()}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

interface FeaturedCardProps {
  offer: Offer;
  onPress: () => void;
  theme: any;
  lang: string;
}

const FeaturedCard = ({ offer, onPress, theme, lang }: FeaturedCardProps) => {
  const title = lang === 'bg' && offer.titleBg ? offer.titleBg : offer.title;
  const partnerName =
    (lang === 'bg' && offer.partner?.businessNameBg)
      ? offer.partner.businessNameBg
      : offer.partner?.businessName ?? '';
  const discountLabel = getDiscountLabel(offer);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[styles.featuredCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}
    >
      {offer.image ? (
        <Image source={{ uri: offer.image }} style={styles.featuredImage} resizeMode="cover" />
      ) : (
        <View style={[styles.featuredImage, { backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="pricetag-outline" size={40} color={theme.colors.onSurfaceVariant} />
        </View>
      )}
      <View style={styles.featuredContent}>
        {partnerName ? (
          <Text style={[styles.featuredPartner, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
            {partnerName}
          </Text>
        ) : null}
        <Text style={[styles.featuredTitle, { color: theme.colors.onSurface }]} numberOfLines={2}>
          {title}
        </Text>
        {discountLabel ? (
          <Text style={[styles.featuredDiscount, { color: theme.colors.gold }]}>
            {discountLabel}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

export default function OffersScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const lang = i18n.language;

  const [activeTab, setActiveTab] = useState<Tab>('places');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [featuredOffers, setFeaturedOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [cityMenuVisible, setCityMenuVisible] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadOffersRef = useRef<((isRefresh?: boolean) => Promise<void>) | null>(null);

  const currentCategories = activeTab === 'places' ? PLACES_CATEGORIES : EXPERIENCES_CATEGORIES;

  const loadOffers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!offers.length) setLoading(true);

    const params: Parameters<typeof OffersApi.getOffers>[0] = { limit: 100, page: 1 };
    if (selectedCategory) params.category = selectedCategory;
    if (searchQuery.trim()) params.search = searchQuery.trim();

    const showFeatured = !selectedCategory && !searchQuery.trim() && activeTab === 'places';

    const [offersRes, featuredRes] = await Promise.all([
      OffersApi.getOffers(params),
      showFeatured ? OffersApi.getFeaturedOffers() : Promise.resolve({ success: false as const, error: '' }),
    ]);

    if (offersRes.success) {
      const items = offersRes.data?.items?.length ? offersRes.data.items : (offersRes.data?.data ?? []);
      setOffers(items);
    }

    if (featuredRes.success) {
      setFeaturedOffers((featuredRes as { success: true; data: Offer[] }).data ?? []);
    } else if (!showFeatured) {
      setFeaturedOffers([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, [selectedCategory, searchQuery, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  loadOffersRef.current = loadOffers;

  useEffect(() => {
    loadOffers();
  }, [selectedCategory, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setSelectedCity('');
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      loadOffersRef.current?.();
    }, 400);
  };

  const handleCategorySelect = (key: string) => {
    setSelectedCategory(key);
    setSearchQuery('');
    setSelectedCity('');
  };

  const handleTabSwitch = (tab: Tab) => {
    setActiveTab(tab);
    setSelectedCategory('');
    setSearchQuery('');
    setSelectedCity('');
  };

  const navigateToDetail = (offer: Offer) => {
    navigation.navigate('OfferDetail', { offer });
  };

  const showFeaturedSection = Array.isArray(featuredOffers) && featuredOffers.length > 0 && !selectedCategory && !searchQuery.trim() && activeTab === 'places';

  const featuredCities = Array.isArray(featuredOffers)
    ? Array.from(
        new Set(featuredOffers.map(o => o.partner?.city ?? '').filter(Boolean))
      ).sort()
    : [];

  const filteredFeatured = Array.isArray(featuredOffers)
    ? (
        selectedCity
          ? featuredOffers.filter(o => (o.partner?.city ?? '') === selectedCity)
          : featuredOffers
      ).slice(0, 9)
    : [];

  // When no category chip is selected, scope offers to the active tab's category set
  // so the word filter only returns relevant results (places vs experiences)
  const displayedOffers = selectedCategory
    ? (Array.isArray(offers) ? offers : [])
    : (Array.isArray(offers) ? offers : []).filter(o => {
        const cat = o.partner?.category ?? '';
        if (!cat) return true; // uncategorized shows in both tabs
        return activeTab === 'places' ? PLACES_KEYS.has(cat) : EXPERIENCES_KEYS.has(cat);
      });

  const ListHeader = (
    <View>
      {/* Places / Experiences toggle */}
      <View style={[styles.tabBar, { backgroundColor: theme.colors.surfaceVariant }]}>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'places' && { backgroundColor: theme.colors.gold },
          ]}
          onPress={() => handleTabSwitch('places')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="storefront-outline"
            size={15}
            color={activeTab === 'places' ? theme.colors.onGold : theme.colors.onSurfaceVariant}
            style={{ marginRight: 5 }}
          />
          <Text style={[
            styles.tabText,
            { color: activeTab === 'places' ? theme.colors.onGold : theme.colors.onSurfaceVariant },
          ]}>
            {t('offers.tabPlaces')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'experiences' && { backgroundColor: theme.colors.gold },
          ]}
          onPress={() => handleTabSwitch('experiences')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="sparkles-outline"
            size={15}
            color={activeTab === 'experiences' ? theme.colors.onGold : theme.colors.onSurfaceVariant}
            style={{ marginRight: 5 }}
          />
          <Text style={[
            styles.tabText,
            { color: activeTab === 'experiences' ? theme.colors.onGold : theme.colors.onSurfaceVariant },
          ]}>
            {t('offers.tabExperiences')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <Searchbar
        placeholder={t('offers.searchPlaceholder')}
        value={searchQuery}
        onChangeText={handleSearchChange}
        style={[styles.searchBar, { backgroundColor: theme.colors.surfaceVariant }]}
        inputStyle={{ color: theme.colors.onSurface }}
        iconColor={theme.colors.onSurfaceVariant}
        placeholderTextColor={theme.colors.onSurfaceVariant}
      />

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {currentCategories.map(cat => (
          <Chip
            key={cat.key}
            selected={selectedCategory === cat.key}
            onPress={() => handleCategorySelect(cat.key)}
            style={[
              styles.chip,
              selectedCategory === cat.key
                ? { backgroundColor: theme.colors.gold }
                : { backgroundColor: theme.colors.surfaceVariant },
            ]}
            textStyle={{
              color: selectedCategory === cat.key ? theme.colors.onGold : theme.colors.onSurface,
              fontSize: 13,
            }}
          >
            {t(cat.labelKey)}
          </Chip>
        ))}
      </ScrollView>

      {/* Featured section — places only */}
      {showFeaturedSection && (
        <View>
          <View style={styles.featuredHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface, marginBottom: 0 }]}>
              {t('offers.featured')}
            </Text>
            {featuredCities.length > 0 && (
              <Menu
                visible={cityMenuVisible}
                onDismiss={() => setCityMenuVisible(false)}
                anchor={
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => setCityMenuVisible(true)}
                    textColor={theme.colors.onSurface}
                    style={[styles.cityButton, { borderColor: theme.colors.outline }]}
                    contentStyle={styles.cityButtonContent}
                    labelStyle={styles.cityButtonLabel}
                    icon="chevron-down"
                  >
                    {selectedCity || t('offers.allCities')}
                  </Button>
                }
              >
                <Menu.Item
                  onPress={() => { setSelectedCity(''); setCityMenuVisible(false); }}
                  title={t('offers.allCities')}
                  titleStyle={!selectedCity ? { fontWeight: '700', color: theme.colors.primary } : undefined}
                />
                {featuredCities.map(city => (
                  <Menu.Item
                    key={city}
                    onPress={() => { setSelectedCity(city); setCityMenuVisible(false); }}
                    title={city}
                    titleStyle={selectedCity === city ? { fontWeight: '700', color: theme.colors.primary } : undefined}
                  />
                ))}
              </Menu>
            )}
          </View>
          {filteredFeatured.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featuredRow}
            >
              {filteredFeatured.map(offer => (
                <FeaturedCard
                  key={offer.id}
                  offer={offer}
                  onPress={() => navigateToDetail(offer)}
                  theme={theme}
                  lang={lang}
                />
              ))}
            </ScrollView>
          ) : (
            <Text style={[styles.featuredEmpty, { color: theme.colors.onSurfaceVariant }]}>
              {t('offers.noOffers')}
            </Text>
          )}
        </View>
      )}

      {/* Section title */}
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
        {selectedCategory
          ? t(`offers.categoryLabel.${selectedCategory}`)
          : searchQuery.trim()
          ? t('offers.searchResults')
          : t('offers.allOffers')}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.gold} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={displayedOffers}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <OfferCard
            offer={item}
            onPress={() => navigateToDetail(item)}
            theme={theme}
            t={t}
            lang={lang}
          />
        )}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadOffers(true)}
            tintColor={theme.colors.gold}
            colors={[theme.colors.gold]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="pricetag-outline" size={48} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
              {t('offers.noOffers')}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  searchBar: {
    marginBottom: 12,
    elevation: 0,
    borderRadius: 12,
  },
  chipsRow: {
    paddingBottom: 16,
    gap: 8,
  },
  chip: {
    marginRight: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 4,
  },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  cityButton: {
    borderRadius: 20,
    height: 34,
  },
  cityButtonContent: {
    height: 34,
    flexDirection: 'row-reverse',
    paddingHorizontal: 4,
  },
  cityButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 4,
  },
  featuredEmpty: {
    fontSize: 14,
    paddingVertical: 16,
    paddingBottom: 20,
  },
  featuredRow: {
    paddingBottom: 16,
    gap: 12,
  },
  featuredCard: {
    width: 220,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  featuredImage: {
    width: '100%',
    height: 120,
  },
  featuredContent: {
    padding: 12,
  },
  featuredPartner: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  featuredTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  featuredDiscount: {
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 14,
  },
  cardImage: {
    width: '100%',
    height: 150,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardContent: {
    padding: 14,
  },
  partnerName: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  offerTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  discountText: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
});
