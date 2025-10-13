import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesCulturalPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('cultural');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Cultural Experiences"
      titleBg="Културни Изживявания"
      subtitleEn="Immerse yourself in Bulgarian culture through museums, galleries, and historical sites"
      subtitleBg="Потопете се в българската култура чрез музеи, галерии и исторически места"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesCulturalPage;
