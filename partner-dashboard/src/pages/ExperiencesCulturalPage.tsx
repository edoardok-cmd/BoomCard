import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesCulturalPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('cultural');
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
      titleEn="Cultural Experiences"
      titleBg="Културни Изживявания"
      subtitleEn="Immerse yourself in Bulgarian culture through museums, galleries, and historical sites"
      subtitleBg="Потопете се в българската култура чрез музеи, галерии и исторически места"
      offers={offers}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesCulturalPage;
