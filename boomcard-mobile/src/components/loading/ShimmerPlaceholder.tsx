import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface ShimmerPlaceholderProps {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
  isDarkMode?: boolean;
}

const ShimmerPlaceholder: React.FC<ShimmerPlaceholderProps> = ({
  width,
  height,
  borderRadius = 8,
  style,
  isDarkMode = false,
}) => {
  const translateX = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const baseColor = isDarkMode ? '#374151' : '#E5E7EB';
  const shimmerColor = isDarkMode ? '#4B5563' : '#F3F4F6';

  // Map translateX from [-1, 1] to actual pixel movement
  const shimmerWidth = typeof width === 'number' ? width : 300;
  const animatedTranslateX = translateX.interpolate({
    inputRange: [-1, 1],
    outputRange: [-shimmerWidth, shimmerWidth],
  });

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: baseColor,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: animatedTranslateX }] },
        ]}
      >
        <LinearGradient
          colors={[baseColor, shimmerColor, baseColor]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

export default ShimmerPlaceholder;
