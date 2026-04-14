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
      a: 'BoomCard ви предоставя достъп до ексклузивни кешбек оферти в стотици места в България. Изберете партньор, сканирайте BOOM стикера на масата, поръчайте, платете сметката и снимайте касовата бележка чрез приложението. Кешбекът се кредитира автоматично след проверка.'
    },
    {
      q: 'Колко струва абонаментът?',
      a: 'Предлагаме три плана: Basic (€8.99/месец), Premium Седмичен (€6.99/седмица) и Premium Месечен (€13.99/месец). Всички планове включват 24-часов безплатен Premium пробен период. Вижте нашата страница с абонаменти за подробности.'
    },
    {
      q: 'Как се изчислява моят процент кешбек?',
      a: 'Кешбекът зависи от отстъпката на партньора. Basic план: до 10%. Premium планове: до 20%. Точният % следва фиксирана матрица — напр. партньор с 20% отстъпка дава 10% кешбек на Basic и 16% на Premium потребители.'
    },
    {
      q: 'Кога мога да изтегля кешбека си?',
      a: 'Кешбекът се изплаща след достигане на минималния праг: €10 за Premium Седмичен, €15 за Premium Месечен, €20 за Basic. Средствата постъпват по регистрираната карта в рамките на 3–5 работни дни.'
    },
    {
      q: 'Изтича ли кешбекът ми?',
      a: 'Да — всяка одобрена транзакция носи 60-дневен период на валидност. Най-старият кешбек изтича първи (каскадно). Това насърчава редовното използване на платформата.'
    },
    {
      q: 'Мога ли да надстроя плана си по-късно?',
      a: 'Да. При надграждане от Premium Седмичен към Premium Месечен се приспада 100% от остатъчната стойност. При надграждане от Basic към Premium се приспада 60% от остатъчната стойност.'
    },
    {
      q: 'Колко време имам да кача касовата бележка?',
      a: 'Качете касовата бележка преди напускане на заведението или малко след плащането. Бележки, качени повече от 1 час след издаването им, може да бъдат насочени към ръчен преглед. Прозорецът за качване се затваря в 6:00 ч. на следващия ден.'
    },
    {
      q: 'Мога ли да откажа абонамента си?',
      a: 'Да, можете да откажете абонамента си по всяко време от вашия профил. Достъпът ви продължава до края на текущия период на фактуриране.'
    },
    {
      q: 'Как мога да стана партньор?',
      a: 'Посетете нашата страница за партньори и попълнете формуляра за кандидатстване. Нашият екип ще се свърже с вас в рамките на 48 часа.'
    },
  ] : [
    {
      q: 'How does BoomCard work?',
      a: 'BoomCard gives you access to exclusive cashback offers at hundreds of venues across Bulgaria. Choose a partner, scan the BOOM sticker at your table, order, pay the bill, and photograph your receipt through the app. Cashback is credited automatically after verification.'
    },
    {
      q: 'How much does a subscription cost?',
      a: 'We offer three plans: Basic (€8.99/month), Premium Weekly (€6.99/week), and Premium Monthly (€13.99/month). All plans include a 24-hour free Premium trial. See our subscriptions page for details.'
    },
    {
      q: 'How is my cashback percentage calculated?',
      a: 'Cashback depends on the discount the partner offers. Basic plan: up to 10%. Premium plans: up to 20%. The exact % follows a fixed matrix — e.g. a partner offering 20% discount gives Basic users 10% and Premium users 16% cashback.'
    },
    {
      q: 'When can I withdraw my cashback?',
      a: 'Cashback is paid out once your balance reaches the minimum threshold: €10 for Premium Weekly, €15 for Premium Monthly, €20 for Basic. Funds arrive to your registered card within 3–5 business days.'
    },
    {
      q: 'Does my cashback expire?',
      a: 'Yes — each approved transaction carries a 60-day cashback window. The oldest cashback expires first (cascading). This encourages regular use of the platform.'
    },
    {
      q: 'Can I upgrade my plan later?',
      a: 'Yes. Upgrading from Premium Weekly to Premium Monthly credits 100% of the remaining weekly value. Upgrading from Basic to Premium credits 60% of the remaining Basic value.'
    },
    {
      q: 'How long do I have to upload my receipt?',
      a: 'Upload your receipt before leaving the venue or shortly after paying. Receipts uploaded more than 1 hour after issuance may be flagged for manual review. The upload window closes at 6am the following day.'
    },
    {
      q: 'Can I cancel my subscription?',
      a: 'Yes, you can cancel your subscription at any time from your profile settings. Your access continues until the end of the current billing period.'
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
