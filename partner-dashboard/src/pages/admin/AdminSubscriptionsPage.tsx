import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminSubscriptionsService,
  AdminSubscription,
  AdminSubscriptionHistory,
  AdminSubscriptionHistoryEntry,
  BillingCycle,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../services/adminSubscriptions.service';
import {
  planLabel as sharedPlanLabel,
  subStatusLabel as sharedSubStatusLabel,
} from '../../utils/planLabels';

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
  exporting:         { bg: 'Експортиране…',                              en: 'Exporting…' },
  exportTruncated:   { bg: 'Експортът е ограничен до 5000 реда. Стесни филтрите за повече.',
                       en: 'Export capped at 5000 rows. Narrow filters for more.' },
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
  allCycles:         { bg: 'Всички цикли',                               en: 'All cycles' },
  allCancellation:   { bg: 'Всички (анулация)',                          en: 'All (cancel)' },
  cancelScheduledOn: { bg: 'Само планирани за анулация',                 en: 'Cancellation scheduled' },
  cancelScheduledOff:{ bg: 'Без планирана анулация',                     en: 'Not scheduled to cancel' },

  colSubscriber:     { bg: 'Абонат',                                     en: 'Subscriber' },
  colPlan:           { bg: 'План',                                       en: 'Plan' },
  colStatus:         { bg: 'Статус',                                     en: 'Status' },
  colAutoRenewal:    { bg: 'Авт. подновяване',                           en: 'Auto-renewal' },
  colPeriod:         { bg: 'Текущ период',                               en: 'Current period' },
  colProvider:       { bg: 'Доставчик',                                  en: 'Provider' },
  colCreated:        { bg: 'Създаден',                                   en: 'Created' },

  actCancel:         { bg: 'Анулирай в края на периода',                 en: 'Cancel at period end' },
  actReactivate:     { bg: 'Възстанови',                                 en: 'Reactivate' },
  actResume:         { bg: 'Възобнови',                                  en: 'Resume' },
  actDisableRenewal: { bg: 'Изключи авт. подновяване',                   en: 'Disable auto-renewal' },
  actEnableRenewal:  { bg: 'Включи авт. подновяване',                    en: 'Enable auto-renewal' },
  actViewHistory:    { bg: 'История',                                    en: 'View history' },

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
  toastErrExport:    { bg: 'Експортът се провали',                       en: 'Export failed' },
  exportedN:         { bg: 'Изтеглени редове: {n}',                     en: '{n} row(s) exported' },
  toastErrHistory:   { bg: 'Историята не може да бъде заредена',         en: 'Failed to load history' },

  drawerHistory:     { bg: 'История на абонаментите',                    en: 'Subscription history' },
  drawerClose:       { bg: 'Затвори',                                    en: 'Close' },
  drawerNoHistory:   { bg: 'Няма абонаменти за този потребител.',        en: 'No subscriptions on record.' },
  drawerLoading:     { bg: 'Зареждане…',                                 en: 'Loading…' },
  drawerPaymentsLabel:{ bg: 'Общо плащания',                             en: 'Total payments' },
  drawerLastPayment: { bg: 'Последно плащане',                           en: 'Last payment' },
  drawerOpenProfile: { bg: 'Отвори профила →',                           en: 'Open profile →' },
  drawerStartedAt:   { bg: 'Старт',                                      en: 'Started' },
  drawerEndedAt:     { bg: 'Край',                                       en: 'Ended' },
  drawerPeriod:      { bg: 'Период',                                     en: 'Period' },

  cycle: {
    WEEKLY:  { bg: 'седмично',   en: 'weekly' },
    MONTHLY: { bg: 'месечно',    en: 'monthly' },
    YEARLY:  { bg: 'годишно',    en: 'yearly' },
    OTHER:   { bg: 'друго',      en: 'other' },
  } as Record<BillingCycle, { bg: string; en: string }>,

  // Plan and status label tables now live in src/utils/planLabels.ts so all
  // three admin screens share a single source of truth. Use sharedPlanLabel /
  // sharedSubStatusLabel below.
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

