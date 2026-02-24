import React from 'react';
import { Animated, View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.82;
const CARD_HEIGHT = CARD_WIDTH * 0.6;

const CARD_GRADIENTS: Record<string, [string, string]> = {
  STANDARD: ['#4A5568', '#2D3748'],
  PREMIUM: ['#D4AF37', '#FFD700'],
  PLATINUM: ['#C0C0C0', '#E8E8E8'],
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

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        {
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
        {/* Card header */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardLogo}>BOOMCARD</Text>
          <View style={styles.cardChip}>
            <View style={styles.chipLine} />
            <View style={[styles.chipLine, { width: 16 }]} />
            <View style={styles.chipLine} />
          </View>
        </View>

        {/* Decorative QR dots */}
        <View style={styles.qrArea}>
          {Array.from({ length: 3 }).map((_, row) => (
            <View key={row} style={styles.qrRow}>
              {Array.from({ length: 4 }).map((_, col) => (
                <View
                  key={col}
                  style={[
                    styles.qrDot,
                    { opacity: ((row + col) % 3 === 0) ? 0.6 : 0.3 },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>

        {/* Card footer */}
        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.cardNumber}>**** **** **** 1234</Text>
            <Text style={styles.cardLabel}>Your Card</Text>
          </View>
          <View style={styles.tierBadge}>
            <Text style={styles.tierText}>{cardType}</Text>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  cardWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLogo: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardChip: {
    width: 32,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  chipLine: {
    width: 20,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 1,
  },
  qrArea: {
    alignSelf: 'flex-end',
    gap: 3,
  },
  qrRow: {
    flexDirection: 'row',
    gap: 3,
  },
  qrDot: {
    width: 6,
    height: 6,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardNumber: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 2,
    fontWeight: '500',
    marginBottom: 2,
  },
  cardLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tierBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});

export default CardReveal;
