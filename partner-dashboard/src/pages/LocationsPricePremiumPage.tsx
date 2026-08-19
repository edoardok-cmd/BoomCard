import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntities } from '../hooks/useOffers';

const LocationsPricePremiumPage: React.FC = () => {
  const { data, isLoading } = useEntities({ minPrice: 150, maxPrice: 400 });
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Premium (293-782 BGN / €150-400) - ${entities.length} Discounts`}
      titleBg={`Премиум (293-782 лв. / €150-400) - ${entities.length} Отстъпки`}
      subtitleEn="Premium venues for discerning travelers"
      subtitleBg="Премиум места за взискателни пътници"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default LocationsPricePremiumPage;
