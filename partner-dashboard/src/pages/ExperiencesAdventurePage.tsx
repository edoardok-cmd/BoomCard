import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesAdventurePage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('adventure');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Adventure Activities"
      titleBg="Приключенски Дейности"
      subtitleEn="Thrilling outdoor adventures: Air sports, Water activities, Mountain expeditions, and Winter sports"
      subtitleBg="Вълнуващи приключения на открито: Въздушни спортове, Водни дейности, Планински експедиции и Зимни спортове"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesAdventurePage;
