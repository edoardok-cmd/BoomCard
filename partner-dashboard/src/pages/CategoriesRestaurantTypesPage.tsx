import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const CategoriesRestaurantTypesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('restaurants');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Restaurant Types"
      titleBg="Типове Ресторанти"
      subtitleEn="Explore diverse dining options: Fine dining, Casual restaurants, Fast casual, and Ethnic cuisines"
      subtitleBg="Разгледайте разнообразни опции за хранене: Fine dining, Casual ресторанти, Fast casual и Етнически кухни"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default CategoriesRestaurantTypesPage;
