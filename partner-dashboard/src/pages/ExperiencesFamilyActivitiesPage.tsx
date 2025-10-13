import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesFamilyActivitiesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('family-activities');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Family Activities"
      titleBg="Семейни Дейности"
      subtitleEn="Perfect family outings: Zoos, Theme parks, and Interactive experiences"
      subtitleBg="Перфектни семейни излети: Зоопаркове, Тематични паркове и Интерактивни изживявания"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesFamilyActivitiesPage;
