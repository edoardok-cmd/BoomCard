/**
 * SubscriptionSuccessPage
 * Displays subscription verification status after payment redirect from Paysera
 *
 * SECURITY: This page NEVER activates the subscription.
 * Activation happens ONLY via webhook. This page only displays status.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import Button from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { plansService, SubscriptionStatus } from '../services/plans.service';
import DownloadAppSection from '../components/common/DownloadAppSection/DownloadAppSection';

const PageContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
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
  const location = useLocation();
  const { language, t } = useLanguage();

  // Extract orderId and Paysera redirect data from URL
  const searchParams = new URLSearchParams(location.search);
  const orderId = searchParams.get('orderId');
  const payseraData = searchParams.get('data');
  const payseraSs1 = searchParams.get('ss1');

  const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'error'>('loading');
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPolling, setIsPolling] = useState(true);
  const [redirectVerified, setRedirectVerified] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [anonymousEmail, setAnonymousEmail] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Refs that let the polling interval read latest values without being deps
  const elapsedRef = useRef(0);
  const activeRef = useRef(false);

  const verifyRedirectData = useCallback(async () => {
    if (!payseraData || !payseraSs1 || redirectVerified) return false;

    try {
      const result = await plansService.verifyPaymentRedirect(payseraData, payseraSs1);
      setRedirectVerified(true);

      if (result.isSuccess) {
        setStatus('success');
        setIsPolling(false);
        activeRef.current = false;
        // Create a minimal subscription-like object for display
        setSubscription({
          subscriptionId: '',
          status: 'ACTIVE',
          plan: { code: '', name: orderId || 'BoomCard', nameBg: null },
          billingPeriod: '',
          currentPeriodEnd: '',
          isActive: true,
        });
        return true;
      }
    } catch (error) {
      console.error('Error verifying redirect:', error);
    }
    return false;
  }, [payseraData, payseraSs1, redirectVerified, orderId]);

  // checkStatus no longer has elapsedTime in deps — reads elapsedRef instead.
  const checkStatus = useCallback(async () => {
    if (!orderId) {
      setStatus('error');
      return;
    }

    try {
      const result = await plansService.checkSubscriptionStatus(orderId);
      setSubscription(result);

      if (result.type === 'pending') {
        // Anonymous checkout — payment paid, waiting for user to complete profile
        if (result.status === 'PAID' || result.status === 'COMPLETED') {
          setIsAnonymous(true);
          setAnonymousEmail(result.email || null);
          setStatus('success');
          setIsPolling(false);
          activeRef.current = false;
        } else if (result.status === 'FAILED') {
          setStatus('error');
          setIsPolling(false);
          activeRef.current = false;
        } else {
          // Webhook not yet received — try redirect-data fallback immediately
          if (!redirectVerified && payseraData && payseraSs1) {
            const verified = await verifyRedirectData();
            if (verified) return;
          }
          setStatus('pending');
        }
        return;
      }

      if (result.isActive) {
        setStatus('success');
        setIsPolling(false);
        activeRef.current = false;
      } else {
        setStatus('pending');
      }
    } catch (error) {
      // 404 = "not processed yet" — expected during polling, don't log as error
      const is404 = (error as { response?: { status?: number } })?.response?.status === 404;
      if (!is404) {
        console.error('Error checking subscription status:', error);
      }

      // If subscription not found, try verifying Paysera redirect data
      if (!redirectVerified && payseraData && payseraSs1) {
        const verified = await verifyRedirectData();
        if (verified) return;
      }

      // Don't immediately show error - might just be processing
      if (elapsedRef.current > MAX_TOTAL_TIME) {
        setStatus('error');
        setIsPolling(false);
        activeRef.current = false;
      }
    }
  }, [orderId, redirectVerified, payseraData, payseraSs1, verifyRedirectData]);

  // Keep a ref to the latest checkStatus so the interval always calls the
  // freshest version without being a dep that would restart the effect.
  const checkStatusRef = useRef(checkStatus);
  useEffect(() => { checkStatusRef.current = checkStatus; }, [checkStatus]);

  // Polling effect — stable: only re-runs on orderId change or manual retry.
  // Does NOT depend on checkStatus, status, or isPolling so state updates
  // inside checkStatus cannot trigger a cascade of new intervals.
  useEffect(() => {
    if (!orderId) {
      setStatus('error');
      return;
    }

    elapsedRef.current = 0;
    activeRef.current = true;
    setElapsedTime(0);
    setIsPolling(true);

    checkStatusRef.current();

    const pollInterval = setInterval(() => {
      if (!activeRef.current) {
        clearInterval(pollInterval);
        return;
      }
      elapsedRef.current += POLLING_INTERVAL;
      setElapsedTime(elapsedRef.current);
      if (elapsedRef.current >= MAX_TOTAL_TIME) {
        setIsPolling(false);
        activeRef.current = false;
        clearInterval(pollInterval);
        return;
      }
      checkStatusRef.current();
    }, POLLING_INTERVAL);

    return () => {
      activeRef.current = false;
      clearInterval(pollInterval);
    };
  }, [orderId, retryCount]);

  const handleRetry = () => {
    setElapsedTime(0);
    setIsPolling(true);
    setStatus('loading');
    setRetryCount(c => c + 1);
  };

  const showTimeoutWarning = elapsedTime >= MAX_POLLING_TIME && status !== 'success';

  const getTitle = () => {
    switch (status) {
      case 'success':
        return t('subscriptionSuccessPage.titleSuccess');
      case 'pending':
        return t('subscriptionSuccessPage.titlePending');
      case 'error':
        return t('subscriptionSuccessPage.titleError');
      default:
        return t('subscriptionSuccessPage.titleDefault');
    }
  };

  const getSubtitle = () => {
    switch (status) {
      case 'success':
        return t('subscriptionSuccessPage.subtitleSuccess');
      case 'pending':
        return t('subscriptionSuccessPage.subtitlePending');
      case 'error':
        return t('subscriptionSuccessPage.subtitleError');
      default:
        return t('subscriptionSuccessPage.subtitleDefault');
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
        return t('subscriptionSuccessPage.weekly');
      case 'monthly':
        return t('subscriptionSuccessPage.monthly');
      case 'yearly':
        return t('subscriptionSuccessPage.yearly');
      default:
        return period;
    }
  };

  return (
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

          {showTimeoutWarning && (
            <TimeoutWarning>
              {t('subscriptionSuccessPage.timeoutWarning')}
            </TimeoutWarning>
          )}

          {subscription && (
            <SubscriptionDetails>
              <DetailRow>
                <DetailLabel>{t('subscriptionSuccessPage.planLabel')}</DetailLabel>
                <DetailValue>
                  {language === 'bg' ? subscription.plan.nameBg : subscription.plan.name}
                </DetailValue>
              </DetailRow>
              <DetailRow>
                <DetailLabel>{t('subscriptionSuccessPage.billingPeriodLabel')}</DetailLabel>
                <DetailValue>{getBillingPeriodLabel(subscription.billingPeriod)}</DetailValue>
              </DetailRow>
              <DetailRow>
                <DetailLabel>{t('subscriptionSuccessPage.statusLabel')}</DetailLabel>
                <StatusBadge $active={subscription.isActive}>
                  {subscription.isActive
                    ? t('subscriptionSuccessPage.statusActive')
                    : t('subscriptionSuccessPage.statusProcessing')}
                </StatusBadge>
              </DetailRow>
              {subscription.currentPeriodEnd && subscription.isActive && (
                <DetailRow>
                  <DetailLabel>{t('subscriptionSuccessPage.validUntilLabel')}</DetailLabel>
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

          {isAnonymous && (
            <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(102,126,234,0.08)', borderRadius: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✉️</div>
              <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.4rem', color: 'var(--color-text-primary)' }}>
                {t('subscriptionSuccessPage.checkInbox')}
              </p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                {anonymousEmail
                  ? <>{t('subscriptionSuccessPage.setupLinkSentPrefix')} {anonymousEmail}{t('subscriptionSuccessPage.setupLinkSentSuffix')}</>
                  : t('subscriptionSuccessPage.setupLinkSentGeneric')}
                {' '}
                {t('subscriptionSuccessPage.linkExpires')}
              </p>
            </div>
          )}

          <ButtonContainer>
            {status === 'success' && !isAnonymous ? (
              <Link to="/dashboard">
                <Button variant="primary" size="large" fullWidth>
                  {t('subscriptionSuccessPage.goToDashboard')}
                </Button>
              </Link>
            ) : status === 'error' || (showTimeoutWarning && !isPolling) ? (
              <>
                <RetryButton variant="primary" size="large" onClick={handleRetry}>
                  <RefreshCw size={18} />
                  {t('subscriptionSuccessPage.tryAgain')}
                </RetryButton>
                <Link to="/support">
                  <Button variant="secondary" size="large" fullWidth>
                    {t('subscriptionSuccessPage.contactSupport')}
                  </Button>
                </Link>
              </>
            ) : null}
          </ButtonContainer>

          {isPolling && status !== 'success' && (
            <PollingIndicator>
              <Loader2 />
              {t('subscriptionSuccessPage.checkingStatus')}
            </PollingIndicator>
          )}
        </Card>

        {status === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <DownloadAppSection />
          </motion.div>
        )}
    </PageContainer>
  );
};

export default SubscriptionSuccessPage;
