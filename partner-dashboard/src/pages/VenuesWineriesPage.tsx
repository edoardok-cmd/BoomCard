import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
import BoomPlacesFilters, { BoomPlacesFiltersState } from '../components/common/BoomPlacesFilters';

const VenuesWineriesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('wineries');
  const offers = data?.data || [];

  const [filters, setFilters] = useState<BoomPlacesFiltersState>({
    categories: [],
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
      subtitleEn="BOOM Card gives you access to exclusive offers with up to 20% discount, based on your chosen plan."
      subtitleBg="BOOM Card ти дава достъп до ексклузивни оферти с до 20% отстъпка, според избрания от теб план."
      offers={offers}
      isLoading={isLoading}
      filters={<BoomPlacesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default VenuesWineriesPage;
