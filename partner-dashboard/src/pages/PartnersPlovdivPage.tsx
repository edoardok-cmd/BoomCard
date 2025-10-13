import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCity } from '../hooks/useOffers';

const PartnersPlovdivPage: React.FC = () => {
  const { data, isLoading } = useOffersByCity('Plovdiv');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Plovdiv Partners (${offers.length})`}
      titleBg={`Пловдив Партньори (${offers.length})`}
      subtitleEn="Discover our growing partner network in Plovdiv"
      subtitleBg="Открийте нашата растяща партньорска мрежа в Пловдив"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PartnersPlovdivPage;
