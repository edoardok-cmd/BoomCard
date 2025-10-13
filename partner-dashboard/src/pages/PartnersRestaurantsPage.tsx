import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const PartnersRestaurantsPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('restaurants');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Restaurant Partners"
      titleBg="Ресторантски Партньори"
      subtitleEn="Discover our restaurant partner network across Bulgaria"
      subtitleBg="Открийте нашата мрежа от ресторантски партньори в цяла България"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PartnersRestaurantsPage;
