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

type ListType = 'STATIC' | 'DYNAMIC' | 'SEGMENT';

const TypePill = styled.span<{ $type: ListType }>`
  display: inline-flex; font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; border-radius: 0.25rem; padding: 0.1rem 0.4rem;
  ${({ $type }) => {
    switch ($type) {
      case 'DYNAMIC':  return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'SEGMENT':  return `background: ${palette.successSoft}; color: ${palette.success};`;
      default:         return `background: #f3e8de; color: #c96442;`;
    }
  }}
`;

interface AudienceList {
  id: string;
  name: string;
  type: ListType;
  description: string;
  size: number;
  updatedAt: string;
  createdAt: string;
}

const MOCK: AudienceList[] = [
  { id: '1', name: 'All Active Subscribers', type: 'DYNAMIC', description: 'Users with an active subscription', size: 18741, updatedAt: '2026-04-28T06:00:00Z', createdAt: '2025-09-01T09:00:00Z' },
  { id: '2', name: 'Sofia Users', type: 'SEGMENT', description: 'Subscribers registered in Sofia', size: 9340, updatedAt: '2026-04-28T06:00:00Z', createdAt: '2025-11-15T10:00:00Z' },
  { id: '3', name: 'High Spenders', type: 'DYNAMIC', description: 'Users who scanned 10+ times last 30 days', size: 3120, updatedAt: '2026-04-27T06:00:00Z', createdAt: '2026-01-10T11:00:00Z' },
  { id: '4', name: 'Inactive 30+ Days', type: 'DYNAMIC', description: 'Users with no scan activity in 30 days', size: 4560, updatedAt: '2026-04-27T06:00:00Z', createdAt: '2026-01-20T10:00:00Z' },
  { id: '5', name: 'Beta Testers', type: 'STATIC', description: 'Hand-picked early access users', size: 87, updatedAt: '2026-02-01T12:00:00Z', createdAt: '2025-08-15T09:00:00Z' },
  { id: '6', name: 'Plovdiv & Varna', type: 'SEGMENT', description: 'Subscribers in Plovdiv or Varna', size: 2890, updatedAt: '2026-04-28T06:00:00Z', createdAt: '2026-02-05T10:00:00Z' },
  { id: '7', name: 'Referral Programme Opt-ins', type: 'STATIC', description: 'Users who opted into referral emails', size: 1240, updatedAt: '2026-04-10T09:00:00Z', createdAt: '2026-02-20T10:00:00Z' },
];

const PAGE_SIZE = 25;

export default function AdminMarketingListsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ListType | ''>('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() =>
    MOCK.filter((l) => {
      if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter && l.type !== typeFilter) return false;
      return true;
    }),
    [search, typeFilter],
  );

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const columns: ColumnDef<AudienceList>[] = [
    {
      key: 'name',
      header: 'List',
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          <MetaLine>{row.description}</MetaLine>
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <TypePill $type={row.type}>{row.type}</TypePill>,
    },
    {
      key: 'size',
      header: 'Members',
      render: (row) => (
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
          {row.size.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Last updated',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.updatedAt)}</span>
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
            Audience Lists
            {filtered.length > 0 && <TotalBadge>{filtered.length}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Subscriber segments and contact lists used in campaigns</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search lists…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as ListType | ''); setPage(1); }}>
            <option value="">All types</option>
            <option value="STATIC">Static</option>
            <option value="DYNAMIC">Dynamic</option>
            <option value="SEGMENT">Segment</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={paged}
          rowKey={(row) => row.id}
          loading={false}
          emptyMessage="No lists found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          onPageChange={setPage}
          rowActions={[
            { label: 'View members', onClick: () => {} },
            { label: 'Edit', onClick: () => {} },
          ]}
        />
      </Card>
    </PageShell>
  );
}
