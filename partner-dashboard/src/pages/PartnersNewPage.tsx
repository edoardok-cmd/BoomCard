import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntities } from '../hooks/useOffers';

const PartnersNewPage: React.FC = () => {
  const { data, isLoading } = useEntities({ sortBy: 'createdAt', sortOrder: 'desc', limit: 50 });
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn="New Partners"
      titleBg="Нови Партньори"
      subtitleEn="Discover freshly joined partners with exclusive welcome discounts"
      subtitleBg="Открийте новоприсъединени партньори с ексклузивни приветствени отстъпки"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PartnersNewPage;
