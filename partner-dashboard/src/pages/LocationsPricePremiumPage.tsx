import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffers } from '../hooks/useOffers';

const LocationsPricePremiumPage: React.FC = () => {
  const { data, isLoading } = useOffers({ minPrice: 150, maxPrice: 400 });
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Premium (293-782 BGN / €150-400) - ${offers.length} Offers`}
      titleBg={`Премиум (293-782 лв. / €150-400) - ${offers.length} Оферти`}
      subtitleEn="Premium venues for discerning travelers"
      subtitleBg="Премиум места за взискателни пътници"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default LocationsPricePremiumPage;
