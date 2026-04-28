import { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminCashbackService,
  CashbackSummaryEntry,
} from '../../services/adminCashback.service';

/* ─── Palette ──────────────────────────────────────────────────────────────── */
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
  amber: '#92400e',
  amberSoft: '#fef3c7',
};

/* ─── Layout ────────────────────────────────────────────────────────────────── */
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

/* ─── Stat cards ────────────────────────────────────────────────────────────── */
const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const StatCard = styled.div<{ $accent?: string; $accentSoft?: string }>`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.25rem 1.5rem;
`;

const StatLabel = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  margin: 0 0 0.375rem;
`;

const StatValue = styled.p<{ $color?: string }>`
  font-size: 1.625rem;
  font-weight: 800;
  color: ${({ $color }) => $color ?? palette.text};
  margin: 0;
  line-height: 1;
`;

/* ─── Table card ────────────────────────────────────────────────────────────── */
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

const MonthInput = styled.input`
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

/* ─── Cell helpers ──────────────────────────────────────────────────────────── */
const PartnerCell = styled.div`
  font-weight: 600;
  color: ${palette.text};
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

type PaymentStatus = CashbackSummaryEntry['paymentStatus'];

const StatusBadge = styled.span<{ $status: PaymentStatus }>`
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
      case 'PAID':
        return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'OVERDUE':
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      default:
        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    }
  }}
`;

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Component ─────────────────────────────────────────────────────────────── */
export default function AdminCashbackPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(currentMonthStr());
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | ''>('');

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  const { data: stats } = useQuery({
    queryKey: ['admin-cashback-stats'],
    queryFn: () => adminCashbackService.getStats(),
  });

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ['admin-cashback-summary', month, statusFilter],
    queryFn: () =>
      adminCashbackService.getSummary({
        month: month || undefined,
        status: statusFilter || undefined,
      }),
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ partnerId, notes }: { partnerId: string; notes?: string }) =>
      adminCashbackService.markPaid(partnerId, month, notes),
    onSuccess: () => {
      toast.success('Cashback marked as paid');
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: () => toast.error('Failed to mark as paid'),
  });

  const reminderMutation = useMutation({
    mutationFn: (partnerId: string) =>
      adminCashbackService.sendReminder(partnerId, month || undefined),
    onSuccess: () => toast.success('Reminder sent'),
    onError: () => toast.error('Failed to send reminder'),
  });

  const columns: ColumnDef<CashbackSummaryEntry>[] = [
    {
      key: 'partner',
      header: 'Partner',
      render: (row) => (
        <PartnerCell>
          {row.partnerName}
          {row.partnerEmail && <MetaLine>{row.partnerEmail}</MetaLine>}
        </PartnerCell>
      ),
    },
    {
      key: 'month',
      header: 'Month',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{row.month}</span>
      ),
    },
    {
      key: 'receiptCount',
      header: 'Scans',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.875rem' }}>
          {row.receiptCount.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'totalOwed',
      header: 'Total owed',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 700, color: palette.text }}>
          {fmtMoney(row.totalOwed)} лв.
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <StatusBadge $status={row.paymentStatus}>{row.paymentStatus}</StatusBadge>
          {row.paidAt && <MetaLine>Paid {fmtDate(row.paidAt)}</MetaLine>}
          {row.paidBy && <MetaLine>by {row.paidBy}</MetaLine>}
          {row.notes && <MetaLine style={{ fontStyle: 'italic' }}>{row.notes}</MetaLine>}
        </span>
      ),
    },
  ];

  const isMutating = markPaidMutation.isPending || reminderMutation.isPending;

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Subscribers</Eyebrow>
          <PageTitle>Cashback</PageTitle>
          <PageSubtitle>Monthly cashback owed to partners from subscriber scans</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <StatsRow>
        <StatCard>
          <StatLabel>Pending total</StatLabel>
          <StatValue $color={palette.warning}>
            {stats ? `${fmtMoney(stats.pendingTotal)} лв.` : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Paid this month</StatLabel>
          <StatValue $color={palette.success}>
            {stats ? `${fmtMoney(stats.paidThisMonth)} лв.` : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Overdue</StatLabel>
          <StatValue $color={stats && stats.overdueCount > 0 ? palette.danger : palette.text}>
            {stats ? stats.overdueCount.toLocaleString() : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Active partners</StatLabel>
          <StatValue>{stats ? stats.activePartners.toLocaleString() : '—'}</StatValue>
        </StatCard>
      </StatsRow>

      <Card>
        <FilterRow>
          <MonthInput
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PaymentStatus | '')}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={summary}
          rowKey={(row) => `${row.partnerId}-${row.month}`}
          loading={isLoading}
          emptyMessage="No cashback entries for this period"
          rowActions={[
            {
              label: 'Mark as paid',
              hidden: (row) => row.paymentStatus === 'PAID',
              onClick: (row) => {
                if (
                  !window.confirm(
                    `Mark cashback for ${row.partnerName} (${row.month}) as paid?\nTotal: ${fmtMoney(row.totalOwed)} лв.`,
                  )
                )
                  return;
                const notes = window.prompt('Optional notes (payment reference, etc.):') ?? undefined;
                markPaidMutation.mutate({ partnerId: row.partnerId, notes: notes || undefined });
              },
            },
            {
              label: 'Send reminder',
              hidden: (row) => row.paymentStatus === 'PAID',
              onClick: (row) => {
                if (!window.confirm(`Send email reminder to ${row.partnerEmail ?? row.partnerName}?`))
                  return;
                reminderMutation.mutate(row.partnerId);
              },
            },
          ]}
        />

        {isMutating && (
          <div
            style={{
              textAlign: 'center',
              padding: '0.5rem',
              fontSize: '0.8125rem',
              color: palette.textSubtle,
            }}
          >
            Updating…
          </div>
        )}
      </Card>
    </PageShell>
  );
}
