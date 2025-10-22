import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

// Billing toggle section
const BillingToggleSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  margin-bottom: 4rem;
`;

const BillingToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  background: white;
  padding: 0.5rem;
  border-radius: 3rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);

  [data-theme="dark"] & {
    background: #1f2937;
  }
`;

const ToggleOption = styled.button<{ $active: boolean }>`
  padding: 1rem 2.5rem;
  border-radius: 3rem;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  background: ${props => props.$active ? '#000000' : 'transparent'};
  color: ${props => props.$active ? 'white' : '#6b7280'};

  [data-theme="dark"] & {
    background: ${props => props.$active ? '#60a5fa' : 'transparent'};
    color: ${props => props.$active ? '#000000' : '#9ca3af'};
  }

  &:hover {
    color: ${props => props.$active ? 'white' : '#374151'};
  }
`;

const SaveBadge = styled.div`
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  padding: 0.75rem 2rem;
  border-radius: 3rem;
  font-size: 1rem;
  font-weight: 700;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);

  [data-theme="color"] & {
    background: linear-gradient(135deg, #10b981 0%, #00d4ff 100%);
  }
`;

// Card grid
const CardsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  max-width: 800px;
  margin: 0 auto;
  padding: 0 1rem;

  @media (max-width: 768px) {
    padding: 0 0.5rem;
  }
