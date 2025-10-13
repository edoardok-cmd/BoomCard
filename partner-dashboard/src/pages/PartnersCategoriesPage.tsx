import React from 'react';
import GenericPage from '../components/templates/GenericPage';

const PartnersCategoriesPage: React.FC = () => {
  return (
    <GenericPage
      titleEn="Partners by Category"
      titleBg="Партньори по Категория"
      subtitleEn="Browse our partner network organized by business category"
      subtitleBg="Разгледайте нашата партньорска мрежа организирана по бизнес категория"
      showEmptyState
      emptyIcon="🏪"
      emptyTitleEn="Explore Partner Categories"
      emptyTitleBg="Разгледай Партньорски Категории"
      emptyTextEn="Select a category to find partners"
      emptyTextBg="Изберете категория, за да намерите партньори"
    />
  );
};

export default PartnersCategoriesPage;
