import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntities } from '../hooks/useOffers';

const PartnersExclusivePage: React.FC = () => {
  const { data, isLoading } = useEntities({ minPrice: 300, featured: true, limit: 50 });
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn="Exclusive Partners"
      titleBg="Ексклузивни Партньори"
      subtitleEn="Experience the finest venues available only through BoomCard"
      subtitleBg="Изживейте най-добрите места достъпни само чрез BoomCard"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PartnersExclusivePage;
