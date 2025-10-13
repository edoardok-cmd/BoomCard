import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const ContactGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
`;

const ContactCard = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  text-align: center;
`;

const Icon = styled.div`
  font-size: 3rem;
  margin-bottom: 1rem;
`;

const ContactTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: #111827;
`;

const ContactInfo = styled.div`
  color: #6b7280;
  line-height: 1.6;
`;

const ContactsPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <GenericPage
      titleEn="Contact Us"
      titleBg="Свържете се с нас"
      subtitleEn="We're here to help. Reach out through any of these channels"
      subtitleBg="Ние сме тук, за да помогнем. Свържете се чрез някой от тези канали"
    >
      <ContactGrid>
        <ContactCard>
          <Icon>📧</Icon>
          <ContactTitle>{language === 'bg' ? 'Имейл' : 'Email'}</ContactTitle>
          <ContactInfo>
            info@boomcard.bg<br />
            support@boomcard.bg
          </ContactInfo>
        </ContactCard>

        <ContactCard>
          <Icon>📞</Icon>
          <ContactTitle>{language === 'bg' ? 'Телефон' : 'Phone'}</ContactTitle>
          <ContactInfo>
            +359 2 123 4567<br />
            {language === 'bg' ? 'Пон-Пет 9:00-18:00' : 'Mon-Fri 9:00-18:00'}
          </ContactInfo>
        </ContactCard>

        <ContactCard>
          <Icon>📍</Icon>
          <ContactTitle>{language === 'bg' ? 'Адрес' : 'Address'}</ContactTitle>
          <ContactInfo>
            {language === 'bg' ? 'бул. Витоша 123' : 'Vitosha Blvd 123'}<br />
            {language === 'bg' ? 'София 1000, България' : 'Sofia 1000, Bulgaria'}
          </ContactInfo>
        </ContactCard>
      </ContactGrid>
    </GenericPage>
  );
};

export default ContactsPage;
