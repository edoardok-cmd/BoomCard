/**
 * SubscriptionSuccessPage
 * Displays subscription verification status after payment redirect from Paysera
 *
 * SECURITY: This page NEVER activates the subscription.
 * Activation happens ONLY via webhook. This page only displays status.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import Button from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { plansService, SubscriptionStatus } from '../services/plans.service';
import Header from '../components/layout/Header/Header';
import Footer from '../components/layout/Footer/Footer';

const PageWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
`;

const PageContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6rem 1rem 2rem;
`;

const Card = styled(motion.div)`
  width: 100%;
  max-width: 32rem;
  background: var(--color-background-secondary);
  border-radius: 1rem;
  box-shadow: var(--shadow-hover);
  padding: 3rem;
  border: 1px solid var(--color-border);
  text-align: center;

  @media (max-width: 640px) {
    padding: 2rem 1.5rem;
  }
`;

const IconContainer = styled.div<{ $status: 'loading' | 'success' | 'pending' | 'error' }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
  background: ${props => {
    switch (props.$status) {
      case 'success': return 'rgba(16, 185, 129, 0.1)';
      case 'pending': return 'rgba(245, 158, 11, 0.1)';
      case 'error': return 'rgba(239, 68, 68, 0.1)';
      default: return 'rgba(59, 130, 246, 0.1)';
    }
  }};

  svg {
    width: 40px;
    height: 40px;
    color: ${props => {
      switch (props.$status) {
        case 'success': return '#10b981';
        case 'pending': return '#f59e0b';
        case 'error': return '#ef4444';
        default: return '#3b82f6';
      }
    }};
  }
`;

const SpinningLoader = styled(Loader2)`
  animation: spin 1s linear infinite;

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const Title = styled.h1`
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.75rem;
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin-bottom: 2rem;
  line-height: 1.6;
`;

const SubscriptionDetails = styled.div`
  background: var(--color-background);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
  border: 1px solid var(--color-border);
  text-align: left;
`;

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }
`;

const DetailLabel = styled.span`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
`;

const DetailValue = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-primary);
`;

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  background: ${props => props.$active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'};
  color: ${props => props.$active ? '#10b981' : '#f59e0b'};
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const RetryButton = styled(Button)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
`;

const PollingIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-top: 1rem;

  svg {
    width: 16px;
    height: 16px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const TimeoutWarning = styled.div`
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
  color: #92400e;

  [data-theme="dark"] & {
    background: rgba(245, 158, 11, 0.1);
    border-color: #f59e0b;
    color: #fbbf24;
  }
`;

const POLLING_INTERVAL = 2000; // 2 seconds
const MAX_POLLING_TIME = 30000; // 30 seconds before showing warning
const MAX_TOTAL_TIME = 120000; // 2 minutes before giving up

const SubscriptionSuccessPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();

  // Extract orderId from URL
  const searchParams = new URLSearchParams(location.search);
  const orderId = searchParams.get('orderId');

  const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'error'>('loading');
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPolling, setIsPolling] = useState(true);

  const checkStatus = useCallback(async () => {
    if (!orderId) {
      setStatus('error');
      return;
    }

    try {
      const result = await plansService.checkSubscriptionStatus(orderId);
      setSubscription(result);

      if (result.isActive) {
        setStatus('success');
        setIsPolling(false);
      } else {
        setStatus('pending');
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
      // Don't immediately show error - might just be processing
      if (elapsedTime > MAX_TOTAL_TIME) {
        setStatus('error');
        setIsPolling(false);
      }
    }
  }, [orderId, elapsedTime]);

  // Initial check and polling
  useEffect(() => {
    if (!orderId) {
      setStatus('error');
      return;
    }

    // Initial check
    checkStatus();

    // Set up polling interval
    const pollInterval = setInterval(() => {
      if (isPolling && status !== 'success') {
        checkStatus();
        setElapsedTime(prev => prev + POLLING_INTERVAL);
      }
    }, POLLING_INTERVAL);

    // Stop polling after max time
    const timeoutId = setTimeout(() => {
      setIsPolling(false);
    }, MAX_TOTAL_TIME);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeoutId);
    };
  }, [orderId, checkStatus, isPolling, status]);

  const handleRetry = () => {
    setElapsedTime(0);
    setIsPolling(true);
    setStatus('loading');
    checkStatus();
  };

  const showTimeoutWarning = elapsedTime >= MAX_POLLING_TIME && status !== 'success';

  const getTitle = () => {
    switch (status) {
      case 'success':
        return language === 'bg' ? 'Плащането е успешно!' : 'Payment Successful!';
      case 'pending':
        return language === 'bg' ? 'Проверка на плащането...' : 'Verifying Payment...';
      case 'error':
        return language === 'bg' ? 'Нещо се обърка' : 'Something Went Wrong';
      default:
        return language === 'bg' ? 'Обработка...' : 'Processing...';
    }
  };

  const getSubtitle = () => {
    switch (status) {
      case 'success':
        return language === 'bg'
          ? 'Вашият абонамент е активен. Можете да започнете да използвате Premium функциите веднага.'
          : 'Your subscription is now active. You can start using Premium features right away.';
      case 'pending':
        return language === 'bg'
          ? 'Моля, изчакайте докато потвърдим вашето плащане. Това обикновено отнема няколко секунди.'
          : 'Please wait while we confirm your payment. This usually takes a few seconds.';
      case 'error':
        return language === 'bg'
          ? 'Не успяхме да потвърдим вашето плащане. Моля, свържете се с поддръжката ако проблемът продължава.'
          : 'We could not confirm your payment. Please contact support if the issue persists.';
      default:
        return language === 'bg'
          ? 'Зареждане...'
          : 'Loading...';
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle />;
      case 'pending':
        return <Clock />;
      case 'error':
        return <AlertCircle />;
      default:
        return <SpinningLoader />;
    }
  };

  const getBillingPeriodLabel = (period: string | undefined) => {
    if (!period) return '-';
    switch (period) {
      case 'weekly':
        return language === 'bg' ? 'Седмичен' : 'Weekly';
      case 'monthly':
        return language === 'bg' ? 'Месечен' : 'Monthly';
      case 'yearly':
        return language === 'bg' ? 'Годишен' : 'Yearly';
      default:
        return period;
    }
  };

  return (
    <PageWrapper>
      <Header />
      <PageContainer>
        <Card
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <IconContainer $status={status}>
            {getIcon()}
          </IconContainer>

          <Title>{getTitle()}</Title>
          <Subtitle>{getSubtitle()}</Subtitle>

          {showTimeoutWarning && status !== 'success' && (
            <TimeoutWarning>
              {language === 'bg'
                ? 'Обработката отнема повече време от очакваното. Вашето плащане може да бъде все още в процес на обработка.'
                : 'Processing is taking longer than expected. Your payment may still be processing.'}
            </TimeoutWarning>
          )}

          {subscription && (
            <SubscriptionDetails>
              <DetailRow>
                <DetailLabel>{language === 'bg' ? 'План' : 'Plan'}</DetailLabel>
                <DetailValue>
                  {language === 'bg' ? subscription.plan.nameBg : subscription.plan.name}
                </DetailValue>
              </DetailRow>
              <DetailRow>
                <DetailLabel>{language === 'bg' ? 'Период' : 'Billing Period'}</DetailLabel>
                <DetailValue>{getBillingPeriodLabel(subscription.billingPeriod)}</DetailValue>
              </DetailRow>
              <DetailRow>
                <DetailLabel>{language === 'bg' ? 'Статус' : 'Status'}</DetailLabel>
                <StatusBadge $active={subscription.isActive}>
                  {subscription.isActive
                    ? (language === 'bg' ? 'Активен' : 'Active')
                    : (language === 'bg' ? 'Обработва се' : 'Processing')}
                </StatusBadge>
              </DetailRow>
              {subscription.currentPeriodEnd && subscription.isActive && (
                <DetailRow>
                  <DetailLabel>{language === 'bg' ? 'Валиден до' : 'Valid Until'}</DetailLabel>
                  <DetailValue>
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString(
                      language === 'bg' ? 'bg-BG' : 'en-US',
                      { year: 'numeric', month: 'long', day: 'numeric' }
                    )}
                  </DetailValue>
                </DetailRow>
              )}
            </SubscriptionDetails>
          )}

          <ButtonContainer>
            {status === 'success' ? (
              <Link to="/dashboard">
                <Button variant="primary" size="large" fullWidth>
                  {language === 'bg' ? 'Към Профила' : 'Go to Dashboard'}
                </Button>
              </Link>
            ) : status === 'error' || (showTimeoutWarning && !isPolling) ? (
              <>
                <RetryButton variant="primary" size="large" onClick={handleRetry}>
                  <RefreshCw size={18} />
                  {language === 'bg' ? 'Опитай отново' : 'Try Again'}
                </RetryButton>
                <Link to="/support">
                  <Button variant="secondary" size="large" fullWidth>
                    {language === 'bg' ? 'Свържи се с поддръжката' : 'Contact Support'}
                  </Button>
                </Link>
              </>
            ) : null}
          </ButtonContainer>

          {isPolling && status !== 'success' && (
            <PollingIndicator>
              <Loader2 />
              {language === 'bg' ? 'Проверка на статуса...' : 'Checking status...'}
            </PollingIndicator>
          )}
        </Card>
      </PageContainer>
      <Footer />
    </PageWrapper>
  );
};

export default SubscriptionSuccessPage;
