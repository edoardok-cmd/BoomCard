import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesRomanticActivitiesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('romantic');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Romantic Experiences"
      titleBg="Романтични Изживявания"
      subtitleEn="Perfect for couples: Romantic dinners, Spa experiences, and Professional photoshoots"
      subtitleBg="Перфектни за двойки: Романтични вечери, СПА изживявания и Професионални фотосесии"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesRomanticActivitiesPage;
