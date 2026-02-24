import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesCulturalPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('cultural');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Cultural Experiences"
      titleBg="Културни Изживявания"
      subtitleEn="Immerse yourself in Bulgarian culture through museums, galleries, and historical sites"
      subtitleBg="Потопете се в българската култура чрез музеи, галерии и исторически места"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesCulturalPage;
