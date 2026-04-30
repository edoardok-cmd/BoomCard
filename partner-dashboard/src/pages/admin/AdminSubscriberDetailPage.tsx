import styled from 'styled-components';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  adminSubscribersService,
  SubscriptionPlan,
  SubscriptionStatus,
  UserAccountStatus,
} from '../../services/adminSubscribers.service';
import { planLabel, subStatusLabel, userStatusLabel, riskLabel, riskBucket, type RiskBucket, type Lang } from '../../utils/planLabels';

/* ─── i18n ─────────────────────────────────────────────────────────────────── */
// Localised strings for this page. Mirrors the AdminSubscribersAllPage pattern
// (local I18N table + tr()) so every string a subscriber-management admin sees
// has a BG counterpart. Keep keys grouped by surface to make additions easy.
const I18N = {
  // Header / states
  backAll:        { en: '← All subscribers', bg: '← Всички абонати' },
  loading:        { en: 'Loading…',          bg: 'Зарежда…' },
  loadFail:       { en: 'Failed to load subscriber.', bg: 'Неуспешно зареждане на абоната.' },
  // Profile meta
  joined:         { en: 'Joined',            bg: 'Регистриран' },
  lastLogin:      { en: 'Last login',        bg: 'Последен вход' },
  risk:           { en: 'Risk',              bg: 'Риск' },
  // Action buttons
  saving:         { en: 'Saving…',           bg: 'Запазва…' },
  suspendAcct:    { en: 'Suspend account',   bg: 'Спри акаунт' },
  activateAcct:   { en: 'Activate account',  bg: 'Активирай акаунт' },
  revoking:       { en: 'Revoking…',         bg: 'Отнема…' },
  forceLogout:    { en: 'Force logout',      bg: 'Принудителен изход' },
  // Confirms
  confirmSuspend: { en: 'Suspend account for {name}?', bg: 'Да спрем акаунта на {name}?' },
  confirmRevoke:  { en: 'Revoke all sessions for {name}?', bg: 'Да отнемем всички сесии на {name}?' },
  // Toasts
  acctSuspended:  { en: 'Account suspended', bg: 'Акаунтът е спрян' },
  acctActivated:  { en: 'Account activated', bg: 'Акаунтът е активиран' },
  statusFail:     { en: 'Failed to update account status', bg: 'Неуспешна промяна на статус' },
  // Decoupled-noun pattern in BG to avoid the singular/plural agreement
  // (1 сесия vs 2+ сесии) that the trailing "{n} сесии" form gets wrong at n=1.
  revokedN:       { en: 'Revoked {n} session(s)', bg: 'Отнети сесии: {n}' },
  // n=0 path: backend returns revokedCount=0 when the user has no active
  // sessions (e.g. already logged out). A "Revoked 0" success toast is
  // semantically dishonest — surface a distinct message instead.
  revokedNone:    { en: 'No active sessions to revoke', bg: 'Няма активни сесии за отнемане' },
  revokeFail:     { en: 'Failed to revoke sessions', bg: 'Неуспешно отнемане на сесиите' },
  // Wallet section
  walletTitle:    { en: 'Wallet',            bg: 'Портфейл' },
  walletAvailable:{ en: 'Available',         bg: 'Налично' },
  walletTotal:    { en: 'Total balance',     bg: 'Общ баланс' },
  walletPending:  { en: 'Pending',           bg: 'Изчаква' },
  noWallet:       { en: 'No wallet found',   bg: 'Няма намерен портфейл' },
  // Subscriptions table
  subsTitle:      { en: 'Subscription history', bg: 'История на абонаменти' },
  noSubs:         { en: 'No subscriptions found', bg: 'Няма открити абонаменти' },
  colPlan:        { en: 'Plan',              bg: 'План' },
  colStatus:      { en: 'Status',            bg: 'Статус' },
  colPeriodEnds:  { en: 'Period ends',       bg: 'Изтича на' },
  colAutoRenew:   { en: 'Auto-renew',        bg: 'Подновяване' },
  colCancelled:   { en: 'Cancelled',         bg: 'Отказан на' },
  colStarted:     { en: 'Started',           bg: 'Започнат на' },
  yes:            { en: 'Yes',               bg: 'Да' },
  no:             { en: 'No',                bg: 'Не' },
};

