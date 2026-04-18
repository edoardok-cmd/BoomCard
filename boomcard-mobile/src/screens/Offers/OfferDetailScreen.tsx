/**
 * Offer Detail Screen
 *
 * Shows full offer details and allows redeeming via GPS proximity check.
 * Requires user to be within 100m of the venue to activate.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Linking,
  Pressable,
} from 'react-native';
import { Text, Button, Chip, ActivityIndicator } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTheme } from '../../contexts/ThemeContext';
import { OffersApi } from '../../api/offers.api';
import type { Offer } from '../../types';
import { OfferType } from '../../types';

type RouteParams = { offer: Offer };

function getDiscountLabel(offer: Offer): string {
  if (offer.discountPercent) return `${offer.discountPercent}% off`;
  if (offer.cashbackPercent) return `${offer.cashbackPercent}% cashback`;
  if (offer.discountAmount) return `${offer.discountAmount} лв. off`;
  return '';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

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

export default function OfferDetailScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const route = useRoute<RouteProp<Record<string, RouteParams>, string>>();
  const { offer } = route.params;
  const lang = i18n.language;

  const [redeeming, setRedeeming] = useState(false);
  const [redeemCode, setRedeemCode] = useState<string | null>(null);
  const [codeExpiry, setCodeExpiry] = useState<string | null>(null);
  const menuVenues = useMemo(
    () => (offer.partner?.venues ?? []).filter(v => !!v.menuUrl),
    [offer.partner?.venues]
  );

  const title = lang === 'bg' && offer.titleBg ? offer.titleBg : offer.title;
  const description = lang === 'bg' && offer.descriptionBg ? offer.descriptionBg : offer.description;
  const partnerName =
    (lang === 'bg' && offer.partner?.businessNameBg)
      ? offer.partner.businessNameBg
      : offer.partner?.businessName ?? '';
  const discountLabel = getDiscountLabel(offer);
  const badgeColor = getTypeBadgeColor(offer.type, theme);

  const handleRedeem = async () => {
    setRedeeming(true);

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setRedeeming(false);
      Alert.alert(
        t('offers.locationRequired'),
        t('offers.locationRequiredDesc'),
      );
      return;
    }

    let location: Location.LocationObject;
    try {
      location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    } catch {
      setRedeeming(false);
      Alert.alert(t('offers.locationError'), t('offers.locationErrorDesc'));
      return;
    }

    const res = await OffersApi.activateOffer(offer.id, {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    setRedeeming(false);

    if (res.success) {
      setRedeemCode(res.data?.code ?? '');
      setCodeExpiry(res.data?.expiresAt ?? '');
    } else {
      const msg = res.error ?? '';
      if (msg.toLowerCase().includes('100') || msg.toLowerCase().includes('distance') || msg.toLowerCase().includes('proximity')) {
        Alert.alert(t('offers.tooFarTitle'), t('offers.tooFarDesc'));
      } else if (msg.toLowerCase().includes('subscription') || msg.toLowerCase().includes('upgrade')) {
        Alert.alert(t('offers.upgradePlanTitle'), t('offers.upgradePlanDesc'));
      } else {
        Alert.alert(t('offers.redeemFailed'), msg || t('errors.unknownError'));
      }
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero image */}
      {offer.image ? (
        <Image source={{ uri: offer.image }} style={styles.heroImage} resizeMode="cover" />
      ) : (
        <View style={[styles.heroPlaceholder, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Ionicons name="pricetag-outline" size={64} color={theme.colors.onSurfaceVariant} />
        </View>
      )}

      {/* Type badge */}
      <View style={[styles.typeBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.typeBadgeText}>{t(`offers.type.${offer.type}`)}</Text>
      </View>

      {/* Partner name */}
      {partnerName ? (
        <Text style={[styles.partnerName, { color: theme.colors.onSurfaceVariant }]}>
          {partnerName}
        </Text>
      ) : null}

      {/* Title */}
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>

      {/* Discount label */}
      {discountLabel ? (
        <Text style={[styles.discount, { color: theme.colors.gold }]}>{discountLabel}</Text>
      ) : null}

      {/* Meta chips */}
      <View style={styles.chipsRow}>
        {offer.partner?.city ? (
          <Chip
            icon="map-marker"
            style={[styles.metaChip, { backgroundColor: theme.colors.surfaceVariant }]}
            textStyle={{ color: theme.colors.onSurface, fontSize: 13 }}
          >
            {offer.partner.city}
          </Chip>
        ) : null}
        {offer.category ? (
          <Chip
            icon="tag"
            style={[styles.metaChip, { backgroundColor: theme.colors.surfaceVariant }]}
            textStyle={{ color: theme.colors.onSurface, fontSize: 13 }}
          >
            {offer.category}
          </Chip>
        ) : null}
      </View>

      {/* Validity dates */}
      <View style={[styles.datesCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
        <View style={styles.dateRow}>
          <Ionicons name="play-circle-outline" size={18} color={theme.colors.tertiary} />
          <Text style={[styles.dateLabel, { color: theme.colors.onSurfaceVariant }]}>
            {t('offers.validFrom')}
          </Text>
          <Text style={[styles.dateValue, { color: theme.colors.onSurface }]}>
            {formatDate(offer.startDate)}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />
        <View style={styles.dateRow}>
          <Ionicons name="stop-circle-outline" size={18} color={theme.colors.error} />
          <Text style={[styles.dateLabel, { color: theme.colors.onSurfaceVariant }]}>
            {t('offers.validUntil')}
          </Text>
          <Text style={[styles.dateValue, { color: theme.colors.onSurface }]}>
            {formatDate(offer.endDate)}
          </Text>
        </View>
      </View>

      {/* Description */}
      {description ? (
        <View style={styles.descSection}>
          <Text style={[styles.descTitle, { color: theme.colors.onSurface }]}>
            {t('offers.description')}
          </Text>
          <Text style={[styles.desc, { color: theme.colors.onSurfaceVariant }]}>
            {description}
          </Text>
        </View>
      ) : null}

      {/* Menus */}
      {menuVenues.length > 0 ? (
        <View style={styles.descSection}>
          <Text style={[styles.descTitle, { color: theme.colors.onSurface }]}>
            {t('offers.viewMenu', { defaultValue: 'Menu' })}
          </Text>
          {menuVenues.map(venue => (
            <Pressable
              key={venue.id}
              onPress={() => venue.menuUrl && Linking.openURL(venue.menuUrl)}
              style={[
                styles.menuLinkRow,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline },
              ]}
            >
              <Ionicons name="restaurant-outline" size={18} color={theme.colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuVenueName, { color: theme.colors.onSurface }]}>
                  {venue.name}
                </Text>
                {venue.city ? (
                  <Text style={[styles.menuVenueCity, { color: theme.colors.onSurfaceVariant }]}>
                    {venue.city}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="open-outline" size={18} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Min purchase */}
      {offer.minPurchase ? (
        <View style={[styles.infoRow, { borderColor: theme.colors.outline }]}>
          <Ionicons name="receipt-outline" size={16} color={theme.colors.onSurfaceVariant} />
          <Text style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
            {t('offers.minPurchase', { amount: offer.minPurchase })}
          </Text>
        </View>
      ) : null}

      {/* Usage */}
      {offer.usageLimit ? (
        <View style={[styles.infoRow, { borderColor: theme.colors.outline }]}>
          <Ionicons name="people-outline" size={16} color={theme.colors.onSurfaceVariant} />
          <Text style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
            {t('offers.usageRemaining', { remaining: offer.usageLimit - offer.usageCount })}
          </Text>
        </View>
      ) : null}

      {/* Redeem code result */}
      {redeemCode ? (
        <View style={[styles.codeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.gold }]}>
          <Ionicons name="checkmark-circle" size={28} color={theme.colors.tertiary} style={{ marginBottom: 8 }} />
          <Text style={[styles.codeLabel, { color: theme.colors.onSurfaceVariant }]}>
            {t('offers.yourCode')}
          </Text>
          <Text style={[styles.codeValue, { color: theme.colors.gold }]}>{redeemCode}</Text>
          {codeExpiry ? (
            <Text style={[styles.codeExpiry, { color: theme.colors.onSurfaceVariant }]}>
              {t('offers.codeValidUntil', { date: formatDate(codeExpiry) })}
            </Text>
          ) : null}
          <Text style={[styles.codeHint, { color: theme.colors.onSurfaceVariant }]}>
            {t('offers.showCodeToStaff')}
          </Text>
        </View>
      ) : (
        <Button
          mode="contained"
          onPress={handleRedeem}
          loading={redeeming}
          disabled={redeeming}
          style={[styles.redeemBtn, { backgroundColor: theme.colors.gold }]}
          labelStyle={{ color: theme.colors.onGold, fontWeight: '700', fontSize: 16 }}
          contentStyle={{ paddingVertical: 6 }}
          icon="qr-code"
        >
          {redeeming ? t('offers.redeeming') : t('offers.redeemOffer')}
        </Button>
      )}

      <Text style={[styles.proximityNote, { color: theme.colors.onSurfaceVariant }]}>
        <Ionicons name="location" size={13} color={theme.colors.onSurfaceVariant} />
        {'  '}{t('offers.proximityNote')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 48,
  },
  heroImage: {
    width: '100%',
    height: 240,
  },
  heroPlaceholder: {
    width: '100%',
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  partnerName: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginTop: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginHorizontal: 20,
    marginTop: 6,
    lineHeight: 28,
  },
  discount: {
    fontSize: 26,
    fontWeight: '800',
    marginHorizontal: 20,
    marginTop: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
  },
  metaChip: {
    height: 32,
  },
  datesCard: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  dateLabel: {
    fontSize: 13,
    flex: 1,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginHorizontal: 14,
  },
  descSection: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  descTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  desc: {
    fontSize: 15,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  infoText: {
    fontSize: 14,
  },
  redeemBtn: {
    marginHorizontal: 20,
    marginTop: 28,
    borderRadius: 12,
  },
  codeCard: {
    marginHorizontal: 20,
    marginTop: 28,
    padding: 24,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  codeValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
  },
  codeExpiry: {
    fontSize: 13,
    marginBottom: 12,
  },
  codeHint: {
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  proximityNote: {
    marginHorizontal: 20,
    marginTop: 14,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  menuLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  menuVenueName: {
    fontSize: 14,
    fontWeight: '600',
  },
  menuVenueCity: {
    fontSize: 12,
    marginTop: 2,
  },
});
