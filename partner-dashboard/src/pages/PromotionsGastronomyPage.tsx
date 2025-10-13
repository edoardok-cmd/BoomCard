import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const PromotionsGastronomyPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('gastronomy');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Gastronomy Promotions"
      titleBg="Гастрономични Промоции"
      subtitleEn="Culinary experiences including street food tours, wine & dine events, cooking classes, and farm-to-table dining"
      subtitleBg="Кулинарни изживявания включващи турове на улична храна, вино и храна, готварски класове и farm-to-table ресторанти"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PromotionsGastronomyPage;
