import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { ArrowLeft, CreditCard, Lock, Check, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { plansService, Plan } from '../services/plans.service';
import { convertEURToBGN } from '../utils/helpers';
import Button from '../components/common/Button/Button';

// Fallback plans when API is unavailable
const getFallbackPlans = (): Plan[] => [
  {
    id: 'lite-premium',
    planCode: 'starter',
    displayName: 'LITE PREMIUM',
    displayNameBg: 'ЛАЙТ ПРЕМИУМ',
    pricing: {
      weekly: 4.99,
      monthly: null,
      yearly: 52,
      currency: 'EUR',
      yearlyDiscountPct: 0,
    },
    billingOptions: {
      hasWeekly: true,
      hasMonthly: false,
      hasYearly: false,
    },
    cashbackRate: 20,
    stickerBonus: 0,
    features: [
      'One week Premium access',
      'Up to 20% discount',
      'Exclusive Premium offers',
      'Limited availability special offers',
      'Access to exclusive Premium campaigns',
      'VIP priority support',
      'Cashback via the app',
    ],
    featuresBg: [
      'Едноседмичен Premium достъп',
      'До 20% отстъпка',
      'Ексклузивни Premium оферти',
      'Специални предложения с ограничена наличност',
      'Достъп до затворени Premium кампании',
      'VIP приоритетна поддръжка',
      'Връщане на пари чрез приложението',
    ],
    cardType: 'light',
    isFeatured: false,
    badge: { text: 'Most Bought', textBg: 'Най-купуван' },
  },
  {
    id: 'basic',
    planCode: 'basic',
    displayName: 'BASIC',
    displayNameBg: 'ОСНОВЕН',
    pricing: {
      weekly: null,
      monthly: 7.99,
      yearly: 84,
      currency: 'EUR',
      yearlyDiscountPct: 12,
    },
    billingOptions: {
      hasWeekly: false,
      hasMonthly: true,
      hasYearly: true,
    },
    cashbackRate: 10,
    stickerBonus: 0,
    features: [
      'One month access',
      'Up to 10% discount',
      'Cashback via the app',
      'Access to partner offers',
      'Standard support',
    ],
    featuresBg: [
      'Едномесечен достъп',
      'До 10% отстъпка',
      'Връщане на пари чрез приложението',
      'Достъп до партньорски оферти',
      'Стандартна поддръжка',
    ],
    cardType: 'silver',
    isFeatured: false,
    badge: null,
  },
  {
    id: 'premium',
    planCode: 'premium',
    displayName: 'PREMIUM',
    displayNameBg: 'ПРЕМИУМ',
    pricing: {
      weekly: null,
      monthly: 12.99,
      yearly: 136,
      currency: 'EUR',
      yearlyDiscountPct: 13,
    },
    billingOptions: {
      hasWeekly: false,
      hasMonthly: true,
      hasYearly: true,
    },
    cashbackRate: 20,
    stickerBonus: 0,
    features: [
      'One month Premium access',
      'Up to 20% discount',
      'Exclusive Premium offers',
      'Limited availability special offers',
      'Access to exclusive Premium campaigns',
      'VIP priority support',
      'Cashback via the app',
    ],
    featuresBg: [
      'Едномесечен Premium достъп',
      'До 20% отстъпка',
      'Ексклузивни Premium оферти',
      'Специални предложения с ограничена наличност',
      'Достъп до затворени Premium кампании',
      'VIP приоритетна поддръжка',
      'Връщане на пари чрез приложението',
    ],
    cardType: 'black',
    isFeatured: true,
    badge: { text: 'Most Popular', textBg: 'Най-популярен' },
  },
];

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
  padding: 2rem;
`;

const CheckoutContainer = styled.div`
  max-width: 900px;
  margin: 0 auto;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 0.9rem;
  margin-bottom: 2rem;
  transition: color 0.2s;

  &:hover {
    color: var(--color-text-primary);
  }
`;

const PageTitle = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 2rem;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
`;

const CheckoutGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const PaymentSection = styled.div`
  background: var(--color-surface);
  border-radius: 1rem;
  padding: 2rem;
  border: 1px solid var(--color-border);
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
`;

const FormGroup = styled.div`
  margin-bottom: 1.25rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.875rem 1rem;
  font-size: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
  }

  &::placeholder {
    color: var(--color-text-tertiary);
  }
`;

const CardInputRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
`;

const OrderSummary = styled.div`
  background: var(--color-surface);
  border-radius: 1rem;
  padding: 2rem;
  border: 1px solid var(--color-border);
  height: fit-content;
  position: sticky;
  top: 2rem;
`;

const PlanCard = styled.div<{ $type: 'black' | 'silver' | 'light' }>`
  width: 100%;
  aspect-ratio: 1.6;
  border-radius: 1rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);

  ${props => props.$type === 'black' && `
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    color: white;
  `}

  ${props => props.$type === 'silver' && `
    background: linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 50%, #a0a0a0 100%);
    color: #1a1a1a;
  `}

  ${props => props.$type === 'light' && `
    background: linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%);
    border: 2px solid rgba(200, 200, 200, 0.5);
    color: #4a4a4a;
  `}
