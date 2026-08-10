import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';
import { getInitialCategoriesFromType } from '../types/categories.types';
import { filterEntities } from '../utils/filterEntities';

const VenuesWineriesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { data, isLoading } = useEntitiesByCategory('wineries');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<BoomPlacesFiltersState>(() => ({
    categories: getInitialCategoriesFromType('wineries', searchParams.get('type')),
    locations: [],
    nearMe: false,
    discountRanges: [],
    ratingRanges: [],
    priceLevels: [],
  }));

  const filteredEntities = useMemo(() => filterEntities(entities, filters), [entities, filters]);

  return (
    <GenericPage
      titleEn="Wineries & Tasting Halls"
      titleBg="Винарни и Дегустационни Зали"
      subtitleEn="BOOM Card gives you access to exclusive offers with up to 20% cashback, based on your chosen plan."
      subtitleBg="BOOM Card ти дава достъп до ексклузивни отстъпки с до 20% кешбек, според избрания от теб план."
      entities={filteredEntities}
      isLoading={isLoading}
      filters={<BoomPlacesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default VenuesWineriesPage;
