import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffers } from '../hooks/useOffers';

const LocationsPriceBudgetPage: React.FC = () => {
  const { data, isLoading } = useOffers({ minPrice: 0, maxPrice: 150 });
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn={`Budget (Under 293 BGN / €150) - ${offers.length} Offers`}
      titleBg={`Бюджет (Под 293 лв. / €150) - ${offers.length} Оферти`}
      subtitleEn="Great value venues at budget-friendly prices"
      subtitleBg="Отлична стойност на бюджетни цени"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default LocationsPriceBudgetPage;
