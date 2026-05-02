import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  BellAlertIcon,
  CheckCircleIcon,
  ArrowUpRightIcon,
  ArrowPathIcon,
  UserPlusIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  BuildingStorefrontIcon,
  CheckBadgeIcon,
  DocumentMagnifyingGlassIcon,
  ReceiptPercentIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CommandLineIcon,
  KeyIcon,
  ChatBubbleBottomCenterTextIcon,
} from '@heroicons/react/24/outline';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  adminAlertsService,
  AdminAlert,
  AlertSeverity,
  AlertTier,
} from '../../services/adminAlerts.service';

// Spec §3.2: alert titles displayed by id. Backend ships canonical Bulgarian
// strings; frontend overrides per language. Falls back to backend `title`
// (BG) for any unknown id, so a new backend signal still renders.
const TITLE_I18N: Record<string, { bg: string; en: string }> = {
  receipt_review: {
    bg: 'Касови бележки за ръчен преглед',
    en: 'Receipts pending manual review',
  },
  partner_invoices_overdue: {
    bg: 'Просрочени фактури от партньори',
    en: 'Overdue partner invoices',
  },
  failed_payments: {
    bg: 'Неуспешни плащания',
    en: 'Failed subscription payments',
  },
  unpaid_subscriptions: {
    bg: 'Неплатени абонаменти',
    en: 'Unpaid subscriptions',
  },
  risk_transactions: {
    bg: 'Рискови транзакции (Висок риск 61+)',
    en: 'High-risk transactions (61+)',
  },
  medium_risk_transactions: {
    bg: 'Транзакции за преглед (31–60)',
    en: 'Transactions for review (31–60)',
  },
  failed_transactions: {
    bg: 'Неуспешни транзакции (последните 24ч)',
    en: 'Failed transactions (last 24h)',
  },
  failed_payouts_pipeline: {
    bg: 'Неуспешни изплащания (последните 24ч)',
    en: 'Failed payouts (last 24h)',
  },
  fraud_check_errors: {
    bg: 'Грешки в проверката за измами (последните 24ч)',
    en: 'Fraud-check errors (last 24h)',
  },
  suspicious_iban_changes: {
    bg: 'Промени на IBAN (последните 24ч)',
    en: 'IBAN changes (last 24h)',
  },
  suspicious_activity: {
    bg: 'Подозрителна активност (последните 24ч)',
    en: 'Suspicious activity (last 24h)',
  },
  open_disputes: {
    bg: 'Активни спорове',
    en: 'Active disputes',
  },
  partner_requests: {
    bg: 'Нови партньорски заявки',
    en: 'New partner requests',
  },
  periods_for_review: {
    bg: 'Периоди за проверка',
    en: 'Periods for review',
  },
  payout_threshold: {
    bg: 'Абонати достигнали праг за изплащане',
    en: 'Subscribers reached payout threshold',
  },
  large_pending_payouts: {
    bg: 'Чакащи изплащания над лимита',
    en: 'Pending payouts above limit',
  },
  new_registrations: {
    bg: 'Нови регистрации (последните 24ч)',
    en: 'New registrations (last 24h)',
  },
  activated_partners: {
    bg: 'Активирани партньори (последните 24ч)',
    en: 'Activated partners (last 24h)',
  },
  completed_onboarding: {
    bg: 'Завършен онбординг (последните 24ч)',
    en: 'Onboarding completed (last 24h)',
  },
};

// Per-id icon mapping. Falls back to BellAlertIcon for unknown ids.
const ICON_BY_ID: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  receipt_review: DocumentMagnifyingGlassIcon,
  partner_invoices_overdue: ReceiptPercentIcon,
  failed_payments: CreditCardIcon,
  unpaid_subscriptions: CreditCardIcon,
  risk_transactions: ExclamationTriangleIcon,
  medium_risk_transactions: ExclamationTriangleIcon,
  failed_transactions: XCircleIcon,
  failed_payouts_pipeline: BanknotesIcon,
  fraud_check_errors: CommandLineIcon,
  suspicious_iban_changes: KeyIcon,
  suspicious_activity: BellAlertIcon,
  open_disputes: ChatBubbleBottomCenterTextIcon,
  partner_requests: UserPlusIcon,
  periods_for_review: CalendarDaysIcon,
  payout_threshold: BanknotesIcon,
  large_pending_payouts: BanknotesIcon,
  new_registrations: UserGroupIcon,
  activated_partners: BuildingStorefrontIcon,
  completed_onboarding: CheckBadgeIcon,
};

