import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesEducationalPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('educational');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Educational Experiences"
      titleBg="Образователни Изживявания"
      subtitleEn="Learn new skills: Cooking classes, Dance lessons, and Art workshops"
      subtitleBg="Научете нови умения: Готварски класове, Танцови уроци и Художествени работилници"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesEducationalPage;
