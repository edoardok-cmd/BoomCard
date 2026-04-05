import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';
import { getInitialCategoriesFromType } from '../types/categories.types';
import { filterEntities } from '../utils/filterEntities';

const VenuesHotelTypesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { data, isLoading } = useEntitiesByCategory('hotels');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<BoomPlacesFiltersState>(() => ({
    categories: getInitialCategoriesFromType('accommodation', searchParams.get('type')),
    locations: [],
    nearMe: false,
    discountRanges: [],
    ratingRanges: [],
    priceLevels: [],
  }));

  const filteredEntities = useMemo(() => filterEntities(entities, filters), [entities, filters]);

  return (
    <GenericPage
      titleEn="Accommodation Types"
      titleBg="Типове Настаняване"
      subtitleEn="BOOM Card gives you access to exclusive offers with up to 24% cashback, based on your chosen plan."
      subtitleBg="BOOM Card ти дава достъп до ексклузивни оферти с до 24% кешбек, според избрания от теб план."
      entities={filteredEntities}
      isLoading={isLoading}
      filters={<BoomPlacesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default VenuesHotelTypesPage;
