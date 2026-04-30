import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminTransactionsService,
  AdminTransaction,
  BusinessTransaction,
  WalletTransactionType,
  WalletTransactionStatus,
} from '../../services/adminTransactions.service';
import {
  adminSubscribersService,
  AdminSubscriber,
} from '../../services/adminSubscribers.service';

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
  teal: '#0f766e',
  tealSoft: '#ccfbf1',
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
  margin-bottom: 2rem;
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

const TotalBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${palette.infoSoft};
  color: ${palette.info};
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 9999px;
  padding: 0.125rem 0.6rem;
  margin-left: 0.5rem;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
`;

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;

/* ─── Stats bar ────────────────────────────────────────────────────────────── */
const StatsBar = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const StatCard = styled.div<{ $accent?: string; $bg?: string }>`
  background: ${({ $bg }) => $bg ?? palette.bg};
  border: 1px solid ${palette.border};
  border-radius: 0.625rem;
  padding: 1rem 1.25rem;
`;

const StatLabel = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  margin: 0 0 0.375rem;
`;

const StatValue = styled.p<{ $color?: string }>`
  font-size: 1.375rem;
  font-weight: 800;
  color: ${({ $color }) => $color ?? palette.text};
  font-variant-numeric: tabular-nums;
  margin: 0;
`;

/* ─── Filters ──────────────────────────────────────────────────────────────── */
const FilterRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  max-width: 20rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }

  &::placeholder { color: ${palette.textSubtle}; }
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

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
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

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 100ms;

  ${({ $variant = 'ghost' }) =>
    $variant === 'primary'
      ? `background: ${palette.accent}; color: #fff; border-color: ${palette.accent};
         &:hover { background: #b55a3b; }`
      : `background: ${palette.surface}; color: ${palette.textMuted}; border-color: ${palette.border};
         &:hover { background: ${palette.bg}; color: ${palette.text}; }`}
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

const AmountCell = styled.div<{ $negative?: boolean }>`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.9375rem;
  color: ${({ $negative }) => ($negative ? palette.danger : palette.success)};
`;

const TypeBadge = styled.span<{ $type: WalletTransactionType }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;

  ${({ $type }) => {
    switch ($type) {
      case 'TOP_UP': return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'WITHDRAWAL': return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'CASHBACK_CREDIT': return `background: ${palette.tealSoft}; color: ${palette.teal};`;
      case 'PURCHASE': return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'REFUND': return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      default: return `background: #f3f4f6; color: #374151;`;
    }
  }}
`;

const StatusBadge = styled.span<{ $status: WalletTransactionStatus }>`
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
      case 'TRIAL_PENDING': return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'PROCESSING': return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'COMPLETED': return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'FAILED':
      case 'CANCELLED': return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      default: return `background: #f3f4f6; color: #6b7280;`;
    }
  }}
`;

/* ─── Adjustment Modal ─────────────────────────────────────────────────────── */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Modal = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.875rem;
  padding: 1.75rem;
  width: 100%;
  max-width: 32rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
`;

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 1.25rem;
`;

const ModalField = styled.div`
  margin-bottom: 1rem;
`;

const ModalLabel = styled.label`
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.textMuted};
  margin-bottom: 0.375rem;
`;

const ModalInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const ModalTextarea = styled.textarea`
  width: 100%;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  resize: vertical;
  min-height: 4rem;
  box-sizing: border-box;
  font-family: inherit;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
`;

const UserResultList = styled.ul`
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  background: ${palette.surface};
  max-height: 12rem;
  overflow-y: auto;
`;

const UserResultItem = styled.li<{ $active?: boolean }>`
  padding: 0.5rem 0.875rem;
  cursor: pointer;
  font-size: 0.875rem;
  background: ${({ $active }) => ($active ? palette.accentSoft : 'transparent')};

  &:hover { background: ${palette.bg}; }
