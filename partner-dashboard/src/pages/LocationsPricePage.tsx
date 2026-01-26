import React from 'react';
import GenericPage from '../components/templates/GenericPage';

const LocationsPricePage: React.FC = () => {
  return (
    <GenericPage
      titleEn="Browse by Price Range"
      titleBg="Разгледай по Ценова Категория"
      subtitleEn="Find venues that match your budget: Mid-range (293-489 BGN / €150-250), High-end (489-782 BGN / €250-400), and Luxury (782+ BGN / €400+)"
      subtitleBg="Намерете места, които отговарят на вашия бюджет: Среден клас (293-489 лв. / €150-250), Висок клас (489-782 лв. / €250-400) и Лукс (782+ лв. / €400+)"
      showEmptyState
      emptyIcon="💰"
      emptyTitleEn="Filter by Price"
      emptyTitleBg="Филтрирай по Цена"
      emptyTextEn="Choose your price range to see matching venues"
      emptyTextBg="Изберете ценова категория, за да видите съответни места"
    />
  );
};

export default LocationsPricePage;
