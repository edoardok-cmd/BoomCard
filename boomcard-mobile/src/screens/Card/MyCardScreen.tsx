/**
 * My Card Screen
 *
 * Display user's BoomCard with QR code, benefits, and statistics
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Text, Card, Button, Chip } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { cardApi } from '../../api/card.api';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;

const CARD_GRADIENTS: Record<string, [string, string]> = {
  STANDARD: ['#757575', '#424242'],
  PREMIUM: ['#ffd700', '#ffed4e'],
  PLATINUM: ['#e5e5e5', '#ffffff'],
};

export default function MyCardScreen() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<any>(null);
  const [statistics, setStatistics] = useState<any>(null);

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
        <Text>Loading card...</Text>
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
                  size={110}
                  backgroundColor="white"
                  color="black"
                />
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.cardNumber}>{card.cardNumber}</Text>
              <Text style={styles.memberSince}>
                Member since {new Date(card.issuedAt).getFullYear()}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Benefits */}
      <Card style={styles.benefitsCard}>
        <Card.Title title="Your Benefits" />
        <Card.Content>
          {card.benefits?.features?.map((feature: string, index: number) => (
            <Text key={index} style={styles.benefitItem}>
              ✓ {feature}
            </Text>
          ))}
        </Card.Content>
      </Card>

      {/* Statistics */}
      {statistics && (
        <Card style={styles.statsCard}>
          <Card.Title title="Your Activity" />
          <Card.Content>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text variant="headlineMedium" style={styles.statValue}>
                  {statistics.receiptsScanned || 0}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Receipts Scanned
                </Text>
              </View>

              <View style={styles.statItem}>
                <Text variant="headlineMedium" style={styles.statValue}>
                  {statistics.stickersScanned || 0}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Stickers Scanned
                </Text>
              </View>
            </View>

            <View style={styles.cashbackContainer}>
              <Text variant="titleLarge" style={styles.cashbackAmount}>
                {(statistics.totalCashbackEarned || 0).toFixed(2)} BGN
              </Text>
              <Text variant="bodySmall" style={styles.cashbackLabel}>
                Total Cashback Earned
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Upgrade Card (if not Platinum) */}
      {card.cardType !== 'PLATINUM' && (
        <Card style={styles.upgradeCard}>
          <Card.Title title="Upgrade Your Card" />
          <Card.Content>
            <Text>
              Unlock more cashback and exclusive benefits with a higher tier card
            </Text>
            <Button mode="contained" style={styles.upgradeButton}>
              View Upgrade Options
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
    elevation: 8,
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
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
  },
  qrWrapper: {
    backgroundColor: 'white',
    padding: 8,
    borderRadius: 12,
  },
  cardFooter: {
    marginTop: 'auto',
  },
  cardNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  memberSince: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
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
  upgradeButton: {
    marginTop: 16,
  },
});
