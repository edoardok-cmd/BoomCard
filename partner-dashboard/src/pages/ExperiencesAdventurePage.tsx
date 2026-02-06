import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesAdventurePage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('adventure');
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
      titleEn="Adventure Activities"
      titleBg="Приключенски Дейности"
      subtitleEn="Thrilling outdoor adventures: Air sports, Water activities, Mountain expeditions, and Winter sports"
      subtitleBg="Вълнуващи приключения на открито: Въздушни спортове, Водни дейности, Планински експедиции и Зимни спортове"
      offers={offers}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesAdventurePage;
