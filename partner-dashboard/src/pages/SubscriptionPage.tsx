import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, CreditCard, Calendar, Clock, ExternalLink } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrentSubscription, useToggleAutoRenewal, useCancelSubscriptionById, useReactivateSubscription, useRetrySubscriptionPayment, useSubscriptionHistory, useRequestTrialRefund, useUpdateSubscriptionPlan, useInitiateCardUpdate, hasActiveSubscription } from '../hooks/useBilling';
import { Button } from '../components/common/Button/Button';
import {
  customerSubStatusLabel,
  customerPlanLabel,
  customerPaymentStatusLabel,
  paymentStatusTone,
} from '../utils/customerLabels';

const PageContainer = styled.div`
  min-height: calc(100vh - 4rem);
  background: #f9fafb;
  padding: 2rem 1rem;
  [data-theme="dark"] & {
    background: #0a0a0a;
  }
`;

const Container = styled.div`
  max-width: 680px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.375rem;
  [data-theme="dark"] & { color: #f9fafb; }
`;

const Subtitle = styled.p`
  color: #6b7280;
  font-size: 1rem;
  [data-theme="dark"] & { color: #9ca3af; }
`;

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const Card = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 1.75rem;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  border: 1px solid #e5e7eb;
  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }
`;

const CardTitle = styled.h2`
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  [data-theme="dark"] & { color: #9ca3af; }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const Label = styled.span`
  font-size: 0.875rem;
  color: #6b7280;
  [data-theme="dark"] & { color: #9ca3af; }
`;

const Value = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
  [data-theme="dark"] & { color: #f9fafb; }
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid #f3f4f6;
  margin: 1rem 0;
  [data-theme="dark"] & { border-color: #374151; }
`;

const PlanBadge = styled.span<{ $plan: string }>`
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.875rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  background: ${({ $plan }) => {
    // Canonical SubscriptionPlan tokens: PREMIUM_MONTHLY (purple, top tier),
    // PREMIUM_WEEKLY (violet), BASIC (blue). Anything else falls back to grey.
    if ($plan === 'PREMIUM_MONTHLY') return 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)';
    if ($plan === 'PREMIUM_WEEKLY') return 'linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)';
    if ($plan === 'BASIC') return 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)';
    return 'linear-gradient(135deg, #374151 0%, #6b7280 100%)';
  }};
  color: white;
`;

// Status colour mapping mirrors AdminSubscriberDetailPage SubStatusBadge so a
// subscription reads the same colour on the customer page and the admin detail.
// Buckets: success (active/trialing) · warn (PAST_DUE/UNPAID at-risk) ·
// info (INCOMPLETE in-flight 3DS/SCA) · danger (INCOMPLETE_EXPIRED failed onboarding) ·
// purple (EXPIRED natural lapse, distinct from CANCELLED — spec §4.2) ·
// neutral (CANCELLED, PAUSED, anything unknown).
const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ $status }) => {
    if ($status === 'ACTIVE' || $status === 'TRIALING') return '#d1fae5';
    if ($status === 'PAST_DUE' || $status === 'UNPAID') return '#fff7ed';
    if ($status === 'INCOMPLETE') return '#dbeafe';
    if ($status === 'INCOMPLETE_EXPIRED') return '#fee2e2';
    if ($status === 'EXPIRED') return '#ede9fe';
    return '#f3f4f6';
  }};
  color: ${({ $status }) => {
    if ($status === 'ACTIVE' || $status === 'TRIALING') return '#065f46';
    if ($status === 'PAST_DUE' || $status === 'UNPAID') return '#c2410c';
    if ($status === 'INCOMPLETE') return '#1e40af';
    if ($status === 'INCOMPLETE_EXPIRED') return '#991b1b';
    if ($status === 'EXPIRED') return '#6d28d9';
    if ($status === 'PAUSED') return '#374151';
    return '#6b7280';
  }};
  [data-theme="dark"] & {
    background: ${({ $status }) => {
      if ($status === 'ACTIVE' || $status === 'TRIALING') return 'rgba(16, 185, 129, 0.2)';
      if ($status === 'PAST_DUE' || $status === 'UNPAID') return 'rgba(234, 88, 12, 0.2)';
      if ($status === 'INCOMPLETE') return 'rgba(37, 99, 235, 0.2)';
      if ($status === 'INCOMPLETE_EXPIRED') return 'rgba(239, 68, 68, 0.2)';
      if ($status === 'EXPIRED') return 'rgba(124, 58, 237, 0.2)';
      return 'rgba(107, 114, 128, 0.2)';
    }};
    color: ${({ $status }) => {
      if ($status === 'ACTIVE' || $status === 'TRIALING') return '#34d399';
      if ($status === 'PAST_DUE' || $status === 'UNPAID') return '#fb923c';
      if ($status === 'INCOMPLETE') return '#93c5fd';
      if ($status === 'INCOMPLETE_EXPIRED') return '#fca5a5';
      if ($status === 'EXPIRED') return '#c4b5fd';
      if ($status === 'PAUSED') return '#d1d5db';
      return '#9ca3af';
    }};
  }
