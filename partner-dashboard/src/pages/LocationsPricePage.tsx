import React from 'react';
import GenericPage from '../components/templates/GenericPage';

const LocationsPricePage: React.FC = () => {
  return (
    <GenericPage
      titleEn="Browse by Price Range"
      titleBg="Разгледай по Ценова Категория"
      subtitleEn="Find venues that match your budget: Mid-range (150-250 BGN), High-end (250-400 BGN), and Luxury (400+ BGN)"
      subtitleBg="Намерете места, които отговарят на вашия бюджет: Среден клас (150-250 лв), Висок клас (250-400 лв) и Лукс (400+ лв)"
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
