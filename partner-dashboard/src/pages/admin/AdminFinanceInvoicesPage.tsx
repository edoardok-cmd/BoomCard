import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminFinanceService,
  AdminInvoice,
  InvoiceStatus,
  ReportingPeriodStatus,
} from '../../services/adminFinance.service';
import {
  adminCashbackService,
  CashbackSummaryEntry,
} from '../../services/adminCashback.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  warning: '#b5803a', warningSoft: '#f5ead2',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  info: '#2563eb', infoSoft: '#dbeafe',
  purple: '#7c3aed', purpleSoft: '#ede9fe',
};

const PageShell = styled.div`
  background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;
  @media print { visibility: hidden; }
`;
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.infoSoft}; color: ${palette.info}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const HeaderActions = styled.div`display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: flex-end;`;
const FilterField = styled.div`display: flex; flex-direction: column; gap: 0.25rem;`;
const FilterLabel = styled.label`font-size: 0.75rem; font-weight: 600; color: ${palette.textSubtle}; text-transform: uppercase; letter-spacing: 0.05em;`;
const SearchInput = styled.input`flex: 1; max-width: 18rem; padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; } &::placeholder { color: ${palette.textSubtle}; }`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const MonthInput = styled.input`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; }`;
const ClearMonthBtn = styled.button`padding: 0.4rem 0.6rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; line-height: 1; color: ${palette.textSubtle}; background: ${palette.bg}; cursor: pointer; &:hover { border-color: ${palette.danger}; color: ${palette.danger}; }`;
const ExportBtn = styled.button`display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; color: ${palette.textMuted}; background: ${palette.surface}; cursor: pointer; white-space: nowrap; &:hover { border-color: ${palette.accent}; color: ${palette.accent}; } &:disabled { opacity: 0.5; cursor: default; }`;
const GenerateBtn = styled.button`display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; color: #fff; background: ${palette.accent}; cursor: pointer; white-space: nowrap; &:hover { opacity: 0.88; } &:disabled { opacity: 0.5; cursor: default; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING: 'Чака',
  PAID:    'Платено',
  OVERDUE: 'Просрочено',
};

const PERIOD_STATUS_LABELS: Record<ReportingPeriodStatus, string> = {
  OPEN:       'Отворен',
  FOR_REVIEW: 'За проверка',
  LOCKED:     'Заключен',
  INVOICED:   'Фактуриран',
};

const StatusBadge = styled.span<{ $status: InvoiceStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'PAID':    return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'OVERDUE': return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      default:        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    }
  }}
`;

const PeriodBadge = styled.span<{ $status: ReportingPeriodStatus | null }>`
  display: inline-flex; align-items: center; font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; border-radius: 0.25rem; padding: 0.1rem 0.4rem; margin-top: 0.25rem;
  ${({ $status }) => {
    switch ($status) {
      case 'LOCKED':     return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'INVOICED':   return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'FOR_REVIEW': return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'OPEN':       return `background: ${palette.infoSoft}; color: ${palette.info};`;
      default:           return `background: ${palette.border}; color: ${palette.textSubtle};`;
    }
  }}
`;

const PartnerTypePill = styled.span<{ $color: string }>`
  display: inline-flex; align-items: center; font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; border-radius: 0.25rem;
  padding: 0.1rem 0.4rem;
  background: ${({ $color }) => $color}22; color: ${({ $color }) => $color};
  margin-left: 0.375rem;
`;

// Modal for editing notes
const Overlay = styled.div`position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: center; justify-content: center;`;
const Modal = styled.div`background: ${palette.surface}; border-radius: 0.75rem; padding: 1.5rem; width: 100%; max-width: 28rem; box-shadow: 0 20px 60px rgba(0,0,0,0.15);`;
const ModalTitle = styled.h3`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0 0 0.25rem;`;
const ModalSub = styled.p`font-size: 0.8125rem; color: ${palette.textMuted}; margin: 0 0 1rem;`;
const Textarea = styled.textarea`width: 100%; box-sizing: border-box; padding: 0.625rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; resize: vertical; min-height: 5rem; outline: none; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }`;
const ModalActions = styled.div`display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;`;
const BtnPrimary = styled.button`padding: 0.5rem 1.125rem; background: ${palette.accent}; color: #fff; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:disabled { opacity: 0.5; }`;
const BtnSecondary = styled.button`padding: 0.5rem 1.125rem; background: ${palette.bg}; color: ${palette.textMuted}; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:disabled { opacity: 0.45; cursor: default; }`;

