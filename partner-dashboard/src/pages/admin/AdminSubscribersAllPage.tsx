import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef, RowAction } from '../../components/admin/DataTable/DataTable';
import {
  adminSubscribersService,
  AdminSubscriber,
  AdminSubscriberDetail,
  SubscriptionPlan,
  SubscriptionStatus,
  UserAccountStatus,
  AccountStatusFilter,
  RiskLevelFilter,
} from '../../services/adminSubscribers.service';
import { adminTransactionsService, AdminTransaction } from '../../services/adminTransactions.service';

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

  &::placeholder {
    color: ${palette.textSubtle};
  }
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

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' | 'danger' }>`
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

  ${({ $variant = 'ghost' }) => {
    if ($variant === 'primary')
      return `background: ${palette.accent}; color: #fff; border-color: ${palette.accent};
        &:hover { background: #b55a3b; }`;
    if ($variant === 'danger')
      return `background: ${palette.dangerSoft}; color: ${palette.danger}; border-color: ${palette.danger};
        &:hover { background: #ebb8a8; }`;
    return `background: ${palette.surface}; color: ${palette.textMuted}; border-color: ${palette.border};
      &:hover { background: ${palette.bg}; color: ${palette.text}; }`;
  }}
`;

/* ─── Cell helpers ─────────────────────────────────────────────────────────── */
const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const PlanBadge = styled.span<{ $plan: SubscriptionPlan }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;

  ${({ $plan }) => {
    if ($plan === 'PREMIUM') return `background: #fef9c3; color: #854d0e;`;
    if ($plan === 'BASIC') return `background: ${palette.infoSoft}; color: ${palette.info};`;
    return `background: #f3e8ff; color: #7c3aed;`;
  }}
`;

const StatusBadge = styled.span<{ $status: SubscriptionStatus }>`
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
      case 'ACTIVE':
        return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'TRIALING':
        return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'PAST_DUE':
      case 'UNPAID':
        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'CANCELLED':
      case 'INCOMPLETE_EXPIRED':
        return `background: #f3f4f6; color: #6b7280;`;
      default:
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
    }
  }}
`;

const BalanceCell = styled.div`
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
  color: ${palette.textMuted};
`;

/* ─── Modal ────────────────────────────────────────────────────────────────── */
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
  max-width: 28rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
`;

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.5rem;
`;

const ModalBody = styled.p`
  font-size: 0.9375rem;
  color: ${palette.textMuted};
  margin: 0 0 1.5rem;
  line-height: 1.5;
`;

const ModalActions = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
`;

const ModalLabel = styled.label`
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.textMuted};
  margin-bottom: 0.375rem;
`;

const ModalSelect = styled.select`
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  margin-bottom: 1.5rem;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const ModalInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  margin-bottom: 1.5rem;
  box-sizing: border-box;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

/* ─── History Drawer ───────────────────────────────────────────────────────── */
const Drawer = styled.div<{ $open: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 28rem;
  max-width: 100vw;
  background: ${palette.surface};
  border-left: 1px solid ${palette.border};
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.1);
  z-index: 90;
  transform: ${({ $open }) => ($open ? 'translateX(0)' : 'translateX(100%)')};
  transition: transform 220ms ease;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const DrawerBackdrop = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  z-index: 89;
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  pointer-events: ${({ $open }) => ($open ? 'auto' : 'none')};
  transition: opacity 220ms ease;
`;

const DrawerHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${palette.border};
`;

const DrawerTitle = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;

const DrawerSubtitle = styled.p`
  font-size: 0.8125rem;
  color: ${palette.textSubtle};
  margin: 0;
`;

const DrawerClose = styled.button`
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  color: ${palette.textSubtle};
  line-height: 1;
  padding: 0.25rem;

  &:hover { color: ${palette.text}; }
`;

const DrawerBody = styled.div`
  padding: 1.25rem 1.5rem;
  flex: 1;
`;

const TxRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid ${palette.border};

  &:last-child { border-bottom: none; }
`;

const TxAmount = styled.div<{ $negative?: boolean }>`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 0.9375rem;
  color: ${({ $negative }) => ($negative ? palette.danger : palette.success)};
  white-space: nowrap;
`;

const TxMeta = styled.div`
  flex: 1;
`;

