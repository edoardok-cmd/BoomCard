import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffers } from '../hooks/useOffers';

const PartnersVIPPage: React.FC = () => {
  const { data, isLoading } = useOffers({ featured: true, limit: 50 });
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="VIP Partners"
      titleBg="VIP Партньори"
      subtitleEn="Access exclusive deals from our most prestigious partner venues"
      subtitleBg="Достъп до ексклузивни сделки от нашите най-престижни партньорски места"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PartnersVIPPage;
