import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCity } from '../hooks/useOffers';

const PartnersPlovdivPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCity('Plovdiv');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Plovdiv Partners (${entities.length})`}
      titleBg={`Пловдив Партньори (${entities.length})`}
      subtitleEn="Discover our growing partner network in Plovdiv"
      subtitleBg="Открийте нашата растяща партньорска мрежа в Пловдив"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PartnersPlovdivPage;
