import React from 'react';
import GenericPage from '../components/templates/GenericPage';

const MediaPhotosPage: React.FC = () => {
  return (
    <GenericPage
      titleEn="Photos by Type"
      titleBg="Снимки по Тип"
      subtitleEn="Browse photos categorized by type: Exterior/Interior views, Food photography, Activities, and Before/After transformations"
      subtitleBg="Разгледайте снимки категоризирани по тип: Exterior/Interior, Храна, Дейности и Before/After трансформации"
      showEmptyState
      emptyIcon="🖼️"
      emptyTitleEn="Photos Coming Soon"
      emptyTitleBg="Снимките Идват Скоро"
      emptyTextEn="We're organizing our photo collection by category"
      emptyTextBg="Организираме нашата колекция от снимки по категория"
    />
  );
};

export default MediaPhotosPage;
