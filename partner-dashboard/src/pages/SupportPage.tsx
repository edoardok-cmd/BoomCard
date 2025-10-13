import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const SupportGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
`;

const SupportCard = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  border: 2px solid #e5e7eb;
  transition: border-color 0.2s;

  &:hover {
    border-color: #000000;
  }
`;

const CardTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: #111827;
`;

const CardText = styled.p`
  color: #6b7280;
  line-height: 1.6;
`;

const SupportPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <GenericPage
      titleEn="Support Center"
      titleBg="Център за Поддръжка"
      subtitleEn="Find answers and get help with BoomCard"
      subtitleBg="Намерете отговори и получете помощ с BoomCard"
    >
      <SupportGrid>
        <SupportCard>
          <CardTitle>{language === 'bg' ? 'Често Задавани Въпроси' : 'Frequently Asked Questions'}</CardTitle>
          <CardText>
            {language === 'bg'
              ? 'Намерете бързи отговори на най-често задаваните въпроси.'
              : 'Find quick answers to the most common questions.'}
          </CardText>
        </SupportCard>

        <SupportCard>
          <CardTitle>{language === 'bg' ? 'Имейл Поддръжка' : 'Email Support'}</CardTitle>
          <CardText>
            {language === 'bg'
              ? 'Изпратете ни имейл на support@boomcard.bg и ние ще отговорим в рамките на 24 часа.'
              : 'Send us an email at support@boomcard.bg and we\'ll respond within 24 hours.'}
          </CardText>
        </SupportCard>

        <SupportCard>
          <CardTitle>{language === 'bg' ? 'Телефонна Поддръжка' : 'Phone Support'}</CardTitle>
          <CardText>
            {language === 'bg'
              ? 'Обадете ни се на +359 2 123 4567 (Пон-Пет 9:00-18:00)'
              : 'Call us at +359 2 123 4567 (Mon-Fri 9:00-18:00)'}
          </CardText>
        </SupportCard>

        <SupportCard>
          <CardTitle>{language === 'bg' ? 'Чат Поддръжка' : 'Live Chat'}</CardTitle>
          <CardText>
            {language === 'bg'
              ? 'Използвайте нашия чат за незабавна помощ (налична в работно време).'
              : 'Use our live chat for instant help (available during business hours).'}
          </CardText>
        </SupportCard>
      </SupportGrid>
    </GenericPage>
  );
};

export default SupportPage;
