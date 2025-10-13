import React from 'react';
import GenericPage from '../components/templates/GenericPage';

const PartnersRegionsPage: React.FC = () => {
  return (
    <GenericPage
      titleEn="Partners by Region"
      titleBg="Партньори по Регион"
      subtitleEn="Find partner venues organized by geographic region"
      subtitleBg="Намерете партньорски места организирани по географски регион"
      showEmptyState
      emptyIcon="🗺️"
      emptyTitleEn="Browse by Region"
      emptyTitleBg="Разгледай по Регион"
      emptyTextEn="Select a region to view partners"
      emptyTextBg="Изберете регион, за да видите партньори"
    />
  );
};

export default PartnersRegionsPage;