`;

const PlanLogo = styled.div`
  font-size: 1.25rem;
  font-weight: 900;
  letter-spacing: 2px;
`;

const PlanName = styled.div`
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  opacity: 0.9;
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-border);

  &:last-of-type {
    border-bottom: none;
  }
`;

const SummaryLabel = styled.span`
  color: var(--color-text-secondary);
  font-size: 0.9rem;
`;

const SummaryValue = styled.span`
  color: var(--color-text-primary);
  font-weight: 500;
`;

const TotalRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  margin-top: 0.5rem;
  border-top: 2px solid var(--color-border);
`;

const TotalLabel = styled.span`
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
`;

const TotalValue = styled.span`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const SecureNote = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-tertiary);
  font-size: 0.8rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);

  svg {
    color: #10b981;
  }
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 1.5rem 0;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  padding: 0.5rem 0;

  svg {
    color: #10b981;
    flex-shrink: 0;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: 1rem;
  color: var(--color-text-secondary);
`;

const LoadingSpinner = styled(Loader2)`
  animation: spin 1s linear infinite;
  width: 2rem;
  height: 2rem;

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const ErrorMessage = styled.div`
  text-align: center;
  padding: 3rem;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 1rem;
`;

const LoginPrompt = styled.div`
  text-align: center;
  padding: 2rem;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 0.75rem;
  margin-bottom: 1.5rem;
