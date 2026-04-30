import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminSubscriptionsService,
  AdminSubscription,
  BillingCycle,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../services/adminSubscriptions.service';

/* ─── Palette ─────────────────────────────────────────────────────────────── */
const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  border: '#e8e5dc',
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
  info: '#2563eb',
  infoSoft: '#dbeafe',
  purple: '#7c3aed',
  purpleSoft: '#ede9fe',
  teal: '#0f766e',
  tealSoft: '#ccfbf1',
  amber: '#92400e',
  amberSoft: '#fef3c7',
  testTagBg: '#f1f5f9',
  testTagFg: '#475569',
};

/* ─── i18n ─────────────────────────────────────────────────────────────────── */
type Lang = 'bg' | 'en';

const T = {
  eyebrow:           { bg: 'Абонати',                                    en: 'Subscribers' },
  title:             { bg: 'Абонаменти',                                 en: 'Subscriptions' },
  subtitle:          { bg: 'Управление на планове, подновявания и анулации.',
                       en: 'Manage all subscriber plans, renewals, and cancellations' },
  searchPlaceholder: { bg: 'Търсене по име, имейл или телефон…',         en: 'Search by name, email or phone…' },
  excludeTest:       { bg: 'Скрий тестови акаунти',                      en: 'Hide test accounts' },
  exportCsv:         { bg: 'Експорт CSV',                                en: 'Export CSV' },
  noName:            { bg: '(без име)',                                  en: '(no name)' },
  emptyMessage:      { bg: 'Не са намерени абонаменти',                  en: 'No subscriptions found' },
  testTag:           { bg: 'тест',                                       en: 'test' },
  plansInHistory:    { bg: 'плана в историята',                          en: 'plans in history' },
  cancelsAt:         { bg: 'Спира',                                      en: 'Cancels' },
  atPeriodEnd:       { bg: 'в края на периода',                          en: 'at period end' },
  on:                { bg: 'Вкл.',                                       en: 'On' },
  off:               { bg: 'Изкл.',                                      en: 'Off' },
  payments:          { bg: 'Плащания',                                   en: 'Payments' },
  noValue:           { bg: '—',                                          en: '—' },
  updating:          { bg: 'Обновяване…',                                en: 'Updating…' },
  allPlans:          { bg: 'Всички планове',                             en: 'All plans' },
  allStatuses:       { bg: 'Всички статуси',                             en: 'All statuses' },

  colSubscriber:     { bg: 'Абонат',                                     en: 'Subscriber' },
  colPlan:           { bg: 'План',                                       en: 'Plan' },
  colStatus:         { bg: 'Статус',                                     en: 'Status' },
  colAutoRenewal:    { bg: 'Авт. подновяване',                           en: 'Auto-renewal' },
  colPeriodEnds:     { bg: 'Край на периода',                            en: 'Period ends' },
  colProvider:       { bg: 'Доставчик',                                  en: 'Provider' },
  colCreated:        { bg: 'Създаден',                                   en: 'Created' },

  actCancel:         { bg: 'Анулирай в края на периода',                 en: 'Cancel at period end' },
  actReactivate:     { bg: 'Възстанови',                                 en: 'Reactivate' },
  actResume:         { bg: 'Възобнови',                                  en: 'Resume' },
  actDisableRenewal: { bg: 'Изключи авт. подновяване',                   en: 'Disable auto-renewal' },
  actEnableRenewal:  { bg: 'Включи авт. подновяване',                    en: 'Enable auto-renewal' },

  toastCancel:       { bg: 'Абонаментът ще бъде анулиран в края на периода.',
                       en: 'Subscription scheduled for cancellation at period end' },
  toastReactivate:   { bg: 'Абонаментът е възстановен — анулацията е премахната.',
                       en: 'Subscription reactivated — cancellation removed' },
  toastResume:       { bg: 'Абонаментът е възобновен.',                  en: 'Subscription resumed' },
  toastRenewalOn:    { bg: 'Авт. подновяване включено',                  en: 'Auto-renewal enabled' },
  toastRenewalOff:   { bg: 'Авт. подновяване изключено',                 en: 'Auto-renewal disabled' },
  toastErrCancel:    { bg: 'Неуспешна анулация',                         en: 'Failed to cancel subscription' },
  toastErrReactivate:{ bg: 'Неуспешно възстановяване',                   en: 'Failed to reactivate subscription' },
  toastErrResume:    { bg: 'Неуспешно възобновяване',                    en: 'Failed to resume subscription' },
  toastErrRenewal:   { bg: 'Неуспешна промяна на авт. подновяване',      en: 'Failed to update auto-renewal' },

  cycle: {
    WEEKLY:  { bg: 'седмично',   en: 'weekly' },
    MONTHLY: { bg: 'месечно',    en: 'monthly' },
    YEARLY:  { bg: 'годишно',    en: 'yearly' },
    OTHER:   { bg: '',           en: '' },
  } as Record<BillingCycle, { bg: string; en: string }>,

  status: {
    ACTIVE:             { bg: 'Активен',              en: 'Active' },
    TRIALING:           { bg: 'Пробен',               en: 'Trialing' },
    PAST_DUE:           { bg: 'Неуспешно плащане',    en: 'Failed payment' },
    UNPAID:             { bg: 'Неплатен',             en: 'Unpaid' },
    CANCELLED:          { bg: 'Анулиран',             en: 'Cancelled' },
    INCOMPLETE:         { bg: 'Незавършен',           en: 'Incomplete' },
    INCOMPLETE_EXPIRED: { bg: 'Незавършен (изтекъл)', en: 'Incomplete expired' },
    PAUSED:             { bg: 'Спрян',                en: 'Paused' },
  } as Record<SubscriptionStatus, { bg: string; en: string }>,

  plan: {
    LIGHT:   { bg: 'Light',   en: 'Light' },
    BASIC:   { bg: 'Basic',   en: 'Basic' },
    PREMIUM: { bg: 'Premium', en: 'Premium' },
  } as Record<SubscriptionPlan, { bg: string; en: string }>,
};

