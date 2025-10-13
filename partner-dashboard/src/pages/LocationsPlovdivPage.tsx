import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCity } from '../hooks/useOffers';

const LocationsPlovdivPage: React.FC = () => {
  const { data, isLoading } = useOffersByCity('Plovdiv');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Plovdiv (${offers.length} Offers)`}
      titleBg={`Пловдив (${offers.length} Оферти)`}
      subtitleEn="Experience Bulgaria's cultural capital with exclusive venue offers"
      subtitleBg="Изживейте културната столица на България с ексклузивни оферти"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default LocationsPlovdivPage;
