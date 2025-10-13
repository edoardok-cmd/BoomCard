import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffers } from '../hooks/useOffers';

const PromotionsTypePage: React.FC = () => {
  const { data, isLoading } = useOffers({ featured: true, limit: 50 });
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Promotions by Type"
      titleBg="Промоции по Тип"
      subtitleEn="Discover exciting promotions organized by category: Gastronomy, Extreme adventures, Cultural experiences"
      subtitleBg="Открийте вълнуващи промоции организирани по категория: Гастрономични, Екстремни приключения, Културни изживявания"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PromotionsTypePage;
