import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCity } from '../hooks/useOffers';

const PartnersSofiaPage: React.FC = () => {
  const { data, isLoading } = useOffersByCity('Sofia');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Sofia Partners (${offers.length})`}
      titleBg={`София Партньори (${offers.length})`}
      subtitleEn="Connect with our partner network in Bulgaria's capital"
      subtitleBg="Свържете се с нашата партньорска мрежа в столицата на България"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PartnersSofiaPage;
