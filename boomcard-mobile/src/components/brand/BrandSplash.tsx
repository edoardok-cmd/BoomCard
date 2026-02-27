import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Rect, Defs, RadialGradient, LinearGradient as SvgLinearGradient, Stop, G } from 'react-native-svg';
import CardReveal from './CardReveal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface BrandSplashProps {
  onComplete: () => void;
  isAppReady: boolean;
  isDarkMode?: boolean;
  showCardReveal?: boolean;
}

type Phase = 'LOGO' | 'CARD_REVEAL' | 'WAITING' | 'FADE_OUT' | 'DONE';

const BrandSplash: React.FC<BrandSplashProps> = ({
  onComplete,
  isAppReady,
  isDarkMode = false,
  showCardReveal = true,
}) => {
  const [phase, setPhase] = useState<Phase>('LOGO');

  // Logo animations
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(0)).current;

  // Brand text animation
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(15)).current;

  // Card reveal animations
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.8)).current;
  const cardRotateX = useRef(new Animated.Value(15)).current;

  // Card pulse (while waiting for app ready)
  const cardPulse = useRef(new Animated.Value(1)).current;

  // Overlay fade out
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayScale = useRef(new Animated.Value(1)).current;

  // Track if minimum animation has completed
  const animationDone = useRef(false);
  const minTimeElapsed = useRef(false);
  const appReadyRef = useRef(isAppReady);
  const timeoutIds = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pulseAnimation = useRef<Animated.CompositeAnimation | null>(null);

  // Minimum display time so the splash feels intentional even if app loads instantly
  const MIN_DISPLAY_MS = showCardReveal ? 2800 : 2000;

  useEffect(() => {
    appReadyRef.current = isAppReady;
  }, [isAppReady]);

  // Start the animation sequence on mount
  useEffect(() => {
    runLogoPhase();

    // Enforce minimum display time
    const minTimer = setTimeout(() => {
      minTimeElapsed.current = true;
      // If animation is done and app is ready but we were waiting for min time, fade out now
      if (animationDone.current && appReadyRef.current) {
        startFadeOut();
      }
    }, MIN_DISPLAY_MS);

    return () => {
      // Cleanup all timeouts and animations on unmount
      clearTimeout(minTimer);
      timeoutIds.current.forEach(id => clearTimeout(id));
      pulseAnimation.current?.stop();
    };
  }, []);

  // When app becomes ready and animation is done, trigger fade out
  useEffect(() => {
    if (isAppReady && phase === 'WAITING' && minTimeElapsed.current) {
      pulseAnimation.current?.stop();
      startFadeOut();
    }
  }, [isAppReady, phase]);

  const addTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeoutIds.current.push(id);
  };

  const runLogoPhase = () => {
    // Phase 1: Logo animation (0-700ms)
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Brand text fades in slightly after logo (300ms delay)
    addTimeout(() => {
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }, 300);

    // After logo phase, move to card reveal or waiting
    addTimeout(() => {
      if (showCardReveal) {
        setPhase('CARD_REVEAL');
        runCardRevealPhase();
      } else {
        animationDone.current = true;
        if (appReadyRef.current && minTimeElapsed.current) {
          startFadeOut();
        } else {
          setPhase('WAITING');
          startPulse();
        }
      }
    }, 1200);
  };

  const runCardRevealPhase = () => {
    // Shrink logo and move up
    Animated.parallel([
      Animated.timing(logoScale, {
        toValue: 0.6,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(logoTranslateY, {
        toValue: -80,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 0.7,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Card appears with 3D effect
    addTimeout(() => {
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(cardRotateX, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }, 100);

    // Card phase completes
    addTimeout(() => {
      animationDone.current = true;
      if (appReadyRef.current && minTimeElapsed.current) {
        startFadeOut();
      } else {
        setPhase('WAITING');
        startPulse();
      }
    }, 1000);
  };

  const startPulse = () => {
    pulseAnimation.current = Animated.loop(
      Animated.sequence([
        Animated.timing(cardPulse, {
          toValue: 1.02,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(cardPulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.current.start();
  };

  const fadeOutStarted = useRef(false);

  const startFadeOut = () => {
    if (fadeOutStarted.current) return;
    fadeOutStarted.current = true;
    pulseAnimation.current?.stop();
    setPhase('FADE_OUT');

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(overlayScale, {
        toValue: 1.05,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setPhase('DONE');
      onComplete();
    });
  };

  if (phase === 'DONE') {
    return null;
  }

  const cardRotateXInterpolated = cardRotateX.interpolate({
    inputRange: [0, 15],
    outputRange: ['0deg', '15deg'],
  });

  const bgColor = isDarkMode ? '#111827' : '#111827';
  const accentGradient: [string, string] = isDarkMode
    ? ['#1E3A8A', '#5B21B6']
    : ['#111827', '#1F2937'];

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: overlayOpacity,
          transform: [{ scale: overlayScale }],
        },
      ]}
    >
      <LinearGradient
        colors={accentGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Card Reveal (rendered first so logo stays on top) */}
        {showCardReveal && (
          <Animated.View
            style={[
              styles.cardArea,
              { transform: [{ scale: cardPulse }] },
            ]}
          >
            <CardReveal
              animatedScale={cardScale}
              animatedRotateX={cardRotateXInterpolated}
              animatedOpacity={cardOpacity}
              cardType="PREMIUM"
            />
          </Animated.View>
        )}

        {/* Logo + Brand Text (rendered after card so it stays on top) */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [
                { scale: logoScale },
                { translateY: logoTranslateY },
              ],
            },
          ]}
        >
          <View style={styles.logoCircle}>
            <Svg width={120} height={120} viewBox="0 0 120 120">
              <Defs>
                <RadialGradient id="topFill" cx="0.4" cy="0.35" rx="0.65" ry="0.65">
                  <Stop offset="0%" stopColor="#B0D4EC" />
                  <Stop offset="100%" stopColor="#6FA8D6" />
                </RadialGradient>
                <RadialGradient id="bottomFill" cx="0.4" cy="0.35" rx="0.65" ry="0.65">
                  <Stop offset="0%" stopColor="#F5E6A3" />
                  <Stop offset="100%" stopColor="#D4B94E" />
                </RadialGradient>
                <SvgLinearGradient id="slashFill" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#908A9A" />
                  <Stop offset="100%" stopColor="#6E6878" />
                </SvgLinearGradient>
              </Defs>
              <G transform="translate(60, 60) rotate(-11) translate(-60, -60)">
                {/* Top-left circle (blue) */}
                <Circle cx="38" cy="32" r="22" fill="url(#topFill)" />
                <Circle cx="38" cy="32" r="9" fill="#5B6EAE" />
                {/* Bottom-right circle (gold) */}
                <Circle cx="82" cy="88" r="26" fill="url(#bottomFill)" />
                <Circle cx="82" cy="88" r="10.5" fill="#5B6EAE" />
                {/* Diagonal slash */}
                <Rect x="53" y="-2" width="14" height="124" rx="7" fill="url(#slashFill)" transform="translate(60, 60) rotate(44) translate(-60, -60)" />
              </G>
            </Svg>
          </View>
          <Animated.View
            style={{
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            }}
          >
            <View style={styles.brandRow}>
              <Text style={styles.brandBoom}>BOOM</Text>
              <Text style={styles.brandCard}>Card</Text>
            </View>
            <Text style={styles.tagline}>Your Cashback Companion</Text>
          </Animated.View>
        </Animated.View>

        {/* Decorative circles */}
        <View style={[styles.decorCircle, styles.decorCircle1]} />
        <View style={[styles.decorCircle, styles.decorCircle2]} />
        <View style={[styles.decorCircle, styles.decorCircle3]} />
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    zIndex: 2,
  },
  logoCircle: {
    width: 120,
    height: 120,
    marginBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  brandBoom: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  brandCard: {
    fontSize: 32,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.85)',
    marginLeft: 6,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  cardArea: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.2,
    alignItems: 'center',
    zIndex: 1,
  },
  // Decorative background circles
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  decorCircle1: {
    width: 300,
    height: 300,
    top: -80,
    right: -100,
  },
  decorCircle2: {
    width: 200,
    height: 200,
    bottom: -60,
    left: -70,
  },
  decorCircle3: {
    width: 120,
    height: 120,
    top: SCREEN_HEIGHT * 0.35,
    left: -40,
  },
});

export default BrandSplash;
