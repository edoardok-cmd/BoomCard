import { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminHelpService,
  NewTicket,
  TicketPriority,
  TicketCategory,
  TicketUser,
} from '../../services/adminHelp.service';

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

const PriorityBadge = styled.span<{ $priority: TicketPriority }>`
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

const CATEGORY_COLOR: Record<TicketCategory, string> = {
  CASHBACK: palette.success, ACCOUNT: palette.info, PAYMENT: palette.danger,
  TECHNICAL: palette.warning, OTHER: palette.textMuted,
};

const PAGE_SIZE = 25;

function displayName(u: TicketUser): string {
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name || u.email;
}

export default function AdminHelpNewPage() {
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-help-new', page, search, priorityFilter, categoryFilter],
    queryFn: () => adminHelpService.listNew({
      page,
      limit: PAGE_SIZE,
      search: search || undefined,
      priority: priorityFilter || undefined,
      category: categoryFilter || undefined,
    }),
  });

  const assignMutation = useMutation({
    mutationFn: (id: string) => adminHelpService.assign(id),
    onSuccess: () => {
      toast.success('Ticket assigned to you');
      queryClient.invalidateQueries({ queryKey: ['admin-help-new'] });
      queryClient.invalidateQueries({ queryKey: ['admin-help-mine'] });
      queryClient.invalidateQueries({ queryKey: ['admin-help-all'] });
    },
    onError: () => toast.error('Failed to assign ticket'),
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const columns: ColumnDef<NewTicket>[] = [
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
          <PrimaryLine style={{ fontWeight: 500 }}>{displayName(row.user)}</PrimaryLine>
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
            {data && data.total > 0 && <TotalBadge>{data.total}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Unassigned support requests awaiting a first response</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search subject or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
          />
          <Select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value as TicketPriority | ''); setPage(1); }}>
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
          data={data?.tickets ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="No new tickets"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total ?? 0}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'Assign to me',
              onClick: (row) => assignMutation.mutate(row.id),
            },
            { label: 'View', onClick: () => {} },
          ]}
        />
      </Card>
    </PageShell>
  );
}
