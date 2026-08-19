import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntities } from '../hooks/useOffers';

const LocationsTypeAllPage: React.FC = () => {
  const { data, isLoading } = useEntities({ limit: 100 });
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn="All Locations"
      titleBg="Всички Места"
      subtitleEn="Browse all available venues and discounts across Bulgaria"
      subtitleBg="Разгледайте всички налични места и отстъпки из България"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default LocationsTypeAllPage;