`;

const HintText = styled.p`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin: 0.25rem 0 0;
`;

/* ─── CSV helper ────────────────────────────────────────────────────────────── */
function downloadCSV(rows: AdminTransaction[], locale: string) {
  const headers = ['ID', 'User email', 'Type', 'Amount', 'Currency', 'Balance before', 'Balance after', 'Status', 'Note', 'Date'];
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.id,
        r.wallet.user.email,
        r.type,
        r.amount.toFixed(2),
        r.currency,
        r.balanceBefore.toFixed(2),
        r.balanceAfter.toFixed(2),
        r.status,
        r.description ?? '',
        fmt(r.createdAt),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Options ──────────────────────────────────────────────────────────────── */
const TYPE_OPTIONS: Array<{ value: WalletTransactionType | ''; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'TOP_UP', label: 'Top-up' },
  { value: 'WITHDRAWAL', label: 'Withdrawal' },
  { value: 'CASHBACK_CREDIT', label: 'Cashback credit' },
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'REFUND', label: 'Refund' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
];

const STATUS_OPTIONS: Array<{ value: WalletTransactionStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'TRIAL_PENDING', label: 'Trial pending' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'ANNULLED', label: 'Annulled' },
];

// Business view uses Prisma TransactionStatus enum (no TRIAL_PENDING / ANNULLED + adds REFUNDED)
const BUSINESS_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
];

const NEGATIVE_TYPES: WalletTransactionType[] = ['WITHDRAWAL', 'PURCHASE'];
const PAGE_SIZE = 20;

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function AdminTransactionsPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const locale = language === 'bg' ? 'bg-BG' : 'en-GB';

  // Allow deep-links from the alerts page to preselect view + wallet status.
  const [searchParams] = useSearchParams();
  const initialView: 'business' | 'wallet' =
    searchParams.get('view') === 'wallet' ? 'wallet' : 'business';
  const VALID_WALLET_STATUSES: WalletTransactionStatus[] = [
    'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED',
    'CANCELLED', 'TRIAL_PENDING', 'ANNULLED',
  ];
  const initialStatusParam = searchParams.get('status');
  const initialStatus: WalletTransactionStatus | '' =
    initialStatusParam &&
    VALID_WALLET_STATUSES.includes(initialStatusParam as WalletTransactionStatus)
      ? (initialStatusParam as WalletTransactionStatus)
      : '';

  /* ── View toggle (spec §4.3 default = Business / receipt-based) ── */
  const [view, setView] = useState<'business' | 'wallet'>(initialView);

  /* ── Filters ── */
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<WalletTransactionType | ''>('');
  const [status, setStatus] = useState<WalletTransactionStatus | ''>(initialStatus);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  /* ── Adjustment modal state ── */
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjSearch, setAdjSearch] = useState('');
  const [adjUser, setAdjUser] = useState<AdminSubscriber | null>(null);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const filterParams = { search: search || undefined, type: type || undefined, status: status || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };

  /* ── Data ── */
  const { data, isLoading } = useQuery({
    queryKey: ['admin-transactions', page, search, type, status, dateFrom, dateTo],
    queryFn: () =>
      adminTransactionsService.list({ page, limit: PAGE_SIZE, ...filterParams }),
    enabled: view === 'wallet',
  });

  // Business / receipt-based transactions (Spec §4.3 — Партньор / Локация / Кешбек / Марджин / Risk score)
  const { data: businessData, isLoading: isBusinessLoading } = useQuery({
    queryKey: ['admin-transactions-business', page, search, status, dateFrom, dateTo],
    queryFn: () =>
      adminTransactionsService.listBusiness({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    enabled: view === 'business',
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-transactions-stats', search, type, status, dateFrom, dateTo],
    queryFn: () => adminTransactionsService.getStats(filterParams),
    enabled: view === 'wallet',
  });

  const { data: adjSearchData } = useQuery({
    queryKey: ['adj-user-search', adjSearch],
    queryFn: () => adminSubscribersService.list({ search: adjSearch, limit: 5, page: 1 }),
    enabled: adjSearch.length >= 2,
  });

  const closeAdjustModal = () => {
    setShowAdjust(false);
    setAdjUser(null);
    setAdjSearch('');
    setAdjAmount('');
    setAdjReason('');
  };

  useEffect(() => {
    if (!showAdjust) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAdjustModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showAdjust]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Mutations ── */
  const adjustMutation = useMutation({
    mutationFn: adminTransactionsService.adjust,
    onSuccess: () => {
      toast.success('Adjustment created');
      queryClient.invalidateQueries({ queryKey: ['admin-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-transactions-stats'] });
      closeAdjustModal();
    },
    onError: () => toast.error('Failed to create adjustment'),
  });

  /* ── Handlers ── */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
  };

  const handleAdjustSubmit = () => {
    if (!adjUser) return;
    const amount = parseFloat(adjAmount);
    if (!amount || amount === 0) { toast.error('Enter a non-zero amount'); return; }
    if (!adjReason.trim()) { toast.error('Reason is required'); return; }
    adjustMutation.mutate({ userId: adjUser.id, amount, reason: adjReason });
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  /* ── Columns ── */
  const columns: ColumnDef<AdminTransaction>[] = [
    {
      key: 'user',
      header: 'Subscriber',
      render: (row) => (
        <UserCell>
          {row.wallet.user.firstName || row.wallet.user.lastName
            ? `${row.wallet.user.firstName ?? ''} ${row.wallet.user.lastName ?? ''}`.trim()
            : '—'}
          <MetaLine>{row.wallet.user.email}</MetaLine>
          {row.wallet.user.phone && <MetaLine>{row.wallet.user.phone}</MetaLine>}
        </UserCell>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <TypeBadge $type={row.type}>{row.type.replace(/_/g, ' ')}</TypeBadge>,
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => {
        const isNeg = NEGATIVE_TYPES.includes(row.type) || (row.type === 'ADJUSTMENT' && row.amount < 0);
        return (
          <AmountCell $negative={isNeg}>
            {isNeg ? '−' : '+'}{Math.abs(row.amount).toFixed(2)} {row.currency}
            <MetaLine>{row.balanceBefore.toFixed(2)} → {row.balanceAfter.toFixed(2)}</MetaLine>
          </AmountCell>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge $status={row.status}>{row.status.replace(/_/g, ' ')}</StatusBadge>,
    },
    {
      key: 'description',
      header: 'Note',
      render: (row) =>
        row.description ? (
          <span style={{ fontSize: '0.8125rem', color: palette.textSubtle }}>{row.description}</span>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmt(row.createdAt)}
          <MetaLine>{fmtTime(row.createdAt)}</MetaLine>
        </span>
      ),
    },
  ];

  /* ── Business / receipt-based columns (Spec §4.3) ── */
  const businessColumns: ColumnDef<BusinessTransaction>[] = [
    {
      key: 'id',
      header: 'Tx ID',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: palette.textMuted }}>
          {row.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: 'subscriber',
      header: 'Subscriber',
      render: (row) => (
        <UserCell>
          {row.user.firstName || row.user.lastName
            ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim()
            : '—'}
          <MetaLine>{row.user.email}</MetaLine>
        </UserCell>
      ),
    },
    {
      key: 'partner',
      header: 'Partner / Location',
      render: (row) => (
        <UserCell>
          {row.partner?.businessName ?? '—'}
          <MetaLine>{row.venue?.name ?? 'No venue'}</MetaLine>
        </UserCell>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <AmountCell $negative={false}>
          {row.amount.toFixed(2)} {row.currency}
        </AmountCell>
      ),
    },
    {
      key: 'cashback',
      header: 'Cashback',
      render: (row) => (
        <span style={{ color: palette.teal, fontWeight: 600 }}>
          {row.cashbackAmount != null ? `${row.cashbackAmount.toFixed(2)} ${row.currency}` : '—'}
        </span>
      ),
    },
    {
      key: 'margin',
      header: 'Margin',
      render: (row) => (
        <span style={{ color: row.margin > 0 ? palette.success : palette.textSubtle, fontWeight: 600 }}>
          {row.margin.toFixed(2)} {row.currency}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge $status={row.status as WalletTransactionStatus}>
          {row.status.replace(/_/g, ' ')}
        </StatusBadge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmt(row.createdAt)}
          <MetaLine>{fmtTime(row.createdAt)}</MetaLine>
        </span>
      ),
    },
  ];

  const adjUserName = adjUser
    ? `${adjUser.firstName ?? ''} ${adjUser.lastName ?? ''}`.trim() || adjUser.email
    : '';

  return (
    <PageShell>
      {/* Adjustment modal */}
      {showAdjust && (
        <Overlay onClick={closeAdjustModal}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Manual wallet adjustment</ModalTitle>

            <ModalField>
              <ModalLabel>User</ModalLabel>
              {adjUser ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', color: palette.text, fontWeight: 600 }}>
                    {adjUserName}
                  </span>
                  <button
                    onClick={() => { setAdjUser(null); setAdjSearch(''); }}
                    style={{ fontSize: '0.75rem', color: palette.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <ModalInput
                    type="text"
                    placeholder="Search by name or email…"
                    value={adjSearch}
                    onChange={(e) => setAdjSearch(e.target.value)}
                    autoFocus
                  />
                  {adjSearch.length >= 2 && adjSearchData && adjSearchData.subscribers.length > 0 && (
                    <UserResultList>
                      {adjSearchData.subscribers.map((sub) => (
                        <UserResultItem
                          key={sub.id}
                          onClick={() => { setAdjUser(sub); setAdjSearch(''); }}
                        >
                          <strong>
                            {`${sub.firstName ?? ''} ${sub.lastName ?? ''}`.trim() || sub.email}
                          </strong>
                          <span style={{ color: palette.textSubtle, marginLeft: '0.375rem', fontSize: '0.8125rem' }}>
                            {sub.email}
                          </span>
                        </UserResultItem>
                      ))}
                    </UserResultList>
                  )}
                  {adjSearch.length >= 2 && adjSearchData?.subscribers.length === 0 && (
                    <HintText>No subscribers found</HintText>
                  )}
                  {adjSearch.length < 2 && (
                    <HintText>Type at least 2 characters to search</HintText>
                  )}
                </>
              )}
            </ModalField>

            <ModalField>
              <ModalLabel>Amount (positive to credit, negative to debit)</ModalLabel>
              <ModalInput
                type="number"
                step="0.01"
                placeholder="e.g. 5.00 or -2.50"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
              />
            </ModalField>

            <ModalField>
              <ModalLabel>Reason</ModalLabel>
              <ModalTextarea
                placeholder="Describe the reason for this adjustment…"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
              />
            </ModalField>

            <ModalActions>
              <Btn onClick={closeAdjustModal}>Cancel</Btn>
              <Btn
                $variant="primary"
                onClick={handleAdjustSubmit}
                disabled={adjustMutation.isPending || !adjUser || !adjAmount || !adjReason}
              >
                {adjustMutation.isPending ? 'Saving…' : 'Create adjustment'}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      <PageHeader>
        <TitleBlock>
          <Eyebrow>Subscribers</Eyebrow>
          <PageTitle>
            {view === 'business' ? 'Transactions' : 'Wallet Transactions'}
            {view === 'wallet' && data && data.total > 0 && <TotalBadge>{data.total.toLocaleString()}</TotalBadge>}
            {view === 'business' && businessData && businessData.total > 0 && <TotalBadge>{businessData.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>
            {view === 'business'
              ? 'Receipt-based transactions: partner, location, cashback, margin, risk score (spec §4.3)'
              : 'Full audit log of all wallet activity across subscribers'}
          </PageSubtitle>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <ViewTab
              $active={view === 'business'}
              onClick={() => { setView('business'); setPage(1); setType(''); setStatus(''); }}
            >
              Business
            </ViewTab>
            <ViewTab
              $active={view === 'wallet'}
              onClick={() => { setView('wallet'); setPage(1); setStatus(''); }}
            >
              Wallet ledger
            </ViewTab>
          </div>
        </TitleBlock>
        <HeaderActions>
          {view === 'wallet' && (
            <>
              <Btn
                onClick={() => data?.transactions.length && downloadCSV(data.transactions, locale)}
                disabled={!data?.transactions.length}
              >
                ↓ Export CSV
              </Btn>
              <Btn $variant="primary" onClick={() => setShowAdjust(true)}>
                + Adjust wallet
              </Btn>
            </>
          )}
        </HeaderActions>
      </PageHeader>

      {/* Stats bar — wallet ledger only (stats endpoint is wallet-aggregated) */}
      {view === 'wallet' && (
        <StatsBar>
          <StatCard>
            <StatLabel>Total volume</StatLabel>
            <StatValue>{stats ? `${stats.totalVolume.toFixed(2)} BGN` : '—'}</StatValue>
          </StatCard>
          <StatCard $bg={palette.tealSoft}>
            <StatLabel>Cashback credited</StatLabel>
            <StatValue $color={palette.teal}>
              {stats ? `${stats.totalCashback.toFixed(2)} BGN` : '—'}
            </StatValue>
          </StatCard>
          <StatCard $bg={palette.warningSoft}>
            <StatLabel>Withdrawals</StatLabel>
            <StatValue $color={palette.warning}>
              {stats ? `${stats.totalWithdrawals.toFixed(2)} BGN` : '—'}
            </StatValue>
          </StatCard>
        </StatsBar>
      )}

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search by name, email or phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {view === 'wallet' && (
            <Select value={type} onChange={(e) => { setType(e.target.value as WalletTransactionType | ''); setPage(1); }}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
          <Select value={status} onChange={(e) => { setStatus(e.target.value as WalletTransactionStatus | ''); setPage(1); }}>
            {(view === 'business' ? BUSINESS_STATUS_OPTIONS : STATUS_OPTIONS).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <DateInput
            type="date"
            value={dateFrom}
            title="Created from"
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
          <DateInput
            type="date"
            value={dateTo}
            title="Created to"
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </FilterRow>

        {view === 'business' ? (
          <DataTable
            columns={businessColumns}
            data={businessData?.transactions ?? []}
            rowKey={(row) => row.id}
            loading={isBusinessLoading}
            emptyMessage="No business transactions found"
            page={page}
            pageSize={PAGE_SIZE}
            totalItems={businessData?.total}
            onPageChange={setPage}
          />
        ) : (
          <DataTable
            columns={columns}
            data={data?.transactions ?? []}
            rowKey={(row) => row.id}
            loading={isLoading}
            emptyMessage="No wallet transactions found"
            page={page}
            pageSize={PAGE_SIZE}
            totalItems={data?.total}
            onPageChange={setPage}
          />
        )}
      </Card>
    </PageShell>
  );
}

const ViewTab = styled.button<{ $active: boolean }>`
  background: ${(p) => p.$active ? palette.accent : 'transparent'};
  color: ${(p) => p.$active ? '#fff' : palette.textMuted};
  border: 1px solid ${(p) => p.$active ? palette.accent : palette.border};
  padding: 0.375rem 0.875rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { color: ${(p) => p.$active ? '#fff' : palette.text}; }
`;