`;

const LoginPromptText = styled.p`
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
`;

const CheckoutPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { user, isAuthenticated } = useAuth();

  const planId = searchParams.get('planId');
  const planCode = searchParams.get('planCode');
  const billingPeriod = (searchParams.get('billing') || 'monthly') as 'weekly' | 'monthly' | 'yearly';

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resolvedPlanId, setResolvedPlanId] = useState<string | null>(planId);

  // Card form state (for display - actual payment handled by Paysera)
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  useEffect(() => {
    const fetchPlan = async () => {
      if (!planId && !planCode) {
        setError(language === 'bg' ? 'Не е избран план' : 'No plan selected');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        let fetchedPlan: Plan;

        if (planId) {
          fetchedPlan = await plansService.getPlanById(planId);
          setResolvedPlanId(planId);
        } else if (planCode) {
          fetchedPlan = await plansService.getPlanByCode(planCode);
          setResolvedPlanId(fetchedPlan.id);
        } else {
          throw new Error('No plan identifier provided');
        }

        setPlan(fetchedPlan);
      } catch (err) {
        console.error('Error fetching plan:', err);
        // Try to find plan in fallback data
        const fallbackPlans = getFallbackPlans();
        const identifier = (planId || planCode || '').toLowerCase();
        const fallbackPlan = fallbackPlans.find(
          p => p.id.toLowerCase() === identifier
            || p.planCode.toLowerCase() === identifier
        );

        if (fallbackPlan) {
          console.warn('API unavailable, using fallback plan data');
          setPlan(fallbackPlan);
          setResolvedPlanId(fallbackPlan.id);
        } else {
          setError(language === 'bg' ? 'Грешка при зареждане на плана' : 'Error loading plan');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPlan();
  }, [planId, planCode, language]);

  const getDisplayPrice = (): number | null => {
    if (!plan) return null;
    return plansService.getDisplayPrice(plan, billingPeriod);
  };

  const displayPrice = getDisplayPrice();
  const displayPriceBGN = displayPrice ? convertEURToBGN(displayPrice) : 0;

  const getBillingLabel = () => {
    switch (billingPeriod) {
      case 'weekly':
        return language === 'bg' ? 'Седмичен' : 'Weekly';
      case 'yearly':
        return language === 'bg' ? 'Годишен' : 'Yearly';
      default:
        return language === 'bg' ? 'Месечен' : 'Monthly';
    }
  };

  const getPeriodLabel = () => {
    switch (billingPeriod) {
      case 'weekly':
        return language === 'bg' ? '/седмица' : '/week';
      case 'yearly':
        return language === 'bg' ? '/година' : '/year';
      default:
        return language === 'bg' ? '/месец' : '/month';
    }
  };

  const handlePayment = async () => {
    if (!plan || !resolvedPlanId) return;

    if (!isAuthenticated) {
      // Redirect to register with plan info
      navigate(`/register?planId=${resolvedPlanId}&billing=${billingPeriod}`);
      return;
    }

    setIsProcessing(true);
    try {
      const paymentResult = await plansService.createSubscriptionPayment(resolvedPlanId, billingPeriod);
      // Redirect to Paysera payment page
      window.location.href = paymentResult.paymentUrl;
    } catch (err) {
      console.error('Payment error:', err);
      setError(language === 'bg' ? 'Грешка при обработка на плащането' : 'Error processing payment');
      setIsProcessing(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ').substr(0, 19) : '';
  };

  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
    }
    return cleaned;
  };

  if (loading) {
    return (
      <PageContainer>
        <CheckoutContainer>
          <LoadingContainer>
            <LoadingSpinner />
            <p>{language === 'bg' ? 'Зареждане...' : 'Loading...'}</p>
          </LoadingContainer>
        </CheckoutContainer>
      </PageContainer>
    );
  }

  if (error || !plan) {
    return (
      <PageContainer>
        <CheckoutContainer>
          <BackLink to="/pricing">
            <ArrowLeft size={18} />
            {language === 'bg' ? 'Обратно към плановете' : 'Back to plans'}
          </BackLink>
          <ErrorMessage>
            {error || (language === 'bg' ? 'Планът не е намерен' : 'Plan not found')}
          </ErrorMessage>
        </CheckoutContainer>
      </PageContainer>
    );
  }

  const features = language === 'bg' ? plan.featuresBg : plan.features;

  return (
    <PageContainer>
      <CheckoutContainer>
        <BackLink to="/pricing">
          <ArrowLeft size={18} />
          {language === 'bg' ? 'Обратно към плановете' : 'Back to plans'}
        </BackLink>

        <PageTitle>
          {language === 'bg' ? 'Завършете поръчката' : 'Complete your order'}
        </PageTitle>

        <CheckoutGrid>
          <PaymentSection>
            {!isAuthenticated && (
              <LoginPrompt>
                <LoginPromptText>
                  {language === 'bg'
                    ? 'Имате акаунт? Влезте за по-бърз checkout.'
                    : 'Have an account? Log in for faster checkout.'}
                </LoginPromptText>
                <Link to={`/login?redirect=/checkout?planId=${planId}&billing=${billingPeriod}`}>
                  <Button variant="outline" size="medium">
                    {language === 'bg' ? 'Вход' : 'Log in'}
                  </Button>
                </Link>
              </LoginPrompt>
            )}

            <SectionTitle>
              <CreditCard size={20} />
              {language === 'bg' ? 'Данни за плащане' : 'Payment Details'}
            </SectionTitle>

            <FormGroup>
              <Label>{language === 'bg' ? 'Име на картодържателя' : 'Cardholder Name'}</Label>
              <Input
                type="text"
                placeholder={language === 'bg' ? 'Иван Иванов' : 'John Doe'}
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
              />
            </FormGroup>

            <FormGroup>
              <Label>{language === 'bg' ? 'Номер на картата' : 'Card Number'}</Label>
              <Input
                type="text"
                placeholder="4242 4242 4242 4242"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                maxLength={19}
              />
            </FormGroup>

            <CardInputRow>
              <FormGroup>
                <Label>{language === 'bg' ? 'Валидност' : 'Expiry Date'}</Label>
                <Input
                  type="text"
                  placeholder="MM/YY"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  maxLength={5}
                />
              </FormGroup>
              <FormGroup>
                <Label>CVV</Label>
                <Input
                  type="text"
                  placeholder="123"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substr(0, 4))}
                  maxLength={4}
                />
              </FormGroup>
            </CardInputRow>

            <Button
              variant="primary"
              size="large"
              fullWidth
              onClick={handlePayment}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <LoadingSpinner style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
                  {language === 'bg' ? 'Обработка...' : 'Processing...'}
                </>
              ) : (
                language === 'bg'
                  ? `Плати €${displayPrice} ${getPeriodLabel()}`
                  : `Pay €${displayPrice} ${getPeriodLabel()}`
              )}
            </Button>

            <SecureNote>
              <Lock size={14} />
              {language === 'bg'
                ? 'Вашето плащане е защитено с 256-bit SSL криптиране'
                : 'Your payment is secured with 256-bit SSL encryption'}
            </SecureNote>
          </PaymentSection>

          <OrderSummary>
            <SectionTitle>
              {language === 'bg' ? 'Обобщение на поръчката' : 'Order Summary'}
            </SectionTitle>

            <PlanCard $type={plan.cardType}>
              <PlanLogo>BOOM CARD</PlanLogo>
              <PlanName>
                {language === 'bg' ? plan.displayNameBg : plan.displayName}
              </PlanName>
            </PlanCard>

            <SummaryRow>
              <SummaryLabel>{language === 'bg' ? 'План' : 'Plan'}</SummaryLabel>
              <SummaryValue>
                {language === 'bg' ? plan.displayNameBg : plan.displayName}
              </SummaryValue>
            </SummaryRow>

            <SummaryRow>
              <SummaryLabel>{language === 'bg' ? 'Период на фактуриране' : 'Billing Period'}</SummaryLabel>
              <SummaryValue>{getBillingLabel()}</SummaryValue>
            </SummaryRow>

            <SummaryRow>
              <SummaryLabel>{language === 'bg' ? 'Кешбек процент' : 'Cashback Rate'}</SummaryLabel>
              <SummaryValue>{plan.cashbackRate}%</SummaryValue>
            </SummaryRow>

            <TotalRow>
              <TotalLabel>{language === 'bg' ? 'Общо' : 'Total'}</TotalLabel>
              <div style={{ textAlign: 'right' }}>
                <TotalValue>€{displayPrice}</TotalValue>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  {displayPriceBGN.toFixed(2)} {language === 'bg' ? 'лв.' : 'BGN'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                  {getPeriodLabel()}
                </div>
              </div>
            </TotalRow>

            <FeatureList>
              {features.slice(0, 5).map((feature, index) => (
                <FeatureItem key={index}>
                  <Check size={16} />
                  {feature}
                </FeatureItem>
              ))}
            </FeatureList>
          </OrderSummary>
        </CheckoutGrid>
      </CheckoutContainer>
    </PageContainer>
  );
};

export default CheckoutPage;
