import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesMuseumsPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('museums');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Cultural Activities"
      titleBg="Културни Дейности"
      subtitleEn="Discover Bulgaria's cultural heritage: Museums, Art galleries, and Historical sites"
      subtitleBg="Открийте културното наследство на България: Музеи, Художествени галерии и Исторически места"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesMuseumsPage;