// Auto-refresh interval (spec §3.2 framing: dashboard exists for at-a-glance
// situational awareness — staleness should be minimal). 60s balances signal
// freshness with backend load (the alerts query runs ~18 parallel counts).
const REFRESH_INTERVAL_MS = 60_000;

/* ─── Palette (matches admin dashboard) ───────────────────────────────────── */
const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  surfaceAlt: '#f5f4ee',
  border: '#e8e5dc',
  borderStrong: '#d6d2c4',
  text: '#141413',
  textMuted: '#605a50',
  textSubtle: '#8c8678',
  accent: '#c96442',
  accentSoft: '#f3e8de',
  success: '#4a7c59',
  successSoft: '#e6efe3',
  warning: '#b5803a',
  warningSoft: '#f5ead2',
  danger: '#b54327',
  dangerSoft: '#f4dcd2',
};

/* ─── Styled components ────────────────────────────────────────────────────── */
const Shell = styled.div`
  padding: 2rem 0 4rem;
`;

const RefreshRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 1.5rem;
`;

const RefreshBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${palette.textMuted};
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  transition: color 180ms ease, background 180ms ease;

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  &:hover {
    color: ${palette.text};
    background: ${palette.surfaceAlt};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const Timestamp = styled.span`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-right: 0.75rem;
`;

const TierSection = styled.div`
  & + & {
    margin-top: 2rem;
  }
`;

const TierHeading = styled.h3`
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${palette.textSubtle};
  margin: 0 0 0.75rem;

  [data-theme='dark'] & {
    color: #9a948a;
  }
`;

const AlertList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
`;

const AlertRow = styled(motion(Link))<{ $severity: AlertSeverity }>`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: ${palette.surface};
  border: 1px solid
    ${p =>
      p.$severity === 'danger'
        ? '#e8b8ad'
        : p.$severity === 'warning'
          ? '#e8d8ad'
          : palette.border};
  border-left: 3px solid
    ${p =>
      p.$severity === 'danger'
        ? palette.danger
        : p.$severity === 'warning'
          ? palette.warning
          : palette.accent};
  border-radius: 0.75rem;
  text-decoration: none;
  transition: box-shadow 200ms ease, transform 200ms ease;

  [data-theme='dark'] & {
    background: #252320;
    border-color: ${p =>
      p.$severity === 'danger'
        ? 'rgba(181,67,39,0.4)'
        : p.$severity === 'warning'
          ? 'rgba(181,128,58,0.4)'
          : '#3a3732'};
    border-left-color: ${p =>
      p.$severity === 'danger'
        ? '#e27d5f'
        : p.$severity === 'warning'
          ? '#d4a165'
          : palette.accent};
  }

  &:hover {
    box-shadow: 0 4px 16px -8px rgba(20, 20, 19, 0.1);
    transform: translateY(-1px);
  }
`;

const AlertIconBox = styled.div<{ $severity: AlertSeverity }>`
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${p =>
    p.$severity === 'danger'
      ? palette.dangerSoft
      : p.$severity === 'warning'
        ? palette.warningSoft
        : palette.accentSoft};
  color: ${p =>
    p.$severity === 'danger'
      ? palette.danger
      : p.$severity === 'warning'
        ? palette.warning
        : palette.accent};

  [data-theme='dark'] & {
    background: ${p =>
      p.$severity === 'danger'
        ? 'rgba(181,67,39,0.2)'
        : p.$severity === 'warning'
          ? 'rgba(181,128,58,0.2)'
          : 'rgba(201,100,66,0.18)'};
    color: ${p =>
      p.$severity === 'danger' ? '#e27d5f' : p.$severity === 'warning' ? '#d4a165' : '#e08162'};
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    stroke-width: 1.75;
  }
`;

const AlertContent = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`;

const AlertTitle = styled.p`
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${palette.text};
  margin: 0;
  line-height: 1.3;

  [data-theme='dark'] & {
    color: #f5f3ec;
  }
`;

const AlertRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.875rem;
  flex-shrink: 0;
`;

