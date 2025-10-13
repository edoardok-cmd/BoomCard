import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const PromotionsCulturalPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('cultural');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Cultural & Romantic Promotions"
      titleBg="Културни и Романтични Промоции"
      subtitleEn="Enriching experiences including cultural tours, romantic getaways, family activities, and educational workshops"
      subtitleBg="Обогатяващи изживявания включващи културни турове, романтични пътувания, семейни дейности и образователни работилници"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PromotionsCulturalPage;
