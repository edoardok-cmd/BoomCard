import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffers } from '../hooks/useOffers';

const PartnersExclusivePage: React.FC = () => {
  const { data, isLoading } = useOffers({ minPrice: 300, featured: true, limit: 50 });
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Exclusive Partners"
      titleBg="Ексклузивни Партньори"
      subtitleEn="Experience the finest venues available only through BoomCard"
      subtitleBg="Изживейте най-добрите места достъпни само чрез BoomCard"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PartnersExclusivePage;
