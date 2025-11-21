import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useLanguage } from '../../../contexts/LanguageContext';
import Button from '../Button/Button';

const CTASection = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);
  color: white;
  padding: 5rem 0;
  text-align: center;

  /* Dark theme - lighter background for contrast */
  [data-theme="dark"] & {
    background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
    border-top: 1px solid #4b5563;
  }

  /* Vibrant mode - explosive blue gradient CTA */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #0a1e3e 0%, #1e3a8a 25%, #1d4ed8 50%, #3b82f6 75%, #06b6d4 100%);
    background-size: 200% 200%;
    animation: heroGradientFlow 10s ease infinite;
    box-shadow:
      inset 0 -8px 40px -10px rgba(59, 130, 246, 0.4),
      inset 0 -4px 30px -10px rgba(6, 182, 212, 0.3);
  }

  @keyframes heroGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @media (max-width: 768px) {
    padding: 3rem 0;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
`;

const CTATitle = styled.h2`
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 1.5rem;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const CTAText = styled.p`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 1.25rem;
  font-weight: 400;
  opacity: 0.9;
  margin-bottom: 2.5rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.7;

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const CTAButtons = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;

  /* Outline buttons on dark CTA - ensure high contrast */
  > a > button[class*="outline"] {
    color: white;
    border-color: rgba(255, 255, 255, 0.6);
    font-weight: 600;

    &:hover {
      border-color: white;
      background: rgba(255, 255, 255, 0.15);
      color: white;
    }
  }

  /* Dark theme - brighter buttons for visibility */
  [data-theme="dark"] & > a > button[class*="outline"] {
    color: #ffffff;
    border-color: #9ca3af;

    &:hover {
      border-color: #60a5fa;
      background: rgba(59, 130, 246, 0.2);
      color: #ffffff;
    }
  }

  /* Color theme - maintain white on blue gradient */
  [data-theme="color"] & > a > button[class*="outline"] {
    color: white;
    border-color: rgba(255, 255, 255, 0.8);

    &:hover {
      color: white;
      border-color: white;
      background: rgba(255, 255, 255, 0.2);
    }
  }
`;

interface ClientCTAProps {
  className?: string;
}

export const ClientCTA: React.FC<ClientCTAProps> = ({ className }) => {
  const { language } = useLanguage();

  const content = {
    en: {
      title: 'Start Saving with BoomCard Today',
      text: 'Join thousands of users enjoying exclusive deals and offers at the best venues across Bulgaria',
      primaryButton: 'Get Started',
      secondaryButton: 'Browse Offers',
      partnerButton: 'Become a Partner',
    },
    bg: {
      title: 'Започнете да спестявате с BoomCard днес',
      text: 'Присъединете се към хиляди потребители, които се радват на ексклузивни оферти и промоции в най-добрите места в България',
      primaryButton: 'Започнете сега',
      secondaryButton: 'Разгледайте офертите',
      partnerButton: 'Станете партньор',
    },
  };

  const t = language === 'bg' ? content.bg : content.en;

  return (
    <CTASection className={className}>
      <Container>
        <CTATitle>{t.title}</CTATitle>
        <CTAText>{t.text}</CTAText>
        <CTAButtons>
          <Link to="/register">
            <Button variant="secondary" size="large">
              {t.primaryButton}
            </Button>
          </Link>
          <Link to="/search">
            <Button variant="outline" size="large">
              {t.secondaryButton}
            </Button>
          </Link>
          <Link to="/partners#application">
            <Button variant="outline" size="large">
              {t.partnerButton}
            </Button>
          </Link>
        </CTAButtons>
      </Container>
    </CTASection>
  );
};

export default ClientCTA;
