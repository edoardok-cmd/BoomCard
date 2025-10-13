import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const CategoriesWineriesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('wineries');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Wineries & Tasting Halls"
      titleBg="Винарни и Дегустационни Зали"
      subtitleEn="Discover Bulgaria's rich wine culture at premier wineries and tasting halls"
      subtitleBg="Открийте богатата винена култура на България в премиум винарни и дегустационни зали"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default CategoriesWineriesPage;
