import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesEducationalPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('educational');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Educational Experiences"
      titleBg="Образователни Изживявания"
      subtitleEn="Learn new skills: Cooking classes, Dance lessons, and Art workshops"
      subtitleBg="Научете нови умения: Готварски класове, Танцови уроци и Художествени работилници"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesEducationalPage;
