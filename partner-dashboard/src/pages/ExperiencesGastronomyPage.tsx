import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { offerToEntity, type Offer } from '../types/entity.types';
import ExperiencesFilters, { defaultExperiencesFilters, type ExperiencesFiltersState } from '../components/common/ExperiencesFilters';

const mockOffers: Offer[] = [
  {
    id: '1',
    title: 'Street Food Tour Sofia',
    titleBg: 'Тур на Улична Храна София',
    description: 'Discover authentic street food across Sofia with local guides',
    descriptionBg: 'Открийте автентична улична храна в София с местни екскурзоводи',
    discount: 30,
    originalPrice: 70,
    discountedPrice: 49,
    category: 'Food Tours',
    categoryBg: 'Кулинарни Турове',
    location: 'Sofia',
    imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
    partnerName: 'Sofia Food Tours',
    path: '/offers/1',
    rating: 4.8,
    reviewCount: 142,
  },
];

const mockEntities = mockOffers.map(offerToEntity);

const ExperiencesGastronomyPage: React.FC = () => {
  const [filters, setFilters] = useState<ExperiencesFiltersState>(defaultExperiencesFilters);

  return (
    <GenericPage
      titleEn="Gastronomy Experiences"
      titleBg="Гастрономични Изживявания"
      subtitleEn="Culinary adventures including street food tours, wine & dine experiences, cooking classes, and farm-to-table dining"
      subtitleBg="Кулинарни приключения включващи турове на улична храна, вино и храна, готварски класове и farm-to-table хранене"
      entities={mockEntities}
      filters={<ExperiencesFilters filters={filters} onChange={setFilters} />}
    />
  );
};

export default ExperiencesGastronomyPage;
