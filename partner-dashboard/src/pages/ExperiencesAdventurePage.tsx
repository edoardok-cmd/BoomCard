import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesAdventurePage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('adventure');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Adventure Activities"
      titleBg="Приключенски Дейности"
      subtitleEn="Thrilling outdoor adventures: Air sports, Water activities, Mountain expeditions, and Winter sports"
      subtitleBg="Вълнуващи приключения на открито: Въздушни спортове, Водни дейности, Планински експедиции и Зимни спортове"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesAdventurePage;
