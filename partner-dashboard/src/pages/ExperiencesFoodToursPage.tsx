import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesFoodToursPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('food-tours');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Food Experiences"
      titleBg="Кулинарни Изживявания"
      subtitleEn="Explore diverse food experiences including street food tours, wine & dine events, cooking classes, and farm-to-table adventures"
      subtitleBg="Разгледайте разнообразни кулинарни изживявания включващи турове на улична храна, вино и храна, готварски класове и farm-to-table приключения"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesFoodToursPage;