const tr = (entry: { bg: string; en: string }, lang: Lang) => entry[lang];

const confirmCancelMessage = (lang: Lang, email: string, date: string) =>
  lang === 'bg'
    ? `Анулирай абонамента на ${email}? Достъпът се запазва до ${date}.`
    : `Cancel subscription for ${email}? They will keep access until ${date}.`;

/* ─── Layout ───────────────────────────────────────────────────────────────── */
const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  gap: 1rem;
  flex-wrap: wrap;
`;

const TitleBlock = styled.div``;

const Eyebrow = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${palette.textSubtle};
  margin-bottom: 0.25rem;
`;

const PageTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 800;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;

const PageSubtitle = styled.p`
  font-size: 0.9375rem;
  color: ${palette.textMuted};
  margin: 0;
`;

const TotalBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${palette.infoSoft};
  color: ${palette.info};
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 9999px;
  padding: 0.125rem 0.6rem;
  margin-left: 0.5rem;
`;

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  max-width: 20rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }

  &::placeholder {
    color: ${palette.textSubtle};
  }
`;

const Select = styled.select`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const Toggle = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: ${palette.textMuted};
  cursor: pointer;
  user-select: none;
  input { cursor: pointer; }
`;

const ExportButton = styled.button`
  margin-left: auto;
  padding: 0.5rem 0.875rem;
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.text};
  cursor: pointer;
  &:hover:not(:disabled) { background: ${palette.bg}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/* ─── Cell helpers ─────────────────────────────────────────────────────────── */
const UserCell = styled.div`
  font-weight: 600;
  color: ${palette.text};
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
`;

const NameMissing = styled.span`
  color: ${palette.textSubtle};
  font-style: italic;
  font-weight: 500;
`;

const TestTag = styled.span`
  display: inline-flex;
  align-items: center;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 0.25rem;
  padding: 0.0625rem 0.375rem;
  background: ${palette.testTagBg};
  color: ${palette.testTagFg};
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
`;

const PlanBadge = styled.span<{ $plan: SubscriptionPlan }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;

  ${({ $plan }) => {
    switch ($plan) {
      case 'PREMIUM':
        return `background: ${palette.amberSoft}; color: ${palette.amber};`;
      case 'BASIC':
        return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'LIGHT':
        return `background: ${palette.tealSoft}; color: ${palette.teal};`;
      default:
        return `background: #f3f4f6; color: #6b7280;`;
    }
  }}