type I18NKey = keyof typeof I18N;
function tr(key: I18NKey, lang: Lang, vars?: Record<string, string | number>): string {
  let s: string = I18N[key]?.[lang] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

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
};

/* ─── Layout ───────────────────────────────────────────────────────────────── */
const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${palette.textMuted};
  text-decoration: none;
  margin-bottom: 1.5rem;

  &:hover { color: ${palette.text}; }
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const ProfileCard = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.75rem;
  margin-bottom: 1.5rem;
`;

const ProfileTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

const ProfileInfo = styled.div``;

const FullName = styled.h1`
  font-size: 1.5rem;
  font-weight: 800;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;

const ContactLine = styled.p`
  font-size: 0.9375rem;
  color: ${palette.textMuted};
  margin: 0.125rem 0;
`;

const BadgeRow = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
`;

const MetaRow = styled.div`
  margin-top: 1rem;
  font-size: 0.8125rem;
  color: ${palette.textSubtle};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' | 'danger' | 'warning' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 100ms;

  ${({ $variant = 'ghost' }) => {
    if ($variant === 'primary')
      return `background: ${palette.accent}; color: #fff; border-color: ${palette.accent};
        &:hover { background: #b55a3b; } &:disabled { opacity: 0.55; cursor: not-allowed; }`;
    if ($variant === 'danger')
      return `background: ${palette.dangerSoft}; color: ${palette.danger}; border-color: ${palette.danger};
        &:hover { background: #ebb8a8; } &:disabled { opacity: 0.55; cursor: not-allowed; }`;
    if ($variant === 'warning')
      return `background: ${palette.warningSoft}; color: ${palette.warning}; border-color: ${palette.warning};
        &:hover { background: #edd9a3; } &:disabled { opacity: 0.55; cursor: not-allowed; }`;
    return `background: ${palette.surface}; color: ${palette.textMuted}; border-color: ${palette.border};
      &:hover { background: ${palette.bg}; color: ${palette.text}; }
      &:disabled { opacity: 0.55; cursor: not-allowed; }`;
  }}
`;

const SectionCard = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 1.25rem;
`;

const WalletGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 1rem;
`;

const WalletItem = styled.div`
  background: ${palette.bg};
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  padding: 0.875rem 1rem;
`;

const WalletLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  margin-bottom: 0.25rem;
`;

const WalletValue = styled.div`
  font-size: 1.25rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${palette.text};
`;

const WalletUnit = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${palette.textSubtle};
  margin-left: 0.25rem;
`;

const SubTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
`;

const Th = styled.th`
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  padding: 0 0.75rem 0.75rem;
  border-bottom: 1px solid ${palette.border};

  &:first-child { padding-left: 0; }
`;

const Td = styled.td`
  padding: 0.75rem;
  border-bottom: 1px solid ${palette.border};
  color: ${palette.textMuted};
  vertical-align: middle;

  &:first-child { padding-left: 0; }
`;

const EmptyState = styled.p`
  color: ${palette.textSubtle};
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem 0;
  margin: 0;
`;

const Spinner = styled.div`
  color: ${palette.textSubtle};
  font-size: 0.875rem;
  padding: 3rem 0;
  text-align: center;
`;

/* ─── Badges ───────────────────────────────────────────────────────────────── */
const UserStatusBadge = styled.span<{ $status: UserAccountStatus | 'DELETED' }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.2rem 0.6rem;

  ${({ $status }) => {
    if ($status === 'ACTIVE') return `background: ${palette.successSoft}; color: ${palette.success};`;
    if ($status === 'SUSPENDED') return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    return `background: #f3f4f6; color: #6b7280;`;
  }}
