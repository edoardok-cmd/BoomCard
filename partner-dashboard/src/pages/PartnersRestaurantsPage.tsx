import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';

const PartnersRestaurantsPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('restaurants');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn="Restaurant Partners"
      titleBg="Ресторантски Партньори"
      subtitleEn="Discover our restaurant partner network across Bulgaria"
      subtitleBg="Открийте нашата мрежа от ресторантски партньори в цяла България"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PartnersRestaurantsPage;
