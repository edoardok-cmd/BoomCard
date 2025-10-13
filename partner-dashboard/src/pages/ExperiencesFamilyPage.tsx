import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesFamilyPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('family-activities');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Family Experiences"
      titleBg="Семейни Изживявания"
      subtitleEn="Fun for the whole family: Zoos, Theme parks, and Family-friendly activities"
      subtitleBg="Забавление за цялото семейство: Зоопаркове, Тематични паркове и Семейни дейности"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesFamilyPage;
