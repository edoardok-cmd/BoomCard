import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';

const PromotionsCulturalPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('cultural');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn="Cultural & Romantic Promotions"
      titleBg="Културни и Романтични Промоции"
      subtitleEn="Enriching experiences including cultural tours, romantic getaways, family activities, and educational workshops"
      subtitleBg="Обогатяващи изживявания включващи културни турове, романтични пътувания, семейни дейности и образователни работилници"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PromotionsCulturalPage;
