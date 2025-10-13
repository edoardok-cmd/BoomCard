import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const CategoriesCafesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('cafes');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Cafes & Pastry Shops"
      titleBg="Кафенета и Сладкарници"
      subtitleEn="Indulge in premium coffee and delicious pastries at Bulgaria's finest cafes and bakeries"
      subtitleBg="Насладете се на премиум кафе и вкусни сладкиши в най-добрите кафенета и сладкарници в България"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default CategoriesCafesPage;
