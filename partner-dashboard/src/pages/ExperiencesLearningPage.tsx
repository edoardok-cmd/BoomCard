import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesLearningPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('educational');
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
      titleEn="Learning Experiences"
      titleBg="Образователни Изживявания"
      subtitleEn="Develop new talents: Cooking classes, Dance lessons, and Art workshops"
      subtitleBg="Развийте нови таланти: Готварски класове, Танцови уроци и Художествени работилници"
      offers={offers}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesLearningPage;
