import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Rect, Defs, RadialGradient, LinearGradient as SvgLinearGradient, Stop, G } from 'react-native-svg';

interface BoomLogoProps {
  size?: number;
}

const BoomLogo: React.FC<BoomLogoProps> = ({ size = 32 }) => {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
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
          <Circle cx="38" cy="32" r="22" fill="url(#topFill)" />
          <Circle cx="38" cy="32" r="9" fill="#5B6EAE" />
          <Circle cx="82" cy="88" r="26" fill="url(#bottomFill)" />
          <Circle cx="82" cy="88" r="10.5" fill="#5B6EAE" />
          <Rect x="53" y="-2" width="14" height="124" rx="7" fill="url(#slashFill)" transform="translate(60, 60) rotate(44) translate(-60, -60)" />
        </G>
      </Svg>
    </View>
  );
};

export default BoomLogo;
