import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesFoodToursPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('food-tours');
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
      titleEn="Food Experiences"
      titleBg="Кулинарни Изживявания"
      subtitleEn="Explore diverse food experiences including street food tours, wine & dine events, cooking classes, and farm-to-table adventures"
      subtitleBg="Разгледайте разнообразни кулинарни изживявания включващи турове на улична храна, вино и храна, готварски класове и farm-to-table приключения"
      offers={offers}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesFoodToursPage;
