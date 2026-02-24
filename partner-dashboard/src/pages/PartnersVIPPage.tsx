import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntities } from '../hooks/useOffers';

const PartnersVIPPage: React.FC = () => {
  const { data, isLoading } = useEntities({ featured: true, limit: 50 });
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn="VIP Partners"
      titleBg="VIP Партньори"
      subtitleEn="Access exclusive deals from our most prestigious partner venues"
      subtitleBg="Достъп до ексклузивни сделки от нашите най-престижни партньорски места"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PartnersVIPPage;
