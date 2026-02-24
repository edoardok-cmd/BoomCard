import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCity } from '../hooks/useOffers';

const LocationsBanskoPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCity('Bansko');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Bansko (${entities.length} Offers)`}
      titleBg={`Банско (${entities.length} Оферти)`}
      subtitleEn="Bulgaria's premier ski destination with exclusive mountain resort offers"
      subtitleBg="Най-добрата ски дестинация в България с ексклузивни планински оферти"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default LocationsBanskoPage;
