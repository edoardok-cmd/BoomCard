import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCity } from '../hooks/useOffers';

const LocationsBanskoPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCity('Bansko');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Bansko (${entities.length} Discounts)`}
      titleBg={`Банско (${entities.length} Отстъпки)`}
      subtitleEn="Bulgaria's premier ski destination with exclusive mountain resort discounts"
      subtitleBg="Най-добрата ски дестинация в България с ексклузивни планински отстъпки"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default LocationsBanskoPage;
