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

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
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
const BtnSecondary = styled.button`padding: 0.5rem 1.125rem; background: ${palette.bg}; color: ${palette.textMuted}; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer;`;

// Generate modal
const GenModalBody = styled.div`display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem;`;
const GenInput = styled.input`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.9rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; }`;

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
    },
    onError: () => toast.error('Грешка при маркиране като платен'),
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

  const [page, setPage]               = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [status, setStatus]           = useState<InvoiceStatus | ''>(initialStatus);
  const [month, setMonth]             = useState('');
  const [notesModal, setNotesModal]   = useState<{ id: string; partnerName: string; month: string; current: string } | null>(null);
  const [notesValue, setNotesValue]   = useState('');
  const [exporting, setExporting]     = useState(false);
  const [generateModal, setGenerateModal] = useState(false);
  const [generateMonth, setGenerateMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      await adminFinanceService.exportInvoices({ status: status || undefined, month: month || undefined, search: search || undefined });
    } catch {
      toast.error('Грешка при експорт');
    } finally {
      setExporting(false);
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
    onSuccess: () => { toast.success('Фактурата е маркирана като платена'); invalidate(); },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при маркиране';
      toast.error(msg);
    },
  });

  const overdueMutation = useMutation({
    mutationFn: (id: string) => adminFinanceService.markInvoiceOverdue(id),
    onSuccess: () => { toast.success('Фактурата е маркирана като просрочена'); invalidate(); },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при маркиране';
      toast.error(msg);
    },
  });

  const pendingMutation = useMutation({
    mutationFn: (id: string) => adminFinanceService.markInvoicePending(id),
    onSuccess: () => { toast.success('Фактурата е върната към Чака'); invalidate(); },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при маркиране';
      toast.error(msg);
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
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <StatusBadge $status={row.status}>{STATUS_LABELS[row.status]}</StatusBadge>
          {row.paidAt && <MetaLine>Платено {fmt(row.paidAt)}</MetaLine>}
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
            Фактури партньори
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
            <ExportBtn onClick={handleExport} disabled={exporting}>
              {exporting ? 'Експортиране…' : '↓ Експорт XLSX'}
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
                onClick: (row) => {
                  if (!window.confirm(`Маркирай кешбек за ${row.partnerName} (${row.month}) като платен?\nСума: ${row.totalOwed.toFixed(2)} лв.`)) return;
                  const notes = window.prompt('Бележки (референция за плащане и др.):') ?? undefined;
                  cbMarkPaidMutation.mutate({ partnerId: row.partnerId, notes: notes || undefined });
                },
              },
              {
                label: 'Изпрати напомняне',
                hidden: (row) => row.paymentStatus === 'PAID',
                onClick: (row) => {
                  if (!window.confirm(`Изпрати имейл напомняне до ${row.partnerEmail ?? row.partnerName}?`)) return;
                  cbReminderMutation.mutate(row.partnerId);
                },
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
            <MonthInput
              id="inv-month"
              type="month"
              value={month}
              onChange={(e) => { setMonth(e.target.value); setPage(1); }}
            />
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
              onClick: (row) => {
                if (!window.confirm(`Маркирай фактурата за ${row.partner.businessName} (${row.month}) като платена?`)) return;
                payMutation.mutate(row.id);
              },
            },
            {
              label: 'Маркирай просрочено',
              hidden: (row) => row.status !== 'PENDING',
              onClick: (row) => {
                if (!window.confirm(`Маркирай фактурата за ${row.partner.businessName} (${row.month}) като просрочена?`)) return;
                overdueMutation.mutate(row.id);
              },
            },
            {
              label: 'Върни към Чака',
              hidden: (row) => row.status !== 'OVERDUE',
              onClick: (row) => {
                if (!window.confirm(`Върни фактурата за ${row.partner.businessName} (${row.month}) към статус Чака?`)) return;
                pendingMutation.mutate(row.id);
              },
            },
            {
              label: 'Редакция бележки',
              hidden: () => false,
              onClick: openNotesModal,
            },
          ]}
        />
      </Card>}

      {notesModal && (
        <Overlay onClick={() => setNotesModal(null)}>
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
        <Overlay onClick={() => setGenerateModal(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Генерирай фактури за месец</ModalTitle>
            <ModalSub>
              Създава PENDING фактури за всички партньори с одобрени сканирания.
              Съществуващи записи се обновяват с новите суми.
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
    </PageShell>
  );
}
