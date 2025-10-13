import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesExtremePage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('extreme-sports');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Extreme Experiences"
      titleBg="Екстремни Изживявания"
      subtitleEn="Adrenaline-pumping adventures including air sports, water activities, mountain expeditions, and winter sports"
      subtitleBg="Приключения пълни с адреналин включващи въздушни спортове, водни дейности, планински експедиции и зимни спортове"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesExtremePage;