// Informational counts get a quieter treatment so the eye is drawn to
// action-required tiers first (spec §3.2 — daily-orientation framing).
const CountBadge = styled.span<{ $severity: AlertSeverity }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  font-feature-settings: 'tnum';
  font-size: ${p => (p.$severity === 'info' ? '0.8125rem' : '0.875rem')};
  font-weight: ${p => (p.$severity === 'info' ? 500 : 700)};
  background: ${p =>
    p.$severity === 'danger'
      ? palette.dangerSoft
      : p.$severity === 'warning'
        ? palette.warningSoft
        : 'transparent'};
  border: ${p =>
    p.$severity === 'info' ? `1px solid ${palette.border}` : 'none'};
  color: ${p =>
    p.$severity === 'danger'
      ? palette.danger
      : p.$severity === 'warning'
        ? palette.warning
        : palette.textMuted};

  [data-theme='dark'] & {
    background: ${p =>
      p.$severity === 'danger'
        ? 'rgba(181,67,39,0.25)'
        : p.$severity === 'warning'
          ? 'rgba(181,128,58,0.25)'
          : 'transparent'};
    border-color: ${p => (p.$severity === 'info' ? '#3a3732' : 'transparent')};
    color: ${p =>
      p.$severity === 'danger' ? '#e27d5f' : p.$severity === 'warning' ? '#d4a165' : '#a8a297'};
  }
`;

const ArrowIcon = styled.div`
  color: ${palette.textSubtle};
  display: flex;
  align-items: center;

  svg {
    width: 1rem;
    height: 1rem;
    stroke-width: 1.8;
  }
`;

const AllClearCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.875rem;
  padding: 4rem 2rem;
  background: ${palette.successSoft};
  border: 1px solid #b8d8c0;
  border-radius: 1rem;
  color: ${palette.success};
  text-align: center;

  [data-theme='dark'] & {
    background: rgba(74, 124, 89, 0.1);
    border-color: rgba(74, 124, 89, 0.25);
    color: #79b090;
  }

  svg {
    width: 2.5rem;
    height: 2.5rem;
    opacity: 0.7;
  }
`;

const AllClearTitle = styled.h3`
  font-family: 'Tiempos Headline', 'Copernicus', 'Georgia', serif;
  font-size: 1.5rem;
  font-weight: 400;
  margin: 0;
  letter-spacing: -0.01em;
`;

const AllClearBody = styled.p`
  font-size: 0.9375rem;
  margin: 0;
  opacity: 0.8;
`;

const LoadingCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  padding: 4rem 2rem;
  color: ${palette.textMuted};
  font-size: 0.9375rem;

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`;

const ErrorCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.875rem;
  padding: 4rem 2rem;
  background: ${palette.dangerSoft};
  border: 1px solid #e8b8ad;
  border-radius: 1rem;
  color: ${palette.danger};
  text-align: center;

  [data-theme='dark'] & {
    background: rgba(181, 67, 39, 0.1);
    border-color: rgba(181, 67, 39, 0.3);
    color: #e27d5f;
  }

  svg {
    width: 2.5rem;
    height: 2.5rem;
    opacity: 0.7;
  }
`;

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
function tierToSeverity(tier: AlertTier): AlertSeverity {
  if (tier === 'critical') return 'danger';
  if (tier === 'operational') return 'warning';
  return 'info';
}

function tierLabel(tier: AlertTier, bg: boolean): string {
  if (tier === 'critical') return bg ? 'Критични' : 'Critical';
  if (tier === 'operational') return bg ? 'Оперативни' : 'Operational';
  return bg ? 'Информационни' : 'Informational';
}

