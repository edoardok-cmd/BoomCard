import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCity } from '../hooks/useOffers';

const PartnersVarnaPage: React.FC = () => {
  const { data, isLoading } = useOffersByCity('Varna');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Varna Partners (${offers.length})`}
      titleBg={`Варна Партньори (${offers.length})`}
      subtitleEn="Explore partner venues along the Black Sea coast"
      subtitleBg="Разгледайте партньорски места по Черноморското крайбрежие"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PartnersVarnaPage;
