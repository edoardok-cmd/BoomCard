import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntitiesByCity } from '../hooks/useOffers';

const PartnersSofiaPage: React.FC = () => {
  const { data, isLoading } = useEntitiesByCity('Sofia');
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Sofia Partners (${entities.length})`}
      titleBg={`София Партньори (${entities.length})`}
      subtitleEn="Connect with our partner network in Bulgaria's capital"
      subtitleBg="Свържете се с нашата партньорска мрежа в столицата на България"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default PartnersSofiaPage;
