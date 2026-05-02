import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import TicketDrawer from '../../components/admin/TicketDrawer';
import {
  adminHelpService,
  HelpTicket,
  TicketStatus,
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
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.infoSoft}; color: ${palette.info}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const SearchInput = styled.input`flex: 1; max-width: 18rem; padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; } &::placeholder { color: ${palette.textSubtle}; }`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;
const NewTicketBtn = styled(Link)`
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.5625rem 1.125rem; border: none; border-radius: 0.5rem;
  background: ${palette.accent}; color: #fff; font-size: 0.875rem; font-weight: 600;
  text-decoration: none; white-space: nowrap; align-self: flex-start;
  &:hover { background: #b5522e; }
`;

const STATUS_BG_LABELS: Record<TicketStatus, string> = {
  NEW: 'Нова', OPEN: 'Отворена', WAITING: 'Изчакване', RESOLVED: 'Решена', CLOSED: 'Затворена',
};

const PRIORITY_BG_LABELS: Record<TicketPriority, string> = {
  LOW: 'Нисък', MEDIUM: 'Среден', HIGH: 'Висок', URGENT: 'Спешен',
};

const CATEGORY_BG_LABELS: Record<TicketCategory, string> = {
  CASHBACK: 'Кешбек', ACCOUNT: 'Акаунт', PAYMENT: 'Плащане', TECHNICAL: 'Техническо', OTHER: 'Друго',
};

const CATEGORY_COLOR: Record<TicketCategory, { bg: string; text: string }> = {
  CASHBACK:  { bg: palette.successSoft, text: palette.success },
  ACCOUNT:   { bg: palette.infoSoft,    text: palette.info },
  PAYMENT:   { bg: palette.dangerSoft,  text: palette.danger },
  TECHNICAL: { bg: palette.warningSoft, text: palette.warning },
  OTHER:     { bg: palette.border,      text: palette.textMuted },
};

const StatusBadge = styled.span<{ $status: TicketStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'NEW':      return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'OPEN':     return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'WAITING':  return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'RESOLVED': return `background: ${palette.successSoft}; color: ${palette.success};`;
      default:         return `background: ${palette.border}; color: ${palette.textMuted};`;
    }
  }}
`;

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

const CategoryBadge = styled.span<{ $cat: TicketCategory }>`
  display: inline-flex; align-items: center; font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.15rem 0.45rem;
  background: ${({ $cat }) => CATEGORY_COLOR[$cat]?.bg ?? palette.border};
  color: ${({ $cat }) => CATEGORY_COLOR[$cat]?.text ?? palette.textMuted};
`;

const PAGE_SIZE = 25;

function displayName(u: TicketUser | null | undefined): string {
  if (!u) return '—';
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name || u.email;
}

export default function AdminHelpAllPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isSuperAdmin = user?.rawRole === 'SUPER_ADMIN';

  useEffect(() => {
    if (user && !isSuperAdmin) {
      navigate('/admin/help/mine', { replace: true });
    }
  }, [user, isSuperAdmin, navigate]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | ''>('');
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-help-all', page, search, statusFilter, priorityFilter, categoryFilter],
    queryFn: () => adminHelpService.listAll({
      page,
      limit: PAGE_SIZE,
      search: search || undefined,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      category: categoryFilter || undefined,
    }),
  });

  const assignMutation = useMutation({
    mutationFn: (id: string) => adminHelpService.assign(id),
    onSuccess: () => {
      toast.success('Заявката е назначена на вас');
      queryClient.invalidateQueries({ queryKey: ['admin-help-all'] });
      queryClient.invalidateQueries({ queryKey: ['admin-help-mine'] });
    },
    onError: () => toast.error('Грешка при назначаване'),
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('bg-BG', { day: '2-digit', month: 'short', year: 'numeric' });

  const columns: ColumnDef<HelpTicket>[] = [
    {
      key: 'subject',
      header: 'Заявка',
      render: (row) => (
        <span>
          <PrimaryLine>{row.subject}</PrimaryLine>
          <MetaLine>
            <CategoryBadge $cat={row.category}>{CATEGORY_BG_LABELS[row.category]}</CategoryBadge>
            <span style={{ marginLeft: '0.5rem', color: palette.textSubtle }}>{fmt(row.createdAt)}</span>
          </MetaLine>
        </span>
      ),
    },
    {
      key: 'user',
      header: 'Потребител',
      render: (row) => (
        <span>
          <PrimaryLine style={{ fontWeight: 500 }}>{displayName(row.user)}</PrimaryLine>
          <MetaLine>{row.user?.email}</MetaLine>
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'Приоритет',
      render: (row) => <PriorityBadge $priority={row.priority}>{PRIORITY_BG_LABELS[row.priority]}</PriorityBadge>,
    },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => <StatusBadge $status={row.status}>{STATUS_BG_LABELS[row.status]}</StatusBadge>,
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
            Всички заявки
            {data && data.total > 0 && <TotalBadge>{data.total}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Пълен преглед на всички заявки в системата</PageSubtitle>
        </TitleBlock>
        <NewTicketBtn to="/admin/help/new">+ Нова заявка</NewTicketBtn>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Търсене по тема или имейл…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { if (debounceRef.current) clearTimeout(debounceRef.current); setSearch(searchInput); setPage(1); } }}
          />
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as TicketStatus | ''); setPage(1); }}>
            <option value="">Всички статуси</option>
            <option value="NEW">Нова</option>
            <option value="OPEN">Отворена</option>
            <option value="WAITING">Изчакване</option>
            <option value="RESOLVED">Решена</option>
            <option value="CLOSED">Затворена</option>
          </Select>
          <Select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value as TicketPriority | ''); setPage(1); }}>
            <option value="">Всички приоритети</option>
            <option value="URGENT">Спешен</option>
            <option value="HIGH">Висок</option>
            <option value="MEDIUM">Среден</option>
            <option value="LOW">Нисък</option>
          </Select>
          <Select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value as TicketCategory | ''); setPage(1); }}>
            <option value="">Всички категории</option>
            <option value="CASHBACK">Кешбек</option>
            <option value="ACCOUNT">Акаунт</option>
            <option value="PAYMENT">Плащане</option>
            <option value="TECHNICAL">Техническо</option>
            <option value="OTHER">Друго</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.tickets ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          loading={isLoading}
          emptyMessage="Няма намерени заявки"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total ?? 0}
          onPageChange={setPage}
          rowActions={[
            { label: 'Преглед', onClick: (row) => setSelectedId(row.id) },
            {
              label: 'Вземи заявката',
              hidden: (row) => !!row.assignee,
              onClick: (row) => assignMutation.mutate(row.id),
            },
          ]}
        />
      </Card>
    </PageShell>
    <TicketDrawer ticketId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}
