import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Check, ArrowRight, CreditCard } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const PageContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
`;

const HeroSection = styled.section`
  padding: 6rem 2rem 4rem;
  text-align: center;
`;

const HeroTitle = styled(motion.h1)`
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 1.5rem;
  color: #1a1a1a;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const HeroSubtitle = styled(motion.p)`
  font-size: 1.5rem;
  color: #6b7280;
  margin-bottom: 3rem;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
`;

const BillingToggle = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 4rem;
`;

const ToggleButton = styled.button<{ $active: boolean }>`
  padding: 0.75rem 2rem;
  border-radius: 9999px;
  border: none;
  background: ${props => props.$active ? '#1a1a1a' : 'transparent'};
  color: ${props => props.$active ? 'white' : '#6b7280'};
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    background: ${props => props.$active ? '#1a1a1a' : '#f3f4f6'};
  }
`;

const SaveBadge = styled.span`
  background: #10b981;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
`;

const PlansGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem 5rem;
`;

const PlanCard = styled(motion.div)<{ $featured?: boolean }>`
  background: white;
  border-radius: 1rem;
  padding: 2.5rem;
  box-shadow: ${props => props.$featured ? '0 20px 40px rgba(0, 0, 0, 0.15)' : '0 4px 12px rgba(0, 0, 0, 0.05)'};
  border: ${props => props.$featured ? '2px solid #1a1a1a' : '1px solid #e5e7eb'};
  position: relative;
  transform: ${props => props.$featured ? 'scale(1.05)' : 'scale(1)'};

  @media (max-width: 768px) {
    transform: scale(1);
  }
`;

const FeaturedBadge = styled.div`
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: #1a1a1a;
  color: white;
  padding: 0.5rem 1.5rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
`;

const CardImageContainer = styled.div`
  width: 100%;
  height: 200px;
  margin-bottom: 1.5rem;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
`;

const CardImage = styled.div<{ $color: string; $gradient: string; $borderColor: string }>`
  width: 100%;
  height: 100%;
  background: ${props => props.$gradient};
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.5rem;
  position: relative;
  border-radius: 20px;
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.5),
    0 0 40px ${props => props.$borderColor},
    inset 0 2px 4px rgba(255, 255, 255, 0.1);
  border: 2px solid ${props => props.$borderColor};
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.3),
      transparent
    );
    transition: left 0.5s;
  }

  &:hover::before {
    left: 100%;
  }
`;

const CardLogo = styled.div<{ $color: string }>`
  font-size: 2rem;
  font-weight: 900;
  background: ${props => props.$color};
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -1px;
  text-shadow: 0 2px 10px ${props => props.$color};
  margin-bottom: 0.5rem;
`;

const CardNumber = styled.div`
  font-size: 1.25rem;
  color: #fff;
  letter-spacing: 4px;
  font-family: 'Courier New', monospace;
  font-weight: 600;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
`;

const CardInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`;

const CardHolder = styled.div`
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 0.25rem;
`;

const CardLabel = styled.div<{ $color: string }>`
  font-size: 1.25rem;
  font-weight: 700;
  background: ${props => props.$color};
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-transform: uppercase;
  letter-spacing: 2px;
`;

const CardExpiry = styled.div`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.75rem;
  font-family: 'Courier New', monospace;
`;

const PlanName = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: #1a1a1a;
`;

const PlanDescription = styled.p`
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 2rem;
`;

const PriceContainer = styled.div`
  margin-bottom: 2rem;
`;

const Price = styled.div`
  font-size: 3rem;
  font-weight: 800;
  color: #1a1a1a;
  line-height: 1;
  margin-bottom: 0.5rem;
`;

const PricePeriod = styled.span`
  font-size: 1rem;
  font-weight: 400;
  color: #6b7280;
`;

const DualCurrency = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
`;

const PlanButton = styled(Link)<{ $variant?: 'primary' | 'secondary' }>`
  display: block;
  width: 100%;
  padding: 1rem;
  text-align: center;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.3s;
  background: ${props => props.$variant === 'primary' ? '#1a1a1a' : 'white'};
  color: ${props => props.$variant === 'primary' ? 'white' : '#1a1a1a'};
  border: ${props => props.$variant === 'primary' ? 'none' : '2px solid #1a1a1a'};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
  }
`;

const FeaturesList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 2rem 0;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;
  color: #4b5563;
  font-size: 0.9375rem;

  svg {
    flex-shrink: 0;
    margin-top: 0.125rem;
    color: #10b981;
  }
`;

const FAQSection = styled.section`
  max-width: 800px;
  margin: 0 auto;
  padding: 5rem 2rem;
