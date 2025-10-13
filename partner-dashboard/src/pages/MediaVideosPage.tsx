import React from 'react';
import GenericPage from '../components/templates/GenericPage';

const MediaVideosPage: React.FC = () => {
  return (
    <GenericPage
      titleEn="Videos by Type"
      titleBg="Видеа по Тип"
      subtitleEn="Watch videos organized by type: Time-lapse productions, Customer testimonials, Behind-the-scenes footage, and Live streaming events"
      subtitleBg="Гледайте видеа организирани по тип: Time-lapse продукции, Отзиви на клиенти, Кадри зад кулисите и Стрийминг събития на живо"
      showEmptyState
      emptyIcon="🎥"
      emptyTitleEn="Videos Coming Soon"
      emptyTitleBg="Видеата Идват Скоро"
      emptyTextEn="We're preparing exciting video content for you"
      emptyTextBg="Подготвяме вълнуващо видео съдържание за вас"
    />
  );
};

export default MediaVideosPage;
