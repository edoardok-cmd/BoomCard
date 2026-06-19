import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, Lock, Check, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { plansService, Plan } from '../services/plans.service';
import { convertEURToBGN } from '../utils/helpers';
import Button from '../components/common/Button/Button';


const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
  padding: 2rem;
  padding-bottom: 4rem;

  @media (max-width: 768px) {
    padding: 1rem;
    padding-bottom: 3rem;
  }
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

  @media (max-width: 768px) {
    padding: 1.25rem;
  }
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

const OrderSummary = styled.div`
  background: var(--color-surface);
  border-radius: 1rem;
  padding: 2rem;
  border: 1px solid var(--color-border);
  height: fit-content;
  position: sticky;
  top: 2rem;

  @media (max-width: 768px) {
    padding: 1.25rem;
    position: static;
  }
`;

const PlanCard = styled.div<{ $type: 'black' | 'silver' | 'light' }>`
  width: 100%;
  aspect-ratio: 1.6;
  border-radius: 1.25rem;
  padding: 1.75rem 2rem;
  margin-bottom: 1.5rem;
  max-height: 220px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);

  ${props => props.$type === 'black' && `
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    border: 3px solid #ffd700;
    color: white;

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

  ${props => props.$type === 'silver' && `
    background: linear-gradient(135deg, #c0c0c0 0%, #939393 100%);
    border: 2px solid rgba(255, 255, 255, 0.3);
    color: #1a1a1a;

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

  ${props => props.$type === 'light' && `
    background: linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%);
    border: 2px solid rgba(200, 200, 200, 0.5);
    color: #4a4a4a;

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
`;

const PlanLogo = styled.div<{ $type?: 'black' | 'silver' | 'light' }>`
  font-size: 1.5rem;
  font-weight: 900;
  font-family: 'Arial Black', sans-serif;
  letter-spacing: 2px;
  margin-bottom: 0.75rem;
  color: ${props => {
    if (props.$type === 'black') return '#ffd700';
    if (props.$type === 'light') return '#4a4a4a';
    return '#1a1a1a';
  }};
  text-shadow: ${props => {
    if (props.$type === 'black') return '0 2px 10px rgba(255, 215, 0, 0.3)';
    if (props.$type === 'light') return '0 1px 2px rgba(0, 0, 0, 0.1)';
    return '0 1px 2px rgba(255, 255, 255, 0.5)';
  }};
`;

const CardNumber = styled.div<{ $type?: 'black' | 'silver' | 'light' }>`
  display: flex;
  gap: 0.75rem;
  margin-bottom: auto;
  font-size: 1.1rem;
  color: ${props => {
    if (props.$type === 'black') return 'rgba(255, 255, 255, 0.9)';
    if (props.$type === 'light') return 'rgba(100, 100, 100, 0.8)';
    return 'rgba(26, 26, 26, 0.9)';
  }};
  letter-spacing: 0.25rem;
  font-family: 'Courier New', monospace;
`;

const CardBottomRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`;

