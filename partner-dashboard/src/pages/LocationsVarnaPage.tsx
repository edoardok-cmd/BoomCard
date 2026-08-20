import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCity } from '../hooks/useOffers';

const LocationsVarnaPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCity('Varna');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Varna (${entities.length} Discounts)`}
      titleBg={`Варна (${entities.length} Отстъпки)`}
      subtitleEn="Enjoy the Black Sea coast with amazing beach and dining discounts"
      subtitleBg="Насладете се на Черноморското крайбрежие с невероятни плажни и ресторантски отстъпки"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default LocationsVarnaPage;
