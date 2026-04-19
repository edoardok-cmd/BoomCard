import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import GenericPage from '../components/templates/GenericPage';
import Button from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { convertEURToBGN } from '../utils/helpers';
import { Plan, plansService } from '../services/plans.service';
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
    gap: 4rem; /* Increased gap to prevent badge overlap with button above */
  }

  @media (max-width: 480px) {
    gap: 3.5rem; /* Increased gap to prevent badge overlap with button above */
  }
`;

const PlanCardWrapper = styled(motion.div)<{ $disabled?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding-top: 1rem;
  flex: 1;
  align-self: stretch;
  opacity: ${props => props.$disabled ? 0.5 : 1};
  filter: ${props => props.$disabled ? 'grayscale(70%)' : 'none'};
  pointer-events: ${props => props.$disabled ? 'none' : 'auto'};
  transition: opacity 0.3s ease, filter 0.3s ease;
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

  @media (max-width: 480px) {
    width: min(340px, 90vw);
    height: 212px;
  }
`;

const PopularBadge = styled.div`
  position: absolute;
  top: -1rem;
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

const MostBoughtBadge = styled.div`
  position: absolute;
  top: -1rem;
  left: 50%;
  transform: translateX(-50%);
  -webkit-transform: translateX(-50%);
  -moz-transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.1);
  color: #c9a237;
  border: 2px solid #c9a237;
  padding: 0.4rem 1.25rem;
  border-radius: 9999px;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(201, 162, 55, 0.3);
  z-index: 10;
  white-space: nowrap;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  pointer-events: none;

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
`;

const CardNumber = styled.div<{ $type?: 'starter' | 'basic' | 'premium' }>`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  font-size: 1.25rem;
  color: ${props => props.$type === 'starter' ? 'rgba(100, 100, 100, 0.8)' : props.$type === 'basic' ? 'rgba(26, 26, 26, 0.9)' : 'rgba(255, 255, 255, 0.9)'};
  letter-spacing: 0.25rem;
  font-family: 'Courier New', monospace;
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


// Static marketing tooltips — not pricing, safe to keep hardcoded
const PLAN_TOOLTIPS: Record<string, { en: string[]; bg: string[] }> = {
  LIGHT: {
    en: [
      'Full Premium access for 7 days',
      'Highest discounts at all partners',
      'Access to exclusive Premium campaigns',
      'Offers with limited quantity or time',
      'Exclusive access to VIP campaigns',
      'Get help within 1 hour',
      'Upload receipt and get money back',
    ],
    bg: [
      'Пълен Premium достъп за 7 дни',
      'Най-високи отстъпки във всички партньори',
      'Достъп до затворени Premium кампании',
      'Оферти с ограничен брой или време',
      'Ексклузивен достъп до VIP кампании',
      'Получете помощ в рамките на 1 час',
      'Качи касова бележка и получи пари обратно',
    ],
  },
  BASIC: {
    en: [
      'Full access for 30 days',
      'Discounts at selected venues',
      'Upload receipt and get money back',
      'Over 500 partners across the country',
      'Response within 24 hours',
    ],
    bg: [
      'Пълен достъп за 30 дни',
      'Отстъпки в избрани заведения',
      'Качи касова бележка и получи пари обратно',
      'Над 500 партньори в цялата страна',
      'Отговор в рамките на 24 часа',
    ],
  },
  PREMIUM: {
    en: [
      'Full Premium access for 30 days',
      'Highest discounts at all partners',
      'Access to exclusive Premium campaigns',
      'Offers with limited quantity or time',
      'Exclusive access to VIP campaigns',
      'Get help within 1 hour',
      'Upload receipt and get money back',
    ],
    bg: [
      'Пълен Premium достъп за 30 дни',
      'Най-високи отстъпки във всички партньори',
      'Достъп до затворени Premium кампании',
      'Оферти с ограничен брой или време',
      'Ексклузивен достъп до VIP кампании',
      'Получете помощ в рамките на 1 час',
      'Качи касова бележка и получи пари обратно',
    ],
  },
};

function cardTypeToStyle(cardType: string): 'starter' | 'basic' | 'premium' {
  switch (cardType) {
    case 'silver': return 'basic';
    case 'black': return 'premium';
    default: return 'starter';
  }
}

