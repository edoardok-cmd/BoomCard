import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntities } from '../hooks/useOffers';

const LocationsPriceBudgetPage: React.FC = () => {
  const { data, isLoading } = useEntities({ minPrice: 0, maxPrice: 150 });
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Budget (Under 293 BGN / €150) - ${entities.length} Offers`}
      titleBg={`Бюджет (Под 293 лв. / €150) - ${entities.length} Оферти`}
      subtitleEn="Great value venues at budget-friendly prices"
      subtitleBg="Отлична стойност на бюджетни цени"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default LocationsPriceBudgetPage;
