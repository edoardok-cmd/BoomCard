import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesMuseumsPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('museums');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Cultural Activities"
      titleBg="Културни Дейности"
      subtitleEn="Discover Bulgaria's cultural heritage: Museums, Art galleries, and Historical sites"
      subtitleBg="Открийте културното наследство на България: Музеи, Художествени галерии и Исторически места"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesMuseumsPage;