const SubscriptionsPage: React.FC = () => {
  const { language } = useLanguage();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    plansService
      .getPlans()
      .then(data => {
        setPlans(data);
        setLoading(false);
      })
      .catch(() => {
        setError(
          language === 'bg'
            ? 'Грешка при зареждане на плановете. Моля, опитайте отново.'
            : 'Error loading plans. Please try again.',
        );
        setLoading(false);
      });
  }, []);

  return (
    <GenericPage
      titleEn="Subscription Plans"
      titleBg="Абонаментни Планове"
      subtitleEn="Choose the perfect plan for your lifestyle"
      subtitleBg="Изберете перфектния план за вашия начин на живот"
    >
      {/* 24h Free Trial Text */}
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem',
        fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      }}>
        <p style={{
          color: '#059669',
          fontWeight: 800,
          fontSize: '1.4rem',
          margin: 0
        }}>
          {language === 'bg'
            ? '24 часа безплатен Premium пробен период за всички планове'
            : '24h free Premium trial for all plans'}
        </p>
      </div>

      {/* Billing Period Toggle */}
      <BillingToggleContainer>
        <BillingToggle>
          <ToggleOption
            $active={billingPeriod === 'yearly'}
            onClick={() => setBillingPeriod('yearly')}
          >
            {(() => {
              const maxDiscount = plans
                .filter(p => p.billingOptions.hasYearly)
                .reduce((max, p) => Math.max(max, p.pricing.yearlyDiscountPct), 0);
              return language === 'bg'
                ? `Годишен абонамент${maxDiscount > 0 ? ` (${maxDiscount}% отстъпка)` : ''}`
                : `Yearly${maxDiscount > 0 ? ` (${maxDiscount}% off)` : ''}`;
            })()}
          </ToggleOption>
          <ToggleOption
            $active={billingPeriod === 'monthly'}
            onClick={() => setBillingPeriod('monthly')}
          >
            {language === 'bg' ? 'Месечен/Седмичен абонамент' : 'Monthly/Weekly'}
          </ToggleOption>
        </BillingToggle>
      </BillingToggleContainer>

      {loading && (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-secondary)' }}>
          {language === 'bg' ? 'Зареждане...' : 'Loading...'}
        </div>
      )}

      {error && (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <SubscriptionCardsContainer>
          {plans.map((plan, index) => {
            const planType = cardTypeToStyle(plan.cardType);
            const isLitePlan = !plan.billingOptions.hasMonthly && plan.billingOptions.hasWeekly;
            const isDisabled = isLitePlan && billingPeriod === 'yearly';
            // EUR price from API
            const eurPrice = isLitePlan
              ? plan.pricing.weekly
              : (billingPeriod === 'yearly' ? plan.pricing.yearly : plan.pricing.monthly);
            const bgnPrice = eurPrice != null ? convertEURToBGN(eurPrice) : null;
            const bgnLabel = language === 'bg' ? 'лв.' : 'BGN';
            const priceLabel = isLitePlan
              ? (language === 'bg' ? '/седмица' : '/week')
              : (billingPeriod === 'yearly'
                ? (language === 'bg' ? '/година' : '/year')
                : (language === 'bg' ? '/месец' : '/month'));
            const features = language === 'bg' ? plan.featuresBg : plan.features;
            const planName = (language === 'bg' && plan.displayNameBg) ? plan.displayNameBg : plan.displayName;
            const tooltips = PLAN_TOOLTIPS[plan.planCode]?.[language === 'bg' ? 'bg' : 'en'] ?? [];

            return (
              <PlanCardWrapper
                key={plan.id}
                $disabled={isDisabled}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: isDisabled ? 0.5 : 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
              >
                {/* Most Bought Badge for Light Plan */}
                {isLitePlan && (
                  <MostBoughtBadge>
                    {language === 'bg' ? 'Най-купуван' : 'Most Bought'}
                  </MostBoughtBadge>
                )}

                {/* Most Popular Badge */}
                {plan.isFeatured && !isLitePlan && (
                  <PopularBadge>
                    {language === 'bg' ? 'Най-популярен' : 'Most Popular'}
                  </PopularBadge>
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
                      {planName.toUpperCase()}
                    </CardHolderName>
                    <CardPriceDisplay $type={planType}>
                      {eurPrice != null && bgnPrice != null ? (
                        <>
                          <span style={{ fontSize: '0.9rem', opacity: 0.85 }}>{bgnPrice.toFixed(2)} {bgnLabel} /</span> €{eurPrice}
                          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            {priceLabel}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.875rem' }}>N/A</span>
                      )}
                    </CardPriceDisplay>
                  </CardBottomRow>
                </CreditCardPlan>

                {/* Plan Details Below Card */}
                <PlanDetails>
                  <FeaturesList>
                    {features.map((feature, i) => {
                      const isEmpty = !feature || feature.trim() === '';
                      return (
                        <FeatureItem key={i} title={tooltips[i]} $isEmpty={isEmpty}>
                          {isEmpty ? '\u00A0' : feature}
                        </FeatureItem>
                      );
                    })}
                  </FeaturesList>

                  <PlanButtonContainer>
                    {isDisabled ? (
                      <div style={{ opacity: 0.6 }}>
                        <Button
                          variant="secondary"
                          size="large"
                          disabled
                        >
                          {language === 'bg' ? 'Само седмичен план' : 'Weekly only'}
                        </Button>
                      </div>
                    ) : (
                      /* SECURITY: Only pass planCode and billing period - NO PRICE IN URL */
                      <Link to={`/checkout?planCode=${plan.planCode}&billing=${isLitePlan ? 'weekly' : billingPeriod}`}>
                        <Button
                          variant={plan.isFeatured ? 'primary' : 'secondary'}
                          size="large"
                        >
                          {language === 'bg' ? 'Избери План' : 'Choose Plan'}
                        </Button>
                      </Link>
                    )}
                  </PlanButtonContainer>
                </PlanDetails>
              </PlanCardWrapper>
            );
          })}
        </SubscriptionCardsContainer>
      )}

      {/* Cashback Explanation */}
      <div style={{
        textAlign: 'center',
        marginTop: '2rem',
        maxWidth: '48rem',
        marginLeft: 'auto',
        marginRight: 'auto',
        fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      }}>
        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: '0.9rem',
          lineHeight: 1.6,
          margin: 0
        }}>
          {language === 'bg'
            ? 'Отстъпките се получават под формата на връщане на пари след качване на касова бележка в приложението. Процентът зависи от абонаментния план.'
            : 'Discounts are received as cashback after uploading a receipt in the app. The percentage depends on the subscription plan.'}
        </p>
      </div>
    </GenericPage>
  );
};

export default SubscriptionsPage;
