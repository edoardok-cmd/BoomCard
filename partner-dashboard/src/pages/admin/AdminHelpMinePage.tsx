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
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.warningSoft}; color: ${palette.warning}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const SearchInput = styled.input`flex: 1; max-width: 18rem; padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; } &::placeholder { color: ${palette.textSubtle}; }`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

type TicketStatus = 'OPEN' | 'WAITING' | 'RESOLVED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

const StatusBadge = styled.span<{ $status: TicketStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'RESOLVED': return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'WAITING':  return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      default:         return `background: ${palette.infoSoft}; color: ${palette.info};`;
    }
  }}
`;

const PriorityDot = styled.span<{ $priority: Priority }>`
  display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 9999px; margin-right: 0.375rem;
  background: ${({ $priority }) => {
    switch ($priority) {
      case 'URGENT': return palette.danger;
      case 'HIGH':   return palette.warning;
      case 'MEDIUM': return palette.info;
      default:       return palette.textSubtle;
    }
  }};
`;

interface MyTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  user: { name: string; email: string };
  lastReplyAt: string;
  openedAt: string;
}

const MOCK: MyTicket[] = [
  { id: '1', subject: 'Cashback not credited after scan', status: 'OPEN', priority: 'HIGH', user: { name: 'Ivan Petrov', email: 'ivan.petrov@gmail.com' }, lastReplyAt: '2026-04-28T09:00:00Z', openedAt: '2026-04-26T08:12:00Z' },
  { id: '2', subject: 'Subscription not activating after payment', status: 'WAITING', priority: 'URGENT', user: { name: 'Kristina Panova', email: 'kpanova@abv.bg' }, lastReplyAt: '2026-04-27T14:30:00Z', openedAt: '2026-04-27T17:20:00Z' },
  { id: '3', subject: 'App crashes on receipt scan', status: 'OPEN', priority: 'MEDIUM', user: { name: 'Elena Todorova', email: 'elena.t@gmail.com' }, lastReplyAt: '2026-04-27T21:00:00Z', openedAt: '2026-04-27T21:00:00Z' },
  { id: '4', subject: 'Wrong cashback percentage applied', status: 'WAITING', priority: 'MEDIUM', user: { name: 'Svetla Marinova', email: 'svetla.m@gmail.com' }, lastReplyAt: '2026-04-26T16:00:00Z', openedAt: '2026-04-25T13:30:00Z' },
  { id: '5', subject: 'Refund request for failed payment', status: 'OPEN', priority: 'HIGH', user: { name: 'Nikolay Vasilev', email: 'nvasilev@abv.bg' }, lastReplyAt: '2026-04-28T08:00:00Z', openedAt: '2026-04-28T07:00:00Z' },
  { id: '6', subject: 'Partner venue not showing on map', status: 'RESOLVED', priority: 'LOW', user: { name: 'Aleksandra Koeva', email: 'a.koeva@gmail.com' }, lastReplyAt: '2026-04-24T11:00:00Z', openedAt: '2026-04-22T10:00:00Z' },
];

const PAGE_SIZE = 25;

export default function AdminHelpMinePage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() =>
    MOCK.filter((t) => {
      if (search && !t.subject.toLowerCase().includes(search.toLowerCase()) && !t.user.email.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    }),
    [search, statusFilter],
  );

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const columns: ColumnDef<MyTicket>[] = [
    {
      key: 'subject',
      header: 'Ticket',
      render: (row) => (
        <span>
          <PrimaryLine>
            <PriorityDot $priority={row.priority} />
            {row.subject}
          </PrimaryLine>
          <MetaLine>Opened {fmt(row.openedAt)}</MetaLine>
        </span>
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <span>
          <PrimaryLine style={{ fontWeight: 500 }}>{row.user.name}</PrimaryLine>
          <MetaLine>{row.user.email}</MetaLine>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge $status={row.status}>{row.status}</StatusBadge>,
    },
    {
      key: 'lastReplyAt',
      header: 'Last activity',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.lastReplyAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Help</Eyebrow>
          <PageTitle>
            My Tickets
            {filtered.filter((t) => t.status !== 'RESOLVED').length > 0 && (
              <TotalBadge>{filtered.filter((t) => t.status !== 'RESOLVED').length} open</TotalBadge>
            )}
          </PageTitle>
          <PageSubtitle>Tickets currently assigned to you</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search subject or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as TicketStatus | ''); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="WAITING">Waiting</option>
            <option value="RESOLVED">Resolved</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={paged}
          rowKey={(row) => row.id}
          loading={false}
          emptyMessage="No tickets assigned to you"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          onPageChange={setPage}
          rowActions={[
            { label: 'Reply', onClick: () => {} },
            { label: 'Resolve', hidden: (row) => row.status === 'RESOLVED', onClick: () => {} },
          ]}
        />
      </Card>
    </PageShell>
  );
}
