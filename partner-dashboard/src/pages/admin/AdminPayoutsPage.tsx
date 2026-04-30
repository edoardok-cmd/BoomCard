import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef, RowAction } from '../../components/admin/DataTable/DataTable';
import {
  adminPayoutsService,
  AdminPayout,
  PayoutStatus,
  PayoutsSummary,
} from '../../services/adminPayouts.service';

/* ─── Palette ─────────────────────────────────────────────────────────────── */
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
  purple: '#7c3aed',
  purpleSoft: '#ede9fe',
};

/* ─── Layout ───────────────────────────────────────────────────────────────── */
const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
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

/* ─── Summary banner ───────────────────────────────────────────────────────── */
const SummaryRow = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
`;

const SummaryCard = styled.div<{ $variant?: 'warning' | 'info' | 'neutral' }>`
  background: ${p =>
    p.$variant === 'warning' ? palette.warningSoft :
    p.$variant === 'info'    ? palette.infoSoft :
    palette.surface};
  border: 1px solid ${p =>
    p.$variant === 'warning' ? '#e5c97a' :
    p.$variant === 'info'    ? '#bfdbfe' :
    palette.border};
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  min-width: 10rem;
`;

const SummaryLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  margin-bottom: 0.25rem;
`;

const SummaryValue = styled.div`
  font-size: 1.375rem;
  font-weight: 800;
  color: ${palette.text};
`;

const SummaryMeta = styled.div`
  font-size: 0.75rem;
  color: ${palette.textMuted};
  margin-top: 0.125rem;
`;

/* ─── Card / filter ────────────────────────────────────────────────────────── */
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

const SearchWrap = styled.div`
  position: relative;
  flex: 1;
  max-width: 22rem;
  display: flex;
`;

const SearchInput = styled.input`
  flex: 1;
  padding: 0.5rem 2.5rem 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem 0 0 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;

  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
`;

const SearchBtn = styled.button`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-left: none;
  border-radius: 0 0.5rem 0.5rem 0;
  background: ${palette.accent};
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  &:hover { opacity: 0.88; }
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
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

/* ─── Cell helpers ─────────────────────────────────────────────────────────── */
const UserCell = styled.div`
  font-weight: 600;
  color: ${palette.text};
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const AmountCell = styled.div`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.9375rem;
  color: ${palette.text};
`;

const IbanCell = styled.div`
  font-size: 0.8125rem;
  color: ${palette.textMuted};
  font-family: monospace;
`;

const SlaTag = styled.span<{ $overdue: boolean }>`
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: 0.25rem;
  padding: 0.1rem 0.4rem;
  margin-top: 0.25rem;
  background: ${p => p.$overdue ? palette.dangerSoft : palette.warningSoft};
  color: ${p => p.$overdue ? palette.danger : palette.warning};
`;

const StatusBadge = styled.span<{ $status: PayoutStatus }>`
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
      case 'PENDING':
        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'PROCESSING':
        return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'COMPLETED':
        return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'FAILED':
      case 'CANCELLED':
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'RISK_HOLD':
        return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      case 'ANNULLED':
      case 'TRIAL_PENDING':
      default:
        return `background: #f3f4f6; color: #6b7280;`;
    }
  }}
`;

/* ─── Modal ────────────────────────────────────────────────────────────────── */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Modal = styled.div`
  background: ${palette.surface};
  border-radius: 0.875rem;
  padding: 1.75rem;
  width: 100%;
  max-width: 26rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
`;

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.5rem;
`;

const ModalSubtitle = styled.p`
  font-size: 0.875rem;
  color: ${palette.textMuted};
  margin: 0 0 1rem;
`;

const ReasonTextarea = styled.textarea`
  width: 100%;
  min-height: 4.5rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-family: inherit;
  background: ${palette.bg};
  color: ${palette.text};
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.25rem;
`;

