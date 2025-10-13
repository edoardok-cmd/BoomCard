import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffers } from '../hooks/useOffers';

const PartnersNewPage: React.FC = () => {
  const { data, isLoading } = useOffers({ sortBy: 'createdAt', sortOrder: 'desc', limit: 50 });
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="New Partners"
      titleBg="Нови Партньори"
      subtitleEn="Discover freshly joined partners with exclusive welcome offers"
      subtitleBg="Открийте новоприсъединени партньори с ексклузивни приветствени оферти"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default PartnersNewPage;