// Generate modal
const GenModalBody = styled.div`display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem;`;
const GenInput = styled.input`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.9rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; }`;

// Print invoice modal
const PrintOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2000;
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
  @media print {
    visibility: visible;
    background: none; position: fixed; inset: 0; padding: 0;
    align-items: flex-start; justify-content: flex-start;
  }
`;
const PrintSheet = styled.div`
  background: #fff; border-radius: 0.75rem; padding: 3rem;
  width: 100%; max-width: 44rem; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 24px 80px rgba(0,0,0,0.2);
  @media print {
    visibility: visible;
    max-height: none; overflow: visible; border-radius: 0; box-shadow: none; padding: 2rem;
    max-width: 100%;
  }
`;
const PrintActions = styled.div`
  display: flex; gap: 0.75rem; margin-bottom: 2rem;
  @media print { display: none; }
`;
const InvHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2.5rem;`;
const InvLogo = styled.div`font-size: 1.5rem; font-weight: 900; color: #c96442; letter-spacing: -0.02em;`;
const InvTitle = styled.div`text-align: right;`;
const InvNum = styled.div`font-size: 1rem; font-weight: 700; color: #141413;`;
const InvDate = styled.div`font-size: 0.8125rem; color: #605a50; margin-top: 0.25rem;`;
const InvParties = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2.5rem;`;
const InvParty = styled.div``;
const InvPartyLabel = styled.div`font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #8c8678; margin-bottom: 0.5rem;`;
const InvPartyName = styled.div`font-size: 0.9375rem; font-weight: 700; color: #141413;`;
const InvPartyMeta = styled.div`font-size: 0.8125rem; color: #605a50; margin-top: 0.25rem;`;
const InvTable = styled.table`width: 100%; border-collapse: collapse; margin-bottom: 2rem;`;
const InvTh = styled.th`text-align: left; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #8c8678; padding: 0.625rem 0.75rem; border-bottom: 2px solid #e8e5dc;`;
const InvThRight = styled(InvTh)`text-align: right;`;
const InvTd = styled.td`padding: 0.75rem 0.75rem; font-size: 0.875rem; color: #605a50; border-bottom: 1px solid #f0ede6;`;
const InvTdRight = styled(InvTd)`text-align: right; font-variant-numeric: tabular-nums;`;
const InvTdBold = styled(InvTd)`font-weight: 700; color: #141413;`;
const InvTotalRow = styled.tr`background: #faf9f5;`;
const InvTotalLabel = styled.td`padding: 0.875rem 0.75rem; font-weight: 700; font-size: 0.9375rem; color: #141413;`;
const InvTotalAmount = styled.td`padding: 0.875rem 0.75rem; font-weight: 800; font-size: 1.125rem; color: #141413; text-align: right; font-variant-numeric: tabular-nums;`;
const InvFooter = styled.div`margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid #e8e5dc; font-size: 0.75rem; color: #8c8678; text-align: center;`;
const InvStatusBanner = styled.div<{ $paid: boolean }>`
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.25rem 0.75rem; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 700;
  background: ${(p) => p.$paid ? '#e6efe3' : '#f5ead2'};
  color: ${(p) => p.$paid ? '#4a7c59' : '#b5803a'};
  margin-bottom: 2rem;
`;

// Cashback mark-paid modal state type
interface CbMarkPaidModalState {
  partnerId: string;
  partnerName: string;
  partnerEmail: string | null;
  month: string;
  totalOwed: number;
  notes: string;
}

// Invoice action confirmation modal
type InvoiceActionType = 'pay' | 'overdue' | 'pending';
interface InvoiceActionModal {
  type: InvoiceActionType;
  row: AdminInvoice;
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

type CbPaymentStatus = CashbackSummaryEntry['paymentStatus'];
const CbStatusBadge = styled.span<{ $status: CbPaymentStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'PAID':    return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'OVERDUE': return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      default:        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    }
  }}
