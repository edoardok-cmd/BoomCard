import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCity } from '../hooks/useOffers';

const LocationsBanskoPage: React.FC = () => {
  const { data, isLoading } = useOffersByCity('Bansko');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Bansko (${offers.length} Offers)`}
      titleBg={`Банско (${offers.length} Оферти)`}
      subtitleEn="Bulgaria's premier ski destination with exclusive mountain resort offers"
      subtitleBg="Най-добрата ски дестинация в България с ексклузивни планински оферти"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default LocationsBanskoPage;
