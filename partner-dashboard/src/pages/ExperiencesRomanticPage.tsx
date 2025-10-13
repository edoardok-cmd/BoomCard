import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const ExperiencesRomanticPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('romantic');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Romantic Experiences"
      titleBg="Романтични Изживявания"
      subtitleEn="Create unforgettable memories: Romantic dinners, Couple spa experiences, and Photoshoots"
      subtitleBg="Създайте незабравими спомени: Романтични вечери, СПА за двойки и Фотосесии"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default ExperiencesRomanticPage;
