import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffers } from '../hooks/useOffers';

const LocationsPriceLuxuryPage: React.FC = () => {
  const { data, isLoading } = useOffers({ minPrice: 400 });
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Luxury (400+ BGN) - ${offers.length} Offers`}
      titleBg={`Лукс (400+ лв) - ${offers.length} Оферти`}
      subtitleEn="Exclusive luxury venues for the finest experience"
      subtitleBg="Ексклузивни луксозни места за най-доброто изживяване"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default LocationsPriceLuxuryPage;
