import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const FAQItem = styled.div`
  margin-bottom: 2rem;
`;

const Question = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.75rem;
`;

const Answer = styled.p`
  color: #6b7280;
  line-height: 1.6;
`;

const FAQPage: React.FC = () => {
  const { language } = useLanguage();

  const faqs = language === 'bg' ? [
    {
      q: 'Как работи BoomCard?',
      a: 'BoomCard ви предоставя достъп до ексклузивни отстъпки в стотици места в България. Просто изберете оферта, запазете я и покажете вашата BoomCard на място.'
    },
    {
      q: 'Колко струва абонаментът?',
      a: 'Предлагаме различни планове - от безплатен основен план до премиум планове с по-големи отстъпки. Вижте нашата страница с абонаменти за подробности.'
    },
    {
      q: 'Мога ли да откажа абонамента си?',
      a: 'Да, можете да откажете абонамента си по всяко време от вашия профил.'
    },
    {
      q: 'Как мога да стана партньор?',
      a: 'Посетете нашата страница за партньори и попълнете формуляра за кандидатстване. Нашият екип ще се свърже с вас в рамките на 48 часа.'
    },
  ] : [
    {
      q: 'How does BoomCard work?',
      a: 'BoomCard provides you access to exclusive discounts at hundreds of venues across Bulgaria. Simply choose an offer, book it, and show your BoomCard at the venue.'
    },
    {
      q: 'How much does a subscription cost?',
      a: 'We offer various plans - from a free basic plan to premium plans with bigger discounts. See our subscriptions page for details.'
    },
    {
      q: 'Can I cancel my subscription?',
      a: 'Yes, you can cancel your subscription at any time from your profile settings.'
    },
    {
      q: 'How can I become a partner?',
      a: 'Visit our partners page and fill out the application form. Our team will contact you within 48 hours.'
    },
  ];

  return (
    <GenericPage
      titleEn="Frequently Asked Questions"
      titleBg="Често Задавани Въпроси"
      subtitleEn="Find answers to common questions about BoomCard"
      subtitleBg="Намерете отговори на често задавани въпроси за BoomCard"
    >
      <ContentBlock>
        {faqs.map((faq, index) => (
          <FAQItem key={index}>
            <Question>{faq.q}</Question>
            <Answer>{faq.a}</Answer>
          </FAQItem>
        ))}
      </ContentBlock>
    </GenericPage>
  );
};

export default FAQPage;
