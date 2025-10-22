import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';
import Button from '../components/common/Button/Button';

const PricingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
`;

const PricingCard = styled.div`
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 1.5rem;
  padding: 2.5rem;
  text-align: center;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }

  &:hover {
    transform: translateY(-8px);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12);

    [data-theme="dark"] & {
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    }
  }

  &.featured {
    background: linear-gradient(135deg, #000000 0%, #1f2937 100%);
    border: none;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    transform: scale(1.05);

    [data-theme="dark"] & {
      background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    }

    [data-theme="color"] & {
      background: linear-gradient(135deg, #6a0572 0%, #ab2567 50%, #ff006e 100%);
      box-shadow:
        0 20px 60px rgba(255, 0, 110, 0.3),
        0 10px 40px rgba(171, 37, 103, 0.2);
    }

    &:hover {
      transform: scale(1.08) translateY(-8px);
      box-shadow: 0 25px 70px rgba(0, 0, 0, 0.2);

      [data-theme="dark"] & {
        box-shadow: 0 25px 70px rgba(0, 0, 0, 0.5);
      }

      [data-theme="color"] & {
        box-shadow:
          0 25px 70px rgba(255, 0, 110, 0.4),
          0 15px 50px rgba(171, 37, 103, 0.3);
      }
    }

    &::before {
      content: 'POPULAR';
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #ff006e 0%, #ff4500 100%);
      color: white;
      padding: 0.5rem 1.5rem;
      border-radius: 2rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 12px rgba(255, 0, 110, 0.3);

      [data-theme="color"] & {
        background: linear-gradient(135deg, #ff4500 0%, #ffd700 100%);
        box-shadow: 0 4px 12px rgba(255, 69, 0, 0.4);
      }
    }
  }
`;

const PlanName = styled.h3`
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  color: #111827;
  text-transform: uppercase;
  letter-spacing: 1px;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  .featured & {
    color: white;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
`;

const Price = styled.div`
  font-size: 3.5rem;
  font-weight: 800;
  color: #000000;
  margin-bottom: 0.5rem;
  line-height: 1;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  .featured & {
    color: white;
    text-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    background: linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;

    [data-theme="color"] & {
      background: linear-gradient(135deg, #ffd700 0%, #ffffff 50%, #ffd700 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
  }
`;

const PriceSubtext = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 2.5rem;
  font-weight: 500;

  [data-theme="dark"] & {
    color: #9ca3af;
  }

  .featured & {
    color: rgba(255, 255, 255, 0.8);
  }
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 2rem 0;
  text-align: left;
`;

const Feature = styled.li`
  padding: 1rem 0;
  border-bottom: 1px solid #e5e7eb;
  color: #374151;
  font-size: 0.9375rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  [data-theme="dark"] & {
    border-bottom-color: #374151;
    color: #d1d5db;
  }

  .featured & {
    border-bottom-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
  }

  &:last-child {
    border-bottom: none;
  }

  &::before {
    content: '✓';
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: #10b981;
    color: white;
    font-size: 0.75rem;
    font-weight: 700;
    flex-shrink: 0;

    [data-theme="color"] & {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }

    .featured & {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
    }
  }
`;

const CTAButton = styled.div`
  margin-top: auto;
  padding-top: 1rem;

  button {
    width: 100%;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: all 0.3s ease;
  }

  .featured & button {
    background: white;
    color: #000000;
    border: none;

    &:hover {
      background: #f3f4f6;
      transform: scale(1.05);
    }

    [data-theme="color"] & {
      background: linear-gradient(135deg, #ffd700 0%, #ffffff 100%);
      color: #6a0572;

      &:hover {
        background: linear-gradient(135deg, #ffffff 0%, #ffd700 100%);
      }
    }
  }
`;

const SubscriptionsPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <GenericPage
      titleEn="Subscription Plans"
      titleBg="Абонаментни Планове"
      subtitleEn="Choose the perfect plan for your lifestyle"
      subtitleBg="Изберете перфектния план за вашия начин на живот"
    >
      <PricingGrid>
        <PricingCard>
          <PlanName>{language === 'bg' ? 'Основен' : 'Basic'}</PlanName>
          <Price>{language === 'bg' ? '0' : '0'} {language === 'bg' ? 'лв' : 'BGN'}</Price>
          <PriceSubtext>{language === 'bg' ? 'на месец' : 'per month'}</PriceSubtext>
          <FeatureList>
            <Feature>{language === 'bg' ? 'Достъп до основни оферти' : 'Access to basic offers'}</Feature>
            <Feature>{language === 'bg' ? '10% средна отстъпка' : '10% average discount'}</Feature>
            <Feature>{language === 'bg' ? 'Месечен бюлетин' : 'Monthly newsletter'}</Feature>
          </FeatureList>
          <CTAButton>
            <Button variant="outline" size="large">
              {language === 'bg' ? 'Избери план' : 'Choose Plan'}
            </Button>
          </CTAButton>
        </PricingCard>

        <PricingCard className="featured">
          <PlanName>{language === 'bg' ? 'Премиум' : 'Premium'}</PlanName>
          <Price>29 {language === 'bg' ? 'лв' : 'BGN'}</Price>
          <PriceSubtext>{language === 'bg' ? 'на месец' : 'per month'}</PriceSubtext>
          <FeatureList>
            <Feature>{language === 'bg' ? 'Всички основни характеристики' : 'All Basic features'}</Feature>
            <Feature>{language === 'bg' ? '30% средна отстъпка' : '30% average discount'}</Feature>
            <Feature>{language === 'bg' ? 'Приоритетна поддръжка' : 'Priority support'}</Feature>
            <Feature>{language === 'bg' ? 'Ексклузивни оферти' : 'Exclusive offers'}</Feature>
          </FeatureList>
          <CTAButton>
            <Button variant="primary" size="large">
              {language === 'bg' ? 'Избери план' : 'Choose Plan'}
            </Button>
          </CTAButton>
        </PricingCard>

        <PricingCard>
          <PlanName>{language === 'bg' ? 'VIP' : 'VIP'}</PlanName>
          <Price>59 {language === 'bg' ? 'лв' : 'BGN'}</Price>
          <PriceSubtext>{language === 'bg' ? 'на месец' : 'per month'}</PriceSubtext>
          <FeatureList>
            <Feature>{language === 'bg' ? 'Всички Премиум характеристики' : 'All Premium features'}</Feature>
            <Feature>{language === 'bg' ? '50% средна отстъпка' : '50% average discount'}</Feature>
            <Feature>{language === 'bg' ? 'VIP събития' : 'VIP events'}</Feature>
            <Feature>{language === 'bg' ? 'Персонален консиерж' : 'Personal concierge'}</Feature>
          </FeatureList>
          <CTAButton>
            <Button variant="outline" size="large">
              {language === 'bg' ? 'Избери план' : 'Choose Plan'}
            </Button>
          </CTAButton>
        </PricingCard>
      </PricingGrid>
    </GenericPage>
  );
};

export default SubscriptionsPage;