`;

const CbMetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;
const CbPartnerCell = styled.div`font-weight: 600; color: ${palette.text};`;

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const STATUS_OPTIONS: Array<{ value: InvoiceStatus | ''; label: string }> = [
  { value: '',        label: 'Всички статуси' },
  { value: 'PENDING', label: 'Чака' },
  { value: 'PAID',    label: 'Платено' },
  { value: 'OVERDUE', label: 'Просрочено' },
];

const PAGE_SIZE = 25;

const bgn = (v: number) =>
  v.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 });

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('bg-BG', { day: '2-digit', month: 'short', year: 'numeric' });

export default function AdminFinanceInvoicesPage() {
  const queryClient = useQueryClient();

  const [view, setView] = useState<'invoices' | 'cashback'>('invoices');

  // ── Cashback partner/month billing state (spec §6.2) ──────────────────────
  const [cbMonth, setCbMonth] = useState(currentMonthStr());
  const [cbStatusFilter, setCbStatusFilter] = useState<CbPaymentStatus | ''>('');

  const { data: cbSummary = [], isLoading: isCbLoading } = useQuery({
    queryKey: ['admin-cashback-summary', cbMonth, cbStatusFilter],
    queryFn: () => adminCashbackService.getSummary({
      month: cbMonth || undefined,
      status: cbStatusFilter || undefined,
    }),
    enabled: view === 'cashback',
  });

  const cbMarkPaidMutation = useMutation({
    mutationFn: ({ partnerId, notes }: { partnerId: string; notes?: string }) =>
      adminCashbackService.markPaid(partnerId, cbMonth, notes),
    onSuccess: () => {
      toast.success('Кешбекът е отбелязан като платен');
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
      setCbMarkPaidModal(null);
    },
    onError: () => {
      toast.error('Грешка при маркиране като платен');
      setCbMarkPaidModal(null);
    },
  });

  const cbReminderMutation = useMutation({
    mutationFn: (partnerId: string) => adminCashbackService.sendReminder(partnerId, cbMonth || undefined),
    onSuccess: () => toast.success('Напомнянето е изпратено'),
    onError: () => toast.error('Грешка при изпращане на напомняне'),
  });

  const cbColumns: ColumnDef<CashbackSummaryEntry>[] = [
    {
      key: 'partner',
      header: 'Партньор',
      render: (row) => (
        <CbPartnerCell>
          {row.partnerName}
          {row.partnerEmail && <CbMetaLine>{row.partnerEmail}</CbMetaLine>}
        </CbPartnerCell>
      ),
    },
    {
      key: 'month',
      header: 'Месец',
      render: (row) => <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{row.month}</span>,
    },
    {
      key: 'receiptCount',
      header: 'Сканирания',
      render: (row) => <span style={{ color: palette.textMuted, fontSize: '0.875rem' }}>{row.receiptCount.toLocaleString('bg-BG')}</span>,
    },
    {
      key: 'totalOwed',
      header: 'Дължимо',
      sortable: true,
      render: (row) => <span style={{ fontWeight: 700, color: palette.text }}>{row.totalOwed.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} лв.</span>,
    },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <CbStatusBadge $status={row.paymentStatus}>
            {row.paymentStatus === 'PAID' ? 'Платено' : row.paymentStatus === 'OVERDUE' ? 'Просрочено' : 'Изчакващо'}
          </CbStatusBadge>
          {row.paidAt && <CbMetaLine>Платено {new Date(row.paidAt).toLocaleDateString('bg-BG')}</CbMetaLine>}
          {row.notes && <CbMetaLine style={{ fontStyle: 'italic' }}>{row.notes}</CbMetaLine>}
        </span>
      ),
    },
  ];
  // ─────────────────────────────────────────────────────────────────────────────

  const [searchParams] = useSearchParams();
  const initialStatusParam = searchParams.get('status');
  const initialStatus: InvoiceStatus | '' =
    initialStatusParam === 'PENDING' || initialStatusParam === 'PAID' || initialStatusParam === 'OVERDUE'
      ? initialStatusParam : '';
  // Default to no month filter so admins see all invoices on first load.
  // Defaulting to the current month was confusing because it usually has 0 invoices,
  // making the page look empty until the admin manually changes the filter.
  const initialMonth = searchParams.get('month') ?? '';

  const [page, setPage]               = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [status, setStatus]           = useState<InvoiceStatus | ''>(initialStatus);
  const [month, setMonth]             = useState(initialMonth);
  const [notesModal, setNotesModal]   = useState<{ id: string; partnerName: string; month: string; current: string } | null>(null);
  const [notesValue, setNotesValue]   = useState('');
  const [cbMarkPaidModal, setCbMarkPaidModal] = useState<CbMarkPaidModalState | null>(null);
  const [invoiceActionModal, setInvoiceActionModal] = useState<InvoiceActionModal | null>(null);
  const [printInvoice, setPrintInvoice]   = useState<AdminInvoice | null>(null);
  const [exporting, setExporting]         = useState(false);
  const [exportFormat, setExportFormat]   = useState<'xlsx' | 'csv'>('xlsx');
  const [cbExporting, setCbExporting]     = useState(false);
  const [cbExportFormat, setCbExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [generateModal, setGenerateModal] = useState(false);
  const [generateMonth, setGenerateMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      await adminFinanceService.exportInvoices({ status: status || undefined, month: month || undefined, search: search || undefined, format: exportFormat });
    } catch {
      toast.error('Грешка при експорт');
    } finally {
      setExporting(false);
    }
  };

  const handleCbExport = async () => {
    setCbExporting(true);
    try {
      await adminFinanceService.exportCashbackSummary({ month: cbMonth || undefined, status: cbStatusFilter || undefined, format: cbExportFormat });
    } catch {
      toast.error('Грешка при експорт');
    } finally {
      setCbExporting(false);
    }
  };

  // Debounce search input — fires 350 ms after the user stops typing.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-finance-invoices', page, search, status, month],
    queryFn: () =>
      adminFinanceService.listInvoices({
        page, limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
        month: month || undefined,
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-finance-invoices'] });

  const payMutation = useMutation({
    mutationFn: (id: string) => adminFinanceService.markInvoicePaid(id),
    onSuccess: () => { toast.success('Фактурата е маркирана като платена'); invalidate(); setInvoiceActionModal(null); },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при маркиране';
      toast.error(msg);
      setInvoiceActionModal(null);
    },
  });

  const overdueMutation = useMutation({
    mutationFn: (id: string) => adminFinanceService.markInvoiceOverdue(id),
    onSuccess: () => { toast.success('Фактурата е маркирана като просрочена'); invalidate(); setInvoiceActionModal(null); },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при маркиране';
      toast.error(msg);
      setInvoiceActionModal(null);
    },
  });

  const pendingMutation = useMutation({
    mutationFn: (id: string) => adminFinanceService.markInvoicePending(id),
    onSuccess: () => { toast.success('Фактурата е върната към Чака'); invalidate(); setInvoiceActionModal(null); },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при маркиране';
      toast.error(msg);
      setInvoiceActionModal(null);
    },
  });

  const notesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      adminFinanceService.updateInvoiceNotes(id, notes),
    onSuccess: () => { toast.success('Бележките са запазени'); invalidate(); setNotesModal(null); },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при запазване';
      toast.error(msg);
    },
  });

  const generateMutation = useMutation({
    mutationFn: (m: string) => adminFinanceService.generateInvoices(m),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate();
      setGenerateModal(false);
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при генериране';
      toast.error(msg);
    },
  });

  const openNotesModal = (row: AdminInvoice) => {
    setNotesValue(row.notes ?? '');
    setNotesModal({ id: row.id, partnerName: row.partner.businessName, month: row.month, current: row.notes ?? '' });
  };

  const columns: ColumnDef<AdminInvoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Номер',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', fontWeight: 700, color: row.invoiceNumber ? palette.text : palette.textSubtle }}>
          {row.invoiceNumber ?? '—'}
        </span>
      ),
    },
    {
      key: 'partner',
      header: 'Партньор',
      render: (row) => (
        <span>
          <PrimaryLine>{row.partner.businessName}</PrimaryLine>
          {row.partner.city && <MetaLine>{row.partner.city}</MetaLine>}
          {row.partner.partnerType && (
            <PartnerTypePill $color={row.partner.partnerType.color}>
              {row.partner.partnerType.name}
            </PartnerTypePill>
          )}
        </span>
      ),
    },
    {
      key: 'month',
      header: 'Месец',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: palette.text }}>{row.month}</span>
          {row.reportingPeriodStatus && (
            <PeriodBadge $status={row.reportingPeriodStatus}>
              {PERIOD_STATUS_LABELS[row.reportingPeriodStatus]}
            </PeriodBadge>
          )}
        </span>
      ),
    },
    {
      key: 'turnover',
      header: 'Оборот',
      render: (row) => (
        <span style={{ fontSize: '0.875rem', color: row.turnoverAmount ? palette.text : palette.textSubtle }}>
          {row.turnoverAmount ? bgn(row.turnoverAmount) : '—'}
        </span>
      ),
    },
    {
      key: 'rate',
      header: '%',
      render: (row) => (
        <span style={{ fontSize: '0.875rem', color: row.contractedRate != null ? palette.text : palette.textSubtle }}>
          {row.contractedRate != null ? `${row.contractedRate}%` : '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Задължение',
      render: (row) => {
        // Spec 6.2: Obligation = full amount invoiced to partner = cashback + margin
        const obligation = row.totalCashbackOwed + row.marginAmount;
        return (
          <span>
            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
              {bgn(obligation)}
            </span>
            {row.marginAmount > 0 && (
              <MetaLine title="Вътрешен разбивка: кешбек + марджин">
                {bgn(row.totalCashbackOwed)} кешбек + {bgn(row.marginAmount)} марджин
              </MetaLine>
            )}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => (
        <StatusBadge $status={row.status}>{STATUS_LABELS[row.status]}</StatusBadge>
      ),
    },
    {
      key: 'paidAt',
      header: 'Платено на',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: row.paidAt ? palette.success : palette.textSubtle }}>
          {row.paidAt ? fmt(row.paidAt) : '—'}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Бележки',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{row.notes ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Дата',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Финанси</Eyebrow>
          <PageTitle>
            Фактуриране към партньори
            {view === 'invoices' && (data?.meta?.total ?? 0) > 0 && <TotalBadge>{data!.meta.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>
            {view === 'invoices'
              ? 'Месечни фактури към партньори — оборот и задължение'
              : 'Месечни задължения на партньори от транзакции на абонати (спец. §6.2)'}
          </PageSubtitle>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <ViewTab $active={view === 'invoices'} onClick={() => setView('invoices')}>Фактури</ViewTab>
            <ViewTab $active={view === 'cashback'} onClick={() => setView('cashback')}>Кешбек по партньор</ViewTab>
          </div>
        </TitleBlock>
        {view === 'invoices' && (
          <HeaderActions>
            <GenerateBtn onClick={() => setGenerateModal(true)}>
              + Генерирай фактури
            </GenerateBtn>
            <div style={{ display: 'flex', gap: 0 }}>
              <ExportBtn
                style={{ borderRadius: '0.5rem 0 0 0.5rem', borderRight: 'none', background: exportFormat === 'xlsx' ? palette.accent : palette.surface, color: exportFormat === 'xlsx' ? '#fff' : palette.textMuted }}
                onClick={() => setExportFormat('xlsx')} disabled={exporting}
              >XLSX</ExportBtn>
              <ExportBtn
                style={{ borderRadius: '0 0.5rem 0.5rem 0', background: exportFormat === 'csv' ? palette.accent : palette.surface, color: exportFormat === 'csv' ? '#fff' : palette.textMuted }}
                onClick={() => setExportFormat('csv')} disabled={exporting}
              >CSV</ExportBtn>
            </div>
            <ExportBtn onClick={handleExport} disabled={exporting}>
              {exporting ? 'Експортиране…' : '↓ Експорт'}
            </ExportBtn>
          </HeaderActions>
        )}
        {view === 'cashback' && (
          <HeaderActions>
            <div style={{ display: 'flex', gap: 0 }}>
              <ExportBtn
                style={{ borderRadius: '0.5rem 0 0 0.5rem', borderRight: 'none', background: cbExportFormat === 'xlsx' ? palette.accent : palette.surface, color: cbExportFormat === 'xlsx' ? '#fff' : palette.textMuted }}
                onClick={() => setCbExportFormat('xlsx')} disabled={cbExporting}
              >XLSX</ExportBtn>
              <ExportBtn
                style={{ borderRadius: '0 0.5rem 0.5rem 0', background: cbExportFormat === 'csv' ? palette.accent : palette.surface, color: cbExportFormat === 'csv' ? '#fff' : palette.textMuted }}
                onClick={() => setCbExportFormat('csv')} disabled={cbExporting}
              >CSV</ExportBtn>
            </div>
            <ExportBtn onClick={handleCbExport} disabled={cbExporting}>
              {cbExporting ? 'Експортиране…' : '↓ Експорт'}
            </ExportBtn>
          </HeaderActions>
        )}
      </PageHeader>

      {view === 'cashback' && (
        <Card>
          <FilterRow>
            <MonthInput type="month" value={cbMonth} onChange={(e) => setCbMonth(e.target.value)} />
            <Select value={cbStatusFilter} onChange={(e) => setCbStatusFilter(e.target.value as CbPaymentStatus | '')}>
              <option value="">Всички статуси</option>
              <option value="PENDING">Изчакващо</option>
              <option value="PAID">Платено</option>
              <option value="OVERDUE">Просрочено</option>
            </Select>
          </FilterRow>
          <DataTable
            columns={cbColumns}
            data={cbSummary}
            rowKey={(row) => `${row.partnerId}-${row.month}`}
            loading={isCbLoading}
            emptyMessage="Няма записи за периода"
            rowActions={[
              {
                label: 'Маркирай като платено',
                hidden: (row) => row.paymentStatus === 'PAID',
                onClick: (row) => setCbMarkPaidModal({
                  partnerId: row.partnerId,
                  partnerName: row.partnerName,
                  partnerEmail: row.partnerEmail,
                  month: row.month,
                  totalOwed: row.totalOwed,
                  notes: '',
                }),
              },
              {
                label: 'Изпрати напомняне',
                hidden: (row) => row.paymentStatus === 'PAID',
                onClick: (row) => cbReminderMutation.mutate(row.partnerId),
              },
            ]}
          />
        </Card>
      )}

      {view === 'invoices' && <Card>
        <FilterRow>
          <FilterField style={{ flex: 1, maxWidth: '18rem' }}>
            <FilterLabel htmlFor="inv-search">Партньор</FilterLabel>
            <SearchInput
              id="inv-search"
              type="text"
              placeholder="Търсене по партньор…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </FilterField>
          <FilterField>
            <FilterLabel htmlFor="inv-status">Статус</FilterLabel>
            <Select
              id="inv-status"
              value={status}
              onChange={(e) => { setStatus(e.target.value as InvoiceStatus | ''); setPage(1); }}
            >
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </FilterField>
          <FilterField>
            <FilterLabel htmlFor="inv-month">Месец</FilterLabel>
            <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
              <MonthInput
                id="inv-month"
                type="month"
                value={month}
                onChange={(e) => { setMonth(e.target.value); setPage(1); }}
              />
              {month && (
                <ClearMonthBtn title="Покажи всички месеци" onClick={() => { setMonth(''); setPage(1); }}>×</ClearMonthBtn>
              )}
            </div>
          </FilterField>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="Няма намерени фактури"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'Маркирай платено',
              hidden: (row) => row.status === 'PAID',
              onClick: (row) => setInvoiceActionModal({ type: 'pay', row }),
            },
            {
              label: 'Маркирай просрочено',
              hidden: (row) =>
                row.status !== 'PENDING' ||
                row.reportingPeriodStatus === 'LOCKED' ||
                row.reportingPeriodStatus === 'INVOICED',
              onClick: (row) => setInvoiceActionModal({ type: 'overdue', row }),
            },
            {
              label: 'Върни към Чака',
              hidden: (row) =>
                row.status !== 'OVERDUE' ||
                row.reportingPeriodStatus === 'LOCKED' ||
                row.reportingPeriodStatus === 'INVOICED',
              onClick: (row) => setInvoiceActionModal({ type: 'pending', row }),
            },
            {
              label: 'Разпечатай фактура',
              hidden: () => false,
              onClick: (row) => setPrintInvoice(row),
            },
            {
              // Notes are allowed on any period status — see PATCH /invoices/:id/notes
              label: 'Редакция бележки',
              hidden: () => false,
              onClick: openNotesModal,
            },
          ]}
        />
      </Card>}

      {notesModal && (
        <Overlay onClick={() => { if (!notesMutation.isPending) setNotesModal(null); }}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Редакция бележки</ModalTitle>
            <ModalSub>{notesModal.partnerName} — {notesModal.month}</ModalSub>
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Добавете бележка…"
              autoFocus
            />
            <ModalActions>
              <BtnSecondary onClick={() => setNotesModal(null)}>Отказ</BtnSecondary>
              <BtnPrimary
                disabled={notesMutation.isPending}
                onClick={() => notesMutation.mutate({ id: notesModal.id, notes: notesValue })}
              >
                {notesMutation.isPending ? 'Запазване…' : 'Запази'}
              </BtnPrimary>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {generateModal && (
        <Overlay onClick={() => { if (!generateMutation.isPending) setGenerateModal(false); }}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Генерирай фактури за месец</ModalTitle>
            <ModalSub>
              Създава PENDING фактури за всички партньори с одобрени сканирания.
              Съществуващи неплатени записи се обновяват с новите суми; платените фактури се запазват непроменени.
            </ModalSub>
            <GenModalBody>
              <FilterLabel htmlFor="gen-month">Месец</FilterLabel>
              <GenInput
                id="gen-month"
                type="month"
                value={generateMonth}
                onChange={(e) => setGenerateMonth(e.target.value)}
              />
            </GenModalBody>
            <ModalActions>
              <BtnSecondary onClick={() => setGenerateModal(false)}>Отказ</BtnSecondary>
              <BtnPrimary
                disabled={generateMutation.isPending || !generateMonth}
                onClick={() => generateMutation.mutate(generateMonth)}
              >
                {generateMutation.isPending ? 'Генериране…' : 'Генерирай'}
              </BtnPrimary>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Cashback mark-paid confirmation modal — replaces window.confirm + window.prompt */}
      {cbMarkPaidModal && (
        <Overlay onClick={() => { if (!cbMarkPaidMutation.isPending) setCbMarkPaidModal(null); }}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Маркирай кешбек като платен</ModalTitle>
            <ModalSub>
              {cbMarkPaidModal.partnerName} — {cbMarkPaidModal.month}
              <br />
              Сума: <strong>{cbMarkPaidModal.totalOwed.toFixed(2)} лв.</strong>
            </ModalSub>
            <FilterLabel style={{ display: 'block', marginBottom: '0.375rem' }}>
              Бележки (референция за плащане и др.)
            </FilterLabel>
            <Textarea
              placeholder="Напр. Превод BG123456789 от 01.05.2026…"
              value={cbMarkPaidModal.notes}
              onChange={(e) => setCbMarkPaidModal((m) => m ? { ...m, notes: e.target.value } : null)}
              autoFocus
            />
            <ModalActions>
              <BtnSecondary disabled={cbMarkPaidMutation.isPending} onClick={() => setCbMarkPaidModal(null)}>Отказ</BtnSecondary>
              <BtnPrimary
                disabled={cbMarkPaidMutation.isPending}
                onClick={() => {
                  cbMarkPaidMutation.mutate({
                    partnerId: cbMarkPaidModal.partnerId,
                    notes: cbMarkPaidModal.notes.trim() || undefined,
                  });
                }}
              >
                {cbMarkPaidMutation.isPending ? 'Запазване…' : 'Маркирай платено'}
              </BtnPrimary>
            </ModalActions>
          </Modal>
        </Overlay>
      )}
      {/* Invoice action confirmation modal — replaces window.confirm for all 3 status transitions */}
      {invoiceActionModal && (() => {
        const { type, row } = invoiceActionModal;
        const obligation = bgn(row.totalCashbackOwed + row.marginAmount);
        const configs: Record<InvoiceActionType, { title: string; body: string; confirm: string; danger?: boolean }> = {
          pay: {
            title: 'Маркирай фактура като платена',
            body: `${row.partner.businessName} — ${row.month} — ${obligation}. Действието е необратимо.`,
            confirm: 'Маркирай платено',
          },
          overdue: {
            title: 'Маркирай фактура като просрочена',
            body: `${row.partner.businessName} — ${row.month} — ${obligation}. Статусът ще бъде сменен от Чака на Просрочено.`,
            confirm: 'Маркирай просрочено',
            danger: true,
          },
          pending: {
            title: 'Върни фактура към Чака',
            body: `${row.partner.businessName} — ${row.month} — ${obligation}. Статусът ще бъде сменен от Просрочено на Чака.`,
            confirm: 'Върни към Чака',
          },
        };
        const cfg = configs[type];
        const isPending = payMutation.isPending || overdueMutation.isPending || pendingMutation.isPending;
        const handleConfirm = () => {
          if (type === 'pay')     payMutation.mutate(row.id);
          if (type === 'overdue') overdueMutation.mutate(row.id);
          if (type === 'pending') pendingMutation.mutate(row.id);
        };
        return (
          <Overlay onClick={() => { if (!isPending) setInvoiceActionModal(null); }}>
            <Modal onClick={(e) => e.stopPropagation()}>
              <ModalTitle>{cfg.title}</ModalTitle>
              <ModalSub>{cfg.body}</ModalSub>
              <ModalActions>
                <BtnSecondary disabled={isPending} onClick={() => setInvoiceActionModal(null)}>Отказ</BtnSecondary>
                <BtnPrimary
                  disabled={isPending}
                  style={cfg.danger ? { background: '#b54327' } : undefined}
                  onClick={handleConfirm}
                >
                  {isPending ? 'Запазване…' : cfg.confirm}
                </BtnPrimary>
              </ModalActions>
            </Modal>
          </Overlay>
        );
      })()}

      {/* ── Printable invoice modal ─────────────────────────────────────────── */}
      {printInvoice && (() => {
        const inv = printInvoice;
        const obligation = inv.totalCashbackOwed + inv.marginAmount;
        const issueDate = inv.paidAt ? new Date(inv.paidAt) : new Date(inv.createdAt);
        return (
          <PrintOverlay onClick={() => setPrintInvoice(null)}>
            <PrintSheet onClick={(e) => e.stopPropagation()}>
              <PrintActions>
                <BtnPrimary onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  🖨 Разпечатай
                </BtnPrimary>
                <BtnSecondary onClick={() => setPrintInvoice(null)}>Затвори</BtnSecondary>
              </PrintActions>

              <InvHeader>
                <InvLogo>BoomCard</InvLogo>
                <InvTitle>
                  <InvNum>Фактура {inv.invoiceNumber ?? '—'}</InvNum>
                  <InvDate>Период: {inv.month}</InvDate>
                  <InvDate>Издадена: {issueDate.toLocaleDateString('bg-BG', { day: '2-digit', month: 'long', year: 'numeric' })}</InvDate>
                </InvTitle>
              </InvHeader>

              {inv.status === 'PAID'
                ? <InvStatusBanner $paid={true}>✓ ПЛАТЕНА</InvStatusBanner>
                : inv.status === 'OVERDUE'
                  ? <InvStatusBanner $paid={false}>⚠ ПРОСРОЧЕНА</InvStatusBanner>
                  : <InvStatusBanner $paid={false}>ИЗЧАКВАНЕ НА ПЛАЩАНЕ</InvStatusBanner>
              }

              <InvParties>
                <InvParty>
                  <InvPartyLabel>Издател</InvPartyLabel>
                  <InvPartyName>BoomCard</InvPartyName>
                  <InvPartyMeta>office@boomcard.bg</InvPartyMeta>
                </InvParty>
                <InvParty>
                  <InvPartyLabel>Получател</InvPartyLabel>
                  <InvPartyName>{inv.partner.businessName}</InvPartyName>
                  {inv.partner.city && <InvPartyMeta>{inv.partner.city}</InvPartyMeta>}
                </InvParty>
              </InvParties>

              <InvTable>
                <thead>
                  <tr>
                    <InvTh>Описание</InvTh>
                    <InvThRight>Оборот</InvThRight>
                    <InvThRight>%</InvThRight>
                    <InvThRight>Сума</InvThRight>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <InvTdBold>Кешбек задължение — {inv.month}</InvTdBold>
                    <InvTdRight>{inv.turnoverAmount ? bgn(inv.turnoverAmount) : '—'}</InvTdRight>
                    <InvTdRight>{inv.contractedRate != null ? `${inv.contractedRate}%` : '—'}</InvTdRight>
                    <InvTdRight>{bgn(inv.totalCashbackOwed)}</InvTdRight>
                  </tr>
                  {inv.marginAmount > 0 && (
                    <tr>
                      <InvTd>Марджин BoomCard</InvTd>
                      <InvTdRight>—</InvTdRight>
                      <InvTdRight>—</InvTdRight>
                      <InvTdRight>{bgn(inv.marginAmount)}</InvTdRight>
                    </tr>
                  )}
                  <InvTotalRow>
                    <InvTotalLabel colSpan={3}>Общо дължимо</InvTotalLabel>
                    <InvTotalAmount>{bgn(obligation)}</InvTotalAmount>
                  </InvTotalRow>
                </tbody>
              </InvTable>

              {inv.notes && (
                <div style={{ fontSize: '0.8125rem', color: '#605a50', marginBottom: '1rem' }}>
                  <strong>Бележки:</strong> {inv.notes}
                </div>
              )}

              <InvFooter>
                BoomCard · office@boomcard.bg · boomcard.bg
                {inv.paidAt && (
                  <div style={{ marginTop: '0.5rem' }}>
                    Платено на: {new Date(inv.paidAt).toLocaleDateString('bg-BG', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                )}
              </InvFooter>
            </PrintSheet>
          </PrintOverlay>
        );
      })()}
    </PageShell>
  );
}
