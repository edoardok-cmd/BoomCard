import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesLearningPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('educational');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Learning Experiences"
      titleBg="Образователни Изживявания"
      subtitleEn="Develop new talents: Cooking classes, Dance lessons, and Art workshops"
      subtitleBg="Развийте нови таланти: Готварски класове, Танцови уроци и Художествени работилници"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesLearningPage;
