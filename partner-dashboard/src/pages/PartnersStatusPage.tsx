import React from 'react';
import GenericPage from '../components/templates/GenericPage';

const PartnersStatusPage: React.FC = () => {
  return (
    <GenericPage
      titleEn="Partners by Status"
      titleBg="Партньори по Статус"
      subtitleEn="Browse partners by their membership tier: New partners, VIP, and Exclusive"
      subtitleBg="Разгледайте партньори по техния членски ранг: Нови партньори, VIP и Ексклузивни"
      showEmptyState
      emptyIcon="⭐"
      emptyTitleEn="Browse by Status"
      emptyTitleBg="Разгледай по Статус"
      emptyTextEn="Select a partner tier to view venues"
      emptyTextBg="Изберете партньорски ранг, за да видите места"
    />
  );
};

export default PartnersStatusPage;
