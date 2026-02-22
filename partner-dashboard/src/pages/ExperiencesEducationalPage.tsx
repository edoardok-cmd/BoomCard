import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesEducationalPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('educational');
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
      titleEn="Educational Experiences"
      titleBg="Образователни Изживявания"
      subtitleEn="Learn new skills: Cooking classes, Dance lessons, and Art workshops"
      subtitleBg="Научете нови умения: Готварски класове, Танцови уроци и Художествени работилници"
      offers={offers}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesEducationalPage;
