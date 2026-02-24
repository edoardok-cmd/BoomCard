import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesFamilyPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('family-activities');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Family Experiences"
      titleBg="Семейни Изживявания"
      subtitleEn="Fun for the whole family: Zoos, Theme parks, and Family-friendly activities"
      subtitleBg="Забавление за цялото семейство: Зоопаркове, Тематични паркове и Семейни дейности"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesFamilyPage;
