import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCity } from '../hooks/useOffers';

const PartnersBanskoPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCity('Bansko');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Bansko Partners (${entities.length})`}
      titleBg={`Банско Партньори (${entities.length})`}
      subtitleEn="Mountain resort partners in Bulgaria's top ski destination"
      subtitleBg="Планински курортни партньори в най-добрата ски дестинация на България"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PartnersBanskoPage;
