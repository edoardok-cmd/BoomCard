import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  progress?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  animated?: boolean;
}

const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  size = 48,
  strokeWidth = 3,
  color = '#3B82F6',
  trackColor = 'rgba(59,130,246,0.15)',
  animated = true,
}) => {
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [];

    if (progress !== undefined) {
      // Determinate mode
      const anim = Animated.timing(animatedProgress, {
        toValue: progress,
        duration: 800,
        useNativeDriver: false,
      });
      anim.start();
      animations.push(anim);
    } else {
      // Indeterminate spinning mode
      const spin = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        })
      );
      spin.start();
      animations.push(spin);

      // Animate dash for indeterminate
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(animatedProgress, {
            toValue: 0.7,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(animatedProgress, {
            toValue: 0.2,
            duration: 800,
            useNativeDriver: false,
          }),
        ])
      );
      pulse.start();
      animations.push(pulse);
    }

    return () => {
      animations.forEach(a => a.stop());
    };
  }, [progress]);

  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const rotation = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        transform: progress === undefined ? [{ rotate: rotation }] : [],
      }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
    </Animated.View>
  );
};

export default ProgressRing;
