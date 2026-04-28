import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
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

type TemplateType = 'EMAIL' | 'PUSH' | 'SMS';

const TypePill = styled.span<{ $type: TemplateType }>`
  display: inline-flex; font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; border-radius: 0.25rem; padding: 0.1rem 0.4rem;
  ${({ $type }) => {
    switch ($type) {
      case 'EMAIL': return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'PUSH':  return `background: #f3e8de; color: #c96442;`;
      case 'SMS':   return `background: ${palette.successSoft}; color: ${palette.success};`;
    }
  }}
`;

interface Template {
  id: string;
  name: string;
  type: TemplateType;
  subject: string | null;
  lastUsed: string | null;
  usageCount: number;
  createdAt: string;
}

const MOCK: Template[] = [
  { id: '1', name: 'Monthly Cashback Summary', type: 'EMAIL', subject: 'Your BoomCard cashback this month', lastUsed: '2026-04-10T10:00:00Z', usageCount: 12, createdAt: '2025-12-01T09:00:00Z' },
  { id: '2', name: 'Welcome — New Subscriber', type: 'EMAIL', subject: 'Welcome to BoomCard!', lastUsed: '2026-04-20T08:00:00Z', usageCount: 890, createdAt: '2025-11-15T10:00:00Z' },
  { id: '3', name: 'New Partner Nearby', type: 'PUSH', subject: null, lastUsed: '2026-04-15T09:00:00Z', usageCount: 34, createdAt: '2026-01-10T11:00:00Z' },
  { id: '4', name: 'Cashback Credited', type: 'PUSH', subject: null, lastUsed: '2026-04-28T07:30:00Z', usageCount: 2100, createdAt: '2025-10-05T09:00:00Z' },
  { id: '5', name: 'OTP Verification', type: 'SMS', subject: null, lastUsed: '2026-04-28T11:00:00Z', usageCount: 15600, createdAt: '2025-09-01T08:00:00Z' },
  { id: '6', name: 'Referral Reward', type: 'EMAIL', subject: 'You earned a referral bonus!', lastUsed: '2026-04-05T13:00:00Z', usageCount: 67, createdAt: '2026-02-20T10:00:00Z' },
  { id: '7', name: 'Promo Blast', type: 'EMAIL', subject: null, lastUsed: null, usageCount: 0, createdAt: '2026-04-26T14:00:00Z' },
  { id: '8', name: 'Re-engagement Nudge', type: 'PUSH', subject: null, lastUsed: '2026-03-15T09:00:00Z', usageCount: 8, createdAt: '2026-03-10T10:00:00Z' },
];

const PAGE_SIZE = 25;

export default function AdminMarketingTemplatesPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TemplateType | ''>('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() =>
    MOCK.filter((t) => {
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter && t.type !== typeFilter) return false;
      return true;
    }),
    [search, typeFilter],
  );

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const columns: ColumnDef<Template>[] = [
    {
      key: 'name',
      header: 'Template',
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          {row.subject && <MetaLine>{row.subject}</MetaLine>}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <TypePill $type={row.type}>{row.type}</TypePill>,
    },
    {
      key: 'usageCount',
      header: 'Times used',
      render: (row) => (
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
          {row.usageCount > 0 ? row.usageCount.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'lastUsed',
      header: 'Last used',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.lastUsed ? fmt(row.lastUsed) : 'Never'}
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
            Templates
            {filtered.length > 0 && <TotalBadge>{filtered.length}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Reusable message templates for campaigns and automations</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as TemplateType | ''); setPage(1); }}>
            <option value="">All types</option>
            <option value="EMAIL">Email</option>
            <option value="PUSH">Push</option>
            <option value="SMS">SMS</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={paged}
          rowKey={(row) => row.id}
          loading={false}
          emptyMessage="No templates found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          onPageChange={setPage}
          rowActions={[
            { label: 'Edit', onClick: () => {} },
            { label: 'Duplicate', onClick: () => {} },
          ]}
        />
      </Card>
    </PageShell>
  );
}
