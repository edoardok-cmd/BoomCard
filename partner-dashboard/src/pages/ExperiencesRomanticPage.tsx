import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesRomanticPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('romantic');
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
      titleEn="Romantic Experiences"
      titleBg="Романтични Изживявания"
      subtitleEn="Create unforgettable memories: Romantic dinners, Couple spa experiences, and Photoshoots"
      subtitleBg="Създайте незабравими спомени: Романтични вечери, СПА за двойки и Фотосесии"
      offers={offers}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesRomanticPage;