`;

// Credit card styled component
const CreditCard = styled.div<{ $variant: 'gold' | 'silver' | 'platinum' }>`
  position: relative;
  width: 100%;
  aspect-ratio: 1.586;
  max-width: 680px;
  margin: 0 auto;
  border-radius: 1.5rem;
  padding: 2.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  overflow: hidden;

  ${props => props.$variant === 'gold' && `
    background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
    border: 3px solid #d4af37;

    [data-theme="dark"] & {
      background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
      border-color: #fbbf24;
    }

    [data-theme="color"] & {
      background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 50%, #ab2567 100%);
      border-color: #ffd700;
      box-shadow:
        0 20px 60px rgba(255, 215, 0, 0.3),
        0 10px 40px rgba(171, 37, 103, 0.3);
    }
  `}

  ${props => props.$variant === 'silver' && `
    background: linear-gradient(135deg, #8b8b8b 0%, #6b6b6b 100%);
    border: 3px solid #c0c0c0;

    [data-theme="dark"] & {
      background: linear-gradient(135deg, #4b5563 0%, #374151 100%);
      border-color: #9ca3af;
    }

    [data-theme="color"] & {
      background: linear-gradient(135deg, #6b7280 0%, #4b5563 50%, #374151 100%);
      border-color: #e5e7eb;
    }
  `}

  ${props => props.$variant === 'platinum' && `
    background: linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%);
    border: 3px solid #e5e4e2;

    [data-theme="dark"] & {
      background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
      border-color: #d1d5db;
    }

    [data-theme="color"] & {
      background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 50%, #0a0a0a 100%);
      border-color: #f3f4f6;
      box-shadow:
        0 20px 60px rgba(243, 244, 246, 0.2),
        0 10px 40px rgba(0, 0, 0, 0.4);
    }
  `}

  &:hover {
    transform: translateY(-12px) scale(1.02);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.3);
  }

  &::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -20%;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
    pointer-events: none;
  }

  @media (max-width: 768px) {
    padding: 1.5rem;
    aspect-ratio: 1.4;
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
  z-index: 1;
`;

const BoomLogo = styled.div`
  font-size: 2.5rem;
  font-weight: 900;
  letter-spacing: -1px;
  text-transform: uppercase;

  ${CreditCard}[data-variant="gold"] & {
    color: #ffd700;
    text-shadow: 0 2px 10px rgba(255, 215, 0, 0.5);
  }

  ${CreditCard}[data-variant="silver"] & {
    color: #ffffff;
    text-shadow: 0 2px 10px rgba(255, 255, 255, 0.3);
  }

  ${CreditCard}[data-variant="platinum"] & {
    color: #e5e4e2;
    text-shadow: 0 2px 10px rgba(229, 228, 226, 0.4);
  }

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const QRCode = styled.div`
  width: 100px;
  height: 100px;
  background: white;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  padding: 0.5rem;

  @media (max-width: 768px) {
    width: 80px;
    height: 80px;
  }
`;

const QRPlaceholder = styled.div`
  width: 60px;
  height: 60px;
  background: #000;
  border-radius: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.5rem;
  color: white;

  @media (max-width: 768px) {
    width: 48px;
    height: 48px;
  }
`;

const ScanText = styled.div`
  font-size: 0.625rem;
  font-weight: 700;
  color: #000;
  margin-top: 0.25rem;
  text-transform: uppercase;
`;

const CardNumber = styled.div`
  font-size: 1.75rem;
  font-weight: 500;
  letter-spacing: 3px;
  color: white;
  font-family: 'Courier New', monospace;
  position: relative;
  z-index: 1;
  margin: 1.5rem 0;

  @media (max-width: 768px) {
    font-size: 1.25rem;
    letter-spacing: 2px;
  }
`;

const CardFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  position: relative;
  z-index: 1;
`;

const CardInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const CardLabel = styled.div`
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const CardValue = styled.div`
  font-size: 1rem;
  color: white;
  font-weight: 600;
  text-transform: uppercase;

  @media (max-width: 768px) {
    font-size: 0.875rem;
  }
`;

const CardExpiry = styled.div`
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'Courier New', monospace;
`;

// Features section below cards
const FeaturesSection = styled.div`
  margin-top: 3rem;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
`;

const FeatureGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const FeatureItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  [data-theme="dark"] & {
    background: #1f2937;
  }
`;

const FeatureIcon = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: white;
  font-weight: 700;
`;

const FeatureText = styled.div`
  font-size: 0.9375rem;
  color: #374151;
  font-weight: 500;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const SubscriptionsPage: React.FC = () => {
  const { language } = useLanguage();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const cards = [
    {
      variant: 'silver' as const,
      name: language === 'bg' ? 'Основен' : 'Basic',
      price: 0,
      features: [
        language === 'bg' ? 'Достъп до основни оферти' : 'Access to basic offers',
        language === 'bg' ? '10% средна отстъпка' : '10% average discount',
        language === 'bg' ? 'Месечен бюлетин' : 'Monthly newsletter'
      ]
    },
    {
      variant: 'gold' as const,
      name: language === 'bg' ? 'Премиум' : 'Premium',
      price: billingPeriod === 'monthly' ? 29 : 290,
      features: [
        language === 'bg' ? 'Всички основни характеристики' : 'All Basic features',
        language === 'bg' ? '30% средна отстъпка' : '30% average discount',
        language === 'bg' ? 'Приоритетна поддръжка' : 'Priority support',
        language === 'bg' ? 'Ексклузивни оферти' : 'Exclusive offers'
      ]
    },
    {
      variant: 'platinum' as const,
      name: 'VIP',
      price: billingPeriod === 'monthly' ? 59 : 590,
      features: [
        language === 'bg' ? 'Всички Премиум характеристики' : 'All Premium features',
        language === 'bg' ? '50% средна отстъпка' : '50% average discount',
        language === 'bg' ? 'VIP събития' : 'VIP events',
        language === 'bg' ? 'Персонален консиерж' : 'Personal concierge'
      ]
    }
  ];

  return (
    <GenericPage
      titleEn="Clear, transparent pricing"
      titleBg="Ясни, прозрачни цени"
      subtitleEn="Choose the perfect plan for your lifestyle"
      subtitleBg="Изберете перфектния план за вашия начин на живот"
    >
      <BillingToggleSection>
        <BillingToggle>
          <ToggleOption
            $active={billingPeriod === 'monthly'}
            onClick={() => setBillingPeriod('monthly')}
          >
            {language === 'bg' ? 'Месечно' : 'Monthly'}
          </ToggleOption>
          <ToggleOption
            $active={billingPeriod === 'yearly'}
            onClick={() => setBillingPeriod('yearly')}
          >
            {language === 'bg' ? 'Годишно' : 'Yearly'}
          </ToggleOption>
        </BillingToggle>
        {billingPeriod === 'yearly' && (
          <SaveBadge>
            {language === 'bg' ? 'Спести 20%' : 'Save 20%'}
          </SaveBadge>
        )}
      </BillingToggleSection>

      <CardsContainer>
        {cards.map((card, index) => (
          <div key={index}>
            <CreditCard $variant={card.variant} data-variant={card.variant}>
              <CardHeader>
                <BoomLogo>BOOM</BoomLogo>
                <QRCode>
                  <QRPlaceholder>QR</QRPlaceholder>
                  <ScanText>SCAN ME</ScanText>
                </QRCode>
              </CardHeader>

              <CardNumber>
                •••• •••• •••• 2025
              </CardNumber>

              <CardFooter>
                <CardInfo>
                  <CardLabel>
                    {language === 'bg' ? 'ПРИТЕЖАТЕЛ' : 'CARDHOLDER'}
                  </CardLabel>
                  <CardValue>
                    {card.name}
                  </CardValue>
                </CardInfo>
                <CardExpiry>12/25</CardExpiry>
              </CardFooter>
            </CreditCard>

            <FeaturesSection>
              <FeatureGrid>
                {card.features.map((feature, idx) => (
                  <FeatureItem key={idx}>
                    <FeatureIcon>✓</FeatureIcon>
                    <FeatureText>{feature}</FeatureText>
                  </FeatureItem>
                ))}
              </FeatureGrid>
            </FeaturesSection>
          </div>
        ))}
      </CardsContainer>
    </GenericPage>
  );
};

export default SubscriptionsPage;
