import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesMuseumsPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('museums');
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
      titleEn="Cultural Activities"
      titleBg="Културни Дейности"
      subtitleEn="Discover Bulgaria's cultural heritage: Museums, Art galleries, and Historical sites"
      subtitleBg="Открийте културното наследство на България: Музеи, Художествени галерии и Исторически места"
      offers={offers}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesMuseumsPage;
