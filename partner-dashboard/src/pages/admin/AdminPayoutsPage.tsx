import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef, RowAction } from '../../components/admin/DataTable/DataTable';
import { formatEUR } from '../../utils/helpers';
import {
  adminPayoutsService,
  AdminPayout,
  PayoutStatus,
  PayoutsSummary,
  PayoutsFilteredSummary,
  isSubscriptionPayoutEligible,
} from '../../services/adminPayouts.service';
import { adminFinanceService } from '../../services/adminFinance.service';

import { palette } from '../../styles/adminTheme';
/* ─── Palette ─────────────────────────────────────────────────────────────── */

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

const SummaryCard = styled.div<{ $variant?: 'warning' | 'info' | 'danger' | 'neutral' }>`
  background: ${p =>
    p.$variant === 'warning' ? palette.warningSoft :
    p.$variant === 'info'    ? palette.infoSoft :
    p.$variant === 'danger'  ? palette.dangerSoft :
    palette.surface};
  border: 1px solid ${p =>
    p.$variant === 'warning' ? palette.warningBorder :
    p.$variant === 'info'    ? palette.infoBorder :
    p.$variant === 'danger'  ? palette.dangerBorder :
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
  color: ${palette.onAccent};
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

const DateInput = styled.input`
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

const DateLabel = styled.label`
  font-size: 0.8125rem;
  color: ${palette.textSubtle};
  display: flex;
  align-items: center;
  gap: 0.375rem;
`;

const ClearBtn = styled.button`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  background: transparent;
  color: ${palette.textMuted};
  cursor: pointer;
  &:hover { background: ${palette.dangerSoft}; color: ${palette.danger}; border-color: ${palette.dangerBorder}; }
`;

const ExportBtn = styled.button`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  background: ${palette.surface};
  color: ${palette.textMuted};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  &:hover { border-color: ${palette.accent}; color: ${palette.accent}; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const ThresholdTag = styled.span`
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 600;
  border-radius: 0.25rem;
  padding: 0.075rem 0.375rem;
  margin-top: 0.25rem;
  background: ${palette.infoSoft};
  color: ${palette.info};
`;

/* ─── Bulk action bar ──────────────────────────────────────────────────────── */
const BulkBar = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: ${palette.infoSoft};
  border: 1px solid ${palette.infoBorder};
  border-radius: 0.5rem;
  margin-bottom: 1rem;
`;

const BulkBarText = styled.span`
  font-size: 0.875rem;
  color: ${palette.info};
  font-weight: 600;
  flex: 1;
`;

const BulkBtn = styled.button`
  padding: 0.375rem 0.875rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  background: ${palette.info};
  color: ${palette.onAccent};
  border: none;
  &:hover { opacity: 0.88; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
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

const SubGateBadge = styled.span`
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 0.25rem;
  padding: 0.075rem 0.375rem;
  margin-left: 0.375rem;
  vertical-align: middle;
  background: ${palette.dangerSoft};
  color: ${palette.danger};
`;

const PlanBadge = styled.span<{ $plan: string }>`
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 0.25rem;
  padding: 0.075rem 0.375rem;
  margin-left: 0.375rem;
  vertical-align: middle;
  ${({ $plan }) => {
    switch ($plan) {
      case 'PREMIUM': return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      case 'BASIC':   return `background: ${palette.infoSoft}; color: ${palette.info};`;
      default:        return `background: ${palette.surfaceAlt}; color: ${palette.textMuted};`;
    }
  }}
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
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'CANCELLED':
        return `background: ${palette.surfaceAlt}; color: ${palette.text};`;
      case 'RISK_HOLD':
        return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      case 'ANNULLED':
      default:
        return `background: ${palette.surfaceAlt}; color: ${palette.textMuted};`;
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
// WITHDRAWAL rows never enter TRIAL_PENDING (that status is reserved for
// CASHBACK_CREDIT held during the 24h trial refund window — see
// backend wallet.service.ts). It is therefore intentionally absent here.
const ALLOWED_STATUSES: PayoutStatus[] = [
  'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED',
  'ANNULLED', 'RISK_HOLD',
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
];

// TRIAL_PENDING kept in the type signature only — WITHDRAWAL rows never have
// that status, but the shared PayoutStatus union does. The fallback at the
// call site (`STATUS_LABELS[row.status] ?? row.status`) handles it defensively.
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

const PLAN_LABELS: Record<string, string> = {
  LIGHT:   'Premium Weekly',
  BASIC:   'Basic',
  PREMIUM: 'Premium',
};

