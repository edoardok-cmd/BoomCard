import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesFamilyActivitiesPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('family-activities');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Family Activities"
      titleBg="Семейни Дейности"
      subtitleEn="Perfect family outings: Zoos, Theme parks, and Interactive experiences"
      subtitleBg="Перфектни семейни излети: Зоопаркове, Тематични паркове и Интерактивни изживявания"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesFamilyActivitiesPage;
