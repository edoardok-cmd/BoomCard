import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';

const VenuesSpaPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('spa-wellness');
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
      titleEn="Spa & Wellness Centers"
      titleBg="Спа и Уелнес Центрове"
      subtitleEn="Rejuvenate your body and mind at Bulgaria's finest spa and wellness centers"
      subtitleBg="Освежете тялото и ума си в най-добрите спа и уелнес центрове в България"
      offers={offers}
      isLoading={isLoading}
      filters={<BoomPlacesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default VenuesSpaPage;
