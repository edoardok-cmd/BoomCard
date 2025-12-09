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

  /* All buttons in CTA section should work on dark background */
  a button {
    /* Override all button variants to work on dark background */
    color: white !important;
    border-color: rgba(255, 255, 255, 0.7) !important;
    font-weight: 600 !important;

    &:hover {
      border-color: white !important;
      background: rgba(255, 255, 255, 0.15) !important;
      color: white !important;
    }
  }

  /* Primary/Secondary button - golden gradient background with dark text for contrast */
  a:first-child button {
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

  /* Light theme - ensure all buttons are visible on dark CTA */
  [data-theme="light"] & a button {
    color: white !important;
    border-color: rgba(255, 255, 255, 0.7) !important;

    &:hover {
      border-color: white !important;
      background: rgba(255, 255, 255, 0.15) !important;
      color: white !important;
    }
  }

  [data-theme="light"] & a:first-child button {
    background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%) !important;
    color: #000000 !important;
    border: 2px solid #c9a237 !important;
    box-shadow: 0 4px 15px rgba(201, 162, 55, 0.4) !important;

    &:hover {
      background: linear-gradient(135deg, #d4af37 0%, #c9a237 100%) !important;
      color: #000000 !important;
      box-shadow: 0 6px 20px rgba(201, 162, 55, 0.5) !important;
    }
  }

  /* Dark theme - brighter buttons for visibility */
  [data-theme="dark"] & a button {
    color: #ffffff !important;
    border-color: rgba(255, 255, 255, 0.7) !important;

    &:hover {
      border-color: #60a5fa !important;
      background: rgba(59, 130, 246, 0.2) !important;
    }
  }

  [data-theme="dark"] & a:first-child button {
    background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%) !important;
    color: #000000 !important;
    border: 2px solid #c9a237 !important;
    box-shadow: 0 4px 15px rgba(201, 162, 55, 0.4) !important;

    &:hover {
      background: linear-gradient(135deg, #d4af37 0%, #c9a237 100%) !important;
      color: #000000 !important;
      box-shadow: 0 6px 20px rgba(201, 162, 55, 0.5) !important;
    }
  }

  /* Color theme - maintain white on blue gradient */
  [data-theme="color"] & a button {
    color: white !important;
    border-color: rgba(255, 255, 255, 0.8) !important;

    &:hover {
      border-color: white !important;
      background: rgba(255, 255, 255, 0.2) !important;
    }
  }

  [data-theme="color"] & a:first-child button {
    background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%) !important;
    color: #000000 !important;
    border: 2px solid #c9a237 !important;
    box-shadow: 0 4px 15px rgba(201, 162, 55, 0.4) !important;

    &:hover {
      background: linear-gradient(135deg, #d4af37 0%, #c9a237 100%) !important;
      color: #000000 !important;
      box-shadow: 0 6px 20px rgba(201, 162, 55, 0.5) !important;
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
      text: 'Join thousands of users enjoying exclusive deals and offers at the best venues across Bulgaria',
      primaryButton: 'Get Started',
      secondaryButton: 'Browse Offers',
      partnerButton: 'Become a Partner',
    },
    bg: {
      title: 'Започнете да спестявате с BOOM Card днес',
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
