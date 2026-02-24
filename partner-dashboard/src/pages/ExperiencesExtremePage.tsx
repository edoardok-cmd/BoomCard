import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesExtremePage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('extreme-sports');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Extreme Experiences"
      titleBg="Екстремни Изживявания"
      subtitleEn="Adrenaline-pumping adventures including air sports, water activities, mountain expeditions, and winter sports"
      subtitleBg="Приключения пълни с адреналин включващи въздушни спортове, водни дейности, планински експедиции и зимни спортове"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesExtremePage;
