import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCity } from '../hooks/useOffers';

const PartnersVarnaPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCity('Varna');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Varna Partners (${entities.length})`}
      titleBg={`Варна Партньори (${entities.length})`}
      subtitleEn="Explore partner venues along the Black Sea coast"
      subtitleBg="Разгледайте партньорски места по Черноморското крайбрежие"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PartnersVarnaPage;
