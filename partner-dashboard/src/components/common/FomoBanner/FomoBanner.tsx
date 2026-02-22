import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

const BannerContainer = styled.div<{ $paused: boolean }>`
  position: fixed;
  top: 66px; /* Directly below fixed header */
  left: 0;
  right: 0;
  width: 100%;
  z-index: 45; /* Below header (z-index 50) */
  background: rgba(0, 0, 0, 0.95); /* Slightly transparent for better integration */
  padding: 10px 0 18px 0; /* Extra bottom padding to cover any gap */
  overflow: hidden;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  cursor: pointer;

  @media (max-width: 1380px) {
    top: 62px;
  }

  @media (max-width: 768px) {
    top: 58px;
    padding: 8px 0 16px 0;
  }

  @media (max-width: 480px) {
    top: 54px;
    padding: 7px 0 14px 0;
  }
`;

const MarqueeTrack = styled.div<{ $paused: boolean }>`
  display: flex;
  justify-content: center;
  white-space: nowrap;
  animation: ${marquee} 28s linear infinite;
  animation-play-state: ${({ $paused }) => ($paused ? 'paused' : 'running')};

  @media (max-width: 768px) {
    animation-duration: 21s;
  }
`;

const BannerText = styled.span`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.875rem; /* Slightly larger for better readability */
  font-weight: 500;
  color: #ffffff;
  margin: 0;
  line-height: 1.4;
  display: inline-block;
  text-align: center;

  /* Gold accent for key words */
  strong {
    color: #d4af37;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    font-size: 0.8125rem;
  }

  @media (max-width: 480px) {
    font-size: 0.75rem;
  }
`;

const SparkleIcon = styled.span`
  color: #d4af37;
  margin-right: 8px;
  font-size: 1rem;

  @media (max-width: 480px) {
    margin-right: 6px;
    font-size: 0.875rem;
  }
`;

const ClickHint = styled.span`
  color: #d4af37;
  margin-left: 12px;
  font-size: 0.875rem;
  opacity: 0.8;

  @media (max-width: 768px) {
    display: none;
  }
`;

const FomoBanner: React.FC<FomoBannerProps> = ({ language = 'bg' }) => {
  const [paused, setPaused] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const content = {
    en: {
      text: 'Promotion active – ',
      highlight: '300 BOOM Card subscriptions',
      suffix: ' available at promotional price. Price will increase once sold out.',
      clickHint: '→ View Plans',
    },
    bg: {
      text: 'В момента тече промоция – пуснати са ',
      highlight: '300 BOOM Card абонамента',
      suffix: ' на промоционална цена. След изчерпване цената ще бъде увеличена.',
      clickHint: '→ Виж плановете',
    },
  };

  const t = content[language];

  return (
    <BannerContainer
      $paused={paused}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => {
        if (location.pathname === '/') {
          document.getElementById('subscription-plans')?.scrollIntoView({ behavior: 'smooth' });
        } else {
          navigate('/');
          setTimeout(() => {
            document.getElementById('subscription-plans')?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      }}
    >
      <MarqueeTrack $paused={paused}>
        <BannerText>
          <SparkleIcon>✨</SparkleIcon>
          {t.text}
          <strong>{t.highlight}</strong>
          {t.suffix}
          <ClickHint>{t.clickHint}</ClickHint>
        </BannerText>
      </MarqueeTrack>
    </BannerContainer>
  );
};

export default FomoBanner;
