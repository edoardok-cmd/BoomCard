import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffers } from '../hooks/useOffers';

const LocationsTypeAllPage: React.FC = () => {
  const { data, isLoading } = useOffers({ limit: 100 });
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="All Locations"
      titleBg="Всички Места"
      subtitleEn="Browse all available venues and offers across Bulgaria"
      subtitleBg="Разгледайте всички налични места и оферти из България"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default LocationsTypeAllPage;
