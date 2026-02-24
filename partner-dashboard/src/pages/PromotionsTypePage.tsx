import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntities } from '../hooks/useOffers';

const PromotionsTypePage: React.FC = () => {
  const { data, isLoading } = useEntities({ featured: true, limit: 50 });
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn="Promotions by Type"
      titleBg="Промоции по Тип"
      subtitleEn="Discover exciting promotions organized by category: Gastronomy, Extreme adventures, Cultural experiences"
      subtitleBg="Открийте вълнуващи промоции организирани по категория: Гастрономични, Екстремни приключения, Културни изживявания"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PromotionsTypePage;
