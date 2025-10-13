import React from 'react';
import GenericPage from '../components/templates/GenericPage';

const MediaGalleryPage: React.FC = () => {
  return (
    <GenericPage
      titleEn="Photo Gallery & 360° Tours"
      titleBg="Галерия със Снимки и 360° Обиколки"
      subtitleEn="Immersive visual experiences from our partner venues including 360° virtual tours, video reviews, promotional videos, and stunning drone footage"
      subtitleBg="Имерсивни визуални изживявания от нашите партньорски места, включително 360° виртуални обиколки, видео ревюта, промо видеа и зашеметяващи дрон кадри"
      showEmptyState
      emptyIcon="📸"
      emptyTitleEn="Gallery Coming Soon"
      emptyTitleBg="Галерията Идва Скоро"
      emptyTextEn="We're curating an amazing collection of photos and videos"
      emptyTextBg="Подготвяме невероятна колекция от снимки и видеа"
    />
  );
};

export default MediaGalleryPage;