`;

const RiskBadge = styled.span<{ $level: RiskBucket }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 9999px;
  padding: 0.2rem 0.6rem;

  ${({ $level }) => {
    if ($level === 'auto') return `background: ${palette.successSoft}; color: ${palette.success};`;
    if ($level === 'review') return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
  }}
`;

// Mirrors AdminSubscriptionsPage PlanBadge so the same plan renders the same
// colour across all three admin screens. Amber = Premium Monthly,
// teal = Premium Weekly (LIGHT), info-blue = Basic.
const PlanBadge = styled.span<{ $plan: SubscriptionPlan }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.2rem 0.6rem;
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

// Palette mirrors AdminSubscriptionsPage StatusBadge so the same record reads the
// same color on list and detail. CANCELLED stays neutral grey (terminal,
// user-initiated — not an error); EXPIRED is purple to distinguish natural
// lapse from cancellation per spec §4.2; INCOMPLETE_EXPIRED is danger (failed
// onboarding, not the same as a healthy cancel).
const SubStatusBadge = styled.span<{ $status: SubscriptionStatus }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.2rem 0.6rem;
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

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function AdminSubscriberDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const locale = language === 'bg' ? 'bg-BG' : 'en-GB';
  const lang: 'en' | 'bg' = language === 'bg' ? 'bg' : 'en';

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-subscriber-detail', userId],
    queryFn: () => adminSubscribersService.getSubscriber(userId!),
    enabled: !!userId,
  });

  const T = (key: I18NKey, vars?: Record<string, string | number>) => tr(key, lang, vars);

  const suspendMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'SUSPENDED') =>
      adminSubscribersService.suspendSubscriber(userId!, status),
    onSuccess: (_, status) => {
      toast.success(T(status === 'SUSPENDED' ? 'acctSuspended' : 'acctActivated'));
      queryClient.invalidateQueries({ queryKey: ['admin-subscriber-detail', userId] });
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
    },
    onError: () => toast.error(T('statusFail')),
  });

  const forceLogoutMutation = useMutation({
    mutationFn: () => adminSubscribersService.forceLogout(userId!),
    onSuccess: (res) => {
      if (res.revokedCount === 0) {
        toast(T('revokedNone'), { icon: 'ℹ️' });
      } else {
        toast.success(T('revokedN', { n: res.revokedCount }));
      }
    },
    onError: () => toast.error(T('revokeFail')),
  });

  if (isLoading) return <PageShell><Spinner>{T('loading')}</Spinner></PageShell>;
  if (isError || !data) return <PageShell><Spinner>{T('loadFail')}</Spinner></PageShell>;

  const accountStatus = (data.deletedAt ? 'DELETED' : data.status) as UserAccountStatus | 'DELETED';
  const fullName =
    data.firstName || data.lastName
      ? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim()
      : data.email;

  const sortedSubs = [...data.subscriptions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <PageShell>
      <PageHeader>
        <BackLink to="/admin/subscribers/all">{T('backAll')}</BackLink>
      </PageHeader>

      {/* Profile header */}
      <ProfileCard>
        <ProfileTop>
          <ProfileInfo>
            <FullName>{fullName}</FullName>
            <ContactLine>{data.email}</ContactLine>
            {data.phone && <ContactLine>{data.phone}</ContactLine>}
            <BadgeRow>
              <UserStatusBadge $status={accountStatus}>{userStatusLabel(accountStatus, lang)}</UserStatusBadge>
              {data.riskScore != null && (
                <RiskBadge $level={riskBucket(data.riskScore)}>
                  {T('risk')}: {riskLabel(data.riskScore, lang)} ({data.riskScore})
                </RiskBadge>
              )}
            </BadgeRow>
            <MetaRow>
              {T('joined')} {fmt(data.createdAt)}
              {data.lastLoginAt && <> · {T('lastLogin')} {fmt(data.lastLoginAt)}</>}
            </MetaRow>
          </ProfileInfo>

          <ActionButtons>
            {accountStatus !== 'DELETED' && (
              <>
                {data.status === 'ACTIVE' ? (
                  <Btn
                    $variant="warning"
                    disabled={suspendMutation.isPending}
                    onClick={() => {
                      if (window.confirm(T('confirmSuspend', { name: fullName })))
                        suspendMutation.mutate('SUSPENDED');
                    }}
                  >
                    {suspendMutation.isPending ? T('saving') : T('suspendAcct')}
                  </Btn>
                ) : data.status === 'SUSPENDED' ? (
                  <Btn
                    $variant="primary"
                    disabled={suspendMutation.isPending}
                    onClick={() => suspendMutation.mutate('ACTIVE')}
                  >
                    {suspendMutation.isPending ? T('saving') : T('activateAcct')}
                  </Btn>
                ) : null}
              </>
            )}
            <Btn
              $variant="ghost"
              disabled={forceLogoutMutation.isPending}
              onClick={() => {
                if (window.confirm(T('confirmRevoke', { name: fullName })))
                  forceLogoutMutation.mutate();
              }}
            >
              {forceLogoutMutation.isPending ? T('revoking') : T('forceLogout')}
            </Btn>
          </ActionButtons>
        </ProfileTop>
      </ProfileCard>

      {/* Wallet */}
      <SectionCard>
        <SectionTitle>{T('walletTitle')}</SectionTitle>
        {data.wallet ? (
          <WalletGrid>
            <WalletItem>
              <WalletLabel>{T('walletAvailable')}</WalletLabel>
              <WalletValue>
                {data.wallet.availableBalance.toFixed(2)}
                <WalletUnit>BGN</WalletUnit>
              </WalletValue>
            </WalletItem>
            <WalletItem>
              <WalletLabel>{T('walletTotal')}</WalletLabel>
              <WalletValue>
                {data.wallet.balance.toFixed(2)}
                <WalletUnit>BGN</WalletUnit>
              </WalletValue>
            </WalletItem>
            <WalletItem>
              <WalletLabel>{T('walletPending')}</WalletLabel>
              <WalletValue>
                {data.wallet.pendingBalance.toFixed(2)}
                <WalletUnit>BGN</WalletUnit>
              </WalletValue>
            </WalletItem>
          </WalletGrid>
        ) : (
          <EmptyState>{T('noWallet')}</EmptyState>
        )}
      </SectionCard>

      {/* Subscriptions */}
      <SectionCard>
        <SectionTitle>{T('subsTitle')}</SectionTitle>
        {sortedSubs.length === 0 ? (
          <EmptyState>{T('noSubs')}</EmptyState>
        ) : (
          <SubTable>
            <thead>
              <tr>
                <Th>{T('colPlan')}</Th>
                <Th>{T('colStatus')}</Th>
                <Th>{T('colPeriodEnds')}</Th>
                <Th>{T('colAutoRenew')}</Th>
                <Th>{T('colCancelled')}</Th>
                <Th>{T('colStarted')}</Th>
              </tr>
            </thead>
            <tbody>
              {sortedSubs.map((sub) => (
                <tr key={sub.id}>
                  <Td>
                    <PlanBadge $plan={sub.plan}>{planLabel(sub.plan, lang)}</PlanBadge>
                  </Td>
                  <Td>
                    <SubStatusBadge $status={sub.status}>
                      {subStatusLabel(sub.status, lang)}
                    </SubStatusBadge>
                  </Td>
                  <Td>{fmt(sub.currentPeriodEnd)}</Td>
                  <Td
                    style={{
                      color: sub.autoRenewal ? palette.success : palette.textSubtle,
                      fontWeight: 600,
                    }}
                  >
                    {sub.autoRenewal ? T('yes') : T('no')}
                  </Td>
                  <Td>{fmt(sub.canceledAt)}</Td>
                  <Td>{fmt(sub.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </SubTable>
        )}
      </SectionCard>
    </PageShell>
  );
}
