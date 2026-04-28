import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  warning: '#b5803a', warningSoft: '#f5ead2',
  danger: '#b54327', dangerSoft: '#f4dcd2',
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
const SearchInput = styled.input`flex: 1; max-width: 18rem; padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; } &::placeholder { color: ${palette.textSubtle}; }`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENT' | 'PAUSED';

const StatusBadge = styled.span<{ $status: CampaignStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'SENT':      return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'SCHEDULED': return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'PAUSED':    return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      default:          return `background: ${palette.border}; color: ${palette.textMuted};`;
    }
  }}
`;

interface Campaign {
  id: string;
  name: string;
  type: 'EMAIL' | 'PUSH' | 'SMS';
  status: CampaignStatus;
  audience: number;
  sentAt: string | null;
  openRate: number | null;
  clickRate: number | null;
  createdAt: string;
}

const MOCK: Campaign[] = [
  { id: '1', name: 'Summer Cashback Boost', type: 'EMAIL', status: 'SENT', audience: 12400, sentAt: '2026-04-10T10:00:00Z', openRate: 38.2, clickRate: 12.1, createdAt: '2026-04-08T09:00:00Z' },
  { id: '2', name: 'New Partner Welcome — April', type: 'PUSH', status: 'SENT', audience: 3200, sentAt: '2026-04-15T09:00:00Z', openRate: 61.5, clickRate: 22.4, createdAt: '2026-04-14T08:00:00Z' },
  { id: '3', name: 'May Loyalty Reminder', type: 'EMAIL', status: 'SCHEDULED', audience: 18700, sentAt: null, openRate: null, clickRate: null, createdAt: '2026-04-22T11:00:00Z' },
  { id: '4', name: 'Weekend Flash Bonus', type: 'PUSH', status: 'DRAFT', audience: 0, sentAt: null, openRate: null, clickRate: null, createdAt: '2026-04-25T14:30:00Z' },
  { id: '5', name: 'Re-engage Inactive Users', type: 'EMAIL', status: 'PAUSED', audience: 5600, sentAt: null, openRate: null, clickRate: null, createdAt: '2026-04-18T10:00:00Z' },
  { id: '6', name: 'BoomCard 1-Year Anniversary', type: 'EMAIL', status: 'DRAFT', audience: 0, sentAt: null, openRate: null, clickRate: null, createdAt: '2026-04-27T16:00:00Z' },
  { id: '7', name: 'Referral Programme Launch', type: 'SMS', status: 'SENT', audience: 8900, sentAt: '2026-04-05T08:00:00Z', openRate: null, clickRate: null, createdAt: '2026-04-03T09:00:00Z' },
  { id: '8', name: 'Sofia Restaurant Week', type: 'PUSH', status: 'SENT', audience: 4100, sentAt: '2026-04-12T07:00:00Z', openRate: 54.3, clickRate: 19.8, createdAt: '2026-04-11T10:00:00Z' },
];

const TYPE_COLOR: Record<Campaign['type'], string> = { EMAIL: palette.info, PUSH: palette.accent, SMS: palette.success };

const PAGE_SIZE = 25;

export default function AdminMarketingCampaignsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return MOCK.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      return true;
    });
  }, [search, statusFilter]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const columns: ColumnDef<Campaign>[] = [
    {
      key: 'name',
      header: 'Campaign',
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          <MetaLine>
            <span style={{ color: TYPE_COLOR[row.type], fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.type}</span>
            <span style={{ marginLeft: '0.5rem', color: palette.textSubtle }}>Created {fmt(row.createdAt)}</span>
          </MetaLine>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge $status={row.status}>{row.status}</StatusBadge>,
    },
    {
      key: 'audience',
      header: 'Audience',
      render: (row) => (
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
          {row.audience > 0 ? row.audience.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'sentAt',
      header: 'Sent',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.sentAt ? fmt(row.sentAt) : '—'}
        </span>
      ),
    },
    {
      key: 'openRate',
      header: 'Open / Click',
      render: (row) => (
        <span style={{ fontSize: '0.875rem', color: palette.text }}>
          {row.openRate != null ? (
            <>
              <span style={{ fontWeight: 600 }}>{row.openRate}%</span>
              <span style={{ color: palette.textSubtle }}> / {row.clickRate}%</span>
            </>
          ) : '—'}
        </span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Marketing</Eyebrow>
          <PageTitle>
            Campaigns
            {filtered.length > 0 && <TotalBadge>{filtered.length}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Email, push, and SMS campaigns sent to subscribers</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as CampaignStatus | ''); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="SENT">Sent</option>
            <option value="PAUSED">Paused</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={paged}
          rowKey={(row) => row.id}
          loading={false}
          emptyMessage="No campaigns found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'View',
              onClick: () => {},
            },
            {
              label: 'Duplicate',
              onClick: () => {},
            },
          ]}
        />
      </Card>
    </PageShell>
  );
}
