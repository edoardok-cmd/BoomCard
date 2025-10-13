import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesLearningPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('educational');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Learning Experiences"
      titleBg="Образователни Изживявания"
      subtitleEn="Develop new talents: Cooking classes, Dance lessons, and Art workshops"
      subtitleBg="Развийте нови таланти: Готварски класове, Танцови уроци и Художествени работилници"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesLearningPage;
