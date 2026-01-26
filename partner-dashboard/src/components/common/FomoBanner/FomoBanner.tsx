import React from 'react';
import styled, { keyframes } from 'styled-components';

interface FomoBannerProps {
  language?: 'en' | 'bg';
}

const marquee = keyframes`
  0% {
    transform: translateX(100vw);
  }
  100% {
    transform: translateX(-100%);
  }
`;

const BannerContainer = styled.div`
  position: fixed;
  top: 66px; /* Directly below fixed header */
  left: 0;
  right: 0;
  width: 100%;
  z-index: 45; /* Below header (z-index 50) */
  background: #000000; /* Match hero background exactly */
  padding: 8px 0 18px 0; /* Extra bottom padding to cover any gap */
  overflow: hidden;

  @media (max-width: 1380px) {
    top: 62px;
  }

  @media (max-width: 768px) {
    top: 58px;
    padding: 6px 0 16px 0;
  }

  @media (max-width: 480px) {
    top: 54px;
    padding: 5px 0 14px 0;
  }
`;

const MarqueeTrack = styled.div`
  display: flex;
  white-space: nowrap;
  animation: ${marquee} 28s linear infinite;

  @media (max-width: 768px) {
    animation-duration: 21s;
  }
`;

const BannerText = styled.span`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.8rem;
  font-weight: 500;
  color: #ffffff;
  margin: 0;
  line-height: 1.4;
  display: inline-block;

  /* Gold accent for key words */
  strong {
    color: #d4af37;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    font-size: 0.75rem;
  }

  @media (max-width: 480px) {
    font-size: 0.7rem;
  }
`;

const SparkleIcon = styled.span`
  color: #d4af37;
  margin-right: 8px;
  font-size: 0.9rem;

  @media (max-width: 480px) {
    margin-right: 6px;
    font-size: 0.8rem;
  }
`;

const FomoBanner: React.FC<FomoBannerProps> = ({ language = 'bg' }) => {
  const content = {
    en: {
      text: 'Promotion active – ',
      highlight: '300 BOOM Card subscriptions',
      suffix: ' available at promotional price. Price will increase once sold out.',
    },
    bg: {
      text: 'В момента тече промоция – пуснати са ',
      highlight: '300 BOOM Card абонамента',
      suffix: ' на промоционална цена. След изчерпване цената ще бъде увеличена.',
    },
  };

  const t = content[language];

  return (
    <BannerContainer>
      <MarqueeTrack>
        <BannerText>
          <SparkleIcon>✨</SparkleIcon>
          {t.text}
          <strong>{t.highlight}</strong>
          {t.suffix}
        </BannerText>
      </MarqueeTrack>
    </BannerContainer>
  );
};

export default FomoBanner;
