import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import GenericPage from '../components/templates/GenericPage';
import Button from '../components/common/Button/Button';
import Tooltip from '../components/common/Tooltip/Tooltip';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

// Subscription cards - Credit card design matching HomePage
const SubscriptionCardsContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: stretch;
  gap: 4rem;
  max-width: 1200px;
  margin: 0 auto;

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

const CreditCardPlan = styled(motion.div)<{ $type: 'starter' | 'basic' | 'premium' }>`
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

  /* Starter Card - White/Light gradient */
  ${props => props.$type === 'starter' && `
    background: linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%);
    border: 2px solid rgba(200, 200, 200, 0.5);

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

  /* Basic Card - Silver/Gray gradient */
  ${props => props.$type === 'basic' && `
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

  /* Premium Card - Black/Gold gradient */
  ${props => props.$type === 'premium' && `
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

  &:hover {
    transform: translateY(-10px) scale(1.02);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  /* Dark Theme - Sophisticated dark gradients */
  [data-theme="dark"] & {
    ${props => props.$type === 'starter' && `
      background: linear-gradient(135deg, #f9fafb 0%, #e5e7eb 100%);
      border: 2px solid rgba(156, 163, 175, 0.5);
      box-shadow:
        0 10px 40px rgba(0, 0, 0, 0.2);

      &::before {
        background: radial-gradient(circle, rgba(0, 0, 0, 0.05) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'basic' && `
      background: linear-gradient(135deg, #374151 0%, #4b5563 100%);
      border: 3px solid #3b82f6;
      box-shadow:
        0 10px 40px rgba(59, 130, 246, 0.3),
        0 8px 30px rgba(6, 182, 212, 0.2);

      &::before {
        background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'premium' && `
      background: linear-gradient(135deg, #111827 0%, #1f2937 50%, #0f172a 100%);
      border: 3px solid #06b6d4;
      box-shadow:
        0 10px 40px rgba(6, 182, 212, 0.5),
        0 8px 35px rgba(59, 130, 246, 0.4);

      &::before {
        background: radial-gradient(circle, rgba(6, 182, 212, 0.2) 0%, transparent 70%);
      }
    `}

    &:hover {
      box-shadow:
        0 20px 60px rgba(59, 130, 246, 0.4),
        0 15px 50px rgba(6, 182, 212, 0.35);
    }
  }

  /* Color Theme - Vibrant gradients */
  [data-theme="color"] & {
    ${props => props.$type === 'starter' && `
      background: linear-gradient(135deg, #ffffff 0%, #fff5f0 100%);
      border: 2px solid rgba(255, 148, 214, 0.3);
      box-shadow:
        0 10px 40px rgba(0, 0, 0, 0.15);

      &::before {
        background: radial-gradient(circle, rgba(255, 105, 180, 0.08) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'basic' && `
      background: linear-gradient(135deg, #ffd6a5 0%, #ffb5d5 50%, #c9e4ff 100%);
      border: 3px solid #ff94d6;
      box-shadow:
        0 10px 40px rgba(255, 148, 214, 0.4),
        0 8px 30px rgba(178, 75, 243, 0.3);

      &::before {
        background: radial-gradient(circle, rgba(255, 105, 180, 0.2) 0%, transparent 70%);
      }
    `}

    ${props => props.$type === 'premium' && `
      background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 50%, #ab2567 100%);
      border: 3px solid #ff4500;
      box-shadow:
        0 10px 40px rgba(255, 69, 0, 0.6),
        0 8px 35px rgba(255, 0, 110, 0.5),
        0 6px 30px rgba(139, 47, 184, 0.4);

      &::before {
        background: radial-gradient(circle, rgba(255, 69, 0, 0.15) 0%, transparent 70%);
      }
    `}

    &:hover {
      box-shadow:
        0 20px 60px rgba(255, 69, 0, 0.5),
        0 15px 50px rgba(255, 0, 110, 0.4),
        0 10px 40px rgba(139, 47, 184, 0.3);
    }
  }

  @media (max-width: 480px) {
    width: min(340px, 90vw);
    height: 212px;
  }
`;

const PopularBadge = styled.div`
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

const CardLogoText = styled.div<{ $type: 'starter' | 'basic' | 'premium' }>`
  font-size: 1.75rem;
  font-weight: 900;
  font-family: 'Arial Black', sans-serif;
  letter-spacing: 2px;
  margin-bottom: 1.5rem;
  color: ${props => props.$type === 'premium' ? '#ffd700' : props.$type === 'starter' ? '#4a4a4a' : '#1a1a1a'};
  text-shadow: ${props => props.$type === 'premium'
    ? '0 2px 10px rgba(255, 215, 0, 0.3)'
    : props.$type === 'starter'
    ? '0 1px 2px rgba(0, 0, 0, 0.1)'
    : '0 1px 2px rgba(255, 255, 255, 0.5)'};

  [data-theme="dark"] & {
    color: ${props => props.$type === 'premium' ? '#06b6d4' : props.$type === 'starter' ? '#1a1a1a' : '#f8fafc'};
    text-shadow: ${props => props.$type === 'premium'
      ? '0 2px 15px rgba(6, 182, 212, 0.6), 0 0 30px rgba(59, 130, 246, 0.4)'
      : props.$type === 'starter'
      ? '0 1px 2px rgba(0, 0, 0, 0.1)'
      : '0 2px 8px rgba(59, 130, 246, 0.3)'};
  }

  [data-theme="color"] & {
    color: ${props => props.$type === 'premium' ? '#ff4500' : props.$type === 'starter' ? '#1a0a2e' : '#1a0a2e'};
    text-shadow: ${props => props.$type === 'premium'
      ? '0 2px 15px rgba(255, 69, 0, 0.6), 0 0 30px rgba(255, 0, 110, 0.4)'
      : props.$type === 'starter'
      ? '0 1px 2px rgba(0, 0, 0, 0.08)'
      : '0 2px 8px rgba(139, 47, 184, 0.3)'};
  }
`;

const CardNumber = styled.div<{ $type?: 'starter' | 'basic' | 'premium' }>`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  font-size: 1.25rem;
  color: ${props => props.$type === 'starter' ? 'rgba(100, 100, 100, 0.8)' : props.$type === 'basic' ? 'rgba(26, 26, 26, 0.9)' : 'rgba(255, 255, 255, 0.9)'};
  letter-spacing: 0.25rem;
  font-family: 'Courier New', monospace;

  [data-theme="dark"] & {
    color: ${props => props.$type === 'starter' ? 'rgba(26, 26, 26, 0.8)' : 'rgba(248, 250, 252, 0.9)'};
  }

  [data-theme="color"] & {
    color: ${props => props.$type === 'starter' ? 'rgba(26, 10, 46, 0.7)' : props.$type === 'basic' ? 'rgba(26, 10, 46, 0.8)' : 'rgba(255, 255, 255, 0.95)'};
  }
`;

const CardBottomRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`;

const CardHolderName = styled.div<{ $type?: 'starter' | 'basic' | 'premium' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: ${props => props.$type === 'starter' ? 'rgba(74, 74, 74, 0.95)' : props.$type === 'basic' ? 'rgba(26, 26, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 400;

  [data-theme="dark"] & {
    color: ${props => props.$type === 'starter' ? 'rgba(26, 26, 26, 0.95)' : 'rgba(248, 250, 252, 0.95)'};
  }

  [data-theme="color"] & {
    color: ${props => props.$type === 'starter' ? 'rgba(26, 10, 46, 0.85)' : props.$type === 'basic' ? 'rgba(26, 10, 46, 0.9)' : 'rgba(255, 255, 255, 0.95)'};
  }
`;

const CardPriceDisplay = styled.div<{ $type: 'starter' | 'basic' | 'premium' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  text-align: right;
  color: ${props => props.$type === 'premium' ? '#ffd700' : props.$type === 'starter' ? 'rgba(74, 74, 74, 0.95)' : 'rgba(26, 26, 26, 0.95)'};
  font-size: 1.75rem;
  font-weight: 400;
  line-height: 1;

  span {
    font-size: 0.875rem;
    font-weight: 400;
    opacity: 0.9;
  }

  [data-theme="dark"] & {
    color: ${props => props.$type === 'premium' ? '#06b6d4' : props.$type === 'starter' ? '#1a1a1a' : '#f8fafc'};
    text-shadow: ${props => props.$type === 'premium'
      ? '0 2px 10px rgba(6, 182, 212, 0.4)'
      : props.$type === 'starter'
      ? 'none'
      : '0 1px 4px rgba(59, 130, 246, 0.2)'};
  }

  [data-theme="color"] & {
    color: ${props => props.$type === 'premium' ? '#ff4500' : props.$type === 'starter' ? '#1a0a2e' : '#1a0a2e'};
    text-shadow: ${props => props.$type === 'premium'
      ? '0 2px 10px rgba(255, 69, 0, 0.4)'
      : props.$type === 'starter'
      ? 'none'
      : '0 1px 4px rgba(139, 47, 184, 0.2)'};
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
  flex: 1; /* Expand to fill remaining space and align buttons */

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
  border-bottom: 1px solid var(--color-border);

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

  a {
    display: block;
    width: 100%;
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

// Billing toggle components
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

const SubscriptionsPage: React.FC = () => {
  const { language } = useLanguage();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const subscriptionPlans = [
    {
      name: language === 'bg' ? 'Лек План' : 'Light Plan',
      monthlyPrice: 4.99,
      yearlyPrice: 52,
      duration: language === 'bg' ? ' €/седмица' : ' €/week',
      type: 'starter' as const,
      features: [
        language === 'bg' ? '24 часа премиум услуга' : '24 hours premium service',
        language === 'bg' ? 'Важи една седмица' : 'Valid for one week',
        language === 'bg' ? 'Достъп до основни оферти' : 'Access to basic offers',
        '', // Empty line 4
        ''  // Empty line 5
      ],
      tooltips: [
        language === 'bg' ? 'Пробвайте всички премиум функции за 24 часа' : 'Try all premium features for 24 hours',
        language === 'bg' ? 'Достъп за 7 дни след активиране' : 'Access for 7 days after activation',
        language === 'bg' ? 'Над 500 партньори в цялата страна' : 'Over 500 partners across the country',
        '', // Empty tooltip
        ''  // Empty tooltip
      ]
    },
    {
      name: language === 'bg' ? 'Основен' : 'Basic',
      monthlyPrice: 7.99,
      yearlyPrice: 84,
      duration: language === 'bg' ? ' €/седмица' : ' €/week',
      type: 'basic' as const,
      features: [
        language === 'bg' ? '24 часа премиум услуга' : '24 hours premium service',
        language === 'bg' ? 'Достъп до основни оферти' : 'Access to basic offers',
        language === 'bg' ? 'До 10% отстъпка' : 'Up to 10% discount',
        language === 'bg' ? 'Кешбек в приложението' : 'In-app cashback',
        '' // Empty line 5
      ],
      tooltips: [
        language === 'bg' ? 'Пробвайте всички премиум функции за 24 часа' : 'Try all premium features for 24 hours',
        language === 'bg' ? 'Над 500 партньори в цялата страна' : 'Over 500 partners across the country',
        language === 'bg' ? 'Ексклузивни отстъпки в избрани заведения' : 'Exclusive discounts at selected venues',
        language === 'bg' ? 'Връщане на пари при всяка покупка' : 'Cashback on every purchase',
        '' // Empty tooltip
      ]
    },
    {
      name: language === 'bg' ? 'Премиум' : 'Premium',
      monthlyPrice: 12.99,
      yearlyPrice: 136,
      duration: language === 'bg' ? ' €/седмица' : ' €/week',
      featured: true,
      type: 'premium' as const,
      features: [
        language === 'bg' ? '24 часа премиум услуга' : '24 hours premium service',
        language === 'bg' ? 'До 20% отстъпка' : 'Up to 20% discount',
        language === 'bg' ? 'В зависимост от заведението' : 'Depending on the venue',
        language === 'bg' ? 'Приоритетна поддръжка' : 'Priority support',
        language === 'bg' ? 'Ексклузивни оферти' : 'Exclusive offers'
      ],
      tooltips: [
        language === 'bg' ? 'Пробвайте всички премиум функции за 24 часа' : 'Try all premium features for 24 hours',
        language === 'bg' ? 'Най-високи отстъпки във всички партньори' : 'Highest discounts at all partners',
        language === 'bg' ? 'Отстъпките варират според партньора' : 'Discounts vary by partner',
        language === 'bg' ? 'Получете помощ в рамките на 1 час' : 'Get help within 1 hour',
        language === 'bg' ? 'Достъп до лимитирани VIP промоции' : 'Access to limited VIP promotions'
      ]
    }
  ];

  return (
    <GenericPage
      titleEn="Subscription Plans"
      titleBg="Абонаментни Планове"
      subtitleEn="Choose the perfect plan for your lifestyle"
      subtitleBg="Изберете перфектния план за вашия начин на живот"
    >
      {/* Billing Period Toggle */}
      <BillingToggleContainer>
        <BillingToggle>
          <Tooltip
            content={language === 'bg'
              ? 'Плащай годишно и спести 20% от общата цена'
              : 'Pay yearly and save 20% on total price'}
            position="top"
          >
            <ToggleOption
              $active={billingPeriod === 'yearly'}
              onClick={() => setBillingPeriod('yearly')}
            >
              {language === 'bg' ? 'Годишен абонамент (20% отстъпка)' : 'Yearly (20% off)'}
            </ToggleOption>
          </Tooltip>
          <Tooltip
            content={language === 'bg'
              ? 'Плащай всеки месец за по-голяма гъвкавост'
              : 'Pay monthly for more flexibility'}
            position="top"
          >
            <ToggleOption
              $active={billingPeriod === 'monthly'}
              onClick={() => setBillingPeriod('monthly')}
            >
              {language === 'bg' ? 'Месечен абонамент' : 'Monthly'}
            </ToggleOption>
          </Tooltip>
        </BillingToggle>
        {billingPeriod === 'yearly' && (
          <Tooltip
            content={language === 'bg'
              ? 'Спестявате 2 месеца с годишен абонамент'
              : 'You save 2 months with yearly subscription'}
            position="bottom"
          >
            <SaveBadge>
              {language === 'bg' ? 'Спести 20%' : 'Save 20%'}
            </SaveBadge>
          </Tooltip>
        )}
      </BillingToggleContainer>

      <SubscriptionCardsContainer>
        {subscriptionPlans.map((plan, index) => {
          const planType = plan.type;
          const displayPrice = billingPeriod === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
          const priceLabel = billingPeriod === 'yearly'
            ? (language === 'bg' ? ' €/година' : ' €/year')
            : plan.duration;

          return (
            <PlanCardWrapper
              key={index}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.2 }}
            >
              {/* Most Popular Badge */}
              {plan.featured && (
                <Tooltip
                  content={language === 'bg'
                    ? 'Избран от 70% от нашите клиенти'
                    : 'Chosen by 70% of our customers'}
                  position="top"
                >
                  <PopularBadge>
                    {language === 'bg' ? 'Най-популярен' : 'Most Popular'}
                  </PopularBadge>
                </Tooltip>
              )}

              {/* Credit Card matching HomePage design */}
              <CreditCardPlan $type={planType}>
                <CardLogoText $type={planType}>
                  BOOM Card
                </CardLogoText>

                <CardNumber $type={planType}>
                  <span>••••</span>
                  <span>••••</span>
                  <span>••••</span>
                  <span>••••</span>
                </CardNumber>

                <CardBottomRow>
                  <CardHolderName $type={planType}>
                    {plan.name.toUpperCase()}
                  </CardHolderName>
                  <CardPriceDisplay $type={planType}>
                    {displayPrice}
                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                      {priceLabel}
                    </span>
                  </CardPriceDisplay>
                </CardBottomRow>
              </CreditCardPlan>

              {/* Plan Details Below Card */}
              <PlanDetails>
                <FeaturesList>
                  {plan.features.map((feature, i) => {
                    const isEmpty = !feature || feature.trim() === '';
                    return isEmpty ? (
                      <FeatureItem key={i} $isEmpty={true}>
                        &nbsp;
                      </FeatureItem>
                    ) : (
                      <Tooltip
                        key={i}
                        content={(plan as any).tooltips?.[i] || ''}
                        position="right"
                      >
                        <FeatureItem $isEmpty={false}>
                          {feature}
                        </FeatureItem>
                      </Tooltip>
                    );
                  })}
                </FeaturesList>

                <PlanButtonContainer>
                  <Tooltip
                    content={language === 'bg'
                      ? 'Преминете към плащане и активирайте плана си'
                      : 'Proceed to payment and activate your plan'}
                    position="bottom"
                  >
                    <Link to="/register" style={{ width: '100%' }}>
                      <Button
                        variant={plan.featured ? 'primary' : 'secondary'}
                        size="large"
                      >
                        {language === 'bg' ? 'Избери План' : 'Choose Plan'}
                      </Button>
                    </Link>
                  </Tooltip>
                </PlanButtonContainer>
              </PlanDetails>
            </PlanCardWrapper>
          );
        })}
      </SubscriptionCardsContainer>
    </GenericPage>
  );
};

export default SubscriptionsPage;
