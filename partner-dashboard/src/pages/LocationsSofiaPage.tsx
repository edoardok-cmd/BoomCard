import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCity } from '../hooks/useOffers';

const LocationsSofiaPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCity('Sofia');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Sofia (${entities.length} Offers)`}
      titleBg={`София (${entities.length} Отстъпки)`}
      subtitleEn="Discover exclusive offers from top venues in Bulgaria's capital"
      subtitleBg="Открийте ексклузивни отстъпки от топ места в столицата на България"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default LocationsSofiaPage;
