import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCity } from '../hooks/useOffers';

const LocationsPlovdivPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCity('Plovdiv');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Plovdiv (${entities.length} Offers)`}
      titleBg={`Пловдив (${entities.length} Оферти)`}
      subtitleEn="Experience Bulgaria's cultural capital with exclusive venue offers"
      subtitleBg="Изживейте културната столица на България с ексклузивни оферти"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default LocationsPlovdivPage;
