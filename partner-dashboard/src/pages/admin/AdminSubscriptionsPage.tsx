import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminSubscriptionsService,
  AdminSubscription,
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
};

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

/* ─── Cell helpers ─────────────────────────────────────────────────────────── */
const UserCell = styled.div`
  font-weight: 600;
  color: ${palette.text};
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
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

/* ─── Options ──────────────────────────────────────────────────────────────── */
const PLAN_OPTIONS: Array<{ value: SubscriptionPlan | ''; label: string }> = [
  { value: '', label: 'All plans' },
  { value: 'LIGHT', label: 'Light (weekly)' },
  { value: 'BASIC', label: 'Basic' },
  { value: 'PREMIUM', label: 'Premium' },
];

const STATUS_OPTIONS: Array<{ value: SubscriptionStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIALING', label: 'Trialing' },
  { value: 'PAST_DUE', label: 'Past due' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'INCOMPLETE', label: 'Incomplete' },
  { value: 'INCOMPLETE_EXPIRED', label: 'Incomplete expired' },
  { value: 'PAUSED', label: 'Paused' },
];

const PAGE_SIZE = 20;

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function AdminSubscriptionsPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan | ''>('');
  const [status, setStatus] = useState<SubscriptionStatus | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-subscriptions', page, search, plan, status],
    queryFn: () =>
      adminSubscriptionsService.list({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        plan: plan || undefined,
        status: status || undefined,
      }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => adminSubscriptionsService.cancel(id),
    onSuccess: () => {
      toast.success('Subscription scheduled for cancellation at period end');
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    },
    onError: () => toast.error('Failed to cancel subscription'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => adminSubscriptionsService.reactivate(id),
    onSuccess: () => {
      toast.success('Subscription reactivated — cancellation removed');
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    },
    onError: () => toast.error('Failed to reactivate subscription'),
  });

  const autoRenewalMutation = useMutation({
    mutationFn: ({ id, autoRenewal }: { id: string; autoRenewal: boolean }) =>
      adminSubscriptionsService.toggleAutoRenewal(id, autoRenewal),
    onSuccess: (_data, vars) => {
      toast.success(vars.autoRenewal ? 'Auto-renewal enabled' : 'Auto-renewal disabled');
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    },
    onError: () => toast.error('Failed to update auto-renewal'),
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setSearch(searchInput);
      setPage(1);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const columns: ColumnDef<AdminSubscription>[] = [
    {
      key: 'user',
      header: 'Subscriber',
      render: (row) => (
        <UserCell>
          {row.user.firstName || row.user.lastName
            ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim()
            : '—'}
          <MetaLine>{row.user.email}</MetaLine>
          {row.user.phone && <MetaLine>{row.user.phone}</MetaLine>}
        </UserCell>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (row) => <PlanBadge $plan={row.plan}>{row.plan}</PlanBadge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <StatusBadge $status={row.status}>{row.status.replace(/_/g, ' ')}</StatusBadge>
          {row.cancelAtPeriodEnd && (
            <MetaLine style={{ color: palette.warning }}>
              Cancels {row.cancelAt ? fmt(row.cancelAt) : 'at period end'}
            </MetaLine>
          )}
        </span>
      ),
    },
    {
      key: 'renewal',
      header: 'Auto-renewal',
      render: (row) => {
        // cancelSubscription() sets cancelAtPeriodEnd=true without syncing autoRenewal,
        // so derive the effective state from both fields to avoid conflicting signals.
        const effective = row.autoRenewal && !row.cancelAtPeriodEnd;
        return <RenewalPill $on={effective}>{effective ? 'On' : 'Off'}</RenewalPill>;
      },
    },
    {
      key: 'periodEnd',
      header: 'Period ends',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmt(row.currentPeriodEnd)}
        </span>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (row) => (
        <ProviderTag>
          {row.stripeSubscriptionId ? 'Stripe' : row.payseraOrderId ? 'Paysera' : '—'}
        </ProviderTag>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmt(row.createdAt)}
        </span>
      ),
    },
  ];

  const isMutating =
    cancelMutation.isPending || reactivateMutation.isPending || autoRenewalMutation.isPending;

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Subscribers</Eyebrow>
          <PageTitle>
            Subscriptions
            {data && data.total > 0 && <TotalBadge>{data.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Manage all subscriber plans, renewals, and cancellations</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search by name, email or phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <Select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value as SubscriptionPlan | '');
              setPage(1);
            }}
          >
            {PLAN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.subscriptions ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="No subscriptions found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'Cancel at period end',
              danger: true,
              hidden: (row) =>
                row.cancelAtPeriodEnd ||
                row.status === 'CANCELLED' ||
                row.status === 'INCOMPLETE_EXPIRED',
              onClick: (row) => {
                if (!window.confirm(`Cancel subscription for ${row.user.email}? They will keep access until ${fmt(row.currentPeriodEnd)}.`)) return;
                cancelMutation.mutate(row.id);
              },
            },
            {
              label: 'Reactivate',
              hidden: (row) => !row.cancelAtPeriodEnd || row.status === 'CANCELLED',
              onClick: (row) => reactivateMutation.mutate(row.id),
            },
            {
              label: 'Disable auto-renewal',
              hidden: (row) =>
                !row.autoRenewal ||
                row.cancelAtPeriodEnd ||
                row.status === 'CANCELLED' ||
                row.status === 'INCOMPLETE_EXPIRED',
              onClick: (row) => autoRenewalMutation.mutate({ id: row.id, autoRenewal: false }),
            },
            {
              label: 'Enable auto-renewal',
              // Hidden when Reactivate already covers the same intent (cancelAtPeriodEnd=true)
              hidden: (row) =>
                row.autoRenewal ||
                row.cancelAtPeriodEnd ||
                row.status === 'CANCELLED' ||
                row.status === 'INCOMPLETE_EXPIRED',
              onClick: (row) => autoRenewalMutation.mutate({ id: row.id, autoRenewal: true }),
            },
          ]}
        />
        {isMutating && (
          <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.8125rem', color: palette.textSubtle }}>
            Updating…
          </div>
        )}
      </Card>
    </PageShell>
  );
}