// §6.1 v1.1 — human labels for subscription statuses that block payout
const SUB_STATUS_LABELS: Record<string, string> = {
  PAST_DUE:           'Неуспешно плащане',
  UNPAID:             'Неплатен',
  CANCELLED:          'Отказан',
  EXPIRED:            'Изтекъл',
  PAUSED:             'На пауза',
  INCOMPLETE:         'Незавършен',
  INCOMPLETE_EXPIRED: 'Незавършен/изтекъл',
};

// Bug 2 fix: subtitle is context-aware based on the active status filter
function subtitleForStatus(status: PayoutStatus | ''): string {
  switch (status) {
    case 'PENDING':       return 'Чакащи заявки за одобрение';
    case 'PROCESSING':    return 'Заявки в процес на банков превод (до 5 раб. дни)';
    case 'COMPLETED':     return 'Изплатени суми към абонати';
    case 'FAILED':        return 'Неуспешни или отхвърлени заявки';
    case 'CANCELLED':     return 'Отменени заявки';
    case 'ANNULLED':      return 'Анулирани заявки';
    case 'RISK_HOLD':     return 'Задържани заявки за риск-проверка';
    default:              return 'Всички заявки за изтегляне на средства';
  }
}

// Returns null when processingStartedAt is absent — SLA tag is hidden for legacy records
// rather than showing an inflated count from the original request timestamp.
function workingDaysSince(metadataJson?: string | null): number | null {
  if (!metadataJson) return null;
  try {
    const meta = JSON.parse(metadataJson) as Record<string, unknown>;
    if (typeof meta.processingStartedAt !== 'string') return null;
    const start = new Date(meta.processingStartedAt);
    const now   = new Date();
    let days    = 0;
    const cur   = new Date(start);
    while (cur < now) {
      cur.setDate(cur.getDate() + 1);
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) days++;
    }
    return days;
  } catch {
    return null;
  }
}

function completedAtFromMeta(metadataJson?: string | null): string | null {
  if (!metadataJson) return null;
  try {
    const meta = JSON.parse(metadataJson) as Record<string, unknown>;
    return typeof meta.completedAt === 'string' ? meta.completedAt : null;
  } catch {
    return null;
  }
}

function displayName(row: AdminPayout): string {
  const { firstName, lastName } = row.wallet.user;
  return [firstName, lastName].filter(Boolean).join(' ') || '—';
}

/* ─── Component ───────────────────────────────────────────────────────────── */
type ModalMode = 'reject' | 'hold' | 'fail' | 'bulkApprove';

interface ModalState {
  mode: ModalMode;
  row?: AdminPayout;
  reason: string;
  bulkCount?: number;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const EMPTY_SUMMARY: PayoutsSummary = {
  pendingCount: 0, pendingTotal: 0,
  processingCount: 0, processingTotal: 0,
  completedCount: 0, completedTotal: 0,
  riskHoldCount: 0,
  failedCount: 0, failedTotal: 0,
  totalCount: 0,
};

const EMPTY_FILTERED_SUMMARY: PayoutsFilteredSummary = {
  pendingCount: 0, pendingTotal: 0,
  processingCount: 0, processingTotal: 0,
  completedCount: 0, completedTotal: 0,
  riskHoldCount: 0,
  failedCount: 0, failedTotal: 0,
  cancelledCount: 0,
  totalCount: 0,
};

export default function AdminPayoutsPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusFromUrl = (): PayoutStatus | '' => {
    const raw = searchParams.get('status') as PayoutStatus | null;
    return raw && ALLOWED_STATUSES.includes(raw) ? raw : '';
  };

  const searchFromUrl = () => searchParams.get('search') ?? '';

  const [page, setPage]               = useState(1);
  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const [search, setSearch]           = useState(searchFromUrl);
  const [status, setStatus]           = useState<PayoutStatus | ''>(statusFromUrl());
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [modal, setModal]             = useState<ModalState | null>(null);
  const [exporting, setExporting]     = useState(false);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');

