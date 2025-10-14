import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const TextContent = styled.div`
  line-height: 1.8;
  color: var(--color-text-secondary);

  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-primary);
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

const TermsPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <GenericPage
      titleEn="Terms & Conditions"
      titleBg="Общи Условия"
      subtitleEn="Please read these terms carefully before using BoomCard"
      subtitleBg="Моля, прочетете внимателно тези условия преди да използвате BoomCard"
    >
      <ContentBlock>
        <TextContent>
          {language === 'bg' ? (
            <>
              <h2>1. Приемане на Условията</h2>
              <p>
                Като използвате платформата BoomCard, вие приемате да спазвате тези общи условия.
              </p>

              <h2>2. Използване на Услугите</h2>
              <p>
                Вие се задължавате да използвате нашите услуги законосъобразно и в съответствие с тези условия.
              </p>

              <h2>3. Политика за Оферти</h2>
              <p>
                Всички оферти са обект на наличност и могат да бъдат променени или прекратени по всяко време.
              </p>

              <h2>4. Отговорности на Потребителя</h2>
              <p>
                Вие сте отговорни за поддържането на сигурността на вашия акаунт и пароли.
              </p>
            </>
          ) : (
            <>
              <h2>1. Acceptance of Terms</h2>
              <p>
                By using the BoomCard platform, you agree to comply with these terms and conditions.
              </p>

              <h2>2. Use of Services</h2>
              <p>
                You agree to use our services lawfully and in accordance with these terms.
              </p>

              <h2>3. Offer Policy</h2>
              <p>
                All offers are subject to availability and may be modified or terminated at any time.
              </p>

              <h2>4. User Responsibilities</h2>
              <p>
                You are responsible for maintaining the security of your account and passwords.
              </p>
            </>
          )}
        </TextContent>
      </ContentBlock>
    </GenericPage>
  );
};

export default TermsPage;
