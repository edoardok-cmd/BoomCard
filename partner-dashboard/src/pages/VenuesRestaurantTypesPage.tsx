import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';

const VenuesRestaurantTypesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('restaurants');
  const offers = data?.data || [];

  const [filters, setFilters] = useState<BoomPlacesFiltersState>({
    locations: [],
    nearMe: false,
    discountRanges: [],
    ratingRanges: [],
    priceLevels: [],
  });

  return (
    <GenericPage
      titleEn="Restaurant Types"
      titleBg="Типове Ресторанти"
      subtitleEn="Explore diverse dining options: Fine dining, Casual restaurants, Fast casual, and Ethnic cuisines"
      subtitleBg="Разгледайте разнообразни опции за хранене: Fine dining, Casual ресторанти, Fast casual и Етнически кухни"
      offers={offers}
      isLoading={isLoading}
      filters={<BoomPlacesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default VenuesRestaurantTypesPage;