  const { data: thresholdsData } = useQuery({
    queryKey: ['payout-thresholds'],
    queryFn: adminFinanceService.getPayoutThresholds,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const nextStatus = statusFromUrl();
    if (nextStatus !== status) { setStatus(nextStatus); setPage(1); }
    const nextSearch = searchFromUrl();
    if (nextSearch !== search) { setSearchInput(nextSearch); setSearch(nextSearch); setPage(1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payouts', page, search, status, dateFrom, dateTo],
    queryFn: () =>
      adminPayoutsService.list({
        page, limit: PAGE_SIZE,
        search: search || undefined,
        status,
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
      }),
  });

  const summary: PayoutsSummary = data?.summary ?? EMPTY_SUMMARY;
  const filteredSummary = data?.filteredSummary ?? EMPTY_FILTERED_SUMMARY;

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

  const resetStuckMutation = useMutation({
    mutationFn: (id: string) => adminPayoutsService.resetStuck(id),
    onSuccess: () => { toast.success('Плащането е върнато в опашката за одобрение'); queryClient.invalidateQueries({ queryKey: ['admin-payouts'] }); },
    onError: (err: unknown) => toast.error((err as any)?.response?.data?.message || 'Грешка при възстановяване'),
  });

  /* ── bulk approve (system-wide — all pages) ── */
  const handleBulkApprove = async () => {
    // Show confirmation using the global pending count, not just the current page
    setModal({ mode: 'bulkApprove', reason: '', bulkCount: summary.pendingCount });
  };

  const executeBulkApprove = async () => {
    closeModal();
    try {
      const result = await adminPayoutsService.bulkApprove();
      const extras: string[] = [];
      if (result.alreadyProcessed > 0) extras.push(`${result.alreadyProcessed} вече обработени`);
      if (result.failed > 0)           extras.push(`${result.failed} неуспешни`);
      const suffix = extras.length ? ` (${extras.join(', ')})` : '';
      toast.success(`${result.approved} от ${result.total} плащания одобрени${suffix}`);
    } catch {
      toast.error('Грешка при масово одобрение');
    }
    queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
  };

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

  const hasDateFilter = dateFrom !== '' || dateTo !== '';
  const hasAnyFilter  = search !== '' || status !== '' || hasDateFilter;
  // Use filter-aware counts when search or date is active; global summary otherwise
  const displaySummary = (search !== '' || hasDateFilter) ? filteredSummary : summary;

  const clearFilters = () => {
    setSearchInput(''); setSearch('');
    setStatus('');
    setDateFrom(''); setDateTo('');
    setPage(1);
  };

  /* ── modal ── */
  const closeModal = () => setModal(null);

  const handleModalConfirm = () => {
    if (!modal) return;
    const { mode, row, reason } = modal;
    if (mode === 'reject' && row) rejectMutation.mutate({ id: row.id, reason });
    if (mode === 'hold'   && row) holdMutation.mutate({ id: row.id, reason });
    if (mode === 'fail'   && row) failMutation.mutate({ id: row.id, reason });
    if (mode === 'bulkApprove') executeBulkApprove();
  };

  const isMutating = rejectMutation.isPending || holdMutation.isPending || failMutation.isPending;
  const isReasonModal = (mode: ModalMode): mode is 'reject' | 'hold' | 'fail' =>
    mode === 'reject' || mode === 'hold' || mode === 'fail';

  /* ── formatters ── */
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      hour: '2-digit', minute: '2-digit',
    });

  // BC-QA-031: admin money endpoints emit plain EUR scalars. The retired
  // `formatMoneyByMode(_, 'eur_only')` divided its input by BGN_TO_EUR_RATE,
  // halving already-converted figures.
  //
  // The summary-card totals below used to go through a separate
  // `fmtBgn = (n) => \`${n.toFixed(2)} BGN\`` helper. adminPayouts.routes.ts
  // now runs pendingTotal/processingTotal/completedTotal/failedTotal through
  // bgnToEur() before responding, so that helper labelled EUR figures as Lev —
  // an admin reading the payout queue saw roughly half the real obligation.
  // There is deliberately only ONE money formatter on this page now: a second
  // one is exactly how the mislabel survived the previous fix pass.
  const fmtAmount = (amount: number) => formatEUR(amount);

  const thresholds = thresholdsData?.data ?? {};

  const handleExport = async () => {
    setExporting(true);
    try {
      await adminPayoutsService.exportPayouts({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        status: status || undefined,
        format: exportFormat,
      });
    } catch {
      toast.error('Грешка при експорт');
    } finally {
      setExporting(false);
    }
  };

