import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useEntities } from '../hooks/useOffers';

const LocationsPriceLuxuryPage: React.FC = () => {
  const { data, isLoading } = useEntities({ minPrice: 400 });
  const entities = data?.data || [];

  return (
    <GenericPage
      titleEn={`Luxury (782+ BGN / €400+) - ${entities.length} Offers`}
      titleBg={`Лукс (782+ лв. / €400+) - ${entities.length} Отстъпки`}
      subtitleEn="Exclusive luxury venues for the finest experience"
      subtitleBg="Ексклузивни луксозни места за най-доброто изживяване"
      entities={entities}
      isLoading={isLoading}
    />
  );
};

export default LocationsPriceLuxuryPage;
