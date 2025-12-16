import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ClientCTA from '../components/common/ClientCTA/ClientCTA';
import Button from '../components/common/Button/Button';

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
`;

const HeroSection = styled.section`
  padding: 6rem 2rem 4rem;
  text-align: center;
  background: var(--color-background-secondary);
`;

const HeroTitle = styled(motion.h1)`
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 1.5rem;
  color: var(--color-text-primary);

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const HeroSubtitle = styled(motion.p)`
  font-size: 1.5rem;
  color: var(--color-text-secondary);
  margin-bottom: 3rem;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
`;

const BillingToggleContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 3rem;
  flex-wrap: wrap;
`;

const BillingToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--color-background);
  padding: 0.5rem;
  border-radius: 3rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--color-border);
`;

const ToggleOption = styled.button<{ $active: boolean }>`
  padding: 0.875rem 2rem;
  border-radius: 3rem;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  background: ${props => props.$active ? 'var(--color-primary)' : 'transparent'};
  color: ${props => props.$active ? 'var(--color-secondary)' : 'var(--color-text-secondary)'};
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  &:hover {
    color: ${props => props.$active ? 'var(--color-secondary)' : 'var(--color-text-primary)'};
  }

  @media (max-width: 480px) {
    padding: 0.75rem 1.5rem;
    font-size: 0.9375rem;
  }
`;

const SaveBadge = styled.div`
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 3rem;
  font-size: 0.9375rem;
  font-weight: 700;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  [data-theme="color"] & {
    background: linear-gradient(135deg, #10b981 0%, #00d4ff 100%);
  }

  @media (max-width: 480px) {
    font-size: 0.875rem;
    padding: 0.625rem 1.25rem;
  }
`;

const SubscriptionCardsContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: stretch;
  gap: 4rem;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem 5rem;

  @media (max-width: 968px) {
    flex-direction: column;
    align-items: center;
    gap: 2rem;
  }

  @media (max-width: 480px) {
    gap: 1.5rem;
  }
`;

const PlanCardWrapper = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding-top: 1rem;
  height: 100%;
`;

const FeaturedBadge = styled.div`
  position: absolute;
  top: -2.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%);
  color: #000;
  padding: 0.4rem 1.25rem;
  border-radius: 9999px;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(201, 162, 55, 0.5);
  z-index: 10;
  white-space: nowrap;
`;

