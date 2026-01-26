import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffers } from '../hooks/useOffers';

const LocationsPriceLuxuryPage: React.FC = () => {
  const { data, isLoading } = useOffers({ minPrice: 400 });
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Luxury (782+ BGN / €400+) - ${offers.length} Offers`}
      titleBg={`Лукс (782+ лв. / €400+) - ${offers.length} Оферти`}
      subtitleEn="Exclusive luxury venues for the finest experience"
      subtitleBg="Ексклузивни луксозни места за най-доброто изживяване"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default LocationsPriceLuxuryPage;
