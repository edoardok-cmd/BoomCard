import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation, Link } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, Lock, Check, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { plansService, Plan } from '../services/plans.service';
import { formatEUR } from '../utils/helpers';
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

// M2 fix: inline "this plan/billing combo is not purchasable" notice, styled to
// match the page's existing error-display patterns (red-on-tinted surface).
const UnavailableNotice = styled.div`
  padding: 1rem 1.25rem;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 0.5rem;
  color: #dc2626;
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 1rem;
`;

// Primary-styled link back to the plans grid, used by the M2 unavailable state.
const BackToPlansButton = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.875rem 1.5rem;
  border-radius: 0.5rem;
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  font-size: 1rem;
  text-decoration: none;
  transition: background 0.2s;

  &:hover {
    background: var(--color-primary-hover);
  }
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
  const location = useLocation();
  const { language, t } = useLanguage();
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
  const [emailConflictCode, setEmailConflictCode] = useState<'EMAIL_ALREADY_HAS_ACTIVE_PLAN' | 'EMAIL_REGISTERED_NO_ACTIVE_PLAN' | 'CHECKOUT_ALREADY_IN_PROGRESS' | null>(null);
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
        setError(t('checkoutPage.noPlanSelected'));
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
        setError(t('checkoutPage.errorLoadingPlan'));
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

  // M2 fix: the selected billing period is only purchasable when (a) the plan
  // actually offers it and (b) a positive price exists for it. PlanPricing's
  // weekly/monthly are nullable, so a missing/zero price must NOT be coalesced
  // to a payable "Pay €0.00". `billing` comes straight from the URL and was
  // never validated against the plan's billingOptions, so guard both here.
  const billingOffered = (() => {
    if (!plan) return false;
    switch (billingPeriod) {
      case 'weekly':
        return plan.billingOptions.hasWeekly;
      case 'yearly':
        return plan.billingOptions.hasYearly;
      default:
        return plan.billingOptions.hasMonthly;
    }
  })();
  const priceUnavailable =
    !!plan && (!billingOffered || displayPrice === null || !(displayPrice > 0));

  // BC-QA-031: plan prices come from the API already in EUR, so they are
  // formatted as-is — the previous EUR→BGN→EUR round trip through the retired
  // dual-currency util added nothing but double rounding.
  // When the price is unavailable for the selected period, show an em-dash
  // instead of a misleading "€0.00" in the order summary (M2 fix).
  const formattedPrice = priceUnavailable ? '—' : formatEUR(displayPrice);

  const getPeriodLabel = () => {
    switch (billingPeriod) {
      case 'weekly':
        return t('checkoutPage.perWeek');
      case 'yearly':
        return t('checkoutPage.perYear');
      default:
        return t('checkoutPage.perMonth');
    }
  };

  const handlePayment = async () => {
    if (!plan || !resolvedPlanId || !selectedMethod) return;

    // M2 fix: never start a payment for a billing period the plan does not offer
    // or that has no valid price (would otherwise post a €0.00 order).
    if (priceUnavailable) return;

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
      setError(t('checkoutPage.errorProcessingPayment'));
      setIsProcessing(false);
    }
  };

  const validateGuestForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      errors.email = t('checkoutPage.enterValidEmail');
    }
    if (!guestFirstName.trim()) {
      errors.firstName = t('checkoutPage.requiredField');
    }
    if (!guestLastName.trim()) {
      errors.lastName = t('checkoutPage.requiredField');
    }
    setGuestErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleGuestPayment = async () => {
    if (!validateGuestForm() || !resolvedPlanId || !plan) return;
    // M2 fix: block guest checkout for an unavailable billing period / price.
    if (priceUnavailable) return;
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
      console.error('Guest payment error:', err?.response?.data ?? err?.message ?? err);
      const status = err?.response?.status;
      const code = err?.response?.data?.code;
      if (status === 409) {
        if (
          code === 'EMAIL_ALREADY_HAS_ACTIVE_PLAN' ||
          code === 'EMAIL_REGISTERED_NO_ACTIVE_PLAN' ||
          code === 'CHECKOUT_ALREADY_IN_PROGRESS'
        ) {
          setEmailConflictCode(code);
        } else {
          const msg = err?.response?.data?.message;
          setError(msg || t('checkoutPage.requestFailedRetry'));
        }
      } else {
        setError(t('checkoutPage.errorProcessingPayment'));
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
            <p>{t('checkoutPage.loading')}</p>
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
            {t('checkoutPage.backToPlans')}
          </BackLink>
          <ErrorMessage>
            {error || t('checkoutPage.planNotFound')}
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
          {t('checkoutPage.backToPlans')}
        </BackLink>

        <CheckoutGrid>
          <PaymentSection>
            {priceUnavailable ? (
              /* M2 fix: the selected billing period is not offered by this plan
                 (or carries no valid price). Show an unavailable state and a way
                 back to the plans instead of a payable "Pay €0.00" button. */
              <>
                <UnavailableNotice>
                  {t('checkoutPage.billingPeriodUnavailable')}
                </UnavailableNotice>
                <BackToPlansButton to="/#subscription-plans">
                  {t('checkoutPage.backToPlans')}
                </BackToPlansButton>
              </>
            ) : !isAuthenticated ? (
              <>
                <GuestForm>
                  <GuestRow>
                    <GuestField>
                      <GuestLabel>{t('checkoutPage.firstNameLabel')} *</GuestLabel>
                      <GuestInput
                        type="text"
                        value={guestFirstName}
                        onChange={e => setGuestFirstName(e.target.value)}
                        $hasError={!!guestErrors.firstName}
                        placeholder={t('checkoutPage.firstNamePlaceholder')}
                      />
                      {guestErrors.firstName && <FieldError>{guestErrors.firstName}</FieldError>}
                    </GuestField>
                    <GuestField>
                      <GuestLabel>{t('checkoutPage.lastNameLabel')} *</GuestLabel>
                      <GuestInput
                        type="text"
                        value={guestLastName}
                        onChange={e => setGuestLastName(e.target.value)}
                        $hasError={!!guestErrors.lastName}
                        placeholder={t('checkoutPage.lastNamePlaceholder')}
                      />
                      {guestErrors.lastName && <FieldError>{guestErrors.lastName}</FieldError>}
                    </GuestField>
                  </GuestRow>

                  <GuestField>
                    <GuestLabel>{t('checkoutPage.emailAddressLabel')} *</GuestLabel>
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
                    <GuestLabel>{t('checkoutPage.phoneOptionalLabel')}</GuestLabel>
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
                      <>
                        {' '}{t('checkoutPage.emailConflictActivePlanPrefix')}{' '}
                        <Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>{t('checkoutPage.emailConflictActivePlanLinkText')}</Link>
                        {' '}{t('checkoutPage.emailConflictActivePlanSuffix')}
                      </>
                    ) : emailConflictCode === 'CHECKOUT_ALREADY_IN_PROGRESS' ? (
                      t('checkoutPage.emailConflictInProgress')
                    ) : (
                      <>
                        {' '}{t('checkoutPage.emailConflictExistsPrefix')}{' '}
                        <Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>{t('checkoutPage.emailConflictExistsLinkText')}</Link>
                        {' '}{t('checkoutPage.emailConflictExistsSuffix')}
                      </>
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
                      {t('checkoutPage.redirecting')}
                    </>
                  ) : (
                    `${t('checkoutPage.pay')} ${formattedPrice} ${getPeriodLabel()}`
                  )}
                </Button>

                <GuestDivider>{t('checkoutPage.or')}</GuestDivider>

                <div style={{ textAlign: 'center' }}>
                  <LoginPromptText style={{ marginBottom: 0 }}>
                    {t('checkoutPage.alreadyHaveAccount')}{' '}
                    {/* M1 fix: LoginPage redirects via `location.state.from`, NOT a
                        `redirect` query param. Pass the in-progress checkout URL
                        (pathname + the original planId/planCode/billing search
                        params, intact) as router state so a returning subscriber
                        lands back on the exact plan they were buying. */}
                    <Link
                      to="/login"
                      state={{ from: { pathname: location.pathname, search: location.search } }}
                      style={{ color: 'var(--color-primary)', fontWeight: 600 }}
                    >
                      {t('checkoutPage.logIn')}
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
                      {t('checkoutPage.redirecting')}
                    </>
                  ) : (
                    `${t('checkoutPage.pay')} ${formattedPrice} ${getPeriodLabel()}`
                  )}
                </Button>
              </>
            )}

            <SecureNote>
              <Lock size={14} />
              {t('checkoutPage.secureRedirectNote')}
            </SecureNote>
          </PaymentSection>

          <OrderSummary>
            <SectionTitle>
              {t('checkoutPage.orderSummary')}
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
                  {formattedPrice}
                  <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                    {getPeriodLabel()}
                  </span>
                </CardPriceDisplay>
              </CardBottomRow>
            </PlanCard>

            <SummaryRow>
              <SummaryLabel>{t('checkoutPage.planLabel')}</SummaryLabel>
              <SummaryValue>
                {language === 'bg' ? plan.displayNameBg : plan.displayName}
              </SummaryValue>
            </SummaryRow>

            <TotalRow>
              <TotalLabel>{t('checkoutPage.total')}</TotalLabel>
              <div style={{ textAlign: 'right' }}>
                <TotalValue>{formattedPrice}</TotalValue>
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
