import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const PricingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
`;

const PricingCard = styled.div`
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 1rem;
  padding: 2rem;
  text-align: center;

  &.featured {
    border-color: #000000;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  }
`;

const PlanName = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: #111827;
`;

const Price = styled.div`
  font-size: 3rem;
  font-weight: 700;
  color: #000000;
  margin-bottom: 0.5rem;
`;

const PriceSubtext = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 2rem;
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  text-align: left;
`;

const Feature = styled.li`
  padding: 0.75rem 0;
  border-bottom: 1px solid #e5e7eb;
  color: #374151;

  &:last-child {
    border-bottom: none;
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
        </PricingCard>
      </PricingGrid>
    </GenericPage>
  );
};

export default SubscriptionsPage;
