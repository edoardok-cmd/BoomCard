import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCity } from '../hooks/useOffers';

const LocationsPlovdivPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCity('Plovdiv');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Plovdiv (${entities.length} Discounts)`}
      titleBg={`Пловдив (${entities.length} Отстъпки)`}
      subtitleEn="Experience Bulgaria's cultural capital with exclusive venue discounts"
      subtitleBg="Изживейте културната столица на България с ексклузивни отстъпки"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default LocationsPlovdivPage;
