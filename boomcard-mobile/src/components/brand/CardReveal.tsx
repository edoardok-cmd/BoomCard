import React from 'react';
import { Animated, View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.82;
const CARD_HEIGHT = CARD_WIDTH * 0.625; // Credit card aspect ratio

// Gradients matching the website HomePage.tsx CreditCardPlan
const CARD_GRADIENTS: Record<string, [string, string]> = {
  STANDARD: ['#ffffff', '#f5f5f5'],
  PREMIUM: ['#1a1a1a', '#2d2d2d'],
  PLATINUM: ['#c0c0c0', '#939393'],
};

// Border colors per card type (website uses gold border for premium)
const CARD_BORDERS: Record<string, { color: string; width: number }> = {
  STANDARD: { color: 'rgba(200, 200, 200, 0.5)', width: 2 },
  PREMIUM: { color: '#ffd700', width: 3 },
  PLATINUM: { color: 'rgba(255, 255, 255, 0.3)', width: 2 },
};

// Logo text color per type (website CardLogoText)
const LOGO_COLORS: Record<string, string> = {
  STANDARD: '#4a4a4a',
  PREMIUM: '#ffd700',
  PLATINUM: '#1a1a1a',
};

// Card number color per type (website CardNumber)
const NUMBER_COLORS: Record<string, string> = {
  STANDARD: 'rgba(100, 100, 100, 0.8)',
  PREMIUM: 'rgba(255, 255, 255, 0.9)',
  PLATINUM: 'rgba(26, 26, 26, 0.9)',
};

// Cardholder name color per type (website CardHolderName)
const HOLDER_COLORS: Record<string, string> = {
  STANDARD: 'rgba(74, 74, 74, 0.95)',
  PREMIUM: 'rgba(255, 255, 255, 0.95)',
  PLATINUM: 'rgba(26, 26, 26, 0.95)',
};

interface CardRevealProps {
  animatedScale: Animated.Value;
  animatedRotateX: Animated.AnimatedInterpolation<string>;
  animatedOpacity: Animated.Value;
  cardType?: 'STANDARD' | 'PREMIUM' | 'PLATINUM';
}

const CardReveal: React.FC<CardRevealProps> = ({
  animatedScale,
  animatedRotateX,
  animatedOpacity,
  cardType = 'STANDARD',
}) => {
  const gradientColors = CARD_GRADIENTS[cardType] || CARD_GRADIENTS.STANDARD;
  const border = CARD_BORDERS[cardType] || CARD_BORDERS.STANDARD;
  const logoColor = LOGO_COLORS[cardType] || LOGO_COLORS.STANDARD;
  const numberColor = NUMBER_COLORS[cardType] || NUMBER_COLORS.STANDARD;
  const holderColor = HOLDER_COLORS[cardType] || HOLDER_COLORS.STANDARD;
  const isPremium = cardType === 'PREMIUM';

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        {
          borderColor: border.color,
          borderWidth: border.width,
          opacity: animatedOpacity,
          transform: [
            { perspective: 800 },
            { rotateX: animatedRotateX },
            { scale: animatedScale },
          ],
        },
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Card logo - matches website "BOOM Card" with Arial Black style */}
        <Text
          style={[
            styles.cardLogo,
            { color: logoColor },
            isPremium && styles.cardLogoPremiumShadow,
          ]}
        >
          BOOM Card
        </Text>

        {/* Card number dots - matches website CardNumber with Courier */}
        <View style={styles.cardNumberRow}>
          <Text style={[styles.cardNumber, { color: numberColor }]}>••••</Text>
          <Text style={[styles.cardNumber, { color: numberColor }]}>••••</Text>
          <Text style={[styles.cardNumber, { color: numberColor }]}>••••</Text>
          <Text style={[styles.cardNumber, { color: numberColor }]}>••••</Text>
        </View>

        {/* Bottom row - matches website CardBottomRow */}
        <View style={styles.cardBottomRow}>
          <Text style={[styles.cardHolderName, { color: holderColor }]}>
            {cardType}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  cardWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20, // 1.25rem from website
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  card: {
    flex: 1,
    borderRadius: 17, // Slightly less than wrapper to avoid clipping
    paddingHorizontal: 28, // ~2rem from website
    paddingVertical: 24, // ~1.75rem from website
    justifyContent: 'space-between',
  },
  cardLogo: {
    fontSize: 26, // ~1.75rem from website
    fontWeight: '900',
    letterSpacing: 2,
  },
  cardLogoPremiumShadow: {
    textShadowColor: 'rgba(255, 215, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  cardNumberRow: {
    flexDirection: 'row',
    gap: 12, // 0.75rem from website
  },
  cardNumber: {
    fontSize: 18, // ~1.25rem from website
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 4, // 0.25rem from website
    fontWeight: '400',
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardHolderName: {
    fontSize: 13, // ~0.8125rem from website
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});

export default CardReveal;