const SubscriberLink = styled(Link)`
  color: ${palette.text};
  text-decoration: none;
  font-weight: 600;

  &:hover {
    color: ${palette.accent};
    text-decoration: underline;
  }
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

const HistoryLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: ${palette.info};
  cursor: pointer;
  font-size: 0.75rem;
  text-align: left;
  text-decoration: underline;
  text-decoration-style: dotted;

  &:hover { color: ${palette.accent}; }
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
  white-space: nowrap;

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

// Spec §4.2 distinguishes EXPIRED (natural lapse) from CANCELLED (user-initiated):
// CANCELLED is terminal-but-not-error → neutral grey; EXPIRED gets a distinct
// purple. INCOMPLETE_EXPIRED is danger (failed onboarding). Mirrors
// AdminSubscriberDetailPage SubStatusBadge so the same record reads the same
// color on both screens.
const StatusBadge = styled.span<{ $status: SubscriptionStatus }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  white-space: nowrap;

  ${({ $status }) => {
    switch ($status) {
      case 'ACTIVE':
      case 'TRIALING':
        return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'PAST_DUE':
      case 'UNPAID':
        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'INCOMPLETE':
        return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'INCOMPLETE_EXPIRED':
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'EXPIRED':
        return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      case 'PAUSED':
        return `background: #f3f4f6; color: #374151;`;
      case 'CANCELLED':
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

/* ─── Drawer ───────────────────────────────────────────────────────────────── */
const DrawerBackdrop = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  z-index: 89;
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  pointer-events: ${({ $open }) => ($open ? 'auto' : 'none')};
  transition: opacity 220ms ease;
`;

const Drawer = styled.div<{ $open: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 32rem;
  max-width: 100vw;
  background: ${palette.surface};
  border-left: 1px solid ${palette.border};
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.1);
  z-index: 90;
  transform: ${({ $open }) => ($open ? 'translateX(0)' : 'translateX(100%)')};
  transition: transform 220ms ease;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const DrawerHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${palette.border};
  position: relative;
`;

const DrawerClose = styled.button`
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  color: ${palette.textSubtle};
  line-height: 1;
  padding: 0.25rem;
  &:hover { color: ${palette.text}; }
`;

const DrawerTitle = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;

const DrawerSubtitle = styled.p`
  font-size: 0.8125rem;
  color: ${palette.textSubtle};
  margin: 0;
`;

const DrawerStat = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
  font-size: 0.8125rem;
`;

const DrawerStatLabel = styled.span`
  color: ${palette.textSubtle};
`;

const DrawerStatValue = styled.span`
  color: ${palette.text};
  font-weight: 600;
`;

const DrawerProfileLink = styled(Link)`
  display: inline-block;
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  color: ${palette.accent};
  text-decoration: none;
  font-weight: 600;
  &:hover { text-decoration: underline; }
`;

const DrawerBody = styled.div`
  padding: 1rem 1.5rem 1.5rem;
  flex: 1;
`;

const HistoryEntry = styled.div`
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  padding: 0.875rem 1rem;
  margin-bottom: 0.75rem;
  background: ${palette.bg};
