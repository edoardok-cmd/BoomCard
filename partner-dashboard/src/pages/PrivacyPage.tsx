import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const TextContent = styled.div`
  line-height: 1.8;
  color: #374151;

  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #111827;
    margin-bottom: 1rem;
    margin-top: 2rem;

    &:first-child {
      margin-top: 0;
    }
  }

  p {
    margin-bottom: 1rem;
  }
`;

const PrivacyPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <GenericPage
      titleEn="Privacy Policy"
      titleBg="Политика за Поверителност"
      subtitleEn="How we collect, use, and protect your information"
      subtitleBg="Как събираме, използваме и защитаваме вашата информация"
    >
      <ContentBlock>
        <TextContent>
          {language === 'bg' ? (
            <>
              <h2>1. Събиране на Информация</h2>
              <p>
                Ние събираме информация, която ни предоставяте директно, като име, имейл адрес и данни за плащане.
              </p>

              <h2>2. Използване на Информацията</h2>
              <p>
                Вашата информация се използва за предоставяне и подобряване на нашите услуги.
              </p>

              <h2>3. Защита на Данните</h2>
              <p>
                Ние прилагаме индустриални стандарти за защита на вашата лична информация.
              </p>

              <h2>4. Споделяне с Трети Страни</h2>
              <p>
                Ние не продаваме вашата лична информация на трети страни.
              </p>
            </>
          ) : (
            <>
              <h2>1. Information Collection</h2>
              <p>
                We collect information you provide directly to us, such as your name, email address, and payment information.
              </p>

              <h2>2. Use of Information</h2>
              <p>
                Your information is used to provide and improve our services.
              </p>

              <h2>3. Data Protection</h2>
              <p>
                We implement industry-standard measures to protect your personal information.
              </p>

              <h2>4. Third-Party Sharing</h2>
              <p>
                We do not sell your personal information to third parties.
              </p>
            </>
          )}
        </TextContent>
      </ContentBlock>
    </GenericPage>
  );
};

export default PrivacyPage;
