import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesRomanticActivitiesPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('romantic');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Romantic Experiences"
      titleBg="Романтични Изживявания"
      subtitleEn="Perfect for couples: Romantic dinners, Spa experiences, and Professional photoshoots"
      subtitleBg="Перфектни за двойки: Романтични вечери, СПА изживявания и Професионални фотосесии"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesRomanticActivitiesPage;
