import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TextStyle } from 'react-native';

interface AnimatedCounterProps {
  targetValue: number;
  duration?: number;
  formatFn?: (val: number) => string;
  style?: TextStyle;
}

const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  targetValue,
  duration = 1200,
  formatFn,
  style,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState('0');
  const prevTarget = useRef(0);

  useEffect(() => {
    const startFrom = prevTarget.current;
    prevTarget.current = targetValue;

    animatedValue.setValue(startFrom);

    const listener = animatedValue.addListener(({ value }) => {
      const rounded = Math.round(value * 100) / 100;
      setDisplayValue(formatFn ? formatFn(rounded) : String(Math.round(rounded)));
    });

    Animated.timing(animatedValue, {
      toValue: targetValue,
      duration,
      useNativeDriver: false,
    }).start();

    return () => {
      animatedValue.removeListener(listener);
    };
  }, [targetValue]);

  return <Text style={style}>{displayValue}</Text>;
};

export default AnimatedCounter;
