import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';

const VenuesWineriesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('wineries');
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
      titleEn="Wineries & Tasting Halls"
      titleBg="Винарни и Дегустационни Зали"
      subtitleEn="Discover Bulgaria's rich wine culture at premier wineries and tasting halls"
      subtitleBg="Открийте богатата винена култура на България в премиум винарни и дегустационни зали"
      offers={offers}
      isLoading={isLoading}
      filters={<BoomPlacesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default VenuesWineriesPage;
