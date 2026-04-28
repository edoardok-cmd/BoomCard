import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  warning: '#b5803a', warningSoft: '#f5ead2',
  info: '#2563eb', infoSoft: '#dbeafe',
};

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.infoSoft}; color: ${palette.info}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

type AutoStatus = 'ACTIVE' | 'PAUSED' | 'DRAFT';

const StatusBadge = styled.span<{ $status: AutoStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'ACTIVE': return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'PAUSED': return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      default:       return `background: ${palette.border}; color: ${palette.textMuted};`;
    }
  }}
`;

interface Automation {
  id: string;
  name: string;
  trigger: string;
  template: string;
  status: AutoStatus;
  totalRuns: number;
  lastRunAt: string | null;
  createdAt: string;
}

const MOCK: Automation[] = [
  { id: '1', name: 'Welcome Series', trigger: 'user.registered', template: 'Welcome — New Subscriber', status: 'ACTIVE', totalRuns: 1240, lastRunAt: '2026-04-28T09:00:00Z', createdAt: '2025-10-01T10:00:00Z' },
  { id: '2', name: 'Cashback Credited Push', trigger: 'cashback.credited', template: 'Cashback Credited', status: 'ACTIVE', totalRuns: 18900, lastRunAt: '2026-04-28T11:30:00Z', createdAt: '2025-10-05T09:00:00Z' },
  { id: '3', name: '30-Day Inactivity Nudge', trigger: 'user.inactive_30d', template: 'Re-engagement Nudge', status: 'PAUSED', totalRuns: 340, lastRunAt: '2026-03-15T09:00:00Z', createdAt: '2026-01-20T10:00:00Z' },
  { id: '4', name: 'Birthday Bonus', trigger: 'user.birthday', template: 'Promo Blast', status: 'DRAFT', totalRuns: 0, lastRunAt: null, createdAt: '2026-04-10T14:00:00Z' },
  { id: '5', name: 'New Partner Alert', trigger: 'partner.approved', template: 'New Partner Nearby', status: 'ACTIVE', totalRuns: 58, lastRunAt: '2026-04-25T08:00:00Z', createdAt: '2026-01-15T11:00:00Z' },
  { id: '6', name: 'Monthly Statement', trigger: 'schedule.monthly', template: 'Monthly Cashback Summary', status: 'ACTIVE', totalRuns: 12, lastRunAt: '2026-04-01T06:00:00Z', createdAt: '2025-12-01T09:00:00Z' },
];

const PAGE_SIZE = 25;

export default function AdminMarketingAutomationsPage() {
  const [statusFilter, setStatusFilter] = useState<AutoStatus | ''>('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() =>
    MOCK.filter((a) => !statusFilter || a.status === statusFilter),
    [statusFilter],
  );

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const columns: ColumnDef<Automation>[] = [
    {
      key: 'name',
      header: 'Automation',
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          <MetaLine>Trigger: <code style={{ fontSize: '0.72rem', background: palette.bg, padding: '0.05rem 0.3rem', borderRadius: '0.2rem' }}>{row.trigger}</code></MetaLine>
        </span>
      ),
    },
    {
      key: 'template',
      header: 'Template',
      render: (row) => (
        <span style={{ fontSize: '0.875rem', color: palette.textMuted }}>{row.template}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge $status={row.status}>{row.status}</StatusBadge>,
    },
    {
      key: 'totalRuns',
      header: 'Total runs',
      render: (row) => (
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
          {row.totalRuns > 0 ? row.totalRuns.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'lastRunAt',
      header: 'Last run',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.lastRunAt ? fmt(row.lastRunAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Marketing</Eyebrow>
          <PageTitle>
            Automations
            {filtered.length > 0 && <TotalBadge>{filtered.length}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Event-triggered message flows sent automatically to users</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as AutoStatus | ''); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="DRAFT">Draft</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={paged}
          rowKey={(row) => row.id}
          loading={false}
          emptyMessage="No automations found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          onPageChange={setPage}
          rowActions={[
            { label: 'Edit', onClick: () => {} },
            { label: 'Pause', hidden: (row) => row.status !== 'ACTIVE', onClick: () => {} },
            { label: 'Activate', hidden: (row) => row.status === 'ACTIVE', onClick: () => {} },
          ]}
        />
      </Card>
    </PageShell>
  );
}
