import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesFoodToursPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('food-tours');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Food Experiences"
      titleBg="Кулинарни Изживявания"
      subtitleEn="Explore diverse food experiences including street food tours, wine & dine events, cooking classes, and farm-to-table adventures"
      subtitleBg="Разгледайте разнообразни кулинарни изживявания включващи турове на улична храна, вино и храна, готварски класове и farm-to-table приключения"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesFoodToursPage;