const Btn = styled.button<{ $variant?: 'danger' | 'ghost' | 'warning' }>`
  padding: 0.5rem 1.125rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 150ms;
  background: ${p =>
    p.$variant === 'danger'   ? palette.danger :
    p.$variant === 'warning'  ? palette.warning :
    p.$variant === 'ghost'    ? 'transparent' :
    palette.accent};
  color: ${p => p.$variant === 'ghost' ? palette.textMuted : '#fff'};
  border: ${p => p.$variant === 'ghost' ? `1px solid ${palette.border}` : 'none'};
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const ALLOWED_STATUSES: PayoutStatus[] = [
  'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED',
  'TRIAL_PENDING', 'ANNULLED', 'RISK_HOLD',
];

const STATUS_OPTIONS: Array<{ value: PayoutStatus | ''; label: string }> = [
  { value: '',              label: 'Всички статуси' },
  { value: 'PENDING',       label: 'Чака' },
  { value: 'RISK_HOLD',     label: 'Задържано (риск)' },
  { value: 'PROCESSING',    label: 'Обработва се' },
  { value: 'COMPLETED',     label: 'Платено' },
  { value: 'FAILED',        label: 'Неуспешно' },
  { value: 'CANCELLED',     label: 'Отменено' },
  { value: 'ANNULLED',      label: 'Анулирано' },
  { value: 'TRIAL_PENDING', label: 'Изчакване (пробен)' },
];

const STATUS_LABELS: Record<PayoutStatus, string> = {
  PENDING:       'Чака',
  RISK_HOLD:     'Задържано (риск)',
  PROCESSING:    'Обработва се',
  COMPLETED:     'Платено',
  FAILED:        'Неуспешно',
  CANCELLED:     'Отменено',
  ANNULLED:      'Анулирано',
  TRIAL_PENDING: 'Изчакване (пробен)',
};

const SLA_WORKING_DAYS = 5;

function workingDaysSince(iso: string, metadataJson?: string | null): number {
  // Prefer the moment the payout was approved (stored by the backend on /approve)
  // over createdAt so the SLA reflects actual processing time, not queue wait time.
  let startIso = iso;
  if (metadataJson) {
    try {
      const meta = JSON.parse(metadataJson) as Record<string, unknown>;
      if (typeof meta.processingStartedAt === 'string') startIso = meta.processingStartedAt;
    } catch { /* ignore malformed JSON */ }
  }
  const start = new Date(startIso);
  const now   = new Date();
  let days    = 0;
  const cur   = new Date(start);
  while (cur < now) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

function displayName(row: AdminPayout): string {
  const { firstName, lastName } = row.wallet.user;
  return [firstName, lastName].filter(Boolean).join(' ') || '—';
}

/* ─── Component ───────────────────────────────────────────────────────────── */
type ModalMode = 'reject' | 'hold' | 'fail';

interface ModalState {
  mode: ModalMode;
  row: AdminPayout;
  reason: string;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

export default function AdminPayoutsPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusFromUrl = (): PayoutStatus | '' => {
    const raw = searchParams.get('status') as PayoutStatus | null;
    return raw && ALLOWED_STATUSES.includes(raw) ? raw : '';
  };

  const [page, setPage]               = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [status, setStatus]           = useState<PayoutStatus | ''>(statusFromUrl());
  const [modal, setModal]             = useState<ModalState | null>(null);

  useEffect(() => {
    const next = statusFromUrl();
    if (next !== status) { setStatus(next); setPage(1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payouts', page, search, status],
    queryFn: () =>
      adminPayoutsService.list({ page, limit: PAGE_SIZE, search: search || undefined, status }),
  });

  const summary: PayoutsSummary = data?.summary ?? { pendingCount: 0, pendingTotal: 0, processingCount: 0, riskHoldCount: 0 };

  /* ── mutations ── */
  const approveMutation = useMutation({
    mutationFn: (id: string) => adminPayoutsService.approve(id),
    onSuccess: () => { toast.success('Плащането е одобрено — преминава в обработка'); queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }); },
    onError: (err: unknown) => toast.error((err as any)?.response?.data?.message || 'Грешка при одобрение'),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => adminPayoutsService.complete(id),
    onSuccess: () => { toast.success('Плащането е маркирано като изпратено'); queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }); },
    onError: (err: unknown) => toast.error((err as any)?.response?.data?.message || 'Грешка'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminPayoutsService.reject(id, reason),
    onSuccess: () => { toast.success('Плащането е отхвърлено — балансът е възстановен'); closeModal(); queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }); },
    onError: (err: unknown) => toast.error((err as any)?.response?.data?.message || 'Грешка при отхвърляне'),
  });

  const holdMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminPayoutsService.hold(id, reason || undefined),
    onSuccess: () => { toast.success('Плащането е задържано за проверка'); closeModal(); queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }); },
    onError: (err: unknown) => toast.error((err as any)?.response?.data?.message || 'Грешка при задържане'),
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) => adminPayoutsService.release(id),
    onSuccess: () => { toast.success('Плащането е освободено — обратно в опашката'); queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }); },
    onError: (err: unknown) => toast.error((err as any)?.response?.data?.message || 'Грешка'),
  });

  const failMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminPayoutsService.fail(id, reason || undefined),
    onSuccess: () => { toast.success('Плащането е маркирано като неуспешно — балансът е възстановен'); closeModal(); queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }); },
    onError: (err: unknown) => toast.error((err as any)?.response?.data?.message || 'Грешка'),
  });

  /* ── search ── */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(val); setPage(1); }, SEARCH_DEBOUNCE_MS);
  };

  const triggerSearch = () => { setSearch(searchInput); setPage(1); };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(e.target.value as PayoutStatus | '');
    setPage(1);
  };

  /* ── modal ── */
  const closeModal = () => setModal(null);

  const handleModalConfirm = () => {
    if (!modal) return;
    const { mode, row, reason } = modal;
    if (mode === 'reject') rejectMutation.mutate({ id: row.id, reason });
    if (mode === 'hold')   holdMutation.mutate({ id: row.id, reason });
    if (mode === 'fail')   failMutation.mutate({ id: row.id, reason });
  };

  const isMutating = rejectMutation.isPending || holdMutation.isPending || failMutation.isPending;

  /* ── formatters ── */
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      hour: '2-digit', minute: '2-digit',
    });

  /* ── columns ── */
  const columns: ColumnDef<AdminPayout>[] = [
    {
      key: 'user',
      header: 'Абонат',
      render: (row) => (
        <UserCell>
          {displayName(row)}
          <MetaLine>{row.wallet.user.email}</MetaLine>
          {row.wallet.user.phone && <MetaLine>{row.wallet.user.phone}</MetaLine>}
        </UserCell>
      ),
    },
    {
      key: 'amount',
      header: 'Сума',
      render: (row) => (
        <AmountCell>
          {Math.abs(row.amount).toFixed(2)} {row.currency}
          <MetaLine>
            Баланс: {Math.abs(row.balanceBefore).toFixed(2)} → {Math.abs(row.balanceAfter).toFixed(2)}
          </MetaLine>
        </AmountCell>
      ),
    },
    {
      key: 'iban',
      header: 'IBAN',
      render: (row) =>
        row.wallet.payoutIban ? (
          <IbanCell>
            {row.wallet.payoutBeneficiaryName && (
              <div style={{ fontFamily: 'inherit', marginBottom: '0.125rem', color: palette.textMuted }}>
                {row.wallet.payoutBeneficiaryName}
              </div>
            )}
            {row.wallet.payoutIban}
          </IbanCell>
        ) : (
          <span style={{ color: palette.textSubtle, fontSize: '0.8125rem' }}>Няма IBAN</span>
        ),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => (
        <>
          <StatusBadge $status={row.status}>{STATUS_LABELS[row.status] ?? row.status}</StatusBadge>
          {row.status === 'PROCESSING' && (() => {
            const days = workingDaysSince(row.createdAt, row.metadata);
            const overdue = days > SLA_WORKING_DAYS;
            return (
              <SlaTag $overdue={overdue}>
                {overdue
                  ? `⚠ ${days} раб. дни (просрочено)`
                  : `${days} / ${SLA_WORKING_DAYS} раб. дни`}
              </SlaTag>
            );
          })()}
        </>
      ),
    },
    {
      key: 'description',
      header: 'Бележка',
      render: (row) =>
        row.description ? (
          <span style={{ fontSize: '0.8125rem', color: palette.textSubtle }}>{row.description}</span>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Заявено',
      sortable: true,
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmt(row.createdAt)}
          <MetaLine>{fmtTime(row.createdAt)}</MetaLine>
        </span>
      ),
    },
  ];

  /* ── row actions ── */
  const rowActions: RowAction<AdminPayout>[] = [
    {
      label: 'Одобри',
      hidden: (row) => row.status !== 'PENDING',
      disabled: (row) => !row.wallet.payoutIban,
      disabledTitle: 'Абонатът няма регистриран IBAN',
      onClick: (row) => approveMutation.mutate(row.id),
    },
    {
      label: 'Задържи (риск)',
      hidden: (row) => row.status !== 'PENDING',
      onClick: (row) => setModal({ mode: 'hold', row, reason: '' }),
    },
    {
      label: 'Освободи',
      hidden: (row) => row.status !== 'RISK_HOLD',
      onClick: (row) => releaseMutation.mutate(row.id),
    },
    {
      label: 'Маркирай като платено',
      hidden: (row) => row.status !== 'PROCESSING',
      onClick: (row) => completeMutation.mutate(row.id),
    },
    {
      label: 'Неуспешно (банка)',
      danger: true,
      hidden: (row) => row.status !== 'PROCESSING',
      onClick: (row) => setModal({ mode: 'fail', row, reason: '' }),
    },
    {
      label: 'Отхвърли',
      danger: true,
      hidden: (row) => row.status !== 'PENDING' && row.status !== 'RISK_HOLD',
      onClick: (row) => setModal({ mode: 'reject', row, reason: '' }),
    },
  ];

  /* ── modal copy ── */
  const modalCopy: Record<ModalMode, { title: string; subtitle: (row: AdminPayout) => string; confirm: string; confirmVariant: 'danger' | 'warning' }> = {
    reject: {
      title: 'Отхвърляне на плащане',
      subtitle: (row) => `${Math.abs(row.amount).toFixed(2)} ${row.currency} за ${displayName(row)} — балансът ще бъде възстановен.`,
      confirm: 'Отхвърли и възстанови',
      confirmVariant: 'danger',
    },
    hold: {
      title: 'Задържане за проверка',
      subtitle: (row) => `Плащането от ${Math.abs(row.amount).toFixed(2)} ${row.currency} за ${displayName(row)} ще бъде задържано.`,
      confirm: 'Задържи',
      confirmVariant: 'warning',
    },
    fail: {
      title: 'Маркиране като неуспешно',
      subtitle: (row) => `Банковият превод от ${Math.abs(row.amount).toFixed(2)} ${row.currency} за ${displayName(row)} не е успял. Балансът ще бъде възстановен.`,
      confirm: 'Маркирай неуспешно',
      confirmVariant: 'danger',
    },
  };

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Финанси</Eyebrow>
          <PageTitle>Плащания към абонати</PageTitle>
          <PageSubtitle>Заявки за изтегляне на средства, очакващи обработка или проверка</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      {/* Summary banner */}
      <SummaryRow>
        <SummaryCard $variant="warning">
          <SummaryLabel>Чакащи</SummaryLabel>
          <SummaryValue>{summary.pendingCount}</SummaryValue>
          <SummaryMeta>
            {Math.abs(summary.pendingTotal).toFixed(2)} BGN общо
          </SummaryMeta>
        </SummaryCard>
        <SummaryCard $variant="info">
          <SummaryLabel>В обработка</SummaryLabel>
          <SummaryValue>{summary.processingCount}</SummaryValue>
          <SummaryMeta>в рамките на 5 раб. дни</SummaryMeta>
        </SummaryCard>
        {summary.riskHoldCount > 0 && (
          <SummaryCard style={{ background: palette.purpleSoft, border: `1px solid #c4b5fd` }}>
            <SummaryLabel style={{ color: palette.purple }}>Задържани (риск)</SummaryLabel>
            <SummaryValue style={{ color: palette.purple }}>{summary.riskHoldCount}</SummaryValue>
            <SummaryMeta>изискват преглед</SummaryMeta>
          </SummaryCard>
        )}
        <SummaryCard>
          <SummaryLabel>Всички</SummaryLabel>
          <SummaryValue>{data?.total ?? '—'}</SummaryValue>
          <SummaryMeta>спрямо текущия филтър</SummaryMeta>
        </SummaryCard>
      </SummaryRow>

      <Card>
        <FilterRow>
          <SearchWrap>
            <SearchInput
              type="text"
              placeholder="Търсене по име, имейл или телефон…"
              value={searchInput}
              onChange={handleSearchChange}
              onKeyDown={(e) => { if (e.key === 'Enter') triggerSearch(); }}
            />
            <SearchBtn onClick={triggerSearch}>Търси</SearchBtn>
          </SearchWrap>
          <Select value={status} onChange={handleStatusChange}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.payouts ?? []}
          rowKey={(row) => row.id}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="Няма намерени заявки за плащане"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
        />
      </Card>

      {/* Reason modal — used for reject, hold, fail */}
      {modal && (
        <Overlay onClick={closeModal}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{modalCopy[modal.mode].title}</ModalTitle>
            <ModalSubtitle>{modalCopy[modal.mode].subtitle(modal.row)}</ModalSubtitle>
            <ReasonTextarea
              placeholder="Причина (по желание)…"
              value={modal.reason}
              onChange={(e) => setModal((m) => m ? { ...m, reason: e.target.value } : null)}
            />
            <ModalActions>
              <Btn $variant="ghost" onClick={closeModal}>Отказ</Btn>
              <Btn
                $variant={modalCopy[modal.mode].confirmVariant}
                disabled={isMutating}
                onClick={handleModalConfirm}
              >
                {isMutating ? 'Зареждане…' : modalCopy[modal.mode].confirm}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}
    </PageShell>
  );
}