`;

const GraceAlert = styled(motion.div)`
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 1rem;
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  [data-theme="dark"] & {
    background: rgba(234, 88, 12, 0.12);
    border-color: rgba(234, 88, 12, 0.3);
  }
`;

const GraceIcon = styled.div`
  color: #c2410c;
  flex-shrink: 0;
  margin-top: 0.125rem;
  [data-theme="dark"] & { color: #fb923c; }
`;

const GraceBody = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const GraceTitle = styled.span`
  font-size: 0.9375rem;
  font-weight: 700;
  color: #c2410c;
  [data-theme="dark"] & { color: #fb923c; }
`;

const GraceDesc = styled.span`
  font-size: 0.8125rem;
  color: #92400e;
  [data-theme="dark"] & { color: #fdba74; }
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const ToggleInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const ToggleLabel = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
  [data-theme="dark"] & { color: #f9fafb; }
`;

const ToggleDesc = styled.span`
  font-size: 0.8125rem;
  color: #6b7280;
  [data-theme="dark"] & { color: #9ca3af; }
`;

const Toggle = styled.button<{ $on: boolean }>`
  position: relative;
  width: 3rem;
  height: 1.625rem;
  border-radius: 9999px;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
  background: ${({ $on }) => ($on ? '#7c3aed' : '#d1d5db')};
  [data-theme="dark"] & {
    background: ${({ $on }) => ($on ? '#7c3aed' : '#4b5563')};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ToggleThumb = styled.span<{ $on: boolean }>`
  position: absolute;
  top: 0.1875rem;
  left: ${({ $on }) => ($on ? '1.4375rem' : '0.1875rem')};
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: white;
  transition: left 0.2s;
`;

const DangerCard = styled(Card)`
  border-color: #fecaca;
  [data-theme="dark"] & { border-color: rgba(239, 68, 68, 0.3); }
`;

const ConfirmBox = styled(motion.div)`
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  margin-top: 1rem;
  [data-theme="dark"] & {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.25);
  }
`;

const ConfirmText = styled.p`
  font-size: 0.875rem;
  color: #991b1b;
  margin-bottom: 0.875rem;
  [data-theme="dark"] & { color: #fca5a5; }
`;

const ConfirmActions = styled.div`
  display: flex;
  gap: 0.75rem;
`;

const LoadingText = styled.p`
  color: #6b7280;
  text-align: center;
  padding: 3rem 0;
`;

const EmptyText = styled.p`
  color: #6b7280;
  text-align: center;
  padding: 2rem 0;
`;

const CardIcon = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const CardBrand = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  text-transform: capitalize;
  [data-theme="dark"] & { color: #d1d5db; }
`;

const HistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
`;

const HistoryItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const HistoryLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const HistoryDate = styled.span`
  font-size: 0.875rem;
  color: #374151;
  font-weight: 500;
  [data-theme="dark"] & { color: #d1d5db; }
`;

// Drives off PaymentTone (success / warn / danger / neutral) instead of a
// hard-coded 'paid' check, so post-Stripe statuses ('completed', 'refunded',
// 'processing', 'cancelled', etc.) get the right colour instead of all
// non-'paid' values rendering red.
const HistoryStatus = styled.span<{ $tone: 'success' | 'warn' | 'danger' | 'neutral' }>`
  font-size: 0.75rem;
  color: ${({ $tone }) => {
    if ($tone === 'success') return '#059669';
    if ($tone === 'warn') return '#c2410c';
    if ($tone === 'neutral') return '#6b7280';
    return '#dc2626';
  }};
  [data-theme="dark"] & {
    color: ${({ $tone }) => {
      if ($tone === 'success') return '#34d399';
      if ($tone === 'warn') return '#fb923c';
      if ($tone === 'neutral') return '#9ca3af';
      return '#fca5a5';
    }};
  }
`;

const HistoryRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const HistoryAmount = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
  [data-theme="dark"] & { color: #f9fafb; }
`;

const PdfLink = styled.a`
  color: #7c3aed;
  display: flex;
  align-items: center;
  &:hover { opacity: 0.75; }
`;

const PayseraMethodRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const PayseraLogo = styled.span`
  font-size: 0.875rem;
  font-weight: 700;
  color: #e03d00;
  letter-spacing: 0.02em;
`;

const InfoText = styled.p`
  font-size: 0.8125rem;
  color: #6b7280;
  margin-bottom: 1rem;
  line-height: 1.5;
  [data-theme="dark"] & { color: #9ca3af; }
`;

const DeleteAccountCard = styled.div`
  border-radius: 1rem;
  padding: 1.25rem 1.75rem;
  border: 1px solid #e5e7eb;
  background: white;
  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }
`;

const DeleteAccountTitle = styled.p`
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
  [data-theme="dark"] & { color: #9ca3af; }
`;

const DeleteAccountDesc = styled.p`
  font-size: 0.8125rem;
  color: #6b7280;
  margin-bottom: 0.875rem;
  [data-theme="dark"] & { color: #9ca3af; }
`;

function formatDate(iso: string | null | undefined, locale?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale ?? 'bg-BG', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function SubscriptionPage() {
  const { t, language } = useLanguage();
  const { data: currentSubscriptionData, isLoading, isError, refetch } = useCurrentSubscription();
  // Normalize the { hasSubscription: false, subscription: null } empty-state
  // shape (a real 200 response, not an error) down to `undefined`, same as a
  // genuinely-empty result — so every existing `subscription?.foo` usage
  // below keeps working unchanged. Fetch failures are handled separately via
  // `isError`, before this normalization ever runs (see the render branches
  // below) — they must NOT fall through to the "no subscription" UI.
  const subscription = hasActiveSubscription(currentSubscriptionData) ? currentSubscriptionData : undefined;
  const queryClient = useQueryClient();
  const toggleAutoRenewal = useToggleAutoRenewal();
  const cancelSubscription = useCancelSubscriptionById();
  const reactivate = useReactivateSubscription();
  const retryPayment = useRetrySubscriptionPayment();
  const trialRefund = useRequestTrialRefund();
  const updatePlan = useUpdateSubscriptionPlan();
  const initiateCardUpdate = useInitiateCardUpdate();
  const hasStripe = !!subscription?.stripeSubscriptionId;
  // Backend /subscriptions/history returns synthesized entries for Paysera
  // users (incl. anonymous checkout), so don't gate the panel on Stripe.
  const { data: history = [], isLoading: historyLoading } = useSubscriptionHistory(!!subscription);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Spec §2.2: cancellation within the 24h trial window must trigger a full
  // refund and void any cashback earned during the trial. The trial-refund
  // endpoint encapsulates all of that; the regular cancel endpoint does not.
  const trialRefundActive = !!(
    subscription?.trialRefundEligibleUntil &&
    !subscription.trialRefundUsed &&
    new Date(subscription.trialRefundEligibleUntil).getTime() > Date.now()
  );

  // LOW fix: trialRefundActive is computed at render time from Date.now(). If the
  // component has been mounted and the user leaves the tab open past the 24h expiry
  // boundary, the UI would continue to offer the refund path until the next render.
  // Schedule a query invalidation at the exact expiry moment so the component
  // re-renders with an up-to-date trialRefundActive = false.
  useEffect(() => {
    if (!subscription?.trialRefundEligibleUntil || subscription.trialRefundUsed) return;
    const expiry = new Date(subscription.trialRefundEligibleUntil).getTime();
    const msUntilExpiry = expiry - Date.now();
    if (msUntilExpiry <= 0) return; // already expired
    const timerId = window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
    }, msUntilExpiry);
    return () => window.clearTimeout(timerId);
  }, [subscription?.trialRefundEligibleUntil, subscription?.trialRefundUsed, queryClient]);

  const isPastDue = subscription?.status === 'PAST_DUE';
  const isCancelled = subscription?.status === 'CANCELLED';
  const isScheduledForCancel = subscription?.cancelAtPeriodEnd && !isCancelled;

  // FINDING-1 fix: gracePeriodEndsAt is a phantom field — it does not exist
  // in the backend Prisma schema and is never returned by /api/subscriptions/current.
  // The PAST_DUE grace countdown previously depended on this field, making the
  // retry-payment button permanently unreachable for PAST_DUE users.
  //
  // Replacement: derive grace days remaining from currentPeriodEnd, which IS a
  // real backend field. For PAST_DUE subscriptions the billing system continues
  // to give a window beyond currentPeriodEnd before final cancellation. We
  // compute days-remaining from currentPeriodEnd directly so the countdown still
  // works without the phantom field.
  const graceDaysLeft = (() => {
    if (!isPastDue) return null;
    const periodEnd = subscription?.currentPeriodEnd;
    if (!periodEnd) return null;
    const diff = new Date(periodEnd).getTime() - Date.now();
    // For PAST_DUE subscriptions still within the current period (e.g. Stripe's
    // built-in grace), show remaining days. If the period has already passed,
    // return 0 — the alert still renders and the retry CTA remains reachable.
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();
  const isPaysera = !!subscription?.payseraOrderId;
  // Mirrors getActiveSubscription() status whitelist so the change-card CTA is
  // only shown when the backend can actually act on the subscription.
  const isActionableSub = ['ACTIVE', 'TRIALING', 'PAST_DUE', 'PAUSED'].includes(subscription?.status ?? '');

  const handleToggleAutoRenewal = () => {
    if (!subscription) return;
    toggleAutoRenewal.mutate({
      subscriptionId: subscription.id,
      autoRenewal: !subscription.autoRenewal,
    });
  };

  const handleCancel = () => {
    if (!subscription) return;
    if (trialRefundActive) {
      // Within the 24h window — cancel + refund + void cashback in one shot.
      trialRefund.mutate(subscription.id, {
        onSuccess: () => setShowCancelConfirm(false),
        // LOW fix: also dismiss the confirm dialog on failure so the user is not
        // left staring at an open dialog with no actionable path forward.
        onError: () => setShowCancelConfirm(false),
      });
      return;
    }
    cancelSubscription.mutate(
      { subscriptionId: subscription.id, cancelAtPeriodEnd: true },
      {
        onSuccess: () => setShowCancelConfirm(false),
        // LOW fix: dismiss the confirm dialog on error too.
        onError: () => setShowCancelConfirm(false),
      }
    );
  };

  const handleReactivate = () => {
    if (!subscription) return;
    reactivate.mutate(subscription.id);
  };

  const handleRetryPayment = () => {
    if (!subscription) return;
    retryPayment.mutate(subscription.id);
  };

  // Spec §5.6: dedicated "upgrade to Premium Monthly" CTA. The backend's
  // updateSubscriptionPlan applies a pro-rata wallet credit on the
  // BASIC→PREMIUM_MONTHLY and PREMIUM_WEEKLY→PREMIUM_MONTHLY transitions.
  // The backend rejects same-plan updates today (subscription.service.ts
  // ~line 236), so we hide the CTA once the user is already on
  // PREMIUM_MONTHLY. Plan token must match the canonical SubscriptionPlan
  // enum (PREMIUM_WEEKLY | BASIC | PREMIUM_MONTHLY).
  const isOnPremium = subscription?.plan === 'PREMIUM_MONTHLY';
  const handleUpgradeToPremium = () => {
    if (!subscription || isOnPremium) return;
    updatePlan.mutate({ subscriptionId: subscription.id, plan: 'PREMIUM_MONTHLY' });
  };

  if (isLoading) {
    return (
      <PageContainer>
        <Container>
          <LoadingText>{t('subscriptionPage.loading')}</LoadingText>
        </Container>
      </PageContainer>
    );
  }

  // UXR-3 fix: a failed GET /subscriptions/current must NOT be presented as
  // "no active subscription" — that misleads a paying subscriber into
  // thinking their subscription is gone and steers them toward "View Plans"
  // (i.e. buying again). Show a distinct load-failed message with a retry
  // action instead, and stop here so the genuinely-empty branch below never
  // runs for an errored fetch.
  //
  // Guarded on `!subscription` (impl-r1 F1): TanStack Query keeps the last
  // successful `data` around when a later background refetch fails (e.g. the
  // app's global refetchOnReconnect:true firing after a network blip), so an
  // unconditional isError check would replace an already-correct, already
  // -rendered subscription with this error screen. Only show it when there's
  // no known-good subscription to keep displaying.
  if (isError && !subscription) {
    return (
      <PageContainer>
        <Container>
          <Stack>
            <div style={{ textAlign: 'center' }}>
              <AlertTriangle size={32} color="#dc2626" style={{ margin: '0 auto 0.75rem' }} />
              <EmptyText>{t('subscriptionPage.loadFailed')}</EmptyText>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Button variant="primary" onClick={() => refetch()}>
                {t('subscriptionPage.retry')}
              </Button>
            </div>
          </Stack>
        </Container>
      </PageContainer>
    );
  }

  if (!subscription) {
    return (
      <PageContainer>
        <Container>
          <Stack>
            <EmptyText>{t('subscriptionPage.noSubscription')}</EmptyText>
            <div style={{ textAlign: 'center' }}>
              <Link to="/subscriptions">
                <Button variant="primary">{t('subscriptionPage.goToPlans')}</Button>
              </Link>
            </div>
            <DeleteAccountCard>
              <DeleteAccountTitle>{t('subscriptionPage.deleteAccountTitle')}</DeleteAccountTitle>
              <DeleteAccountDesc>{t('subscriptionPage.deleteAccountDesc')}</DeleteAccountDesc>
              <Link to="/settings">
                <Button variant="ghost" size="small">{t('subscriptionPage.deleteAccountLink')}</Button>
              </Link>
            </DeleteAccountCard>
          </Stack>
        </Container>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Container>
        <PageHeader>
          <Title>{t('subscriptionPage.title')}</Title>
          <Subtitle>{t('subscriptionPage.subtitle')}</Subtitle>
        </PageHeader>

        <Stack>
          {/* Grace period alert — FINDING-1 fix: render whenever isPastDue is
               true, not only when graceDaysLeft is non-null. The retry and
               update-payment CTAs must always be reachable for PAST_DUE users. */}
          <AnimatePresence>
            {isPastDue && (
              <GraceAlert
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <GraceIcon><AlertTriangle size={20} /></GraceIcon>
                <GraceBody>
                  <GraceTitle>{t('subscriptionPage.gracePeriodAlert')}</GraceTitle>
                  <GraceDesc>
                    {isPaysera
                      ? (graceDaysLeft !== null && graceDaysLeft > 0
                          ? t('subscriptionPage.gracePeriodPayseraMsg').replace('{days}', String(graceDaysLeft))
                          : t('subscriptionPage.gracePeriodPayseraExpired'))
                      : (graceDaysLeft !== null && graceDaysLeft > 0
                          ? t('subscriptionPage.gracePeriodMsg').replace('{days}', String(graceDaysLeft))
                          : t('subscriptionPage.gracePeriodExpired'))}
                  </GraceDesc>
                  <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
                    {isPaysera ? (
                      <a href="mailto:office@boomcard.bg">
                        <Button variant="primary" size="small">
                          <CreditCard size={14} style={{ marginRight: 6 }} />
                          {t('subscriptionPage.gracePeriodPayseraCta')}
                        </Button>
                      </a>
                    ) : (
                      <>
                        <Button
                          variant="primary"
                          size="small"
                          onClick={handleRetryPayment}
                          disabled={retryPayment.isPending}
                        >
                          <RefreshCw size={14} style={{ marginRight: 6 }} />
                          {retryPayment.isPending
                            ? t('subscriptionPage.retryPaymentPending')
                            : t('subscriptionPage.retryPayment')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => initiateCardUpdate.mutate(subscription.id, {
                            onError: (err) => {
                              const status: number | undefined = (err as any)?.response?.status;
                              if (status === 409) {
                                toast.error(t('subscriptionPage.changeCardConflict'));
                              } else {
                                toast.error(t('subscriptionPage.changeCardError'));
                              }
                            },
                          })}
                          disabled={initiateCardUpdate.isPending}
                        >
                          <CreditCard size={14} style={{ marginRight: 6 }} />
                          {t('subscriptionPage.updatePayment')}
                        </Button>
                      </>
                    )}
                  </div>
                </GraceBody>
              </GraceAlert>
            )}
          </AnimatePresence>

          {/* Plan details card */}
          <Card
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <CardTitle>
              <Calendar size={14} />
              {t('subscriptionPage.currentPlan')}
            </CardTitle>

            <Row>
              <Label>{t('subscriptionPage.currentPlan')}</Label>
              <PlanBadge $plan={subscription.plan}>{customerPlanLabel(subscription.plan, language)}</PlanBadge>
            </Row>

            <Divider />

            <Row>
              <Label>{t('subscriptionPage.status')}</Label>
              <StatusBadge $status={subscription.status}>{customerSubStatusLabel(subscription.status, language)}</StatusBadge>
            </Row>

            {subscription.currentPeriodStart && subscription.currentPeriodEnd && (
              <>
                <Divider />
                <Row>
                  <Label>{t('subscriptionPage.billingPeriod')}</Label>
                  <Value>
                    {formatDate(subscription.currentPeriodStart, language === 'bg' ? 'bg-BG' : 'en-US')} {t('subscriptionPage.to')} {formatDate(subscription.currentPeriodEnd, language === 'bg' ? 'bg-BG' : 'en-US')}
                  </Value>
                </Row>
                {!isCancelled && (
                  <>
                    <Divider />
                    <Row>
                      <Label>{t('subscriptionPage.nextBilling')}</Label>
                      <Value>{formatDate(subscription.currentPeriodEnd, language === 'bg' ? 'bg-BG' : 'en-US')}</Value>
                    </Row>
                  </>
                )}
              </>
            )}

            <Divider />

            <Row>
              <Link to="/subscriptions">
                <Button variant="ghost" size="small">{t('subscriptionPage.changePlan')}</Button>
              </Link>
            </Row>
          </Card>

          {/* Auto-renewal card */}
          {!isCancelled && (
            <Card
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}
            >
              <CardTitle>
                <RefreshCw size={14} />
                {t('subscriptionPage.autoRenewal')}
              </CardTitle>

              <ToggleRow>
                <ToggleInfo>
                  <ToggleLabel>
                    {subscription.autoRenewal
                      ? t('subscriptionPage.autoRenewalOn')
                      : subscription.currentPeriodEnd
                        ? t('subscriptionPage.autoRenewalOff').replace('{date}', formatDate(subscription.currentPeriodEnd, language === 'bg' ? 'bg-BG' : 'en-US'))
                        : t('subscriptionPage.autoRenewalOffShort')}
                  </ToggleLabel>
                  <ToggleDesc>{t('subscriptionPage.autoRenewalDesc')}</ToggleDesc>
                </ToggleInfo>
                <Toggle
                  $on={subscription.autoRenewal}
                  onClick={handleToggleAutoRenewal}
                  disabled={toggleAutoRenewal.isPending}
                  aria-label={t('subscriptionPage.autoRenewal')}
                >
                  <ToggleThumb $on={subscription.autoRenewal} />
                </Toggle>
              </ToggleRow>
            </Card>
          )}

          {/* Upgrade to Premium Monthly (spec §5.6) — hidden once already on PREMIUM */}
          {!isCancelled && !isOnPremium && (
            <Card
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.07 }}
            >
              <CardTitle>
                <RefreshCw size={14} />
                {t('subscriptionPage.upgradeToPremium')}
              </CardTitle>
              <ToggleDesc>
                {t('subscriptionPage.upgradeToPremiumDesc')}
              </ToggleDesc>
              <Row>
                <Button
                  variant="primary"
                  size="medium"
                  onClick={handleUpgradeToPremium}
                  disabled={updatePlan.isPending}
                >
                  {t('subscriptionPage.upgradeBtn')}
                </Button>
              </Row>
            </Card>
          )}

          {/* Payment method card — Stripe (card details) */}
          {hasStripe && subscription.paymentMethod && (
            <Card
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.08 }}
            >
              <CardTitle>
                <CreditCard size={14} />
                {t('subscriptionPage.paymentMethod')}
              </CardTitle>
              <Row>
                <Label>{t('subscriptionPage.paymentMethodCard')}</Label>
                <CardIcon>
                  <CardBrand>{subscription.paymentMethod.brand ?? 'card'}</CardBrand>
                  <Value>•••• {subscription.paymentMethod.last4}</Value>
                  {subscription.paymentMethod.expiryMonth && subscription.paymentMethod.expiryYear && (
                    <Label>
                      {String(subscription.paymentMethod.expiryMonth).padStart(2, '0')}/
                      {String(subscription.paymentMethod.expiryYear).slice(-2)}
                    </Label>
                  )}
                </CardIcon>
              </Row>
              <Divider />
              <Row>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => initiateCardUpdate.mutate(subscription.id, {
                    onError: (err) => {
                      const status: number | undefined = (err as any)?.response?.status;
                      if (status === 409) {
                        toast.error(t('subscriptionPage.changeCardConflict'));
                      } else {
                        toast.error(t('subscriptionPage.changeCardError'));
                      }
                    },
                  })}
                  disabled={initiateCardUpdate.isPending}
                >
                  {t('subscriptionPage.changeCard')}
                </Button>
              </Row>
            </Card>
          )}

          {/* Payment method card — Paysera (§3.4 action 2: manage payment method).
               Shown for Paysera subscriptions that have no Stripe card on file. */}
          {!hasStripe && isPaysera && isActionableSub && (
            <Card
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.08 }}
            >
              <CardTitle>
                <CreditCard size={14} />
                {t('subscriptionPage.paymentMethod')}
              </CardTitle>
              <PayseraMethodRow>
                <Label>{t('subscriptionPage.paymentMethodCard')}</Label>
                <PayseraLogo>{t('subscriptionPage.paymentMethodPaysera')}</PayseraLogo>
              </PayseraMethodRow>
              <Divider />
              <InfoText>{t('subscriptionPage.changeCardPayseraInfo')}</InfoText>
              <div>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => initiateCardUpdate.mutate(subscription.id, {
                    onError: (err) => {
                      const status: number | undefined = (err as any)?.response?.status;
                      if (status === 409) {
                        toast.error(t('subscriptionPage.changeCardConflict'));
                      } else {
                        toast.error(t('subscriptionPage.changeCardError'));
                      }
                    },
                  })}
                  disabled={initiateCardUpdate.isPending}
                >
                  <CreditCard size={14} style={{ marginRight: 6 }} />
                  {initiateCardUpdate.isPending
                    ? t('subscriptionPage.changeCardPayseraPending')
                    : t('subscriptionPage.changeCardPayseraBtn')}
                </Button>
              </div>
            </Card>
          )}

          {/* Payment history (works for Stripe + Paysera; backend synthesizes
               entries for anonymous-checkout users that have no Transaction row). */}
          {!!subscription && (
            <Card
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
            >
              <CardTitle>
                <Clock size={14} />
                {t('subscriptionPage.paymentHistory')}
              </CardTitle>
              {historyLoading ? (
                <LoadingText style={{ padding: '1rem 0' }}>{t('subscriptionPage.historyLoading')}</LoadingText>
              ) : history.length === 0 ? (
                <EmptyText style={{ padding: '0.75rem 0' }}>{t('subscriptionPage.historyEmpty')}</EmptyText>
              ) : (
                <HistoryList>
                  {history.map((item, i) => (
                    <div key={item.id}>
                      {i > 0 && <Divider />}
                      <HistoryItem>
                        <HistoryLeft>
                          <HistoryDate>{formatDate(item.date, language === 'bg' ? 'bg-BG' : 'en-US')}</HistoryDate>
                          <HistoryStatus $tone={paymentStatusTone(item.status)}>{customerPaymentStatusLabel(item.status, language)}</HistoryStatus>
                        </HistoryLeft>
                        <HistoryRight>
                          <HistoryAmount>
                            {item.amount.toFixed(2)} {item.currency}
                          </HistoryAmount>
                          {item.pdfUrl && (
                            <PdfLink href={item.pdfUrl} target="_blank" rel="noopener noreferrer" title="Download invoice">
                              <ExternalLink size={14} />
                            </PdfLink>
                          )}
                        </HistoryRight>
                      </HistoryItem>
                    </div>
                  ))}
                </HistoryList>
              )}
            </Card>
          )}

          {/* Reactivate card (when scheduled for cancel or already cancelled) */}
          {(isScheduledForCancel || isCancelled) && (
            <Card
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
            >
              <CardTitle>
                <CheckCircle size={14} />
                {t('subscriptionPage.reactivate')}
              </CardTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <ToggleDesc>{t('subscriptionPage.reactivateDesc')}</ToggleDesc>
                <div>
                  <Button variant="primary" onClick={handleReactivate} disabled={reactivate.isPending}>
                    {t('subscriptionPage.reactivateBtn')}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Cancel card */}
          {!isCancelled && !isScheduledForCancel && (
            <DangerCard
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
            >
              <CardTitle>
                <XCircle size={14} />
                {trialRefundActive
                  ? t('subscriptionPage.cancelWithRefund')
                  : t('subscriptionPage.cancelSubscription')}
              </CardTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <ToggleDesc>
                  {trialRefundActive
                    ? t('subscriptionPage.trialRefundDesc')
                    : t('subscriptionPage.cancelDesc')}
                </ToggleDesc>

              {!showCancelConfirm ? (
                <div>
                  <Button variant="ghost" onClick={() => setShowCancelConfirm(true)}>
                    {trialRefundActive
                      ? t('subscriptionPage.cancelWithRefund')
                      : t('subscriptionPage.cancelSubscription')}
                  </Button>
                </div>
              ) : (
                <AnimatePresence>
                  <ConfirmBox
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ConfirmText>
                      {trialRefundActive
                        ? t('subscriptionPage.trialRefundConfirm')
                        : t('subscriptionPage.cancelConfirm').replace(
                            '{date}',
                            formatDate(subscription.currentPeriodEnd, language === 'bg' ? 'bg-BG' : 'en-US')
                          )}
                    </ConfirmText>
                    <ConfirmActions>
                      <Button
                        variant="primary"
                        onClick={handleCancel}
                        disabled={cancelSubscription.isPending || trialRefund.isPending}
                      >
                        {trialRefundActive
                          ? t('subscriptionPage.refundBtn')
                          : t('subscriptionPage.cancelBtn')}
                      </Button>
                      <Button variant="ghost" onClick={() => setShowCancelConfirm(false)}>
                        {t('common.cancel')}
                      </Button>
                    </ConfirmActions>
                  </ConfirmBox>
                </AnimatePresence>
              )}
              </div>
            </DangerCard>
          )}

          {/* §3.4 action (4): navigate to profile deletion (Settings danger zone). */}
          <DeleteAccountCard>
            <DeleteAccountTitle>{t('subscriptionPage.deleteAccountTitle')}</DeleteAccountTitle>
            <DeleteAccountDesc>{t('subscriptionPage.deleteAccountDesc')}</DeleteAccountDesc>
            <Link to="/settings">
              <Button variant="ghost" size="small">{t('subscriptionPage.deleteAccountLink')}</Button>
            </Link>
          </DeleteAccountCard>
        </Stack>
      </Container>
    </PageContainer>
  );
}