`;

const StatusBadge = styled.span<{ $status: SubscriptionStatus }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;

  ${({ $status }) => {
    switch ($status) {
      case 'ACTIVE':
      case 'TRIALING':
        return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'PAST_DUE':
      case 'UNPAID':
        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'CANCELLED':
      case 'INCOMPLETE_EXPIRED':
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'INCOMPLETE':
        return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'PAUSED':
        return `background: #f3f4f6; color: #374151;`;
      default:
        return `background: #f3f4f6; color: #6b7280;`;
    }
  }}
`;

const RenewalPill = styled.span<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 9999px;
  padding: 0.1rem 0.45rem;
  background: ${({ $on }) => ($on ? palette.successSoft : palette.dangerSoft)};
  color: ${({ $on }) => ($on ? palette.success : palette.danger)};
`;

const ProviderTag = styled.span`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
`;

const PaymentsCell = styled.span`
  display: flex;
  flex-direction: column;
`;

const PaymentsTotal = styled.span`
  color: ${palette.text};
  font-size: 0.8125rem;
  font-weight: 600;
`;

/* ─── Options ──────────────────────────────────────────────────────────────── */
const PLAN_VALUES: Array<SubscriptionPlan | ''> = ['', 'LIGHT', 'BASIC', 'PREMIUM'];
const STATUS_VALUES: Array<SubscriptionStatus | ''> = [
  '',
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'UNPAID',
  'CANCELLED',
  'INCOMPLETE',
  'INCOMPLETE_EXPIRED',
  'PAUSED',
];

const PAGE_SIZE = 20;

/**
 * A subscription is "actively renewing" only when autoRenewal is on AND
 * cancellation isn't scheduled AND the status is a billing one. Without all
 * three, render Off — otherwise CANCELLED rows misleadingly show "On".
 */
