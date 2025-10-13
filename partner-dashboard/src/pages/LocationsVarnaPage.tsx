import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCity } from '../hooks/useOffers';

const LocationsVarnaPage: React.FC = () => {
  const { data, isLoading } = useOffersByCity('Varna');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Varna (${offers.length} Offers)`}
      titleBg={`Варна (${offers.length} Оферти)`}
      subtitleEn="Enjoy the Black Sea coast with amazing beach and dining offers"
      subtitleBg="Насладете се на Черноморското крайбрежие с невероятни плажни и ресторантски оферти"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default LocationsVarnaPage;
