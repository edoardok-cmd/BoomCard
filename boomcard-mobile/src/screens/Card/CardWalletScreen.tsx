import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { cardApi } from '../../api/card.api';

interface CardData {
  id: string;
  cardNumber: string;
  cardType: string;
  userId: string;
  issuedAt: string;
  benefits?: {
    features?: string[];
    cashbackPercentage?: number;
  };
}

const CARD_BENEFITS: Record<string, { cashback: number; features: string[] }> = {
  STANDARD: {
    cashback: 5,
    features: [
      '5% Cashback on all purchases',
      'Valid at all partner venues',
      'Digital card - no physical card needed',
    ],
  },
  PREMIUM: {
    cashback: 7,
    features: [
      '7% Cashback on all purchases',
      'Priority customer support',
      'Exclusive partner deals',
      'Valid at all partner venues',
    ],
  },
  PLATINUM: {
    cashback: 10,
    features: [
      '10% Cashback on all purchases',
      'VIP customer support',
      'Premium partner access',
      'Early access to new features',
      'Valid at all partner venues',
    ],
  },
};

const CardWalletScreen = () => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [card, setCard] = useState<CardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCard = async () => {
    try {
      setError(null);
      const cardData = await cardApi.getMyCard();
      setCard(cardData);
    } catch (error: any) {
      console.error('Failed to load card:', error);
      setError(error.message || 'Failed to load card. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCard();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadCard();
  };

  const styles = getStyles(theme);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading your card...</Text>
      </View>
    );
  }

  if (error || !card) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Card not found'}</Text>
        <Text style={styles.errorSubtext}>Pull down to refresh</Text>
      </View>
    );
  }

  const qrData = JSON.stringify({
    cardNumber: card.cardNumber,
    userId: card.userId,
    type: card.cardType,
    issuedAt: card.issuedAt,
  });

  const benefits = CARD_BENEFITS[card.cardType] || CARD_BENEFITS.STANDARD;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>BoomCard</Text>
        <Text style={styles.cardType}>{card.cardType}</Text>
        <Text style={styles.cardNumber}>{card.cardNumber}</Text>
        <View style={styles.qrContainer}>
          <QRCode
            value={qrData}
            size={150}
            backgroundColor="white"
            color="black"
          />
        </View>
      </View>
      <View style={styles.benefits}>
        <Text style={styles.benefitsTitle}>Card Benefits</Text>
        {benefits.features.map((feature, index) => (
          <Text key={index} style={styles.benefitItem}>
            • {feature}
          </Text>
        ))}
      </View>
    </ScrollView>
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
  card: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    padding: 24,
    margin: 16,
    marginBottom: 24,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  cardType: {
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 32,
  },
  cardNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    letterSpacing: 2,
    marginBottom: 24,
  },
  qrContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefits: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 20,
    margin: 16,
    marginTop: 0,
  },
  benefitsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginBottom: 16,
  },
  benefitItem: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 8,
    lineHeight: 20,
  },
});

export default CardWalletScreen;
