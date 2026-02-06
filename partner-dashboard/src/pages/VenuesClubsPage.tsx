import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';

const VenuesClubsPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('clubs');
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
      titleEn="Clubs & Night Venues"
      titleBg="Клубове и Нощни Заведения"
      subtitleEn="Experience the best nightlife with exclusive access to top clubs and entertainment venues"
      subtitleBg="Изживейте най-добрия нощен живот с ексклузивен достъп до топ клубове и развлекателни места"
      offers={offers}
      isLoading={isLoading}
      filters={<BoomPlacesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default VenuesClubsPage;
