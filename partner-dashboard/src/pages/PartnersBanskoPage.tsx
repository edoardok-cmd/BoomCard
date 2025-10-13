import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCity } from '../hooks/useOffers';

const PartnersBanskoPage: React.FC = () => {
  const { data, isLoading } = useOffersByCity('Bansko');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Bansko Partners (${offers.length})`}
      titleBg={`Банско Партньори (${offers.length})`}
      subtitleEn="Mountain resort partners in Bulgaria's top ski destination"
      subtitleBg="Планински курортни партньори в най-добрата ски дестинация на България"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PartnersBanskoPage;
