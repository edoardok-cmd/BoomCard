import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';
import { getInitialCategoriesFromType } from '../types/categories.types';

const VenuesCafesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { data, isLoading } = useEntitiesByCategory('cafes');
  const entities = data?.data || [];

  const [filters, setFilters] = useState<BoomPlacesFiltersState>(() => ({
    categories: getInitialCategoriesFromType('cafes', searchParams.get('type')),
    locations: [],
    nearMe: false,
    discountRanges: [],
    ratingRanges: [],
    priceLevels: [],
  }));

  return (
    <GenericPage
      titleEn="Cafes & Pastry Shops"
      titleBg="Кафенета и Сладкарници"
      subtitleEn="BOOM Card gives you access to exclusive offers with up to 20% discount, based on your chosen plan."
      subtitleBg="BOOM Card ти дава достъп до ексклузивни оферти с до 20% отстъпка, според избрания от теб план."
      entities={entities}
      isLoading={isLoading}
      filters={<BoomPlacesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default VenuesCafesPage;