const TxType = styled.div`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.text};
  text-transform: capitalize;
`;

const TxDate = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const TxNote = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
  font-style: italic;
`;

const EmptyDrawer = styled.p`
  color: ${palette.textSubtle};
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem 0;
`;

const IbanRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const IbanValue = styled.span`
  font-size: 0.8125rem;
  color: ${palette.text};
  font-weight: 500;
  font-family: monospace;
  letter-spacing: 0.04em;
`;

const CopyBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  &:hover { background: ${palette.border}; color: ${palette.text}; }
`;

const SubscriberName = styled(Link)`
  font-weight: 600;
  color: ${palette.text};
  text-decoration: none;

  &:hover {
    color: ${palette.accent};
    text-decoration: underline;
  }
`;

const MonoId = styled.span`
  font-family: 'Menlo', 'Consolas', 'Monaco', monospace;
  font-size: 0.75rem;
  color: ${palette.textMuted};
  letter-spacing: 0.03em;
`;

const UserStatusBadge = styled.span<{ $status: UserAccountStatus | 'DELETED' }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;

  ${({ $status }) => {
    if ($status === 'ACTIVE') return `background: ${palette.successSoft}; color: ${palette.success};`;
    if ($status === 'SUSPENDED') return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    return `background: #f3f4f6; color: #6b7280;`;
  }}
`;

const RiskPill = styled.span<{ $level: 'low' | 'medium' | 'high' }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 9999px;
  padding: 0.125rem 0.5rem;

  ${({ $level }) => {
    if ($level === 'low') return `background: ${palette.successSoft}; color: ${palette.success};`;
    if ($level === 'medium') return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
  }}
`;

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function riskLevelOf(score: number): 'low' | 'medium' | 'high' {
  if (score <= 30) return 'low';
  if (score <= 60) return 'medium';
  return 'high';
}

function riskLabel(score: number): string {
  if (score <= 30) return 'Low';
  if (score <= 60) return 'Medium';
  return 'High';
}

