import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesFamilyActivitiesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('family-activities');
  const offers = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>({
    categories: [],
    durations: [],
    formats: [],
    seasons: [],
    participations: [],
    ratingRanges: [],
    priceLevels: [],
  });

  return (
    <GenericPage
      titleEn="Family Activities"
      titleBg="Семейни Дейности"
      subtitleEn="Perfect family outings: Zoos, Theme parks, and Interactive experiences"
      subtitleBg="Перфектни семейни излети: Зоопаркове, Тематични паркове и Интерактивни изживявания"
      offers={offers}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesFamilyActivitiesPage;
