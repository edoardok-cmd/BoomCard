import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCategory } from '../hooks/useOffers';

const PromotionsExtremePage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCategory('extreme');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn="Extreme Activity Promotions"
      titleBg="Отстъпки за Екстремни Дейности"
      subtitleEn="Adrenaline-pumping adventures including air sports, water activities, mountain expeditions, and winter sports"
      subtitleBg="Приключения пълни с адреналин включващи въздушни спортове, водни дейности, планински експедиции и зимни спортове"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PromotionsExtremePage;
