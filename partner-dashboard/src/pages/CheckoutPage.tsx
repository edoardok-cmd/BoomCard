import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, Building2, Lock, Check, Loader2, Mail, User, Phone } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { plansService, Plan, PayseraPaymentMethod } from '../services/plans.service';
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

const PageTitle = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 2rem;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  @media (max-width: 768px) {
    font-size: 1.5rem;
    margin-bottom: 1.25rem;
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

const PaymentMethodsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
`;

const PaymentMethodCard = styled.div<{ $isSelected: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 0.75rem;
  border: 2px solid ${props => props.$isSelected ? 'var(--color-primary)' : 'var(--color-border)'};
  border-radius: 0.75rem;
  background: ${props => props.$isSelected ? 'rgba(0, 0, 0, 0.03)' : 'var(--color-background)'};
  cursor: pointer;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  min-height: 90px;
  justify-content: center;

  &:hover {
    border-color: ${props => props.$isSelected ? 'var(--color-primary)' : 'var(--color-text-tertiary)'};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  @media (max-width: 768px) {
    padding: 0.75rem 0.5rem;
    min-height: 80px;
  }
`;

const SelectedCheckmark = styled.div`
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  width: 20px;
  height: 20px;
  background: var(--color-primary, #000);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;

  svg {
    width: 12px;
    height: 12px;
  }
`;

const MethodLogo = styled.img`
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 0.5rem;

  @media (max-width: 768px) {
    width: 40px;
    height: 40px;
  }
`;

const MethodLogoFallback = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 0.5rem;
  background: var(--color-background-tertiary, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-tertiary, #9ca3af);
  text-transform: uppercase;

  @media (max-width: 768px) {
    width: 40px;
    height: 40px;
    font-size: 1rem;
  }
`;

const MethodName = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-align: center;
  line-height: 1.3;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const MethodSkeleton = styled.div`
  height: 90px;
  border-radius: 0.75rem;
  background: linear-gradient(90deg, var(--color-background-tertiary, #f3f4f6) 0%, var(--color-border, #e5e7eb) 50%, var(--color-background-tertiary, #f3f4f6) 100%);
  background-size: 1000px 100%;
  animation: shimmer 2s infinite linear;

  @keyframes shimmer {
    0% { background-position: -1000px 0; }
    100% { background-position: 1000px 0; }
  }
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

const EmailSection = styled.div`
  margin-bottom: 1.5rem;
`;

const FormFieldsGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const EmailInput = styled.input`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 1rem;
  color: var(--color-text);
  background: var(--color-surface);
  transition: border-color 200ms ease;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  &::placeholder {
    color: var(--color-text-secondary);
    opacity: 0.6;
  }
`;

// Inline SVG fallback icons for common payment method groups
const FALLBACK_ICONS: Record<string, string> = {
  // Bank transfer / banklink — building with columns
  banklink: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="8" fill="#EEF2FF"/><path d="M24 10L10 18v2h28v-2L24 10z" fill="#4F46E5"/><rect x="13" y="22" width="4" height="10" rx="1" fill="#6366F1"/><rect x="22" y="22" width="4" height="10" rx="1" fill="#6366F1"/><rect x="31" y="22" width="4" height="10" rx="1" fill="#6366F1"/><rect x="10" y="34" width="28" height="4" rx="1" fill="#4F46E5"/></svg>')}`,
  // Generic card icon
  card: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="8" fill="#FEF3C7"/><rect x="8" y="14" width="32" height="20" rx="3" fill="#F59E0B"/><rect x="8" y="19" width="32" height="5" fill="#D97706"/><rect x="12" y="28" width="10" height="3" rx="1" fill="#FDE68A"/></svg>')}`,
  // Wallet icon
  wallet: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="8" fill="#ECFDF5"/><rect x="8" y="14" width="32" height="22" rx="3" fill="#10B981"/><circle cx="34" cy="25" r="3" fill="#FFF"/></svg>')}`,
};

/**
 * Payment method icon with robust fallback chain:
 * logoRoundUrl -> logoUrl -> inline SVG -> initials placeholder
 */
const PaymentMethodIcon: React.FC<{ method: PayseraPaymentMethod; language: string }> = ({ method, language }) => {
  const [failCount, setFailCount] = useState(0);

  const altText = language === 'bg' ? method.titleBg : method.titleEn;

  // Build ordered list of image sources to try
  const sources: string[] = [];
  if (method.logoRoundUrl) sources.push(method.logoRoundUrl);
  if (method.logoUrl) sources.push(method.logoUrl);
  // Add inline SVG fallback matching the method key or group
  const svgFallback = FALLBACK_ICONS[method.key] || FALLBACK_ICONS[method.group];
  if (svgFallback) sources.push(svgFallback);

  const currentSrc = sources[failCount];

  if (!currentSrc) {
    // All sources exhausted — show initials
    const initials = (altText || method.key).slice(0, 2);
    return <MethodLogoFallback>{initials}</MethodLogoFallback>;
  }

  return (
    <MethodLogo
      src={currentSrc}
      alt={altText}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailCount(prev => prev + 1)}
    />
  );
};

const CheckoutPage: React.FC = () => {
  const [searchParams] = useSearchParams();
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

  // Guest checkout state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // Payment method selection state
  const [paymentMethods, setPaymentMethods] = useState<PayseraPaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [methodsError, setMethodsError] = useState<string | null>(null);

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

  useEffect(() => {
    const fetchMethods = async () => {
      try {
        setMethodsLoading(true);
        setMethodsError(null);
        const amountInCents = displayPrice ? Math.round(displayPrice * 100) : 1000;
        const methods = await plansService.getPaymentMethods('bg', 'EUR', amountInCents);
        setPaymentMethods(methods);
      } catch (err) {
        console.error('Error fetching payment methods:', err);
        // Use frontend fallback methods instead of showing an error
        console.warn('API unavailable, using fallback payment methods');
        setPaymentMethods([
          {
            key: 'card',
            title: 'Банкови карти',
            titleBg: 'Банкови карти',
            titleEn: 'Bank cards',
            logoUrl: 'https://bank.paysera.com/assets/image/payment_types/card.png',
            currency: 'EUR',
            group: 'cards',
            groupTitle: 'Cards',
          },
          {
            key: 'wallet',
            title: 'Paysera',
            titleBg: 'Paysera',
            titleEn: 'Paysera',
            logoUrl: 'https://bank.paysera.com/assets/image/payment_types/wallet.png',
            currency: 'EUR',
            group: 'wallet',
            groupTitle: 'Wallet',
          },
          {
            key: 'banklink',
            title: 'Банков превод',
            titleBg: 'Банков превод',
            titleEn: 'Bank transfer',
            logoUrl: FALLBACK_ICONS.banklink,
            currency: 'EUR',
            group: 'banks',
            groupTitle: 'Banks',
          },
        ]);
      } finally {
        setMethodsLoading(false);
      }
    };

    if (plan) {
      fetchMethods();
    }
  }, [plan, language]);

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
    if (!plan || !resolvedPlanId || !selectedMethod) return;
    if (!isAuthenticated && (!guestEmail || !guestName || !guestPhone)) return;

    setIsProcessing(true);
    try {
      const paymentResult = await plansService.createSubscriptionPayment(
        resolvedPlanId,
        billingPeriod,
        isAuthenticated ? undefined : guestEmail,
        isAuthenticated ? undefined : guestName,
        isAuthenticated ? undefined : guestPhone,
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

        <PageTitle>
          {language === 'bg' ? 'Завършете поръчката' : 'Complete your order'}
        </PageTitle>

        <CheckoutGrid>
          <PaymentSection>
            {!isAuthenticated && (
              <>
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

                <EmailSection>
                  <SectionTitle>
                    <User size={20} />
                    {language === 'bg' ? 'Вашите данни' : 'Your details'}
                  </SectionTitle>
                  <FormFieldsGrid>
                    <EmailInput
                      type="text"
                      placeholder={language === 'bg' ? 'Име и фамилия' : 'Full name'}
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      required
                    />
                    <EmailInput
                      type="email"
                      placeholder={language === 'bg' ? 'Имейл адрес' : 'Email address'}
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      required
                    />
                    <EmailInput
                      type="tel"
                      placeholder={language === 'bg' ? 'Телефонен номер' : 'Phone number'}
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      required
                    />
                  </FormFieldsGrid>
                </EmailSection>
              </>
            )}

            <SectionTitle>
              <Building2 size={20} />
              {language === 'bg' ? 'Изберете метод за плащане' : 'Choose payment method'}
            </SectionTitle>

            {methodsLoading ? (
              <PaymentMethodsGrid>
                {Array.from({ length: 6 }).map((_, i) => (
                  <MethodSkeleton key={i} />
                ))}
              </PaymentMethodsGrid>
            ) : methodsError ? (
              <ErrorMessage style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                {methodsError}
              </ErrorMessage>
            ) : (
              <PaymentMethodsGrid>
                {paymentMethods.map((method) => (
                  <PaymentMethodCard
                    key={method.key}
                    $isSelected={selectedMethod === method.key}
                    onClick={() => setSelectedMethod(method.key)}
                  >
                    {selectedMethod === method.key && (
                      <SelectedCheckmark>
                        <Check size={12} />
                      </SelectedCheckmark>
                    )}
                    <PaymentMethodIcon method={method} language={language} />
                    <MethodName>
                      {language === 'bg' ? method.titleBg : method.titleEn}
                    </MethodName>
                  </PaymentMethodCard>
                ))}
              </PaymentMethodsGrid>
            )}

            <Button
              variant="primary"
              size="large"
              fullWidth
              onClick={handlePayment}
              disabled={isProcessing || methodsLoading || !selectedMethod || (!isAuthenticated && (!guestEmail || !guestName || !guestPhone))}
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
