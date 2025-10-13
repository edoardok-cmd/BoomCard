import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const CategoriesSpaPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('spa-wellness');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Spa & Wellness Centers"
      titleBg="Спа и Уелнес Центрове"
      subtitleEn="Rejuvenate your body and mind at Bulgaria's finest spa and wellness centers"
      subtitleBg="Освежете тялото и ума си в най-добрите спа и уелнес центрове в България"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default CategoriesSpaPage;
