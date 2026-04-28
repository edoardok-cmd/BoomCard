import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const Message = styled.p`
  font-size: 1.125rem;
  color: #6b7280;
  line-height: 1.7;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const ComingSoonPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <GenericPage
      titleEn="Coming Soon"
      titleBg="Скоро очаквайте"
      subtitleEn="This feature is under development"
      subtitleBg="Тази функция е в процес на разработка"
    >
      <Message>
        {language === 'bg'
          ? 'Работим по тази страница. Очаквайте я скоро!'
          : 'We are working on this page. Stay tuned!'}
      </Message>
    </GenericPage>
  );
};

export default ComingSoonPage;
