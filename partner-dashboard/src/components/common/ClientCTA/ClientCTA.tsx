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
  text-align: center;
`;

const CTATitle = styled.h2`
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 1.5rem;
  text-align: center;

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
  text-align: center;

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const CTAButtons = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 0 1rem;

    a {
      width: 100%;
      max-width: 300px;
    }

    a button {
      width: 100%;
    }
  }
`;

const PrimaryButtonContainer = styled.div`
  width: 100%;
  text-align: center;
  margin-bottom: 1.5rem;

  button {
    min-width: 280px;
    font-size: 1.32rem;
    padding: 1rem 2.5rem;
    background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%) !important;
    color: #000000 !important;
    border: 2px solid #c9a237 !important;
    font-weight: 600 !important;
    box-shadow: 0 4px 15px rgba(201, 162, 55, 0.4) !important;

    &:hover {
      background: linear-gradient(135deg, #d4af37 0%, #c9a237 100%) !important;
      color: #000000 !important;
      border-color: #d4af37 !important;
      box-shadow: 0 6px 20px rgba(201, 162, 55, 0.5) !important;
    }
  }

  @media (max-width: 768px) {
    button {
      min-width: auto;
      width: 100%;
      max-width: 300px;
    }
  }
`;

const SecondaryButtonsRow = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;

  /* Make all buttons uniform - gold border, no background */
  a button {
    min-width: 200px;
    background: transparent !important;
    border: 2px solid #D4AF37 !important;
    color: #D4AF37 !important;
    box-shadow: none !important;

    &:hover {
      background: rgba(212, 175, 55, 0.15) !important;
      border-color: #D4AF37 !important;
      color: #D4AF37 !important;
    }
  }

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: center;

    a button {
      min-width: auto;
      width: 100%;
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
      title: 'Start Saving with BOOM Card Today',
      text: 'Join people discovering exclusive deals at the best venues across Bulgaria',
      primaryButton: 'Get Started',
      secondaryButton: 'Browse Offers',
      viewPartnersButton: 'View All Partners',
      partnerButton: 'Become a Partner',
    },
    bg: {
      title: 'Започнете да спестявате с BOOM Card още днес',
      text: 'Присъединете се към хора, които откриват ексклузивни оферти в най-добрите места в България',
      primaryButton: 'Започнете сега',
      secondaryButton: 'Разгледайте офертите',
      viewPartnersButton: 'Виж Всички Партньори',
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
          {/* Primary CTA - centered and prominent */}
          <PrimaryButtonContainer>
            <Link to="/subscriptions">
              <Button variant="primary" size="large">
                {t.primaryButton}
              </Button>
            </Link>
          </PrimaryButtonContainer>
          {/* Secondary CTAs - smaller, in a row */}
          <SecondaryButtonsRow>
            <Link to="/search">
              <Button variant="outline" size="medium">
                {t.secondaryButton}
              </Button>
            </Link>
            <Link to="/partners#locations">
              <Button variant="outline" size="medium">
                {t.viewPartnersButton}
              </Button>
            </Link>
            <Link to="/partners#application">
              <Button variant="outline" size="medium">
                {t.partnerButton}
              </Button>
            </Link>
          </SecondaryButtonsRow>
        </CTAButtons>
      </Container>
    </CTASection>
  );
};

export default ClientCTA;
