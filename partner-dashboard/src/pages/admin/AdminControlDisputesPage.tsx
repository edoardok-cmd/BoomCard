import { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import { adminControlService, AdminDispute } from '../../services/adminControl.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  warning: '#b5803a', warningSoft: '#f5ead2',
  info: '#2563eb', infoSoft: '#dbeafe',
};

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.warningSoft}; color: ${palette.warning}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

const ScoreBadge = styled.span<{ $score: number }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  border-radius: 0.375rem; padding: 0.125rem 0.45rem;
  ${({ $score }) => {
    if ($score >= 70) return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
    if ($score >= 40) return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    return `background: ${palette.successSoft}; color: ${palette.success};`;
  }}
`;

const FlagsPill = styled.span`
  display: inline-flex; font-size: 0.65rem; font-weight: 600; font-family: monospace;
  border-radius: 0.25rem; padding: 0.1rem 0.375rem;
  background: ${palette.dangerSoft}; color: ${palette.danger};
  max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;

const STATUS_OPTIONS = [
  { value: 'MANUAL_REVIEW', label: 'Manual review' },
  { value: 'PROCESSING', label: 'Processing' },
];

const PAGE_SIZE = 25;

export default function AdminControlDisputesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('MANUAL_REVIEW');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-disputes', page, status],
    queryFn: () => adminControlService.getDisputes({ page, limit: PAGE_SIZE, status }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminControlService.approveDispute(id),
    onSuccess: () => {
      toast.success('Receipt approved — cashback will be credited');
      queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
    },
    onError: () => toast.error('Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => adminControlService.rejectDispute(id),
    onSuccess: () => {
      toast.success('Receipt rejected');
      queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
    },
    onError: () => toast.error('Failed to reject'),
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const fmtBgn = (n: number | null) =>
    n == null ? '—' : n.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 });

  const columns: ColumnDef<AdminDispute>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <span>
          <PrimaryLine>
            {row.user.firstName || row.user.lastName
              ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim()
              : '—'}
          </PrimaryLine>
          <MetaLine>{row.user.email}</MetaLine>
        </span>
      ),
    },
    {
      key: 'venue',
      header: 'Venue',
      render: (row) =>
        row.venue ? (
          <span>
            <PrimaryLine style={{ fontWeight: 500 }}>{row.venue.name}</PrimaryLine>
            <MetaLine>{row.venue.partner.businessName} · {row.venue.city}</MetaLine>
          </span>
        ) : (
          <MetaLine>—</MetaLine>
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <span>
          <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
            {fmtBgn(row.total)}
          </span>
          <MetaLine>Cashback: {fmtBgn(row.cashbackAmount)}</MetaLine>
        </span>
      ),
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {row.verificationScore != null && (
            <ScoreBadge $score={row.verificationScore}>
              Score: {row.verificationScore}
            </ScoreBadge>
          )}
          {row.fraudFlags && <FlagsPill title={row.fraudFlags}>{row.fraudFlags}</FlagsPill>}
          {!row.verificationScore && !row.fraudFlags && <MetaLine>—</MetaLine>}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Control</Eyebrow>
          <PageTitle>
            Disputes
            {data && data.meta.total > 0 && <TotalBadge>{data.meta.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Receipts flagged for manual review — approve or reject cashback</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="No disputes pending review"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'Approve',
              onClick: (row) => {
                if (!window.confirm(`Approve cashback of ${fmtBgn(row.cashbackAmount)} for ${row.user.email}?`)) return;
                approveMutation.mutate(row.id);
              },
            },
            {
              label: 'Reject',
              danger: true,
              onClick: (row) => {
                if (!window.confirm(`Reject this receipt from ${row.user.email}?`)) return;
                rejectMutation.mutate(row.id);
              },
            },
          ]}
        />
      </Card>
    </PageShell>
  );
}
