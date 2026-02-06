import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesFamilyPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('family-activities');
  const offers = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>({
    durations: [],
    formats: [],
    seasons: [],
    participations: [],
    ratingRanges: [],
    priceLevels: [],
  });

  return (
    <GenericPage
      titleEn="Family Experiences"
      titleBg="Семейни Изживявания"
      subtitleEn="Fun for the whole family: Zoos, Theme parks, and Family-friendly activities"
      subtitleBg="Забавление за цялото семейство: Зоопаркове, Тематични паркове и Семейни дейности"
      offers={offers}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesFamilyPage;
