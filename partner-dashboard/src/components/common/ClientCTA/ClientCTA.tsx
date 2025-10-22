import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useLanguage } from '../../../contexts/LanguageContext';
import Button from '../Button/Button';

const CTASection = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);

  /* Vibrant mode - explosive gradient CTA */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
    background-size: 200% 200%;
    animation: heroGradientFlow 10s ease infinite;
    box-shadow:
      inset 0 -8px 40px -10px rgba(255, 69, 0, 0.3),
      inset 0 -4px 30px -10px rgba(255, 0, 110, 0.2);
  }

  @keyframes heroGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  color: white;
  padding: 5rem 0;
  text-align: center;

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
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 1.5rem;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const CTAText = styled.p`
  font-size: 1.25rem;
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

  /* Make outline buttons visible on dark background */
  > a > button {
    &:last-child {
      color: white !important;
      border-color: rgba(255, 255, 255, 0.5) !important;

      &:hover {
        border-color: white !important;
        background: rgba(255, 255, 255, 0.1) !important;
      }
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
    },
    bg: {
      title: 'Започнете да спестявате с BoomCard днес',
      text: 'Присъединете се към хиляди потребители, които се радват на ексклузивни оферти и промоции в най-добрите места в България',
      primaryButton: 'Започнете сега',
      secondaryButton: 'Разгледайте офертите',
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
        </CTAButtons>
      </Container>
    </CTASection>
  );
};

export default ClientCTA;
