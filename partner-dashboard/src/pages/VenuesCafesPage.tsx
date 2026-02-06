import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';

const VenuesCafesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('cafes');
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
      titleEn="Cafes & Pastry Shops"
      titleBg="Кафенета и Сладкарници"
      subtitleEn="Indulge in premium coffee and delicious pastries at Bulgaria's finest cafes and bakeries"
      subtitleBg="Насладете се на премиум кафе и вкусни сладкиши в най-добрите кафенета и сладкарници в България"
      offers={offers}
      isLoading={isLoading}
      filters={<BoomPlacesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default VenuesCafesPage;
