import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef, RowAction } from '../../components/admin/DataTable/DataTable';
import {
  adminPayoutsService,
  AdminPayout,
  PayoutStatus,
} from '../../services/adminPayouts.service';

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
  background: ${palette.warningSoft};
  color: ${palette.warning};
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

const AmountCell = styled.div`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.9375rem;
  color: ${palette.text};
`;

const IbanCell = styled.div`
  font-size: 0.8125rem;
  color: ${palette.textMuted};
  font-family: monospace;
`;

const StatusBadge = styled.span<{ $status: PayoutStatus }>`
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
      case 'PENDING':
        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'PROCESSING':
        return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'COMPLETED':
        return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'FAILED':
      case 'CANCELLED':
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'ANNULLED':
        return `background: #f3f4f6; color: #6b7280;`;
      default:
        return `background: #f3f4f6; color: #6b7280;`;
    }
  }}
`;

/* ─── Reject modal ─────────────────────────────────────────────────────────── */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Modal = styled.div`
  background: ${palette.surface};
  border-radius: 0.875rem;
  padding: 1.75rem;
  width: 100%;
  max-width: 26rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
`;

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.5rem;
`;

const ModalSubtitle = styled.p`
  font-size: 0.875rem;
  color: ${palette.textMuted};
  margin: 0 0 1rem;
`;

const ReasonTextarea = styled.textarea`
  width: 100%;
  min-height: 4.5rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-family: inherit;
  background: ${palette.bg};
  color: ${palette.text};
  resize: vertical;
  box-sizing: border-box;
  outline: none;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.25rem;
`;

const Btn = styled.button<{ $variant?: 'danger' | 'ghost' }>`
  padding: 0.5rem 1.125rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 150ms;

  background: ${(p) =>
    p.$variant === 'danger' ? palette.danger : p.$variant === 'ghost' ? 'transparent' : palette.accent};
  color: ${(p) => (p.$variant === 'ghost' ? palette.textMuted : '#fff')};
  border: ${(p) => (p.$variant === 'ghost' ? `1px solid ${palette.border}` : 'none')};

  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/* ─── Component ───────────────────────────────────────────────────────────── */
const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: PayoutStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'ANNULLED', label: 'Annulled' },
];

export default function AdminPayoutsPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PayoutStatus | ''>('');
  const [rejectTarget, setRejectTarget] = useState<AdminPayout | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payouts', page, search, status],
    queryFn: () =>
      adminPayoutsService.list({ page, limit: PAGE_SIZE, search: search || undefined, status }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminPayoutsService.approve(id),
    onSuccess: () => {
      toast.success('Payout approved — marked as Processing');
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.message || (err as any)?.response?.data?.error || 'Failed to approve payout';
      toast.error(msg);
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => adminPayoutsService.complete(id),
    onSuccess: () => {
      toast.success('Payout marked as Completed');
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.message || (err as any)?.response?.data?.error || 'Failed to mark payout as completed';
      toast.error(msg);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminPayoutsService.reject(id, reason),
    onSuccess: () => {
      toast.success('Payout rejected — balance restored');
      setRejectTarget(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.message || (err as any)?.response?.data?.error || 'Failed to reject payout';
      toast.error(msg);
    },
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setSearch(searchInput);
      setPage(1);
    }
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(e.target.value as PayoutStatus | '');
    setPage(1);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const columns: ColumnDef<AdminPayout>[] = [
    {
      key: 'user',
      header: 'Subscriber',
      render: (row) => (
        <UserCell>
          {row.wallet.user.firstName || row.wallet.user.lastName
            ? `${row.wallet.user.firstName ?? ''} ${row.wallet.user.lastName ?? ''}`.trim()
            : '—'}
          <MetaLine>{row.wallet.user.email}</MetaLine>
          {row.wallet.user.phone && <MetaLine>{row.wallet.user.phone}</MetaLine>}
        </UserCell>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <AmountCell>
          {row.amount.toFixed(2)} {row.currency}
          <MetaLine>
            Balance: {row.balanceBefore.toFixed(2)} → {row.balanceAfter.toFixed(2)}
          </MetaLine>
        </AmountCell>
      ),
    },
    {
      key: 'iban',
      header: 'Destination',
      render: (row) =>
        row.wallet.payoutIban ? (
          <IbanCell>
            {row.wallet.payoutBeneficiaryName && (
              <div style={{ fontFamily: 'inherit', marginBottom: '0.125rem', color: palette.textMuted }}>
                {row.wallet.payoutBeneficiaryName}
              </div>
            )}
            {row.wallet.payoutIban}
          </IbanCell>
        ) : (
          <span style={{ color: palette.textSubtle, fontSize: '0.8125rem' }}>No IBAN set</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge $status={row.status}>{row.status.replace('_', ' ')}</StatusBadge>
      ),
    },
    {
      key: 'description',
      header: 'Note',
      render: (row) =>
        row.description ? (
          <span style={{ fontSize: '0.8125rem', color: palette.textSubtle }}>{row.description}</span>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Requested',
      sortable: true,
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmt(row.createdAt)}
          <MetaLine>{fmtTime(row.createdAt)}</MetaLine>
        </span>
      ),
    },
  ];

  const rowActions: RowAction<AdminPayout>[] = [
    {
      label: 'Approve',
      hidden: (row) => row.status !== 'PENDING',
      onClick: (row) => approveMutation.mutate(row.id),
    },
    {
      label: 'Mark paid',
      hidden: (row) => row.status !== 'PROCESSING',
      onClick: (row) => completeMutation.mutate(row.id),
    },
    {
      label: 'Reject',
      danger: true,
      hidden: (row) => row.status !== 'PENDING',
      onClick: (row) => {
        setRejectTarget(row);
        setRejectReason('');
      },
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Finance</Eyebrow>
          <PageTitle>
            Subscriber Payouts
            {data && data.total > 0 && <TotalBadge>{data.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Wallet withdrawal requests awaiting processing or review</PageSubtitle>
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
          <Select value={status} onChange={handleStatusChange}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.payouts ?? []}
          rowKey={(row) => row.id}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="No payout requests found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
        />
      </Card>

      {rejectTarget && (
        <Overlay onClick={() => setRejectTarget(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Reject payout</ModalTitle>
            <ModalSubtitle>
              {rejectTarget.amount.toFixed(2)} {rejectTarget.currency} for{' '}
              {rejectTarget.wallet.user.firstName ?? ''} {rejectTarget.wallet.user.lastName ?? ''} —
              the balance will be restored.
            </ModalSubtitle>
            <ReasonTextarea
              placeholder="Reason (optional)…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <ModalActions>
              <Btn $variant="ghost" onClick={() => setRejectTarget(null)}>
                Cancel
              </Btn>
              <Btn
                $variant="danger"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason })}
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Reject & restore'}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}
    </PageShell>
  );
}