`;

const HistoryEntryHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const HistoryEntryMeta = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const EmptyDrawer = styled.p`
  color: ${palette.textSubtle};
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem 0;
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
  'EXPIRED',
  'INCOMPLETE',
  'INCOMPLETE_EXPIRED',
  'PAUSED',
];
const CYCLE_VALUES: Array<BillingCycle | ''> = ['', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const CANCEL_VALUES: Array<'' | 'true' | 'false'> = ['', 'true', 'false'];

const PAGE_SIZE = 20;

/**
 * A subscription is "actively renewing" only when autoRenewal is on AND
 * cancellation isn't scheduled AND the status is a billing one. Without all
 * three, render Off — otherwise CANCELLED rows misleadingly show "On".
 */
const isAutoRenewalEffective = (row: { autoRenewal: boolean; cancelAtPeriodEnd: boolean; status: SubscriptionStatus }) => {
  if (!row.autoRenewal) return false;
  if (row.cancelAtPeriodEnd) return false;
  switch (row.status) {
    case 'CANCELLED':
    case 'EXPIRED':
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
    'PAUSED', 'CANCELLED', 'EXPIRED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED',
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
  const [cycle, setCycle] = useState<BillingCycle | ''>('');
  const [cancelScheduled, setCancelScheduled] = useState<'' | 'true' | 'false'>('');
  const [excludeTest, setExcludeTest] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [historyUserId, setHistoryUserId] = useState<string | null>(null);

  // Debounce search → server, 300ms after user stops typing.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const filterParams = {
    search: search || undefined,
    plan: plan || undefined,
    status: status || undefined,
    billingCycle: cycle || undefined,
    cancelScheduled: cancelScheduled || undefined,
    excludeTest,
  } as const;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-subscriptions', page, search, plan, status, cycle, cancelScheduled, excludeTest],
    queryFn: () =>
      adminSubscriptionsService.list({
        page,
        limit: PAGE_SIZE,
        ...filterParams,
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

  const { data: historyData, isLoading: historyLoading } = useQuery<AdminSubscriptionHistory>({
    queryKey: ['admin-subscription-history', historyUserId],
    queryFn: () => adminSubscriptionsService.getUserHistory(historyUserId!),
    enabled: !!historyUserId,
  });

  // Drawer a11y: ESC to close, focus trap inside the drawer, restore focus to
  // the element that opened the drawer when it closes.
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const drawerOpenerRef = useRef<HTMLElement | null>(null);
  const drawerTitleId = 'admin-subscription-history-title';

  useEffect(() => {
    if (!historyUserId) return;

    // Stash the element that had focus when the drawer opened so we can put
    // focus back on close (WCAG 2.4.3).
    drawerOpenerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    // Move focus to the close button so screen readers announce the dialog
    // and Tab navigation starts inside the drawer.
    drawerCloseRef.current?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setHistoryUserId(null);
        return;
      }
      if (e.key !== 'Tab') return;
      const root = drawerRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (active && !root.contains(active)) {
        // Focus had escaped to the underlying page — pull it back.
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      // Restore focus on close. Skip if the opener was unmounted.
      const opener = drawerOpenerRef.current;
      if (opener && document.contains(opener)) opener.focus();
      drawerOpenerRef.current = null;
    };
  }, [historyUserId]);

  const fmtDate = (iso: string | Date) =>
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

  const planLabel = (p: SubscriptionPlan) => sharedPlanLabel(p, lang);
  const statusLabel = (s: SubscriptionStatus) => sharedSubStatusLabel(s, lang);
  const cycleLabel = (c?: BillingCycle) => (c ? tr(T.cycle[c], lang) : '');

  const handleExportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await adminSubscriptionsService.exportAll(filterParams);
      const rows = res.subscriptions ?? [];
      if (!rows.length) {
        toast.error(tr(T.emptyMessage, lang));
        return;
      }
      const headers = [
        'Subscriber', 'Email', 'Phone', 'Plan', 'Cycle', 'Status', 'Auto-renewal',
        'Period start', 'Period ends', 'Cancel scheduled', 'Provider',
        'Payments (count)', 'Payments (total BGN)', 'Last payment', 'Created',
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
          fmtDate(r.currentPeriodStart),
          fmtDate(r.currentPeriodEnd),
          r.cancelAtPeriodEnd ? 'Yes' : 'No',
          provider,
          r.paymentCount ?? 0,
          (r.paymentTotalAmount ?? 0).toFixed(2),
          r.lastPaymentAt ? fmtDate(r.lastPaymentAt) : '',
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

      toast.success(tr(T.exportedN, lang).replace('{n}', String(rows.length)));
      if (res.truncated) {
        toast(tr(T.exportTruncated, lang), { icon: '⚠️', duration: 6000 });
      }
    } catch {
      toast.error(tr(T.toastErrExport, lang));
    } finally {
      setExporting(false);
    }
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
              {name ? (
                <SubscriberLink to={`/admin/subscribers/${row.user.id}`}>{name}</SubscriberLink>
              ) : (
                <SubscriberLink to={`/admin/subscribers/${row.user.id}`}>
                  <NameMissing>{tr(T.noName, lang)}</NameMissing>
                </SubscriberLink>
              )}
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
        const c = cycleLabel(row.billingCycle);
        return (
          <span>
            <PlanBadge $plan={row.plan}>{planLabel(row.plan)}</PlanBadge>
            {c && <MetaLine>{c}</MetaLine>}
            {row.userSubscriptionCount && row.userSubscriptionCount > 1 && (
              <HistoryLink
                type="button"
                onClick={() => setHistoryUserId(row.user.id)}
                title="Spec §4.2 — view full subscription history for this user"
              >
                {row.userSubscriptionCount} {tr(T.plansInHistory, lang)}
              </HistoryLink>
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
      key: 'period',
      header: tr(T.colPeriod, lang),
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem', display: 'flex', flexDirection: 'column' }}>
          <span>{fmtDate(row.currentPeriodStart)} → {fmtDate(row.currentPeriodEnd)}</span>
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
            {row.lastPaymentAt && <MetaLine title="Last successful payment">{fmtDate(row.lastPaymentAt)}</MetaLine>}
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

  const isTerminal = (s: SubscriptionStatus) =>
    s === 'CANCELLED' || s === 'EXPIRED' || s === 'INCOMPLETE_EXPIRED' || s === 'INCOMPLETE';

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
            value={cycle}
            onChange={(e) => {
              setCycle(e.target.value as BillingCycle | '');
              setPage(1);
            }}
          >
            {CYCLE_VALUES.map((v) => (
              <option key={v || 'all-cycles'} value={v}>
                {v === '' ? tr(T.allCycles, lang) : tr(T.cycle[v], lang)}
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
          <Select
            value={cancelScheduled}
            onChange={(e) => {
              setCancelScheduled(e.target.value as '' | 'true' | 'false');
              setPage(1);
            }}
          >
            {CANCEL_VALUES.map((v) => (
              <option key={v || 'all-cancel'} value={v}>
                {v === '' ? tr(T.allCancellation, lang)
                  : v === 'true' ? tr(T.cancelScheduledOn, lang)
                  : tr(T.cancelScheduledOff, lang)}
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
          <ExportButton type="button" onClick={handleExportCsv} disabled={exporting || !data?.total}>
            {exporting ? tr(T.exporting, lang) : tr(T.exportCsv, lang)}
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
              label: tr(T.actViewHistory, lang),
              onClick: (row) => setHistoryUserId(row.user.id),
            },
            {
              label: tr(T.actCancel, lang),
              danger: true,
              hidden: (row) => row.cancelAtPeriodEnd || isTerminal(row.status),
              onClick: (row) => {
                if (!window.confirm(confirmCancelMessage(lang, row.user.email, fmtDate(row.currentPeriodEnd)))) return;
                cancelMutation.mutate(row.id);
              },
            },
            {
              label: tr(T.actReactivate, lang),
              hidden: (row) => !row.cancelAtPeriodEnd || row.status === 'CANCELLED' || row.status === 'EXPIRED',
              onClick: (row) => reactivateMutation.mutate(row.id),
            },
            {
              label: tr(T.actResume, lang),
              hidden: (row) => row.status !== 'PAUSED',
              onClick: (row) => resumeMutation.mutate(row.id),
            },
            {
              label: tr(T.actDisableRenewal, lang),
              // Auto-renewal is now a pure preference toggle (does not schedule
              // cancellation), so it stays togglable on any non-terminal sub.
              hidden: (row) => !row.autoRenewal || isTerminal(row.status) || row.status === 'PAUSED',
              onClick: (row) => autoRenewalMutation.mutate({ id: row.id, autoRenewal: false }),
            },
            {
              label: tr(T.actEnableRenewal, lang),
              hidden: (row) => row.autoRenewal || isTerminal(row.status) || row.status === 'PAUSED',
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

      {/* History drawer */}
      <DrawerBackdrop $open={!!historyUserId} onClick={() => setHistoryUserId(null)} />
      <Drawer
        $open={!!historyUserId}
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-hidden={!historyUserId}
        aria-labelledby={drawerTitleId}
      >
        {historyUserId && (
          <>
            <DrawerHeader>
              <DrawerClose
                onClick={() => setHistoryUserId(null)}
                ref={drawerCloseRef}
                aria-label={tr(T.drawerClose, lang)}
              >
                ✕
              </DrawerClose>
              <DrawerTitle id={drawerTitleId}>{tr(T.drawerHistory, lang)}</DrawerTitle>
              {historyData && (
                <>
                  <DrawerSubtitle>
                    {`${historyData.user.firstName ?? ''} ${historyData.user.lastName ?? ''}`.trim() || historyData.user.email}
                    {' · '}
                    {historyData.user.email}
                  </DrawerSubtitle>
                  <DrawerStat>
                    <DrawerStatLabel>{tr(T.drawerPaymentsLabel, lang)}</DrawerStatLabel>
                    <DrawerStatValue>
                      {fmtMoney(historyData.paymentSummary.totalAmount)} ({historyData.paymentSummary.count})
                    </DrawerStatValue>
                  </DrawerStat>
                  {historyData.paymentSummary.lastPaymentAt && (
                    <DrawerStat>
                      <DrawerStatLabel>{tr(T.drawerLastPayment, lang)}</DrawerStatLabel>
                      <DrawerStatValue>{fmtDate(historyData.paymentSummary.lastPaymentAt)}</DrawerStatValue>
                    </DrawerStat>
                  )}
                  <DrawerProfileLink to={`/admin/subscribers/${historyData.user.id}`} onClick={() => setHistoryUserId(null)}>
                    {tr(T.drawerOpenProfile, lang)}
                  </DrawerProfileLink>
                </>
              )}
            </DrawerHeader>
            <DrawerBody>
              {historyLoading ? (
                <EmptyDrawer>{tr(T.drawerLoading, lang)}</EmptyDrawer>
              ) : !historyData?.subscriptions.length ? (
                <EmptyDrawer>{tr(T.drawerNoHistory, lang)}</EmptyDrawer>
              ) : (
                historyData.subscriptions.map((entry: AdminSubscriptionHistoryEntry) => (
                  <HistoryEntry key={entry.id}>
                    <HistoryEntryHeader>
                      <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <PlanBadge $plan={entry.plan}>{planLabel(entry.plan)}</PlanBadge>
                        <StatusBadge $status={entry.status}>{statusLabel(entry.status)}</StatusBadge>
                        {entry.billingCycle && entry.billingCycle !== 'OTHER' && (
                          <MetaLine>{cycleLabel(entry.billingCycle)}</MetaLine>
                        )}
                      </span>
                      <RenewalPill $on={isAutoRenewalEffective(entry)}>
                        {isAutoRenewalEffective(entry) ? tr(T.on, lang) : tr(T.off, lang)}
                      </RenewalPill>
                    </HistoryEntryHeader>
                    <HistoryEntryMeta>
                      <span>
                        {tr(T.drawerPeriod, lang)}: {fmtDate(entry.currentPeriodStart)} → {fmtDate(entry.currentPeriodEnd)}
                      </span>
                      <span>
                        {tr(T.drawerStartedAt, lang)}: {fmtDate(entry.createdAt)}
                      </span>
                      {entry.canceledAt && (
                        <span>
                          {tr(T.drawerEndedAt, lang)}: {fmtDate(entry.canceledAt)}
                        </span>
                      )}
                      {entry.cancelAtPeriodEnd && entry.cancelAt && (
                        <span style={{ color: palette.warning }}>
                          {tr(T.cancelsAt, lang)} {fmtDate(entry.cancelAt)}
                        </span>
                      )}
                      <span style={{ color: palette.textSubtle }}>
                        {entry.stripeSubscriptionId ? 'Stripe' : entry.payseraOrderId ? 'Paysera' : '—'}
                      </span>
                    </HistoryEntryMeta>
                  </HistoryEntry>
                ))
              )}
            </DrawerBody>
          </>
        )}
      </Drawer>
    </PageShell>
  );
}
