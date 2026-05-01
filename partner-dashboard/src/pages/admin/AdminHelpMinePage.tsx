import { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import TicketDrawer from '../../components/admin/TicketDrawer';
import {
  adminHelpService,
  MyTicket,
  TicketStatus,
  TicketPriority,
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
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.warningSoft}; color: ${palette.warning}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const SearchInput = styled.input`flex: 1; max-width: 18rem; padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; } &::placeholder { color: ${palette.textSubtle}; }`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

const STATUS_BG_LABELS: Record<TicketStatus, string> = {
  NEW: 'Нова', OPEN: 'Отворена', WAITING: 'Изчакване', RESOLVED: 'Решена', CLOSED: 'Затворена',
};

const PRIORITY_BG_LABELS: Record<TicketPriority, string> = {
  LOW: 'Нисък', MEDIUM: 'Среден', HIGH: 'Висок', URGENT: 'Спешен',
};

const StatusBadge = styled.span<{ $status: TicketStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'RESOLVED': return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'WAITING':  return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'NEW':      return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      default:         return `background: ${palette.infoSoft}; color: ${palette.info};`;
    }
  }}
`;

const PriorityDot = styled.span<{ $priority: TicketPriority }>`
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

const PAGE_SIZE = 25;

function displayName(u: TicketUser | null | undefined): string {
  if (!u) return '—';
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name || u.email;
}

export default function AdminHelpMinePage() {
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-help-mine', page, search, statusFilter],
    queryFn: () => adminHelpService.listMine({
      page,
      limit: PAGE_SIZE,
      search: search || undefined,
      status: statusFilter || undefined,
    }),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => adminHelpService.update(id, { status: 'RESOLVED' }),
    onSuccess: () => {
      toast.success('Заявката е маркирана като решена');
      queryClient.invalidateQueries({ queryKey: ['admin-help-mine'] });
      queryClient.invalidateQueries({ queryKey: ['admin-help-all'] });
    },
    onError: () => toast.error('Грешка при обновяване'),
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('bg-BG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const columns: ColumnDef<MyTicket>[] = [
    {
      key: 'subject',
      header: 'Заявка',
      render: (row) => (
        <span>
          <PrimaryLine>
            <PriorityDot $priority={row.priority} title={PRIORITY_BG_LABELS[row.priority]} />
            {row.subject}
          </PrimaryLine>
          <MetaLine>Подадена {fmt(row.createdAt)}</MetaLine>
        </span>
      ),
    },
    {
      key: 'assignee',
      header: 'Назначена на',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: row.assignee ? palette.textMuted : palette.danger }}>
          {row.assignee ? displayName(row.assignee) : 'Неназначена'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => <StatusBadge $status={row.status}>{STATUS_BG_LABELS[row.status]}</StatusBadge>,
    },
    {
      key: 'updatedAt',
      header: 'Последна промяна',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.updatedAt)}</span>
      ),
    },
  ];

  return (
    <>
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Помощ</Eyebrow>
          <PageTitle>
            Моите заявки
            {data && data.total > 0 && <TotalBadge>{data.total}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Заявки, създадени от мен</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Търсене по тема…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
          />
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as TicketStatus | ''); setPage(1); }}>
            <option value="">Всички статуси</option>
            <option value="NEW">Нова</option>
            <option value="OPEN">Отворена</option>
            <option value="WAITING">Изчакване</option>
            <option value="RESOLVED">Решена</option>
            <option value="CLOSED">Затворена</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.tickets ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="Нямате подадени заявки"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total ?? 0}
          onPageChange={setPage}
          rowActions={[
            { label: 'Преглед', onClick: (row) => setSelectedId(row.id) },
            {
              label: 'Маркирай като решена',
              hidden: (row) => row.status === 'RESOLVED' || row.status === 'CLOSED',
              onClick: (row) => resolveMutation.mutate(row.id),
            },
          ]}
        />
      </Card>
    </PageShell>
    <TicketDrawer ticketId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
