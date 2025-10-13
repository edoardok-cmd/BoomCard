import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCity } from '../hooks/useOffers';

const LocationsSofiaPage: React.FC = () => {
  const { data, isLoading } = useOffersByCity('Sofia');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Sofia (${offers.length} Offers)`}
      titleBg={`София (${offers.length} Оферти)`}
      subtitleEn="Discover exclusive offers from top venues in Bulgaria's capital"
      subtitleBg="Открийте ексклузивни оферти от топ места в столицата на България"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default LocationsSofiaPage;