`;

const FAQTitle = styled.h2`
  font-size: 2.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 3rem;
  color: #1a1a1a;
`;

const FAQItem = styled.div`
  background: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
`;

const FAQQuestion = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 0.5rem;
`;

const FAQAnswer = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.6;
`;

const PricingPublicPage: React.FC = () => {
  const { language } = useLanguage();
  const [isAnnual, setIsAnnual] = useState(false);

  // EUR to BGN exchange rate (approximately 1 EUR = 1.96 BGN)
  const eurToBgn = 1.96;

  const plans = [
    {
      nameEn: 'Black',
      nameBg: 'Черна',
      cardGradient: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)',
      logoGradient: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #ffd700 100%)',
      borderColor: 'rgba(255, 215, 0, 0.3)',
      descEn: 'Essential tier for businesses starting out',
      descBg: 'Основна категория за начинаещи бизнеси',
      monthlyPriceEur: 29,
      annualPriceEur: 290,
      features: [
        { en: 'Standard promotions', bg: 'Стандартни промоции' },
        { en: 'Up to 10 active offers', bg: 'До 10 активни оферти' },
        { en: 'Basic analytics', bg: 'Основни анализи' },
        { en: 'Mobile app access', bg: 'Достъп до мобилно приложение' },
        { en: 'Email support', bg: 'Имейл поддръжка' },
        { en: 'QR code generation', bg: 'Генериране на QR кодове' },
      ],
    },
    {
      nameEn: 'Silver',
      nameBg: 'Сребърна',
      cardGradient: 'linear-gradient(135deg, #71717a 0%, #a1a1aa 50%, #71717a 100%)',
      logoGradient: 'linear-gradient(135deg, #e5e7eb 0%, #f9fafb 50%, #e5e7eb 100%)',
      borderColor: 'rgba(229, 231, 235, 0.5)',
      descEn: 'Better promotions and enhanced features',
      descBg: 'По-добри промоции и подобрени функции',
      monthlyPriceEur: 79,
      annualPriceEur: 790,
      featured: true,
      features: [
        { en: 'Better promotions with priority placement', bg: 'По-добри промоции с приоритетно позициониране' },
        { en: 'Unlimited offers', bg: 'Неограничени оферти' },
        { en: 'Advanced analytics', bg: 'Усъвършенствани анализи' },
        { en: 'Priority support', bg: 'Приоритетна поддръжка' },
        { en: 'Custom branding', bg: 'Персонализиран брандинг' },
        { en: 'Marketing automation', bg: 'Маркетингова автоматизация' },
        { en: 'API access', bg: 'Достъп до API' },
        { en: 'POS integration', bg: 'POS интеграция' },
      ],
    },
    {
      nameEn: 'Gold',
      nameBg: 'Златна',
      cardGradient: 'linear-gradient(135deg, #b45309 0%, #f59e0b 50%, #b45309 100%)',
      logoGradient: 'linear-gradient(135deg, #fbbf24 0%, #fde047 50%, #fbbf24 100%)',
      borderColor: 'rgba(251, 191, 36, 0.5)',
      descEn: 'Exclusive promotions and premium features',
      descBg: 'Ексклузивни промоции и премиум функции',
      monthlyPriceEur: 149,
      annualPriceEur: 1490,
      features: [
        { en: 'Exclusive promotions with top visibility', bg: 'Ексклузивни промоции с топ видимост' },
        { en: 'Featured placement in app', bg: 'Представяне в приложението' },
        { en: 'Everything in Silver', bg: 'Всичко от Сребърна' },
        { en: 'Dedicated account manager', bg: 'Специален акаунт мениджър' },
        { en: 'White-label solution', bg: 'Решение с бяла етикетка' },
        { en: 'Custom integrations', bg: 'Персонализирани интеграции' },
        { en: 'SLA guarantee', bg: 'SLA гаранция' },
        { en: '24/7 phone support', bg: '24/7 телефонна поддръжка' },
        { en: 'Training & onboarding', bg: 'Обучение и адаптиране' },
      ],
    },
  ];

  const faqs = [
    {
      questionEn: 'Can I change my plan later?',
      questionBg: 'Мога ли да променя плана си по-късно?',
      answerEn: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.',
      answerBg: 'Да, можете да надстроите или понижите плана си по всяко време. Промените влизат в сила незабавно.',
    },
    {
      questionEn: 'What payment methods do you accept?',
      questionBg: 'Какви методи за плащане приемате?',
      answerEn: 'We accept all major credit cards, debit cards, and bank transfers for annual plans.',
      answerBg: 'Приемаме всички основни кредитни карти, дебитни карти и банкови преводи за годишни планове.',
    },
    {
      questionEn: 'Is there a setup fee?',
      questionBg: 'Има ли такса за настройка?',
      answerEn: 'No, there are no setup fees or hidden charges. You only pay the monthly or annual subscription.',
      answerBg: 'Не, няма такси за настройка или скрити такси. Плащате само месечния или годишния абонамент.',
    },
    {
      questionEn: 'Can I cancel anytime?',
      questionBg: 'Мога ли да откажа по всяко време?',
      answerEn: 'Yes, you can cancel your subscription at any time. No questions asked.',
      answerBg: 'Да, можете да откажете абонамента си по всяко време. Без допълнителни въпроси.',
    },
  ];

  return (
    <PageContainer>
      <HeroSection>
        <HeroTitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {language === 'bg' ? 'Прости, прозрачни цени' : 'Simple, Transparent Pricing'}
        </HeroTitle>
        <HeroSubtitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {language === 'bg'
            ? 'Изберете перфектния план за вашия бизнес'
            : 'Choose the perfect plan for your business'}
        </HeroSubtitle>

        <BillingToggle>
          <ToggleButton $active={!isAnnual} onClick={() => setIsAnnual(false)}>
            {language === 'bg' ? 'Месечно' : 'Monthly'}
          </ToggleButton>
          <ToggleButton $active={isAnnual} onClick={() => setIsAnnual(true)}>
            {language === 'bg' ? 'Годишно' : 'Annual'}
          </ToggleButton>
          <SaveBadge>{language === 'bg' ? 'Спести 20%' : 'Save 20%'}</SaveBadge>
        </BillingToggle>
      </HeroSection>

      <PlansGrid>
        {plans.map((plan, index) => (
          <PlanCard
            key={index}
            $featured={plan.featured}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            {plan.featured && (
              <FeaturedBadge>
                {language === 'bg' ? 'Най-популярен' : 'Most Popular'}
              </FeaturedBadge>
            )}

            <CardImageContainer>
              <CardImage
                $color={plan.logoGradient}
                $gradient={plan.cardGradient}
                $borderColor={plan.borderColor}
              >
                <div>
                  <CardLogo $color={plan.logoGradient}>BOOM</CardLogo>
                  <CardNumber>•••• •••• •••• 2024</CardNumber>
                </div>
                <CardInfo>
                  <div>
                    <CardHolder>
                      {language === 'bg' ? 'ПРИТЕЖАТЕЛ' : 'CARD HOLDER'}
                    </CardHolder>
                  </div>
                  <CardExpiry>12/25</CardExpiry>
                </CardInfo>
              </CardImage>
            </CardImageContainer>

            <PlanName>{language === 'bg' ? plan.nameBg : plan.nameEn}</PlanName>
            <PlanDescription>
              {language === 'bg' ? plan.descBg : plan.descEn}
            </PlanDescription>

            <PriceContainer>
              <Price>
                €{isAnnual ? Math.floor(plan.annualPriceEur / 12) : plan.monthlyPriceEur}
                <PricePeriod>/{language === 'bg' ? 'месец' : 'month'}</PricePeriod>
              </Price>
              <DualCurrency>
                {Math.floor((isAnnual ? Math.floor(plan.annualPriceEur / 12) : plan.monthlyPriceEur) * eurToBgn)} BGN / {language === 'bg' ? 'месец' : 'month'}
              </DualCurrency>
              {isAnnual && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  {language === 'bg' ? 'Плащане годишно' : 'Billed annually'}: €{plan.annualPriceEur} ({Math.floor(plan.annualPriceEur * eurToBgn)} BGN)
                </p>
              )}
            </PriceContainer>

            <PlanButton
              to="/register/partner"
              $variant={plan.featured ? 'primary' : 'secondary'}
            >
              {language === 'bg' ? 'Започнете сега' : 'Get Started'}
            </PlanButton>

            <FeaturesList>
              {plan.features.map((feature, i) => (
                <FeatureItem key={i}>
                  <Check size={18} />
                  <span>{language === 'bg' ? feature.bg : feature.en}</span>
                </FeatureItem>
              ))}
            </FeaturesList>
          </PlanCard>
        ))}
      </PlansGrid>

      <FAQSection>
        <FAQTitle>{language === 'bg' ? 'Често задавани въпроси' : 'Frequently Asked Questions'}</FAQTitle>
        {faqs.map((faq, index) => (
          <FAQItem key={index}>
            <FAQQuestion>{language === 'bg' ? faq.questionBg : faq.questionEn}</FAQQuestion>
            <FAQAnswer>{language === 'bg' ? faq.answerBg : faq.answerEn}</FAQAnswer>
          </FAQItem>
        ))}
      </FAQSection>
    </PageContainer>
  );
};

export default PricingPublicPage;
