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
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.dangerSoft}; color: ${palette.danger}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const SearchInput = styled.input`flex: 1; max-width: 18rem; padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; } &::placeholder { color: ${palette.textSubtle}; }`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type TicketCategory = 'CASHBACK' | 'ACCOUNT' | 'PAYMENT' | 'TECHNICAL' | 'OTHER';

const PriorityBadge = styled.span<{ $priority: Priority }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $priority }) => {
    switch ($priority) {
      case 'URGENT': return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'HIGH':   return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'MEDIUM': return `background: ${palette.infoSoft}; color: ${palette.info};`;
      default:       return `background: ${palette.border}; color: ${palette.textMuted};`;
    }
  }}
`;

interface Ticket {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: Priority;
  user: { name: string; email: string };
  createdAt: string;
}

const MOCK: Ticket[] = [
  { id: '1', subject: 'Cashback not credited after scan', category: 'CASHBACK', priority: 'HIGH', user: { name: 'Ivan Petrov', email: 'ivan.petrov@gmail.com' }, createdAt: '2026-04-28T08:12:00Z' },
  { id: '2', subject: 'Cannot log in to my account', category: 'ACCOUNT', priority: 'URGENT', user: { name: 'Maria Georgieva', email: 'maria.g@abv.bg' }, createdAt: '2026-04-28T07:45:00Z' },
  { id: '3', subject: 'Payment declined but scan was accepted', category: 'PAYMENT', priority: 'HIGH', user: { name: 'Georgi Nikolov', email: 'g.nikolov@mail.bg' }, createdAt: '2026-04-28T06:30:00Z' },
  { id: '4', subject: 'App crashes on receipt scan', category: 'TECHNICAL', priority: 'MEDIUM', user: { name: 'Elena Todorova', email: 'elena.t@gmail.com' }, createdAt: '2026-04-27T21:00:00Z' },
  { id: '5', subject: 'How do I update my phone number?', category: 'ACCOUNT', priority: 'LOW', user: { name: 'Dimitar Stoyanov', email: 'dstoyanov@gmail.com' }, createdAt: '2026-04-27T18:45:00Z' },
  { id: '6', subject: 'Subscription not activating after payment', category: 'PAYMENT', priority: 'URGENT', user: { name: 'Kristina Panova', email: 'kpanova@abv.bg' }, createdAt: '2026-04-27T17:20:00Z' },
  { id: '7', subject: 'QR code not scanning at partner', category: 'TECHNICAL', priority: 'MEDIUM', user: { name: 'Boyko Ivanov', email: 'boyko.i@gmail.com' }, createdAt: '2026-04-27T15:00:00Z' },
  { id: '8', subject: 'Wrong cashback percentage applied', category: 'CASHBACK', priority: 'MEDIUM', user: { name: 'Svetla Marinova', email: 'svetla.m@gmail.com' }, createdAt: '2026-04-27T13:30:00Z' },
  { id: '9', subject: 'Other — general question', category: 'OTHER', priority: 'LOW', user: { name: 'Plamen Kostov', email: 'pkostov@mail.bg' }, createdAt: '2026-04-27T11:00:00Z' },
];

const CATEGORY_COLOR: Record<TicketCategory, string> = {
  CASHBACK: palette.success, ACCOUNT: palette.info, PAYMENT: palette.danger,
  TECHNICAL: palette.warning, OTHER: palette.textMuted,
};

const PAGE_SIZE = 25;

export default function AdminHelpNewPage() {
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | ''>('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() =>
    MOCK.filter((t) => {
      if (search && !t.subject.toLowerCase().includes(search.toLowerCase()) && !t.user.email.toLowerCase().includes(search.toLowerCase())) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (categoryFilter && t.category !== categoryFilter) return false;
      return true;
    }),
    [search, priorityFilter, categoryFilter],
  );

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const columns: ColumnDef<Ticket>[] = [
    {
      key: 'subject',
      header: 'Ticket',
      render: (row) => (
        <span>
          <PrimaryLine>{row.subject}</PrimaryLine>
          <MetaLine>
            <span style={{ color: CATEGORY_COLOR[row.category], fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.category}</span>
          </MetaLine>
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
      key: 'priority',
      header: 'Priority',
      render: (row) => <PriorityBadge $priority={row.priority}>{row.priority}</PriorityBadge>,
    },
    {
      key: 'createdAt',
      header: 'Received',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Help</Eyebrow>
          <PageTitle>
            New Tickets
            {filtered.length > 0 && <TotalBadge>{filtered.length}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Unassigned support requests awaiting a first response</PageSubtitle>
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
          <Select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value as Priority | ''); setPage(1); }}>
            <option value="">All priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
          <Select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value as TicketCategory | ''); setPage(1); }}>
            <option value="">All categories</option>
            <option value="CASHBACK">Cashback</option>
            <option value="ACCOUNT">Account</option>
            <option value="PAYMENT">Payment</option>
            <option value="TECHNICAL">Technical</option>
            <option value="OTHER">Other</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={paged}
          rowKey={(row) => row.id}
          loading={false}
          emptyMessage="No new tickets"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          onPageChange={setPage}
          rowActions={[
            { label: 'Assign to me', onClick: () => {} },
            { label: 'View', onClick: () => {} },
          ]}
        />
      </Card>
    </PageShell>
  );
}