function displayName(row: AdminSubscriber): string {
  return row.firstName || row.lastName
    ? `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim()
    : row.email;
}

/* ─── CSV helper ────────────────────────────────────────────────────────────── */
function downloadCSV(rows: AdminSubscriber[], locale: string) {
  const headers = ['ID', 'First name', 'Last name', 'Email', 'Phone', 'Account status', 'Plan', 'Sub status', 'Cashback balance', 'Period ends', 'Auto-renew', 'Joined'];
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.id,
        r.firstName ?? '',
        r.lastName ?? '',
        r.email,
        r.phone ?? '',
        r.deletedAt ? 'DELETED' : r.status,
        r.subscription?.plan ?? '',
        r.subscription?.status ?? '',
        r.wallet?.availableBalance.toFixed(2) ?? '',
        r.subscription?.currentPeriodEnd ? fmt(r.subscription.currentPeriodEnd) : '',
        r.subscription?.autoRenewal ? 'Yes' : 'No',
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
  a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Component ───────────────────────────────────────────────────────────── */
const PAGE_SIZE = 20;
const NEGATIVE_TX_TYPES = ['WITHDRAWAL', 'PURCHASE'];

const PLAN_OPTIONS: Array<{ value: SubscriptionPlan | ''; label: string }> = [
  { value: '', label: 'All plans' },
  { value: 'LIGHT', label: 'Light' },
  { value: 'BASIC', label: 'Basic' },
  { value: 'PREMIUM', label: 'Premium' },
];

const STATUS_OPTIONS: Array<{ value: SubscriptionStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'TRIALING', label: 'Trialing' },
  { value: 'PAST_DUE', label: 'Past due' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'INCOMPLETE', label: 'Incomplete' },
  { value: 'INCOMPLETE_EXPIRED', label: 'Incomplete expired' },
];

const ACCOUNT_STATUS_OPTIONS: Array<{ value: AccountStatusFilter | ''; label: string }> = [
  { value: '', label: 'All accounts' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'DELETED', label: 'Deleted' },
];

const RISK_OPTIONS: Array<{ value: RiskLevelFilter | ''; label: string }> = [
  { value: '', label: 'All risk' },
  { value: 'low', label: 'Low risk' },
  { value: 'medium', label: 'Medium risk' },
  { value: 'high', label: 'High risk' },
];

const PLAN_CHOICES: SubscriptionPlan[] = ['LIGHT', 'BASIC', 'PREMIUM'];

type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer';
const REFUND_REASONS: Array<{ value: RefundReason; label: string }> = [
  { value: 'requested_by_customer', label: 'Requested by customer' },
  { value: 'duplicate', label: 'Duplicate charge' },
  { value: 'fraudulent', label: 'Fraudulent' },
];

export default function AdminSubscribersAllPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const locale = language === 'bg' ? 'bg-BG' : 'en-GB';

  /* ── Filters ── */
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan | ''>('');
  const [status, setStatus] = useState<SubscriptionStatus | ''>('');
  const [accountStatus, setAccountStatus] = useState<AccountStatusFilter | ''>('');
  const [riskLevel, setRiskLevel] = useState<RiskLevelFilter | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  /* ── Modal state ── */
  const [confirmCancel, setConfirmCancel] = useState<AdminSubscriber | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<AdminSubscriber | null>(null);
  const [newPlan, setNewPlan] = useState<SubscriptionPlan>('BASIC');
  const [confirmSuspend, setConfirmSuspend] = useState<{
    row: AdminSubscriber;
    targetStatus: 'ACTIVE' | 'SUSPENDED';
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminSubscriber | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [confirmRestore, setConfirmRestore] = useState<AdminSubscriber | null>(null);
  const [confirmForceLogout, setConfirmForceLogout] = useState<AdminSubscriber | null>(null);
  const [refundTarget, setRefundTarget] = useState<AdminSubscriber | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState<RefundReason>('requested_by_customer');
  const [exporting, setExporting] = useState(false);

  /* ── Drawer state ── */
  const [drawerSub, setDrawerSub] = useState<AdminSubscriber | null>(null);

  /* ── Data ── */
  const filters = {
    search: search || undefined,
    plan,
    status,
    accountStatus,
    riskLevel,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const queryKey = ['admin-subscribers', page, search, plan, status, accountStatus, riskLevel, dateFrom, dateTo];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => adminSubscribersService.list({ page, limit: PAGE_SIZE, ...filters }),
  });

  const { data: drawerTxData, isLoading: drawerTxLoading } = useQuery({
    queryKey: ['subscriber-tx-history', drawerSub?.id],
    queryFn: () =>
      adminTransactionsService.list({ userId: drawerSub!.id, limit: 5, page: 1 }),
    enabled: !!drawerSub,
  });

  const { data: drawerDetail } = useQuery<AdminSubscriberDetail>({
    queryKey: ['subscriber-detail', drawerSub?.id],
    queryFn: () => adminSubscribersService.getSubscriber(drawerSub!.id),
    enabled: !!drawerSub,
  });

  /* ── Mutations ── */
  const cancelMutation = useMutation({
    mutationFn: (id: string) => adminSubscribersService.cancelSubscription(id),
    onSuccess: () => {
      toast.success('Subscription cancelled');
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setConfirmCancel(null);
    },
    onError: () => toast.error('Failed to cancel subscription'),
  });

  const planMutation = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: SubscriptionPlan }) =>
      adminSubscribersService.changePlan(id, plan),
    onSuccess: () => {
      toast.success('Plan updated');
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setConfirmPlan(null);
    },
    onError: () => toast.error('Failed to update plan'),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, targetStatus }: { id: string; targetStatus: 'ACTIVE' | 'SUSPENDED' }) =>
      adminSubscribersService.suspendSubscriber(id, targetStatus),
    onSuccess: (_, vars) => {
      toast.success(vars.targetStatus === 'SUSPENDED' ? 'Account suspended' : 'Account activated');
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setConfirmSuspend(null);
    },
    onError: () => toast.error('Failed to update account status'),
  });

  const forceLogoutMutation = useMutation({
    mutationFn: (id: string) => adminSubscribersService.forceLogout(id),
    onSuccess: (res) => {
      toast.success(`Revoked ${res.revokedCount} session(s)`);
      setConfirmForceLogout(null);
    },
    onError: () => toast.error('Failed to revoke sessions'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminSubscribersService.deleteAccount(id, reason),
    onSuccess: () => {
      toast.success('Account deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setConfirmDelete(null);
      setDeleteReason('');
    },
    onError: () => toast.error('Failed to delete account'),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => adminSubscribersService.restoreAccount(id),
    onSuccess: () => {
      toast.success('Account restored');
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setConfirmRestore(null);
    },
    onError: () => toast.error('Failed to restore account'),
  });

  const refundMutation = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount?: number; reason: RefundReason }) =>
      adminSubscribersService.refund(id, { amount, reason }),
    onSuccess: (res) => {
      toast.success(`Refund of ${res.amount.toFixed(2)} ${res.currency.toUpperCase()} issued`);
      queryClient.invalidateQueries({ queryKey: ['admin-subscribers'] });
      setRefundTarget(null);
      setRefundAmount('');
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? 'Failed to issue refund'),
  });

  /* ── Escape key close ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setConfirmCancel(null);
      setConfirmPlan(null);
      setConfirmSuspend(null);
      setConfirmDelete(null);
      setConfirmRestore(null);
      setConfirmForceLogout(null);
      setRefundTarget(null);
      setDrawerSub(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  /* ── CSV export handler ── */
  const handleExportCSV = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await adminSubscribersService.exportAll(filters);
      if (!res.subscribers.length) {
        toast.error('No subscribers to export');
        return;
      }
      downloadCSV(res.subscribers, locale);
      toast.success(`Exported ${res.subscribers.length} subscriber(s)`);
    } catch {
      toast.error('Failed to export subscribers');
    } finally {
      setExporting(false);
    }
  };

  /* ── Handlers ── */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
  };

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  /* ── Columns ── */
  const columns: ColumnDef<AdminSubscriber>[] = [
    {
      key: 'firstName',
      header: 'Subscriber',
      render: (row) => (
        <div>
          <SubscriberName to={`/admin/subscribers/${row.id}`}>
            {displayName(row)}
          </SubscriberName>
          <MetaLine>{row.email}</MetaLine>
          {row.phone && <MetaLine>{row.phone}</MetaLine>}
        </div>
      ),
    },
    {
      key: 'userId',
      header: 'User ID',
      render: (row) => <MonoId>{row.id.slice(0, 8)}</MonoId>,
    },
    {
      key: 'accountStatus',
      header: 'User Status',
      render: (row) => {
        const s = (row.deletedAt ? 'DELETED' : row.status) as UserAccountStatus | 'DELETED';
        return <UserStatusBadge $status={s}>{s}</UserStatusBadge>;
      },
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (row) =>
        row.riskScore == null ? (
          <span style={{ color: palette.textSubtle }}>—</span>
        ) : (
          <RiskPill $level={riskLevelOf(row.riskScore)}>{riskLabel(row.riskScore)}</RiskPill>
        ),
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {row.lastLoginAt ? fmt(row.lastLoginAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (row) =>
        row.subscription ? (
          <PlanBadge $plan={row.subscription.plan}>
            {row.subscription.planDisplayName ?? row.subscription.plan}
          </PlanBadge>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
        ),
    },
    {
      key: 'subscriptionStatus',
      header: 'Sub status',
      render: (row) =>
        row.subscription ? (
          <StatusBadge $status={row.subscription.status}>
            {row.subscription.status.replace('_', ' ')}
          </StatusBadge>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
        ),
    },
    {
      key: 'wallet',
      header: 'Cashback',
      render: (row) =>
        row.wallet ? (
          <BalanceCell>
            {row.wallet.availableBalance.toFixed(2)} BGN
            {row.wallet.pendingBalance > 0 && (
              <MetaLine>+{row.wallet.pendingBalance.toFixed(2)} pending</MetaLine>
            )}
          </BalanceCell>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
        ),
    },
    {
      key: 'currentPeriodEnd',
      header: 'Period ends',
      sortable: true,
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {row.subscription?.currentPeriodEnd ? fmt(row.subscription.currentPeriodEnd) : '—'}
        </span>
      ),
    },
    {
      key: 'autoRenewal',
      header: 'Auto-renew',
      render: (row) => (
        <span
          style={{
            fontSize: '0.8125rem',
            color: row.subscription?.autoRenewal ? palette.success : palette.textSubtle,
            fontWeight: 600,
          }}
        >
          {row.subscription?.autoRenewal ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Joined',
      sortable: true,
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {fmt(row.createdAt)}
        </span>
      ),
    },
  ];

  const rowActions: RowAction<AdminSubscriber>[] = [
    {
      label: 'View history',
      onClick: (row) => setDrawerSub(row),
    },
    {
      label: 'Change plan',
      onClick: (row) => {
        setNewPlan(row.subscription?.plan ?? 'BASIC');
        setConfirmPlan(row);
      },
      hidden: (row) => !row.subscription || row.subscription.status === 'CANCELLED' || !!row.deletedAt,
    },
    {
      label: 'Cancel subscription',
      danger: true,
      onClick: (row) => setConfirmCancel(row),
      hidden: (row) => !row.subscription || row.subscription.status === 'CANCELLED' || !!row.deletedAt,
    },
    {
      label: 'Refund',
      danger: true,
      onClick: (row) => {
        setRefundAmount('');
        setRefundReason('requested_by_customer');
        setRefundTarget(row);
      },
      hidden: (row) => !row.subscription || !!row.deletedAt,
    },
    {
      label: 'Suspend account',
      danger: true,
      onClick: (row) => setConfirmSuspend({ row, targetStatus: 'SUSPENDED' }),
      hidden: (row) => row.status === 'SUSPENDED' || !!row.deletedAt,
    },
    {
      label: 'Activate account',
      onClick: (row) => setConfirmSuspend({ row, targetStatus: 'ACTIVE' }),
      hidden: (row) => row.status === 'ACTIVE' || !!row.deletedAt,
    },
    {
      label: 'Force logout',
      onClick: (row) => setConfirmForceLogout(row),
      hidden: (row) => !!row.deletedAt,
    },
    {
      label: 'Delete account',
      danger: true,
      onClick: (row) => {
        setDeleteReason('');
        setConfirmDelete(row);
      },
      hidden: (row) => !!row.deletedAt,
    },
    {
      label: 'Restore account',
      onClick: (row) => setConfirmRestore(row),
      hidden: (row) => !row.deletedAt,
    },
  ];

  return (
    <PageShell>
      {/* Cancel confirm modal */}
      {confirmCancel && (
        <Overlay onClick={() => !cancelMutation.isPending && setConfirmCancel(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Cancel subscription?</ModalTitle>
            <ModalBody>
              The subscription for <strong>{displayName(confirmCancel)}</strong> will be cancelled
              at the end of the current billing period. No refund will be issued.
            </ModalBody>
            <ModalActions>
              <Btn onClick={() => setConfirmCancel(null)}>Keep active</Btn>
              <Btn
                $variant="danger"
                onClick={() => cancelMutation.mutate(confirmCancel.id)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Yes, cancel'}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Change plan modal */}
      {confirmPlan && (
        <Overlay onClick={() => setConfirmPlan(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Change plan</ModalTitle>
            <ModalBody>
              Select a new plan for <strong>{displayName(confirmPlan)}</strong>.
              {confirmPlan.subscription && (
                <> Current plan:{' '}
                  <PlanBadge $plan={confirmPlan.subscription.plan}>
                    {confirmPlan.subscription.plan}
                  </PlanBadge>
                </>
              )}
            </ModalBody>
            <div>
              <ModalLabel>New plan</ModalLabel>
              <ModalSelect
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value as SubscriptionPlan)}
              >
                {PLAN_CHOICES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </ModalSelect>
            </div>
            <ModalActions>
              <Btn onClick={() => setConfirmPlan(null)}>Cancel</Btn>
              <Btn
                $variant="primary"
                onClick={() => planMutation.mutate({ id: confirmPlan.id, plan: newPlan })}
                disabled={planMutation.isPending || newPlan === confirmPlan.subscription?.plan}
              >
                {planMutation.isPending ? 'Saving…' : 'Save change'}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <Overlay onClick={() => !deleteMutation.isPending && setConfirmDelete(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Delete account?</ModalTitle>
            <ModalBody>
              <strong>{displayName(confirmDelete)}</strong> will be soft-deleted. History,
              payments and transactions are preserved and the account can be restored later.
            </ModalBody>
            <div>
              <ModalLabel>Reason (optional)</ModalLabel>
              <ModalInput
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. user request, fraud"
              />
            </div>
            <ModalActions>
              <Btn onClick={() => setConfirmDelete(null)}>Cancel</Btn>
              <Btn
                $variant="danger"
                onClick={() =>
                  deleteMutation.mutate({ id: confirmDelete.id, reason: deleteReason || undefined })
                }
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Restore confirm modal */}
      {confirmRestore && (
        <Overlay onClick={() => !restoreMutation.isPending && setConfirmRestore(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Restore account?</ModalTitle>
            <ModalBody>
              <strong>{displayName(confirmRestore)}</strong>&apos;s account will be restored
              and set back to ACTIVE.
            </ModalBody>
            <ModalActions>
              <Btn onClick={() => setConfirmRestore(null)}>Cancel</Btn>
              <Btn
                $variant="primary"
                onClick={() => restoreMutation.mutate(confirmRestore.id)}
                disabled={restoreMutation.isPending}
              >
                {restoreMutation.isPending ? 'Restoring…' : 'Yes, restore'}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Force logout confirm modal */}
      {confirmForceLogout && (
        <Overlay onClick={() => !forceLogoutMutation.isPending && setConfirmForceLogout(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Force logout?</ModalTitle>
            <ModalBody>
              All active sessions for <strong>{displayName(confirmForceLogout)}</strong> will
              be revoked. They will need to sign in again on every device.
            </ModalBody>
            <ModalActions>
              <Btn onClick={() => setConfirmForceLogout(null)}>Cancel</Btn>
              <Btn
                $variant="danger"
                onClick={() => forceLogoutMutation.mutate(confirmForceLogout.id)}
                disabled={forceLogoutMutation.isPending}
              >
                {forceLogoutMutation.isPending ? 'Revoking…' : 'Yes, revoke'}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Refund modal */}
      {refundTarget && (
        <Overlay onClick={() => !refundMutation.isPending && setRefundTarget(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Issue refund</ModalTitle>
            <ModalBody>
              Refund the latest Stripe payment for <strong>{displayName(refundTarget)}</strong>.
              Leave amount empty to refund the full charge.
            </ModalBody>
            <div>
              <ModalLabel>Amount (BGN)</ModalLabel>
              <ModalInput
                type="number"
                step="0.01"
                min="0"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="Full amount"
              />
            </div>
            <div>
              <ModalLabel>Reason</ModalLabel>
              <ModalSelect
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value as RefundReason)}
              >
                {REFUND_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </ModalSelect>
            </div>
            <ModalActions>
              <Btn onClick={() => setRefundTarget(null)}>Cancel</Btn>
              <Btn
                $variant="danger"
                onClick={() => {
                  const parsed = refundAmount ? parseFloat(refundAmount) : undefined;
                  if (parsed !== undefined && (!Number.isFinite(parsed) || parsed <= 0)) {
                    toast.error('Amount must be a positive number');
                    return;
                  }
                  refundMutation.mutate({
                    id: refundTarget.id,
                    amount: parsed,
                    reason: refundReason,
                  });
                }}
                disabled={refundMutation.isPending}
              >
                {refundMutation.isPending ? 'Refunding…' : 'Issue refund'}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Suspend / Activate confirm modal */}
      {confirmSuspend && (
        <Overlay onClick={() => !suspendMutation.isPending && setConfirmSuspend(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>
              {confirmSuspend.targetStatus === 'SUSPENDED' ? 'Suspend account?' : 'Activate account?'}
            </ModalTitle>
            <ModalBody>
              {confirmSuspend.targetStatus === 'SUSPENDED' ? (
                <>
                  <strong>{displayName(confirmSuspend.row)}</strong> will be suspended and will no
                  longer be able to log in.
                </>
              ) : (
                <>
                  <strong>{displayName(confirmSuspend.row)}</strong>&apos;s account will be
                  reactivated.
                </>
              )}
            </ModalBody>
            <ModalActions>
              <Btn onClick={() => setConfirmSuspend(null)}>Cancel</Btn>
              <Btn
                $variant={confirmSuspend.targetStatus === 'SUSPENDED' ? 'danger' : 'primary'}
                onClick={() =>
                  suspendMutation.mutate({
                    id: confirmSuspend.row.id,
                    targetStatus: confirmSuspend.targetStatus,
                  })
                }
                disabled={suspendMutation.isPending}
              >
                {suspendMutation.isPending
                  ? 'Saving…'
                  : confirmSuspend.targetStatus === 'SUSPENDED'
                  ? 'Yes, suspend'
                  : 'Yes, activate'}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* History drawer */}
      <DrawerBackdrop $open={!!drawerSub} onClick={() => setDrawerSub(null)} />
      <Drawer $open={!!drawerSub}>
        {drawerSub && (
          <>
            <DrawerHeader style={{ position: 'relative' }}>
              <DrawerClose onClick={() => setDrawerSub(null)}>✕</DrawerClose>
              <DrawerTitle>{displayName(drawerSub)}</DrawerTitle>
              <DrawerSubtitle>Last 5 wallet transactions</DrawerSubtitle>
              <IbanRow>
                <span style={{ fontSize: '0.75rem', color: palette.textSubtle }}>IBAN:</span>
                {drawerDetail?.iban ? (
                  <>
                    <IbanValue>{drawerDetail.iban}</IbanValue>
                    <CopyBtn
                      title="Copy IBAN"
                      onClick={() => {
                        navigator.clipboard.writeText(drawerDetail.iban!);
                        toast.success('IBAN copied');
                      }}
                    >
                      Copy
                    </CopyBtn>
                  </>
                ) : (
                  <span style={{ fontSize: '0.8125rem', color: palette.textSubtle }}>Not provided</span>
                )}
              </IbanRow>
            </DrawerHeader>
            <DrawerBody>
              {drawerTxLoading ? (
                <EmptyDrawer>Loading…</EmptyDrawer>
              ) : !drawerTxData?.transactions.length ? (
                <EmptyDrawer>No transactions found</EmptyDrawer>
              ) : (
                drawerTxData.transactions.map((tx: AdminTransaction) => (
                  <TxRow key={tx.id}>
                    <TxMeta>
                      <TxType>{tx.type.replace(/_/g, ' ').toLowerCase()}</TxType>
                      {tx.description && <TxNote>{tx.description}</TxNote>}
                      <TxDate>
                        {fmt(tx.createdAt)} {fmtTime(tx.createdAt)}
                      </TxDate>
                    </TxMeta>
                    <div>
                      <TxAmount $negative={NEGATIVE_TX_TYPES.includes(tx.type)}>
                        {NEGATIVE_TX_TYPES.includes(tx.type) ? '−' : '+'}
                        {tx.amount.toFixed(2)} {tx.currency}
                      </TxAmount>
                      <MetaLine style={{ textAlign: 'right' }}>
                        {tx.balanceBefore.toFixed(2)} → {tx.balanceAfter.toFixed(2)}
                      </MetaLine>
                    </div>
                  </TxRow>
                ))
              )}
            </DrawerBody>
          </>
        )}
      </Drawer>

      <PageHeader>
        <TitleBlock>
          <Eyebrow>Subscribers</Eyebrow>
          <PageTitle>
            All subscribers
            {data && <TotalBadge>{data.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>All subscription records across plans and statuses</PageSubtitle>
        </TitleBlock>
        <HeaderActions>
          <Btn onClick={handleExportCSV} disabled={exporting || !data?.total}>
            {exporting ? 'Exporting…' : '↓ Export CSV'}
          </Btn>
        </HeaderActions>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search by name, email, phone or IBAN…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <Select value={accountStatus} onChange={(e) => { setAccountStatus(e.target.value as AccountStatusFilter | ''); setPage(1); }}>
            {ACCOUNT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select value={plan} onChange={(e) => { setPlan(e.target.value as SubscriptionPlan | ''); setPage(1); }}>
            {PLAN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value as SubscriptionStatus | ''); setPage(1); }}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select value={riskLevel} onChange={(e) => { setRiskLevel(e.target.value as RiskLevelFilter | ''); setPage(1); }}>
            {RISK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <DateInput
            type="date"
            value={dateFrom}
            title="Joined from"
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
          <DateInput
            type="date"
            value={dateTo}
            title="Joined to"
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.subscribers ?? []}
          rowKey={(row) => row.id}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="No subscribers found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
        />
      </Card>
    </PageShell>
  );
}