  /* ── columns ── */
  const columns: ColumnDef<AdminPayout>[] = [
    {
      key: 'user',
      header: 'Абонат',
      render: (row) => {
        const latestSub = row.wallet.user.subscriptions?.[0];
        const eligible  = isSubscriptionPayoutEligible(latestSub);
        const threshold = eligible && latestSub ? thresholds[latestSub.plan] : undefined;
        return (
          <UserCell>
            {displayName(row)}
            {eligible && latestSub && (
              <PlanBadge $plan={latestSub.plan}>
                {PLAN_LABELS[latestSub.plan] ?? latestSub.plan}
              </PlanBadge>
            )}
            {!eligible && (
              <SubGateBadge title="Payout се задържа до възстановяване на абонамента (§6.1)">
                {latestSub
                  ? `Абонамент: ${SUB_STATUS_LABELS[latestSub.status] ?? latestSub.status}`
                  : 'Няма абонамент'}
              </SubGateBadge>
            )}
            <MetaLine>{row.wallet.user.email}</MetaLine>
            {row.wallet.user.phone && <MetaLine>{row.wallet.user.phone}</MetaLine>}
            {threshold !== undefined && (
              <ThresholdTag title="Минимален праг за изплащане">
                Мин. праг: {fmtAmount(threshold)}
              </ThresholdTag>
            )}
          </UserCell>
        );
      },
    },
    {
      key: 'amount',
      header: 'Сума',
      render: (row) => (
        <AmountCell>
          {fmtAmount(Math.abs(row.amount))}
          <MetaLine>
            Баланс: {fmtAmount(Math.abs(row.balanceBefore))} → {fmtAmount(Math.abs(row.balanceAfter))}
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
            const days = workingDaysSince(row.metadata);
            if (days === null) return null;
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
    {
      key: 'completedAt',
      header: 'Платено на',
      render: (row) => {
        const completedAt = completedAtFromMeta(row.metadata);
        return (
          <span style={{ color: completedAt ? palette.success : palette.textSubtle, fontSize: '0.8125rem' }}>
            {completedAt ? fmt(completedAt) : '—'}
          </span>
        );
      },
    },
  ];

  /* ── row actions ── */
  const rowActions: RowAction<AdminPayout>[] = [
    {
      label: 'Одобри',
      hidden: (row) => row.status !== 'PENDING',
      disabled: (row) =>
        !row.wallet.payoutIban ||
        !isSubscriptionPayoutEligible(row.wallet.user.subscriptions?.[0]),
      disabledTitle: (row) =>
        !row.wallet.payoutIban
          ? 'Абонатът няма регистриран IBAN'
          : 'Абонаментът не е активен — payout се задържа до възстановяване (§6.1)',
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
      // Crash-recovery — visible only when PROCESSING with no Paysera transfer
      // ever initiated (rare; happens if the API process crashed between the
      // PENDING→PROCESSING transition and Paysera createTransfer).
      label: 'Възстанови (без превод)',
      hidden: (row) => {
        if (row.status !== 'PROCESSING') return true;
        try {
          const meta = row.metadata ? JSON.parse(row.metadata) : {};
          // Hide when a Paysera transfer was created (use /fail to reverse)
          // or when the row is parked by the no-Paysera-configured path
          // (use /complete or /fail).
          if (Boolean(meta.payseraTransferId) || meta.manualHold === true) return true;
          // Mirror backend WITHIN_GRACE_PERIOD guard: hide within the 2-minute
          // window where an in-flight executePayoutTransfer may still be running.
          if (meta.processingStartedAt) {
            const startedAt = new Date(meta.processingStartedAt).getTime();
            if (Number.isFinite(startedAt) && Date.now() - startedAt < 2 * 60 * 1000) return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      onClick: (row) => resetStuckMutation.mutate(row.id),
    },
    {
      label: 'Отхвърли',
      danger: true,
      hidden: (row) => row.status !== 'PENDING' && row.status !== 'RISK_HOLD',
      onClick: (row) => setModal({ mode: 'reject', row, reason: '' }),
    },
  ];

  /* ── modal copy ── */
  const modalCopy: Record<'reject' | 'hold' | 'fail', { title: string; subtitle: (row: AdminPayout) => string; confirm: string; confirmVariant: 'danger' | 'warning' }> = {
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

  /* ── bulk approve availability — driven by global pending count ── */
  const showBulkBar = (status === '' || status === 'PENDING') && summary.pendingCount > 1;

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Финанси</Eyebrow>
          <PageTitle>Плащания към абонати</PageTitle>
          {/* Bug 2 fix: subtitle reflects the active filter */}
          <PageSubtitle>{subtitleForStatus(status)}</PageSubtitle>
        </TitleBlock>
        <div style={{ display: 'flex', gap: 0 }}>
          <ExportBtn
            style={{ borderRadius: '0.5rem 0 0 0.5rem', borderRight: 'none', background: exportFormat === 'xlsx' ? palette.accent : undefined, color: exportFormat === 'xlsx' ? '#fff' : undefined, borderColor: exportFormat === 'xlsx' ? palette.accent : undefined }}
            onClick={() => setExportFormat('xlsx')}
            disabled={exporting}
          >XLSX</ExportBtn>
          <ExportBtn
            style={{ borderRadius: '0 0.5rem 0.5rem 0', background: exportFormat === 'csv' ? palette.accent : undefined, color: exportFormat === 'csv' ? '#fff' : undefined, borderColor: exportFormat === 'csv' ? palette.accent : undefined }}
            onClick={() => setExportFormat('csv')}
            disabled={exporting}
          >CSV</ExportBtn>
        </div>
        <ExportBtn onClick={handleExport} disabled={exporting}>
          {exporting ? 'Експортиране…' : '↓ Експорт'}
        </ExportBtn>
      </PageHeader>

      {/* Summary banner — filter-aware when search/date filters active */}
      <SummaryRow>
        <SummaryCard $variant="warning">
          <SummaryLabel>Чакащи</SummaryLabel>
          <SummaryValue>{displaySummary.pendingCount}</SummaryValue>
          <SummaryMeta>{fmtAmount(displaySummary.pendingTotal)} общо</SummaryMeta>
        </SummaryCard>

        <SummaryCard $variant="info">
          <SummaryLabel>В обработка</SummaryLabel>
          <SummaryValue>{displaySummary.processingCount}</SummaryValue>
          <SummaryMeta>{fmtAmount(displaySummary.processingTotal)} общо</SummaryMeta>
        </SummaryCard>

        <SummaryCard style={{ background: palette.purpleSoft, border: `1px solid ${palette.purpleBorder}` }}>
          <SummaryLabel style={{ color: palette.purple }}>Задържани (риск)</SummaryLabel>
          <SummaryValue style={{ color: palette.purple }}>{displaySummary.riskHoldCount}</SummaryValue>
          <SummaryMeta>изискват преглед</SummaryMeta>
        </SummaryCard>

        <SummaryCard $variant="neutral">
          <SummaryLabel style={{ color: palette.success }}>Платено</SummaryLabel>
          <SummaryValue style={{ color: palette.success }}>{displaySummary.completedCount}</SummaryValue>
          <SummaryMeta>{fmtAmount(displaySummary.completedTotal)} изплатено</SummaryMeta>
        </SummaryCard>

        <SummaryCard $variant="danger">
          <SummaryLabel style={{ color: palette.danger }}>Неуспешни</SummaryLabel>
          <SummaryValue style={{ color: palette.danger }}>{displaySummary.failedCount}</SummaryValue>
          <SummaryMeta>{fmtAmount(displaySummary.failedTotal)} общо</SummaryMeta>
        </SummaryCard>

        <SummaryCard>
          <SummaryLabel>Всички</SummaryLabel>
          <SummaryValue>{displaySummary.totalCount}</SummaryValue>
          <SummaryMeta>
            {(search !== '' || hasDateFilter) ? 'в текущия филтър' : 'заявки в системата'}
          </SummaryMeta>
        </SummaryCard>
      </SummaryRow>

      <Card>
        {/* Gap 5 fix: date range filter row */}
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

          <DateLabel>
            От
            <DateInput
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            />
          </DateLabel>

          <DateLabel>
            До
            <DateInput
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            />
          </DateLabel>

          {hasAnyFilter && (
            <ClearBtn onClick={clearFilters}>Изчисти филтри</ClearBtn>
          )}
        </FilterRow>

        {/* Gap 6 fix: bulk approve bar */}
        {showBulkBar && (
          <BulkBar>
            <BulkBarText>
              {summary.pendingCount} чакащи заявки в системата
            </BulkBarText>
            <BulkBtn onClick={handleBulkApprove}>
              Одобри всички с IBAN
            </BulkBtn>
          </BulkBar>
        )}

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
      {modal && isReasonModal(modal.mode) && modal.row && (
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

      {/* Bulk approve confirmation modal */}
      {modal?.mode === 'bulkApprove' && (
        <Overlay onClick={closeModal}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Масово одобрение</ModalTitle>
            <ModalSubtitle>
              Ще бъдат одобрени всички чакащи заявки с регистриран IBAN (от общо {modal.bulkCount} чакащи в системата).
              Заявките без IBAN се пропускат. Одобрените преминават в статус „Обработва се" и абонатът получава имейл.
            </ModalSubtitle>
            <ModalActions>
              <Btn $variant="ghost" onClick={closeModal}>Отказ</Btn>
              <Btn onClick={handleModalConfirm}>
                Одобри {modal.bulkCount}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}
    </PageShell>
  );
}
