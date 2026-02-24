import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const ExperiencesRomanticPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('romantic');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Romantic Experiences"
      titleBg="Романтични Изживявания"
      subtitleEn="Create unforgettable memories: Romantic dinners, Couple spa experiences, and Photoshoots"
      subtitleBg="Създайте незабравими спомени: Романтични вечери, СПА за двойки и Фотосесии"
      entities={entities}
      isLoading={isLoading}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesRomanticPage;