/* ─── Component ────────────────────────────────────────────────────────────── */
const AdminAlertsPage: React.FC = () => {
  const { language } = useLanguage();
  const bg = language === 'bg';

  // Shared cache key: AdminFinanceReportsPage reads the same key for its focus
  // banner, and AdminPartnerRequestsPage invalidates it on approve/reject so
  // the badge updates without waiting for the 60s poll.
  //
  // refetchIntervalInBackground=false is deliberate: this query fires ~18
  // parallel counts and a raw $queryRaw on every poll, so we don't burn that
  // budget when the tab is hidden. react-query's default refetchOnWindowFocus
  // covers staleness on re-foregrounding, so the worst-case freshness gap is
  // "until the admin tabs back in", not "until the next 60s tick".
  const { data: result, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-alerts'],
    queryFn: adminAlertsService.getAlerts,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const error = isError ? (bg ? 'Неуспешно зареждане на сигналите.' : 'Failed to load alerts.') : null;

  const generatedAt = result?.generatedAt
    ? new Date(result.generatedAt).toLocaleTimeString(bg ? 'bg-BG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Skip building tiers when the latest fetch errored — the JSX is gated on
  // `!error` anyway, but doing the work would read from a stale `result` and
  // is wasted compute on every error render.
  //
  // Informational tier visibility rule (spec §3.2 — "кратка дневна ориентация"):
  // Show it when there are critical/operational items (daily orientation alongside
  // active work), or when it has its own items. Suppress it — and show only the
  // all-clear card — when everything is empty, to avoid the dual-render of
  // "All Clear" + "No new signals in the last 24 hours".
  const hasActionItems = !error && result
    ? result.critical.length > 0 || result.operational.length > 0
    : false;
  const tiers: { tier: AlertTier; items: AdminAlert[] }[] = !error && result
    ? [
        { tier: 'critical' as AlertTier, items: result.critical },
        { tier: 'operational' as AlertTier, items: result.operational },
        { tier: 'informational' as AlertTier, items: result.informational },
      ].filter(t => t.items.length > 0 || (t.tier === 'informational' && hasActionItems))
    : [];

  return (
    <Shell>
      <RefreshRow>
        {/* Hide the timestamp when the latest fetch errored — it would otherwise read from
            a stale `result?.generatedAt` and falsely imply the counts below are fresh. */}
        {!error && generatedAt && (
          <Timestamp>
            {bg ? `Обновено в ${generatedAt}` : `Updated at ${generatedAt}`}
          </Timestamp>
        )}
        <RefreshBtn onClick={() => refetch()} disabled={isFetching}>
          <ArrowPathIcon style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined} />
          {bg ? 'Обнови' : 'Refresh'}
        </RefreshBtn>
      </RefreshRow>

      {isLoading && (
        <LoadingCard>
          <ArrowPathIcon style={{ animation: 'spin 1s linear infinite' }} />
          <span>{bg ? 'Зареждане…' : 'Loading…'}</span>
        </LoadingCard>
      )}

      {error && (
        <ErrorCard>
          <BellAlertIcon />
          <div>
            <AllClearTitle>{bg ? 'Грешка' : 'Error'}</AllClearTitle>
            <AllClearBody>{error}</AllClearBody>
          </div>
        </ErrorCard>
      )}

      {!isLoading && !error && result && result.totalCount === 0 && (
        <AllClearCard>
          <CheckCircleIcon />
          <div>
            <AllClearTitle>{bg ? 'Всичко е наред' : 'All Clear'}</AllClearTitle>
            <AllClearBody>
              {bg
                ? 'Няма елементи, изискващи незабавно внимание.'
                : 'No items require immediate attention.'}
            </AllClearBody>
          </div>
        </AllClearCard>
      )}

      {/* Hide stale data when the latest fetch errored — a populated `result`
          can hang around from the previous successful poll, and rendering it
          alongside the ErrorCard would imply the counts are still trustworthy. */}
      {!error && tiers.map(({ tier, items }) => (
        <TierSection key={tier}>
          <TierHeading>{tierLabel(tier, bg)}</TierHeading>
          <AlertList>
            {tier === 'informational' && items.length === 0 && (
              <li style={{
                padding: '0.75rem 1rem',
                color: '#8c8678',
                fontSize: '0.875rem',
                listStyle: 'none',
                fontStyle: 'italic',
              }}>
                {bg
                  ? 'Няма нови сигнали за последните 24 часа'
                  : 'No new signals in the last 24 hours'}
              </li>
            )}
            {items.map((alert, idx) => {
              const severity = tierToSeverity(alert.tier);
              const i18n = TITLE_I18N[alert.id];
              const baseTitle = i18n ? (bg ? i18n.bg : i18n.en) : alert.title;
              // Append "(≥X лв/BGN)" when the backend supplied a threshold via meta —
              // keeps EN titles in parity with BG instead of dropping the number.
              const threshold = alert.meta?.['threshold'];
              const title =
                typeof threshold === 'number' || typeof threshold === 'string'
                  ? `${baseTitle} (≥${threshold} ${bg ? 'лв' : 'BGN'})`
                  : baseTitle;
              const Icon = ICON_BY_ID[alert.id] ?? BellAlertIcon;
              return (
                <AlertRow
                  key={alert.id}
                  to={alert.link}
                  $severity={severity}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * idx, duration: 0.25 }}
                >
                  <AlertIconBox $severity={severity}>
                    <Icon />
                  </AlertIconBox>
                  <AlertContent>
                    <AlertTitle>{title}</AlertTitle>
                  </AlertContent>
                  <AlertRight>
                    <CountBadge $severity={severity}>{alert.count}</CountBadge>
                    <ArrowIcon>
                      <ArrowUpRightIcon />
                    </ArrowIcon>
                  </AlertRight>
                </AlertRow>
              );
            })}
          </AlertList>
        </TierSection>
      ))}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Shell>
  );
};

export default AdminAlertsPage;
