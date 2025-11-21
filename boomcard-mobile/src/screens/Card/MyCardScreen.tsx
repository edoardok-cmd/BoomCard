/**
 * My Card Screen
 *
 * Display user's BoomCard with QR code, benefits, and statistics
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, Alert } from 'react-native';
import { Text, Card, Button, Chip } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { cardApi } from '../../api/card.api';
import { formatDualCurrency } from '../../utils/format';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;

const CARD_GRADIENTS: Record<string, [string, string]> = {
  STANDARD: ['#4A5568', '#2D3748'],
  PREMIUM: ['#D4AF37', '#FFD700'],
  PLATINUM: ['#C0C0C0', '#E8E8E8'],
};

export default function MyCardScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<any>(null);
  const [statistics, setStatistics] = useState<any>(null);

  // Translate card benefits
  const translateBenefit = (benefit: string): string => {
    const benefitMap: Record<string, string> = {
      '5% cashback on receipts': t('card.benefits.cashback5'),
      '10% cashback on receipts': t('card.benefits.cashback10'),
      '15% cashback on receipts': t('card.benefits.cashback15'),
      'Standard QR code': t('card.benefits.standardQR'),
      'Basic rewards': t('card.benefits.basicRewards'),
      'Priority customer support': t('card.benefits.prioritySupport'),
      'Exclusive partner discounts': t('card.benefits.exclusiveDiscounts'),
      'Annual bonus rewards': t('card.benefits.annualBonus'),
      '24/7 dedicated support': t('card.benefits.support247'),
      'Premium partner network': t('card.benefits.premiumNetwork'),
      'VIP event access': t('card.benefits.vipEvents'),
      'Travel insurance included': t('card.benefits.travelInsurance'),
    };
    return benefitMap[benefit] || benefit;
  };

  const loadCard = async () => {
    try {
      const [cardData, statsData] = await Promise.all([
        cardApi.getMyCard(),
        cardApi.getStatistics(),
      ]);

      setCard(cardData);
      setStatistics(statsData);
    } catch (error: any) {
      console.error('Failed to load card:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCard();
  }, []);

  const styles = getStyles(theme);

  if (loading || !card) {
    return (
      <View style={styles.centered}>
        <Text>{t('common.loading')}</Text>
      </View>
    );
  }

  const qrData = JSON.stringify({
    cardNumber: card.cardNumber,
    userId: card.userId,
    type: card.cardType,
    issuedAt: card.issuedAt,
  });

  return (
    <ScrollView style={styles.container}>
      {/* Card Visual */}
      <View style={styles.cardContainer}>
        <LinearGradient
          colors={CARD_GRADIENTS[card.cardType] || CARD_GRADIENTS.STANDARD}
          style={styles.cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLogo}>BOOMCARD</Text>
              <Chip mode="flat" textStyle={styles.tierText}>
                {card.cardType}
              </Chip>
            </View>

            <View style={styles.qrContainer}>
              <View style={styles.qrWrapper}>
                <QRCode
                  value={qrData}
                  size={99}
                  backgroundColor="white"
                  color="black"
                />
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.cardNumber}>{card.cardNumber}</Text>
            </View>

            <View style={styles.memberSinceContainer}>
              <Text style={styles.memberSince}>
                {t('card.memberSince')} {card.issuedAt ? new Date(card.issuedAt).getFullYear() : ''}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Benefits */}
      <Card style={styles.benefitsCard}>
        <Card.Title title={t('card.yourBenefits')} />
        <Card.Content>
          {card.benefits?.features?.map((feature: string, index: number) => (
            <Text key={index} style={styles.benefitItem}>
              ✓ {translateBenefit(feature)}
            </Text>
          ))}
        </Card.Content>
      </Card>

      {/* Statistics */}
      {statistics && (
        <Card style={styles.statsCard}>
          <Card.Title title={t('card.yourActivity')} />
          <Card.Content>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text variant="headlineMedium" style={styles.statValue}>
                  {statistics.receiptsScanned || 0}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  {t('card.receiptsScanned')}
                </Text>
              </View>

              <View style={styles.statItem}>
                <Text variant="headlineMedium" style={styles.statValue}>
                  {statistics.stickersScanned || 0}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  {t('card.stickersScanned')}
                </Text>
              </View>
            </View>

            <View style={styles.cashbackContainer}>
              <Text variant="titleLarge" style={styles.cashbackAmount}>
                {formatDualCurrency(statistics.totalCashbackEarned || 0)}
              </Text>
              <Text variant="bodySmall" style={styles.cashbackLabel}>
                {t('card.totalCashbackEarned')}
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Upgrade Card (if not Platinum) */}
      {card.cardType && card.cardType.toUpperCase() !== 'PLATINUM' && (
        <Card style={styles.upgradeCard}>
          <Card.Title title={t('card.upgradeYourCard')} />
          <Card.Content>
            <Text style={styles.upgradeDescription}>
              {t('card.upgradeDescription')}
            </Text>
            <Button
              mode="contained"
              style={styles.upgradeButton}
              onPress={() => {
                const currentTier = (card.cardType || '').toUpperCase();
                const nextTier = currentTier === 'STANDARD' ? 'PREMIUM' : 'PLATINUM';
                const benefits = {
                  PREMIUM: [
                    '10% cashback on receipts',
                    'Priority customer support',
                    'Exclusive partner discounts',
                    'Annual bonus rewards'
                  ],
                  PLATINUM: [
                    '15% cashback on receipts',
                    '24/7 dedicated support',
                    'Premium partner network',
                    'VIP event access',
                    'Travel insurance included'
                  ]
                };

                Alert.alert(
                  `${t('card.upgradeTo')} ${t('card.tiers.' + nextTier)}`,
                  `${t('card.upgradeBenefits')}\n\n${benefits[nextTier].map(b => `• ${translateBenefit(b)}`).join('\n')}\n\n${t('card.upgradeMessage')}`,
                  [
                    { text: t('card.maybeLater'), style: 'cancel' },
                    {
                      text: t('card.contactSupport'),
                      onPress: () => Alert.alert(t('card.supportTitle'), t('card.supportContact'))
                    }
                  ]
                );
              }}
            >
              {t('card.viewUpgradeOptions')}
            </Button>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    padding: 16,
  },
  cardGradient: {
    borderRadius: 16,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 24,
    height: CARD_WIDTH * 0.68, // Adjusted for better QR code spacing
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLogo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  tierText: {
    color: 'white',
    fontWeight: 'bold',
  },
  qrContainer: {
    height: 125,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
  qrWrapper: {
    backgroundColor: 'white',
    padding: 8,
    borderRadius: 12,
  },
  cardFooter: {
    marginTop: 'auto',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    letterSpacing: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  memberSinceContainer: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  memberSince: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },
  benefitsCard: {
    margin: 16,
    marginTop: 0,
  },
  benefitItem: {
    paddingVertical: 4,
  },
  statsCard: {
    margin: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  statLabel: {
    opacity: 0.6,
    textAlign: 'center',
  },
  cashbackContainer: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.dark ? '#1E3A5F' : '#f0f9ff',
    borderRadius: 8,
  },
  cashbackAmount: {
    color: theme.dark ? '#FFA726' : '#ff9800',
    fontWeight: 'bold',
  },
  cashbackLabel: {
    opacity: 0.6,
  },
  upgradeCard: {
    margin: 16,
  },
  upgradeDescription: {
    marginBottom: 8,
    color: theme.colors.onSurfaceVariant,
  },
  upgradeButton: {
    marginTop: 16,
  },
});