const CreditCardPlan = styled(motion.div)<{ $type: 'black' | 'silver' }>`
  width: 360px;
  height: 225px;
  border-radius: 1.25rem;
  padding: 1.75rem 2rem;
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  margin-top: 1.5rem;

  @media (max-width: 768px) {
    width: min(360px, 92vw);
    height: 210px;
    padding: 1.5rem 1.75rem;
  }

  /* Black Card */
  ${props => props.$type === 'black' && `
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 3px solid #ffd700;

    &::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, rgba(255, 215, 0, 0.1) 0%, transparent 70%);
      border-radius: 50%;
    }
  `}

  /* Silver Card */
  ${props => props.$type === 'silver' && `
    background: linear-gradient(135deg, #c0c0c0 0%, #939393 100%);
    border: 2px solid rgba(255, 255, 255, 0.3);

    &::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%);
      border-radius: 50%;
    }
  `}

  /* Light Card */
  ${props => props.$type === 'light' && `
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    border: 2px solid #dee2e6;

    &::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, rgba(0, 0, 0, 0.05) 0%, transparent 70%);
      border-radius: 50%;
    }
  `}

  &:hover {
    transform: translateY(-10px) scale(1.02);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  [data-theme="dark"] & {
    ${props => props.$type === 'black' && `
      background: linear-gradient(135deg, #111827 0%, #1f2937 50%, #0f172a 100%);
      border: 3px solid #06b6d4;
      box-shadow:
        0 10px 40px rgba(6, 182, 212, 0.5),
        0 8px 35px rgba(59, 130, 246, 0.4);

      &::before {
        background: radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'silver' && `
      background: linear-gradient(135deg, #374151 0%, #4b5563 100%);
      border: 3px solid #3b82f6;
      box-shadow:
        0 10px 40px rgba(59, 130, 246, 0.3),
        0 8px 30px rgba(6, 182, 212, 0.2);

      &::before {
        background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'light' && `
      background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
      border: 2px solid #4b5563;
      box-shadow:
        0 10px 40px rgba(0, 0, 0, 0.3),
        0 8px 30px rgba(75, 85, 99, 0.2);

      &::before {
        background: radial-gradient(circle, rgba(75, 85, 99, 0.1) 0%, transparent 70%);
      }
    `}

    &:hover {
      box-shadow:
        0 20px 60px rgba(59, 130, 246, 0.4),
        0 15px 50px rgba(6, 182, 212, 0.35);
    }
  }

  @media (max-width: 480px) {
    width: min(340px, 90vw);
    height: 212px;
  }
`;

const CardLogoText = styled.div<{ $type: 'black' | 'silver' | 'light' }>`
  font-size: 1.75rem;
  font-weight: 900;
  font-family: 'Arial Black', sans-serif;
  letter-spacing: 2px;
  margin-bottom: 1.5rem;
  color: ${props => {
    if (props.$type === 'black') return '#ffd700';
    if (props.$type === 'light') return '#6c757d';
    return '#1a1a1a';
  }};
  text-shadow: ${props => {
    if (props.$type === 'black') return '0 2px 10px rgba(255, 215, 0, 0.3)';
    if (props.$type === 'light') return '0 1px 2px rgba(0, 0, 0, 0.1)';
    return '0 1px 2px rgba(255, 255, 255, 0.5)';
  }};

  [data-theme="dark"] & {
    color: ${props => {
      if (props.$type === 'black') return '#06b6d4';
      if (props.$type === 'light') return '#adb5bd';
      return '#f8fafc';
    }};
    text-shadow: ${props => {
      if (props.$type === 'black') return '0 2px 15px rgba(6, 182, 212, 0.6), 0 0 30px rgba(59, 130, 246, 0.4)';
      if (props.$type === 'light') return '0 2px 8px rgba(255, 255, 255, 0.1)';
      return '0 2px 8px rgba(59, 130, 246, 0.3)';
    }};
  }
`;

const CardNumber = styled.div<{ $type?: 'black' | 'silver' | 'light' }>`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  font-size: 1.25rem;
  color: ${props => {
    if (props.$type === 'black') return 'rgba(255, 255, 255, 0.9)';
    if (props.$type === 'light') return 'rgba(26, 26, 26, 0.8)';
    return 'rgba(26, 26, 26, 0.9)';
  }};
  letter-spacing: 0.25rem;
  font-family: 'Courier New', monospace;

  [data-theme="dark"] & {
    color: ${props => props.$type === 'light' ? 'rgba(173, 181, 189, 0.9)' : 'rgba(248, 250, 252, 0.9)'};
  }
`;

const CardBottomRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`;

const CardHolderName = styled.div<{ $type?: 'black' | 'silver' | 'light' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: ${props => {
    if (props.$type === 'black') return 'rgba(255, 255, 255, 0.95)';
    if (props.$type === 'light') return 'rgba(26, 26, 26, 0.9)';
    return 'rgba(26, 26, 26, 0.95)';
  }};
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 400;

  [data-theme="dark"] & {
    color: ${props => props.$type === 'light' ? 'rgba(173, 181, 189, 0.95)' : 'rgba(248, 250, 252, 0.95)'};
  }
`;

const CardPriceDisplay = styled.div<{ $type: 'black' | 'silver' | 'light' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  text-align: right;
  color: ${props => {
    if (props.$type === 'black') return '#ffd700';
    if (props.$type === 'light') return '#6c757d';
    return 'rgba(26, 26, 26, 0.95)';
  }};
  font-size: 1.75rem;
  font-weight: 400;
  line-height: 1;

  span {
    font-size: 0.875rem;
    font-weight: 400;
    opacity: 0.9;
  }

  [data-theme="dark"] & {
    color: ${props => {
      if (props.$type === 'black') return '#06b6d4';
      if (props.$type === 'light') return '#adb5bd';
      return '#f8fafc';
    }};
    text-shadow: ${props => {
      if (props.$type === 'black') return '0 2px 10px rgba(6, 182, 212, 0.4)';
      if (props.$type === 'light') return '0 1px 4px rgba(173, 181, 189, 0.2)';
      return '0 1px 4px rgba(59, 130, 246, 0.2)';
    }};
  }
`;

const PlanDetails = styled.div`
  margin-top: 2rem;
  width: 360px;
  display: flex;
  flex-direction: column;
  flex: 1;

  @media (max-width: 768px) {
    margin-top: 1.5rem;
    width: min(360px, 92vw);
  }

  @media (max-width: 480px) {
    margin-top: 1rem;
    width: min(340px, 90vw);
  }
`;

const FeaturesList = styled.ul`
  list-style: none;
  padding: 1.5rem 0;
  margin: 0;
  background: var(--color-background);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  flex: 1;

  @media (max-width: 768px) {
    padding: 1rem 0;
  }

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }
`;

const FeatureItem = styled.li<{ $isEmpty?: boolean }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 0.875rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  font-size: clamp(0.875rem, 2.5vw, 0.9375rem);
  font-weight: 400;
  min-height: ${props => props.$isEmpty ? '3rem' : 'auto'};

  @media (max-width: 768px) {
    padding: 0.75rem 1rem;
    gap: 0.75rem;
  }
  color: var(--color-text-secondary);
  border-bottom: ${props => props.$isEmpty ? 'none' : '1px solid var(--color-border)'};

  &:last-child {
    border-bottom: none;
  }

  &::before {
    content: '✓';
    display: ${props => props.$isEmpty ? 'none' : 'flex'};
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    font-weight: 700;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  [data-theme="dark"] & {
    color: #d1d5db;
    border-bottom-color: #374151;
  }
`;

const PlanButtonContainer = styled.div`
  margin-top: auto;
  padding-top: 1.5rem;
  display: flex;
  justify-content: center;
  align-items: center;

  a {
    display: block;
  }

  /* Golden gradient for all "Choose Plan" buttons */
  button {
    background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%) !important;
    color: #000000 !important;
    border: 2px solid #c9a237 !important;
    font-weight: 600 !important;
    box-shadow: 0 4px 15px rgba(201, 162, 55, 0.4) !important;

    &:hover {
      background: linear-gradient(135deg, #d4af37 0%, #c9a237 100%) !important;
      color: #000000 !important;
      border-color: #d4af37 !important;
      box-shadow: 0 6px 20px rgba(201, 162, 55, 0.5) !important;
    }
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
  color: var(--color-text-primary);
`;

const FAQItem = styled.div`
  background: var(--color-background);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--color-border);
`;

const FAQQuestion = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
`;

const FAQAnswer = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
`;

const PricingPublicPage: React.FC = () => {
  const { language } = useLanguage();
  const [isAnnual, setIsAnnual] = useState(false);

  const plans = [
    {
      nameEn: 'Lite',
      nameBg: 'Лайт',
      type: 'light' as const,
      descEn: 'Perfect for new partners getting started',
      descBg: 'Идеален за нови партньори',
      monthlyPrice: 9.99,
      yearlyPrice: 99,
      features: [
        { en: 'Basic promotions', bg: 'Основни промоции' },
        { en: 'Up to 5 active offers', bg: 'До 5 активни оферти' },
        { en: 'Basic analytics', bg: 'Основни анализи' },
        { en: 'Email support', bg: 'Имейл поддръжка' },
        { en: 'Monthly reporting', bg: 'Месечни отчети' },
      ],
    },
    {
      nameEn: 'Basic',
      nameBg: 'Основен',
      type: 'black' as const,
      descEn: 'Essential tier for businesses growing',
      descBg: 'Основна категория за растящи бизнеси',
      monthlyPrice: 29,
      yearlyPrice: 290,
      features: [
        { en: 'Standard promotions', bg: 'Стандартни промоции' },
        { en: 'Up to 10 active offers', bg: 'До 10 активни оферти' },
        { en: 'Basic analytics', bg: 'Основни анализи' },
        { en: 'Mobile app access', bg: 'Достъп до мобилно приложение' },
        { en: 'Email support', bg: 'Имейл поддръжка' },
      ],
    },
    {
      nameEn: 'Premium',
      nameBg: 'Премиум',
      type: 'silver' as const,
      descEn: 'Advanced promotions and enhanced features',
      descBg: 'Разширени промоции и подобрени функции',
      monthlyPrice: 79,
      yearlyPrice: 790,
      featured: true,
      features: [
        { en: 'Premium promotions with priority placement', bg: 'Премиум промоции с приоритетно позициониране' },
        { en: 'Unlimited offers', bg: 'Неограничени оферти' },
        { en: 'Advanced analytics', bg: 'Усъвършенствани анализи' },
        { en: 'Priority support', bg: 'Приоритетна поддръжка' },
        { en: 'Custom branding', bg: 'Персонализиран брандинг' },
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
  ];

  return (
    <PageContainer>
      <HeroSection>
        <HeroTitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {language === 'bg' ? 'Ясни, прозрачни цени' : 'Simple, Transparent Pricing'}
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

        <BillingToggleContainer>
          <BillingToggle>
            <ToggleOption
              $active={!isAnnual}
              onClick={() => setIsAnnual(false)}
            >
              {language === 'bg' ? 'Месячно' : 'Monthly'}
            </ToggleOption>
            <ToggleOption
              $active={isAnnual}
              onClick={() => setIsAnnual(true)}
            >
              {language === 'bg' ? 'Годишно' : 'Yearly'}
            </ToggleOption>
          </BillingToggle>
        </BillingToggleContainer>
      </HeroSection>

      <SubscriptionCardsContainer>
        {plans.map((plan, index) => {
          const displayPrice = isAnnual ? Math.floor(plan.yearlyPrice / 12) : plan.monthlyPrice;
          const priceLabel = isAnnual
            ? (language === 'bg' ? ' €/година' : ' €/year')
            : plan.type === 'light'
              ? (language === 'bg' ? ' €/седмица' : ' €/week')
              : (language === 'bg' ? ' €/месец' : ' €/month');

          return (
            <PlanCardWrapper
              key={index}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.2 }}
            >
              {plan.featured && (
                <FeaturedBadge>
                  {language === 'bg' ? 'Най-популярен' : 'Most Popular'}
                </FeaturedBadge>
              )}

              <CreditCardPlan $type={plan.type}>
                <CardLogoText $type={plan.type}>
                  BOOM Card
                </CardLogoText>

                <CardNumber $type={plan.type}>
                  <span>••••</span>
                  <span>••••</span>
                  <span>••••</span>
                  <span>••••</span>
                </CardNumber>

                <CardBottomRow>
                  <CardHolderName $type={plan.type}>
                    {plan.nameEn.toUpperCase()}
                  </CardHolderName>
                  <CardPriceDisplay $type={plan.type}>
                    {displayPrice}
                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                      {priceLabel}
                    </span>
                  </CardPriceDisplay>
                </CardBottomRow>
              </CreditCardPlan>

              <PlanDetails>
                <FeaturesList>
                  {plan.features.map((feature, i) => (
                    <FeatureItem key={i}>
                      {language === 'bg' ? feature.bg : feature.en}
                    </FeatureItem>
                  ))}
                </FeaturesList>

                <PlanButtonContainer>
                  <Link to="/register/partner">
                    <Button
                      variant={plan.featured ? 'primary' : 'secondary'}
                      size="large"
                    >
                      {language === 'bg' ? 'Започнете сега' : 'Get Started'}
                    </Button>
                  </Link>
                </PlanButtonContainer>
              </PlanDetails>
            </PlanCardWrapper>
          );
        })}
      </SubscriptionCardsContainer>

      <FAQSection>
        <FAQTitle>{language === 'bg' ? 'Често задавани въпроси' : 'Frequently Asked Questions'}</FAQTitle>
        {faqs.map((faq, index) => (
          <FAQItem key={index}>
            <FAQQuestion>{language === 'bg' ? faq.questionBg : faq.questionEn}</FAQQuestion>
            <FAQAnswer>{language === 'bg' ? faq.answerBg : faq.answerEn}</FAQAnswer>
          </FAQItem>
        ))}
      </FAQSection>

      {/* Client CTA */}
      <ClientCTA />
    </PageContainer>
  );
};

export default PricingPublicPage;