const PlanName = styled.div<{ $type?: 'black' | 'silver' | 'light' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: ${props => {
    if (props.$type === 'black') return 'rgba(255, 255, 255, 0.95)';
    if (props.$type === 'light') return 'rgba(74, 74, 74, 0.95)';
    return 'rgba(26, 26, 26, 0.95)';
  }};
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 400;
`;

const CardPriceDisplay = styled.div<{ $type: 'black' | 'silver' | 'light' }>`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  text-align: right;
  color: ${props => {
    if (props.$type === 'black') return '#ffd700';
    if (props.$type === 'light') return 'rgba(74, 74, 74, 0.95)';
    return 'rgba(26, 26, 26, 0.95)';
  }};
  font-size: 1.5rem;
  font-weight: 400;
  line-height: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;

  span {
    font-size: 0.8rem;
    font-weight: 400;
    opacity: 0.9;
  }
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

const LoginPromptText = styled.p`
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
`;

const GuestForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const GuestField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const GuestLabel = styled.label`
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-secondary);
`;

const GuestInput = styled.input<{ $hasError?: boolean }>`
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid ${p => p.$hasError ? '#ef4444' : 'var(--color-border)'};
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: var(--color-primary);
  }
`;

const FieldError = styled.span`
  font-size: 0.8rem;
  color: #ef4444;
`;

const GuestRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
`;

const GuestDivider = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
  color: var(--color-text-secondary);
  font-size: 0.85rem;

  &::before, &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }
`;

const CheckoutPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const { isAuthenticated } = useAuth();

  const planId = searchParams.get('planId');
  const planCode = searchParams.get('planCode');
  const rawBilling = searchParams.get('billing');
  const billingPeriod = (['weekly', 'monthly', 'yearly'].includes(rawBilling || '')
    ? rawBilling
    : 'monthly') as 'weekly' | 'monthly' | 'yearly';

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailConflictCode, setEmailConflictCode] = useState<'EMAIL_ALREADY_HAS_ACTIVE_PLAN' | 'EMAIL_REGISTERED_NO_ACTIVE_PLAN' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resolvedPlanId, setResolvedPlanId] = useState<string | null>(planId);

  // Payment method selection state
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [methodsLoading, setMethodsLoading] = useState(true);

  // Guest checkout form state
  const [guestEmail, setGuestEmail] = useState('');
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestErrors, setGuestErrors] = useState<Record<string, string>>({});

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
        setError(language === 'bg' ? 'Грешка при зареждане на плана' : 'Error loading plan');
      } finally {
        setLoading(false);
      }
    };

    fetchPlan();
  }, [planId, planCode, language]);

  // Pre-select Paysera as the only payment method (no method selection UI shown)
  useEffect(() => {
    if (plan) {
      setSelectedMethod('wallet');
      setMethodsLoading(false);
    }
  }, [plan]);

  const getDisplayPrice = (): number | null => {
    if (!plan) return null;
    return plansService.getDisplayPrice(plan, billingPeriod);
  };

  const displayPrice = getDisplayPrice();
  const displayPriceBGN = displayPrice ? convertEURToBGN(displayPrice) : 0;

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
    if (!plan || !resolvedPlanId || !selectedMethod) return;

    // Unauthenticated users must register first — the button below navigates them
    if (!isAuthenticated) return;

    setIsProcessing(true);
    try {
      const paymentResult = await plansService.createSubscriptionPayment(
        resolvedPlanId,
        billingPeriod,
        undefined,
        undefined,
        undefined,
        selectedMethod
      );
      // Redirect directly to the selected bank/payment provider
      window.location.href = paymentResult.paymentUrl;
    } catch (err) {
      console.error('Payment error:', err);
      setError(language === 'bg' ? 'Грешка при обработка на плащането' : 'Error processing payment');
      setIsProcessing(false);
    }
  };

  const validateGuestForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      errors.email = language === 'bg' ? 'Въведете валиден имейл' : 'Enter a valid email';
    }
    if (!guestFirstName.trim()) {
      errors.firstName = language === 'bg' ? 'Задължително поле' : 'Required';
    }
    if (!guestLastName.trim()) {
      errors.lastName = language === 'bg' ? 'Задължително поле' : 'Required';
    }
    setGuestErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleGuestPayment = async () => {
    if (!validateGuestForm() || !resolvedPlanId || !plan) return;
    setIsProcessing(true);
    try {
      const result = await plansService.createAnonymousSubscriptionPayment({
        planId: resolvedPlanId,
        billingPeriod,
        email: guestEmail,
        firstName: guestFirstName.trim(),
        lastName: guestLastName.trim(),
        phone: guestPhone.trim() || undefined,
        // Spec §7.1: forward the active interface language so post-payment emails match.
        language,
      });
      window.location.href = result.paymentUrl;
    } catch (err: any) {
      console.error('Guest payment error:', err);
      const code = err?.response?.data?.code;
      if (code === 'EMAIL_ALREADY_HAS_ACTIVE_PLAN' || code === 'EMAIL_REGISTERED_NO_ACTIVE_PLAN') {
        setEmailConflictCode(code);
      } else {
        setError(language === 'bg' ? 'Грешка при обработка на плащането' : 'Error processing payment');
      }
      setIsProcessing(false);
    }
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
          <BackLink to="/#subscription-plans">
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
        <BackLink to="/#subscription-plans">
          <ArrowLeft size={18} />
          {language === 'bg' ? 'Обратно към плановете' : 'Back to plans'}
        </BackLink>

        <CheckoutGrid>
          <PaymentSection>
            {!isAuthenticated ? (
              <>
                <GuestForm>
                  <GuestRow>
                    <GuestField>
                      <GuestLabel>{language === 'bg' ? 'Име' : 'First name'} *</GuestLabel>
                      <GuestInput
                        type="text"
                        value={guestFirstName}
                        onChange={e => setGuestFirstName(e.target.value)}
                        $hasError={!!guestErrors.firstName}
                        placeholder={language === 'bg' ? 'Иван' : 'John'}
                      />
                      {guestErrors.firstName && <FieldError>{guestErrors.firstName}</FieldError>}
                    </GuestField>
                    <GuestField>
                      <GuestLabel>{language === 'bg' ? 'Фамилия' : 'Last name'} *</GuestLabel>
                      <GuestInput
                        type="text"
                        value={guestLastName}
                        onChange={e => setGuestLastName(e.target.value)}
                        $hasError={!!guestErrors.lastName}
                        placeholder={language === 'bg' ? 'Иванов' : 'Doe'}
                      />
                      {guestErrors.lastName && <FieldError>{guestErrors.lastName}</FieldError>}
                    </GuestField>
                  </GuestRow>

                  <GuestField>
                    <GuestLabel>{language === 'bg' ? 'Имейл адрес' : 'Email address'} *</GuestLabel>
                    <GuestInput
                      type="email"
                      value={guestEmail}
                      onChange={e => { setGuestEmail(e.target.value); setEmailConflictCode(null); }}
                      $hasError={!!guestErrors.email}
                      placeholder="you@example.com"
                    />
                    {guestErrors.email && <FieldError>{guestErrors.email}</FieldError>}
                  </GuestField>

                  <GuestField>
                    <GuestLabel>{language === 'bg' ? 'Телефон (по избор)' : 'Phone (optional)'}</GuestLabel>
                    <GuestInput
                      type="tel"
                      value={guestPhone}
                      onChange={e => setGuestPhone(e.target.value)}
                      placeholder="+359 88 888 8888"
                    />
                  </GuestField>
                </GuestForm>

                {emailConflictCode && (
                  <div style={{ padding: '0.875rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626', lineHeight: 1.6 }}>
                    {emailConflictCode === 'EMAIL_ALREADY_HAS_ACTIVE_PLAN' ? (
                      language === 'bg'
                        ? <>{' Имате активен абонамент за този имейл. '}<Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>Влезте в акаунта си</Link>{' за да го управлявате.'}</>
                        : <>You already have an active subscription for this email.{' '}<Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>Sign in</Link>{' to manage it.'}</>
                    ) : (
                      language === 'bg'
                        ? <>{' Акаунт с този имейл вече съществува. '}<Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>Влезте</Link>{' за да се абонирате.'}</>
                        : <>An account with this email already exists.{' '}<Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>Sign in</Link>{' to subscribe.'}</>
                    )}
                  </div>
                )}

                <Button
                  variant="primary"
                  size="large"
                  fullWidth
                  onClick={handleGuestPayment}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <LoadingSpinner style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
                      {language === 'bg' ? 'Пренасочване...' : 'Redirecting...'}
                    </>
                  ) : (
                    language === 'bg'
                      ? `Плати €${displayPrice} ${getPeriodLabel()}`
                      : `Pay €${displayPrice} ${getPeriodLabel()}`
                  )}
                </Button>

                <GuestDivider>{language === 'bg' ? 'или' : 'or'}</GuestDivider>

                <div style={{ textAlign: 'center' }}>
                  <LoginPromptText style={{ marginBottom: 0 }}>
                    {language === 'bg' ? 'Вече имате акаунт?' : 'Already have an account?'}{' '}
                    <Link to={`/login?redirect=/checkout?planId=${planId}&billing=${billingPeriod}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                      {language === 'bg' ? 'Вход' : 'Log in'}
                    </Link>
                  </LoginPromptText>
                </div>
              </>
            ) : (
              <>
                {/* Payment method is pre-selected to Paysera — no selection UI needed */}

                <Button
                  variant="primary"
                  size="large"
                  fullWidth
                  onClick={handlePayment}
                  disabled={isProcessing || methodsLoading || !selectedMethod}
                >
                  {isProcessing ? (
                    <>
                      <LoadingSpinner style={{ width: '1rem', height: '1rem', marginRight: '0.5rem' }} />
                      {language === 'bg' ? 'Пренасочване...' : 'Redirecting...'}
                    </>
                  ) : (
                    language === 'bg'
                      ? `Плати €${displayPrice} ${getPeriodLabel()}`
                      : `Pay €${displayPrice} ${getPeriodLabel()}`
                  )}
                </Button>
              </>
            )}

            <SecureNote>
              <Lock size={14} />
              {language === 'bg'
                ? 'Ще бъдете пренасочени към избраната банка за сигурно плащане'
                : 'You will be redirected to the selected bank for secure payment'}
            </SecureNote>
          </PaymentSection>

          <OrderSummary>
            <SectionTitle>
              {language === 'bg' ? 'Обобщение на поръчката' : 'Order Summary'}
            </SectionTitle>

            <PlanCard $type={plan.cardType}>
              <PlanLogo $type={plan.cardType}>BOOM Card</PlanLogo>

              <CardNumber $type={plan.cardType}>
                <span>••••</span>
                <span>••••</span>
                <span>••••</span>
                <span>••••</span>
              </CardNumber>

              <CardBottomRow>
                <PlanName $type={plan.cardType}>
                  {language === 'bg' ? plan.displayNameBg : plan.displayName}
                </PlanName>
                <CardPriceDisplay $type={plan.cardType}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>{displayPriceBGN.toFixed(2)} {language === 'bg' ? 'лв.' : 'BGN'} /</span> €{displayPrice}
                  <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                    {getPeriodLabel()}
                  </span>
                </CardPriceDisplay>
              </CardBottomRow>
            </PlanCard>

            <SummaryRow>
              <SummaryLabel>{language === 'bg' ? 'План' : 'Plan'}</SummaryLabel>
              <SummaryValue>
                {language === 'bg' ? plan.displayNameBg : plan.displayName}
              </SummaryValue>
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
              {features.map((feature, index) => (
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