const isAutoRenewalEffective = (row: AdminSubscription) => {
  if (!row.autoRenewal) return false;
  if (row.cancelAtPeriodEnd) return false;
  switch (row.status) {
    case 'CANCELLED':
    case 'INCOMPLETE':
    case 'INCOMPLETE_EXPIRED':
    case 'PAUSED':
    case 'UNPAID':
      return false;
    default:
      return true;
  }
};

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function AdminSubscriptionsPage() {
  const { language } = useLanguage();
  const lang = (language === 'bg' ? 'bg' : 'en') as Lang;
  const queryClient = useQueryClient();

  // Allow deep-links from the alerts page to preselect a subscription status.
  const [searchParams] = useSearchParams();
  const VALID_STATUSES: SubscriptionStatus[] = [
    'ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID',
    'PAUSED', 'CANCELLED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED',
  ];
  const initialStatusParam = searchParams.get('status');
  const initialStatus: SubscriptionStatus | '' =
    initialStatusParam && VALID_STATUSES.includes(initialStatusParam as SubscriptionStatus)
      ? (initialStatusParam as SubscriptionStatus)
      : '';

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan | ''>('');
  const [status, setStatus] = useState<SubscriptionStatus | ''>(initialStatus);
  const [excludeTest, setExcludeTest] = useState(true);

  // Debounce search → server, 300ms after user stops typing.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-subscriptions', page, search, plan, status, excludeTest],
    queryFn: () =>
      adminSubscriptionsService.list({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        plan: plan || undefined,
        status: status || undefined,
        excludeTest,
      }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => adminSubscriptionsService.cancel(id),
    onSuccess: () => {
      toast.success(tr(T.toastCancel, lang));
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    },
    onError: () => toast.error(tr(T.toastErrCancel, lang)),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => adminSubscriptionsService.reactivate(id),
    onSuccess: () => {
      toast.success(tr(T.toastReactivate, lang));
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    },
    onError: () => toast.error(tr(T.toastErrReactivate, lang)),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => adminSubscriptionsService.resume(id),
    onSuccess: () => {
      toast.success(tr(T.toastResume, lang));
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    },
    onError: () => toast.error(tr(T.toastErrResume, lang)),
  });

  const autoRenewalMutation = useMutation({
    mutationFn: ({ id, autoRenewal }: { id: string; autoRenewal: boolean }) =>
      adminSubscriptionsService.toggleAutoRenewal(id, autoRenewal),
    onSuccess: (_data, vars) => {
      toast.success(vars.autoRenewal ? tr(T.toastRenewalOn, lang) : tr(T.toastRenewalOff, lang));
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    },
    onError: () => toast.error(tr(T.toastErrRenewal, lang)),
  });

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const fmtMoney = (amount: number) =>
    new Intl.NumberFormat(lang === 'bg' ? 'bg-BG' : 'en-GB', {
      style: 'currency',
      currency: 'BGN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  const planLabel = (p: SubscriptionPlan) => tr(T.plan[p], lang);
  const statusLabel = (s: SubscriptionStatus) => tr(T.status[s], lang);
  const cycleLabel = (c?: BillingCycle) => (c && c !== 'OTHER' ? tr(T.cycle[c], lang) : '');

  const exportCsv = () => {
    const rows = data?.subscriptions ?? [];
    if (!rows.length) return;
    const headers = [
      'Subscriber', 'Email', 'Phone', 'Plan', 'Cycle', 'Status', 'Auto-renewal',
      'Period ends', 'Provider', 'Payments', 'Total paid', 'Created',
    ];
    const escape = (v: string | number | null | undefined) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((r) => {
      const name = `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim();
      const provider = r.stripeSubscriptionId ? 'Stripe' : r.payseraOrderId ? 'Paysera' : '';
      return [
        name, r.user.email, r.user.phone ?? '', r.plan, r.billingCycle ?? '', r.status,
        isAutoRenewalEffective(r) ? 'On' : 'Off',
        fmtDate(r.currentPeriodEnd), provider,
        r.paymentCount ?? 0, (r.paymentTotalAmount ?? 0).toFixed(2),
        fmtDate(r.createdAt),
      ].map(escape).join(',');
    });
    // BOM so Excel detects UTF-8 (Cyrillic names render correctly).
    const csv = '﻿' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscriptions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<AdminSubscription>[] = useMemo(() => [
    {
      key: 'user',
      header: tr(T.colSubscriber, lang),
      render: (row) => {
        const name = `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim();
        return (
          <UserCell>
            <NameRow>
              {name ? <span>{name}</span> : <NameMissing>{tr(T.noName, lang)}</NameMissing>}
              {row.user.isTest && <TestTag>{tr(T.testTag, lang)}</TestTag>}
            </NameRow>
            <MetaLine>{row.user.email}</MetaLine>
            {row.user.phone && <MetaLine>{row.user.phone}</MetaLine>}
          </UserCell>
        );
      },
    },
    {
      key: 'plan',
      header: tr(T.colPlan, lang),
      render: (row) => {
        const cycle = cycleLabel(row.billingCycle);
        return (
          <span>
            <PlanBadge $plan={row.plan}>{planLabel(row.plan)}</PlanBadge>
            {cycle && <MetaLine>{cycle}</MetaLine>}
            {row.userSubscriptionCount && row.userSubscriptionCount > 1 && (
              <MetaLine title="Spec §4.2 — total subscriptions ever for this user">
                {row.userSubscriptionCount} {tr(T.plansInHistory, lang)}
              </MetaLine>
            )}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: tr(T.colStatus, lang),
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <StatusBadge $status={row.status}>{statusLabel(row.status)}</StatusBadge>
          {row.cancelAtPeriodEnd && (
            <MetaLine style={{ color: palette.warning }}>
              {tr(T.cancelsAt, lang)} {row.cancelAt ? fmtDate(row.cancelAt) : tr(T.atPeriodEnd, lang)}
            </MetaLine>
          )}
        </span>
      ),
    },
    {
      key: 'renewal',
      header: tr(T.colAutoRenewal, lang),
      render: (row) => {
        const effective = isAutoRenewalEffective(row);
        return <RenewalPill $on={effective}>{effective ? tr(T.on, lang) : tr(T.off, lang)}</RenewalPill>;
      },
    },
    {
      key: 'periodEnd',
      header: tr(T.colPeriodEnds, lang),
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmtDate(row.currentPeriodEnd)}
        </span>
      ),
    },
    {
      key: 'payments',
      header: tr(T.payments, lang),
      render: (row) => {
        const count = row.paymentCount ?? 0;
        const total = row.paymentTotalAmount ?? 0;
        if (count === 0) return <ProviderTag>{tr(T.noValue, lang)}</ProviderTag>;
        return (
          <PaymentsCell>
            <PaymentsTotal>{fmtMoney(total)}</PaymentsTotal>
            <MetaLine>{count}×</MetaLine>
          </PaymentsCell>
        );
      },
    },
    {
      key: 'provider',
      header: tr(T.colProvider, lang),
      render: (row) => (
        <ProviderTag>
          {row.stripeSubscriptionId ? 'Stripe' : row.payseraOrderId ? 'Paysera' : tr(T.noValue, lang)}
        </ProviderTag>
      ),
    },
    {
      key: 'createdAt',
      header: tr(T.colCreated, lang),
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmtDate(row.createdAt)}
        </span>
      ),
    },
  ], [lang]);

  const isMutating =
    cancelMutation.isPending ||
    reactivateMutation.isPending ||
    resumeMutation.isPending ||
    autoRenewalMutation.isPending;

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>{tr(T.eyebrow, lang)}</Eyebrow>
          <PageTitle>
            {tr(T.title, lang)}
            {data && data.total > 0 && <TotalBadge>{data.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>{tr(T.subtitle, lang)}</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder={tr(T.searchPlaceholder, lang)}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value as SubscriptionPlan | '');
              setPage(1);
            }}
          >
            {PLAN_VALUES.map((v) => (
              <option key={v || 'all'} value={v}>
                {v === '' ? tr(T.allPlans, lang) : planLabel(v)}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as SubscriptionStatus | '');
              setPage(1);
            }}
          >
            {STATUS_VALUES.map((v) => (
              <option key={v || 'all'} value={v}>
                {v === '' ? tr(T.allStatuses, lang) : statusLabel(v)}
              </option>
            ))}
          </Select>
          <Toggle>
            <input
              type="checkbox"
              checked={excludeTest}
              onChange={(e) => {
                setExcludeTest(e.target.checked);
                setPage(1);
              }}
            />
            {tr(T.excludeTest, lang)}
          </Toggle>
          <ExportButton type="button" onClick={exportCsv} disabled={!data?.subscriptions?.length}>
            {tr(T.exportCsv, lang)}
          </ExportButton>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.subscriptions ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage={tr(T.emptyMessage, lang)}
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
          rowActions={[
            {
              label: tr(T.actCancel, lang),
              danger: true,
              hidden: (row) =>
                row.cancelAtPeriodEnd ||
                row.status === 'CANCELLED' ||
                row.status === 'INCOMPLETE_EXPIRED' ||
                row.status === 'INCOMPLETE',
              onClick: (row) => {
                if (!window.confirm(confirmCancelMessage(lang, row.user.email, fmtDate(row.currentPeriodEnd)))) return;
                cancelMutation.mutate(row.id);
              },
            },
            {
              label: tr(T.actReactivate, lang),
              hidden: (row) => !row.cancelAtPeriodEnd || row.status === 'CANCELLED',
              onClick: (row) => reactivateMutation.mutate(row.id),
            },
            {
              label: tr(T.actResume, lang),
              hidden: (row) => row.status !== 'PAUSED',
              onClick: (row) => resumeMutation.mutate(row.id),
            },
            {
              label: tr(T.actDisableRenewal, lang),
              hidden: (row) =>
                !row.autoRenewal ||
                row.cancelAtPeriodEnd ||
                row.status === 'CANCELLED' ||
                row.status === 'INCOMPLETE_EXPIRED' ||
                row.status === 'INCOMPLETE' ||
                row.status === 'PAUSED',
              onClick: (row) => autoRenewalMutation.mutate({ id: row.id, autoRenewal: false }),
            },
            {
              label: tr(T.actEnableRenewal, lang),
              // Hidden when Reactivate already covers the same intent (cancelAtPeriodEnd=true)
              hidden: (row) =>
                row.autoRenewal ||
                row.cancelAtPeriodEnd ||
                row.status === 'CANCELLED' ||
                row.status === 'INCOMPLETE_EXPIRED' ||
                row.status === 'INCOMPLETE' ||
                row.status === 'PAUSED',
              onClick: (row) => autoRenewalMutation.mutate({ id: row.id, autoRenewal: true }),
            },
          ]}
        />
        {isMutating && (
          <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.8125rem', color: palette.textSubtle }}>
            {tr(T.updating, lang)}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
