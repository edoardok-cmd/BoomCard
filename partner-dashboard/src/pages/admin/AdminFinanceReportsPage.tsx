import { useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminFinanceService, PlanBreakdownRow } from '../../services/adminFinance.service';
import { adminAlertsService, AdminAlert } from '../../services/adminAlerts.service';
import { useLanguage } from '../../contexts/LanguageContext';

const BG_PLURAL = new Intl.PluralRules('bg');
const EN_PLURAL = new Intl.PluralRules('en');

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  warning: '#b5803a', warningSoft: '#f5ead2',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  info: '#2563eb', infoSoft: '#dbeafe',
  purple: '#7c3aed', purpleSoft: '#ede9fe',
  teal: '#0f766e', tealSoft: '#ccfbf1',
};

/* ─── Layout ────────────────────────────────────────────────────────────────── */
const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const HeaderActions = styled.div`display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;`;

/* ─── Filters ───────────────────────────────────────────────────────────────── */
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 2rem; flex-wrap: wrap; align-items: center;`;
const DateInput = styled.input`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.surface}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; }`;
const FilterLabel = styled.span`font-size: 0.8125rem; color: ${palette.textMuted}; font-weight: 600;`;
const FilterSelect = styled.select`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.surface}; color: ${palette.text}; outline: none; cursor: pointer; min-width: 10rem; &:focus { border-color: ${palette.accent}; }`;
const PartnerSearchInput = styled.input`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.surface}; color: ${palette.text}; outline: none; min-width: 14rem; &:focus { border-color: ${palette.accent}; } &::placeholder { color: ${palette.textSubtle}; }`;
const RunBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.accent}; color: #fff; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { opacity: 0.9; } &:disabled { opacity: 0.5; cursor: default; }`;
const ExportBtn = styled.button`padding: 0.5rem 0.875rem; background: ${palette.surface}; color: ${palette.text}; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.8125rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 0.375rem; &:hover { background: ${palette.bg}; } &:disabled { opacity: 0.5; cursor: default; }`;

/* ─── Stats grid ────────────────────────────────────────────────────────────── */
const StatsGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 1rem; margin-bottom: 2rem;`;
const StatCard = styled.div<{ $soft?: string }>`background: ${({ $soft }) => $soft ?? palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.25rem 1.5rem;`;
const StatLabel = styled.p`font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: ${palette.textSubtle}; margin: 0 0 0.375rem;`;
const StatValue = styled.p<{ $color?: string }>`font-size: 1.75rem; font-weight: 800; color: ${({ $color }) => $color ?? palette.text}; margin: 0;`;
const StatSub = styled.p`font-size: 0.8rem; color: ${palette.textMuted}; margin: 0.25rem 0 0;`;

/* ─── Tables ────────────────────────────────────────────────────────────────── */
const SectionTitle = styled.h2`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0 0 1rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem;`;
const Table = styled.table`width: 100%; border-collapse: collapse; font-size: 0.875rem;`;
const Th = styled.th`text-align: left; color: ${palette.textSubtle}; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.5rem 0.75rem; border-bottom: 1px solid ${palette.border};`;
const ThRight = styled(Th)`text-align: right;`;
const Td = styled.td`padding: 0.625rem 0.75rem; border-bottom: 1px solid ${palette.border}; color: ${palette.textMuted};`;
const TdRight = styled(Td)`text-align: right; font-variant-numeric: tabular-nums;`;
const TdBold = styled(Td)`font-weight: 600; color: ${palette.text};`;

const TypeBadge = styled.span`display: inline-flex; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; border-radius: 0.375rem; padding: 0.125rem 0.45rem; background: ${palette.infoSoft}; color: ${palette.info};`;

const InvoiceStatusBadge = styled.span<{ $status: string }>`
  display: inline-flex; font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; border-radius: 0.375rem; padding: 0.125rem 0.45rem;
  background: ${({ $status }) =>
    $status === 'PAID' ? palette.successSoft :
    $status === 'OVERDUE' ? palette.dangerSoft :
    palette.warningSoft};
  color: ${({ $status }) =>
    $status === 'PAID' ? palette.success :
    $status === 'OVERDUE' ? palette.danger :
    palette.warning};
`;

const PeriodStatusBadge = styled.span<{ $status: string }>`
  display: inline-flex; font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; border-radius: 0.375rem; padding: 0.125rem 0.45rem;
  background: ${({ $status }) =>
    $status === 'INVOICED'   ? palette.successSoft :
    $status === 'LOCKED'     ? palette.infoSoft :
    $status === 'FOR_REVIEW' ? palette.warningSoft :
    $status === 'NO_RECORD'  ? '#f3f4f6' :
    palette.accentSoft};
  color: ${({ $status }) =>
    $status === 'INVOICED'   ? palette.success :
    $status === 'LOCKED'     ? palette.info :
    $status === 'FOR_REVIEW' ? palette.warning :
    $status === 'NO_RECORD'  ? '#6b7280' :
    palette.accent};
`;

/* ─── Banners ───────────────────────────────────────────────────────────────── */
const FocusBanner = styled.div`display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem; background: ${palette.warningSoft}; border: 1px solid #e8d8ad; border-left: 3px solid ${palette.warning}; border-radius: 0.75rem; margin-bottom: 1.5rem;`;
const FocusContent = styled.div`flex: 1;`;
const FocusEyebrow = styled.p`font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${palette.warning}; margin: 0 0 0.25rem;`;
const FocusTitle = styled.p`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0;`;
const FocusCount = styled.span`font-feature-settings: 'tnum'; color: ${palette.danger};`;
const FocusBtn = styled(Link)`flex-shrink: 0; padding: 0.5rem 0.875rem; background: ${palette.text}; color: #fff; border: none; border-radius: 0.5rem; font-size: 0.8125rem; font-weight: 600; text-decoration: none; cursor: pointer; &:hover { opacity: 0.9; }`;

const WarningBanner = styled.div`display: flex; align-items: flex-start; gap: 0.75rem; padding: 1rem 1.25rem; background: ${palette.warningSoft}; border: 1px solid #e8d8ad; border-left: 3px solid ${palette.warning}; border-radius: 0.75rem; margin-bottom: 1.5rem;`;
const PlanScopeBanner = styled.div`display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.875rem 1.125rem; background: ${palette.infoSoft}; border: 1px solid #bfdbfe; border-left: 3px solid ${palette.info}; border-radius: 0.75rem; margin-bottom: 1.5rem; font-size: 0.875rem; color: ${palette.text};`;
const WarningText = styled.div`font-size: 0.875rem; color: ${palette.text};`;
const WarningTitle = styled.p`font-weight: 700; margin: 0 0 0.25rem;`;
const WarningDesc = styled.p`margin: 0; color: ${palette.textMuted};`;

/* ─── Alert focus configs (spec §3.2) ───────────────────────────────────────── */
interface FocusCopy {
  eyebrow: string;
  body: (category: Intl.LDMLPluralRule) => string;
  cta: string;
}
interface FocusConfig {
  alertId: string;
  bg: FocusCopy;
  en: FocusCopy;
  drillDown: (meta?: Record<string, string | number>) => string;
}

const FOCUS_CONFIGS: Record<string, FocusConfig> = {
  failed_payments: {
    alertId: 'failed_payments',
    bg: {
      eyebrow: 'Сигнал',
      body: (c) => `абонамент${c === 'one' ? '' : 'а'} с неуспешно плащане (PAST_DUE)`,
      cta: 'Виж в Абонати',
    },
    en: {
      eyebrow: 'Alert',
      body: (c) => `subscription${c === 'one' ? '' : 's'} with failed payment (PAST_DUE)`,
      cta: 'Open in Subscriptions',
    },
    drillDown: () => '/admin/subscribers/subscriptions?status=PAST_DUE',
  },
  unpaid_subscriptions: {
    alertId: 'unpaid_subscriptions',
    bg: {
      eyebrow: 'Сигнал',
      body: (c) => `неплатен${c === 'one' ? '' : 'и'} абонамент${c === 'one' ? '' : 'а'} (UNPAID)`,
      cta: 'Виж в Абонати',
    },
    en: {
      eyebrow: 'Alert',
      body: (c) => `unpaid subscription${c === 'one' ? '' : 's'} (UNPAID)`,
      cta: 'Open in Subscriptions',
    },
    drillDown: () => '/admin/subscribers/subscriptions?status=UNPAID',
  },
  failed_transactions: {
    alertId: 'failed_transactions',
    bg: {
      eyebrow: 'Сигнал',
      body: (c) => `неуспешн${c === 'one' ? 'а' : 'и'} транзакци${c === 'one' ? 'я' : 'и'} (последните 24ч)`,
      cta: 'Виж в Транзакции',
    },
    en: {
      eyebrow: 'Alert',
      body: (c) => `failed transaction${c === 'one' ? '' : 's'} (last 24h)`,
      cta: 'Open in Transactions',
    },
    drillDown: (meta) => {
      const base = '/admin/subscribers/transactions?view=business&status=FAILED';
      const dateFrom = meta?.['dateFrom'];
      return typeof dateFrom === 'string' ? `${base}&dateFrom=${encodeURIComponent(dateFrom)}` : base;
    },
  },
};

/* ─── Month/date helpers ────────────────────────────────────────────────────── */
const now = new Date();
// Default selection: current calendar month as YYYY-MM
const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
// Convert a YYYY-MM month string to the first and last day date strings.
// Use local date components directly to avoid UTC conversion shifting the day
// in timezones east of UTC (e.g. Sofia UTC+2/+3 would shift last-day back by 1).
const monthToFrom = (m: string) => `${m}-01`;
const monthToTo = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  return `${y}-${m.slice(5, 7)}-${String(lastDay).padStart(2, '0')}`;
};

/* ─── Invoice status labels ──────────────────────────────────────────────────── */
const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Чакащ',
  PAID: 'Платен',
  OVERDUE: 'Просрочен',
};

/* ─── Period status labels ───────────────────────────────────────────────────── */
const PERIOD_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Отворен',
  FOR_REVIEW: 'За проверка',
  LOCKED: 'Заключен',
  INVOICED: 'Фактуриран',
};

/* ─── Subscription plan labels ───────────────────────────────────────────────── */
const PLAN_LABELS: Record<string, string> = {
  LIGHT:   'Light',
  BASIC:   'Basic',
  PREMIUM: 'Premium',
  UNKNOWN: 'Без абонамент',
};

/* ─── Wallet type labels ─────────────────────────────────────────────────────── */
const WALLET_TYPE_LABELS: Record<string, string> = {
  CASHBACK_CREDIT: 'Кешбек кредит',
  WITHDRAWAL: 'Плащане към абонат',
  TOP_UP: 'Зареждане',
};

export default function AdminFinanceReportsPage() {
  // Month pickers: value is YYYY-MM (spec §6.4 "Период" filter)
  const [fromMonth, setFromMonth] = useState(defaultMonth);
  const [toMonth, setToMonth] = useState(defaultMonth);
  // Committed query state (from Run button)
  const [queryFrom, setQueryFrom] = useState(monthToFrom(defaultMonth));
  const [queryTo, setQueryTo] = useState(monthToTo(defaultMonth));
  const [partnerId, setPartnerId] = useState('');
  const [partnerInput, setPartnerInput] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [queryPartnerId, setQueryPartnerId] = useState('');
  const [queryInvoiceStatus, setQueryInvoiceStatus] = useState('');
  const [queryPlan, setQueryPlan] = useState('');
  const [exporting, setExporting] = useState(false);
  const runCount = useRef(0);
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const focusKey = searchParams.get('focus');
  const focusConfig = focusKey ? FOCUS_CONFIGS[focusKey] : undefined;

  const { data: alertsData } = useQuery({
    queryKey: ['admin-alerts'],
    queryFn: adminAlertsService.getAlerts,
    enabled: !!focusConfig,
    staleTime: 30_000,
  });
  const focusAlert: AdminAlert | undefined = focusConfig && alertsData
    ? [...alertsData.critical, ...alertsData.operational, ...alertsData.informational]
        .find((a) => a.id === focusConfig.alertId)
    : undefined;
  const focusCount = focusAlert?.count ?? null;

  // Partner list for dropdown (partners that have at least one invoice)
  const { data: partnersData } = useQuery({
    queryKey: ['admin-report-partners'],
    queryFn: adminFinanceService.getReportPartners,
    staleTime: 5 * 60_000,
  });

  // runKey forces a refetch even when all params are unchanged (Run button clicked
  // while dates/filters haven't changed — the previous behaviour silently no-oped)
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-finance-reports', queryFrom, queryTo, queryPartnerId, queryInvoiceStatus, queryPlan, runCount.current],
    queryFn: () => adminFinanceService.getReports({
      from: queryFrom,
      to: queryTo,
      partnerId: queryPartnerId || undefined,
      invoiceStatus: queryInvoiceStatus || undefined,
      plan: queryPlan || undefined,
    }),
  });

  const report = data?.data;
  const walletTx = report?.walletTransactions ?? {};

  const totalVolume = Object.values(walletTx).reduce((s, v) => s + v.total, 0);
  const totalCount = Object.values(walletTx).reduce((s, v) => s + v.count, 0);
  const cashback = walletTx['CASHBACK_CREDIT'];
  const withdrawals = walletTx['WITHDRAWAL'];
  const topUps = walletTx['TOP_UP'];

  const fmt = (n: number) =>
    n.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 });

  const handleRun = () => {
    runCount.current += 1;
    setQueryFrom(monthToFrom(fromMonth));
    setQueryTo(monthToTo(toMonth));
    setQueryPartnerId(partnerId);
    setQueryInvoiceStatus(invoiceStatus);
    setQueryPlan(plan);
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      await adminFinanceService.exportReports({
        from: queryFrom,
        to: queryTo,
        format,
        partnerId: queryPartnerId || undefined,
        invoiceStatus: queryInvoiceStatus || undefined,
        plan: queryPlan || undefined,
      });
    } catch {
      toast.error('Грешка при експорт на отчет');
    } finally {
      setExporting(false);
    }
  };

  // Periods that are open/in-review warn that data may still change.
  // Periods with null status have no ReportingPeriod record at all — equally uncontrolled.
  const openPeriods = (report?.periodStatuses ?? []).filter(
    (p) => p.status === 'OPEN' || p.status === 'FOR_REVIEW' || p.status === null
  );

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Финанси</Eyebrow>
          <PageTitle>Справки</PageTitle>
          <PageSubtitle>Обобщени финансови данни за избран период</PageSubtitle>
        </TitleBlock>
        <HeaderActions>
          <ExportBtn onClick={() => handleExport('csv')} disabled={exporting || !report}>
            ↓ CSV
          </ExportBtn>
          <ExportBtn onClick={() => handleExport('xlsx')} disabled={exporting || !report}>
            ↓ Excel
          </ExportBtn>
        </HeaderActions>
      </PageHeader>

      {/* Alert focus banner (spec §3.2) */}
      {focusConfig && focusCount !== null && focusCount > 0 && (() => {
        const copy = language === 'bg' ? focusConfig.bg : focusConfig.en;
        const plural = language === 'bg' ? BG_PLURAL : EN_PLURAL;
        const category = plural.select(focusCount);
        return (
          <FocusBanner>
            <FocusContent>
              <FocusEyebrow>{copy.eyebrow}</FocusEyebrow>
              <FocusTitle>
                <FocusCount>{focusCount}</FocusCount> {copy.body(category)}
              </FocusTitle>
            </FocusContent>
            <FocusBtn to={focusConfig.drillDown(focusAlert?.meta)}>{copy.cta}</FocusBtn>
          </FocusBanner>
        );
      })()}

      {/* Warning when periods are open, in-review, or have no record at all */}
      {openPeriods.length > 0 && (
        <WarningBanner>
          <span style={{ fontSize: '1.1rem' }}>⚠</span>
          <WarningText>
            <WarningTitle>Незатворени периоди в избрания диапазон</WarningTitle>
            <WarningDesc>
              Периоди{' '}
              {openPeriods.map((p, i) => (
                <span key={p.month}>
                  {i > 0 && ', '}
                  <strong>{p.month}</strong>{' '}
                  {p.status === null
                    ? <PeriodStatusBadge $status="NO_RECORD">Без запис</PeriodStatusBadge>
                    : <PeriodStatusBadge $status={p.status}>{PERIOD_STATUS_LABELS[p.status] ?? p.status}</PeriodStatusBadge>
                  }
                </span>
              ))}{' '}
              все още не са заключени — данните може да се променят.{' '}
              <Link to="/admin/finance/periods" style={{ color: palette.accent }}>Управление на периоди →</Link>
            </WarningDesc>
          </WarningText>
        </WarningBanner>
      )}

      {/* Filters — period picker (spec §6.4: Период, партньор, абонатен план, статус на фактура) */}
      <FilterRow>
        <FilterLabel>От период</FilterLabel>
        <DateInput type="month" value={fromMonth} onChange={(e) => {
          const v = e.target.value;
          setFromMonth(v);
          if (v > toMonth) setToMonth(v);
        }} />
        <FilterLabel>До период</FilterLabel>
        <DateInput type="month" value={toMonth} onChange={(e) => {
          const v = e.target.value;
          setToMonth(v);
          if (v < fromMonth) setFromMonth(v);
        }} />
        <PartnerSearchInput
          type="text"
          list="report-partners-list"
          placeholder="Търси партньор…"
          value={partnerInput}
          onChange={(e) => {
            const val = e.target.value;
            setPartnerInput(val);
            const found = (partnersData?.data ?? []).find(
              (p) => p.businessName.toLowerCase() === val.toLowerCase()
            );
            setPartnerId(found?.id ?? '');
          }}
        />
        <datalist id="report-partners-list">
          {(partnersData?.data ?? []).map((p) => (
            <option key={p.id} value={p.businessName} />
          ))}
        </datalist>
        <FilterSelect value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">Всички планове</option>
          <option value="LIGHT">Light</option>
          <option value="BASIC">Basic</option>
          <option value="PREMIUM">Premium</option>
          <option value="UNKNOWN">Без абонамент</option>
        </FilterSelect>
        <FilterSelect value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value)}>
          <option value="">Статус на фактура (всички)</option>
          <option value="PENDING">Чакащи</option>
          <option value="PAID">Платени</option>
          <option value="OVERDUE">Просрочени</option>
        </FilterSelect>
        <RunBtn disabled={isLoading} onClick={handleRun}>
          {isLoading ? 'Зареждане…' : 'Приложи филтри'}
        </RunBtn>
      </FilterRow>

      {report && (
        <>
          {/* Plan filter scope banner — wallet/invoice stats are not plan-filterable */}
          {queryPlan && (
            <PlanScopeBanner>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>ℹ</span>
              <span>
                <strong>Планът филтрира само разбивката по план.</strong>{' '}
                Статистиките на портфейла (кешбек, плащания, зареждания) и фактурните карти показват данни за всички планове — тези агрегати не са обвързани с конкретен абонатен план.
              </span>
            </PlanScopeBanner>
          )}

          {/* Stats grid */}
          <StatsGrid>
            <StatCard $soft={palette.infoSoft}>
              <StatLabel>Общ обем (портфейл)</StatLabel>
              <StatValue $color={palette.info}>{fmt(totalVolume)}</StatValue>
              <StatSub>{totalCount.toLocaleString()} транзакции</StatSub>
              {(queryPartnerId || queryPlan) && <StatSub style={{ color: palette.textSubtle, fontStyle: 'italic' }}>за цялата платформа</StatSub>}
            </StatCard>

            <StatCard $soft={palette.successSoft}>
              <StatLabel>Кешбек кредитиран</StatLabel>
              <StatValue $color={palette.success}>{fmt(cashback?.total ?? 0)}</StatValue>
              <StatSub>{(cashback?.count ?? 0).toLocaleString()} транзакции</StatSub>
              {(queryPartnerId || queryPlan) && <StatSub style={{ color: palette.textSubtle, fontStyle: 'italic' }}>за цялата платформа</StatSub>}
            </StatCard>

            <StatCard $soft={palette.purpleSoft}>
              <StatLabel>Плащания към абонати</StatLabel>
              <StatValue $color={palette.purple}>{fmt(withdrawals?.total ?? 0)}</StatValue>
              <StatSub>{(withdrawals?.count ?? 0).toLocaleString()} транзакции</StatSub>
              {(queryPartnerId || queryPlan) && <StatSub style={{ color: palette.textSubtle, fontStyle: 'italic' }}>за цялата платформа</StatSub>}
            </StatCard>

            <StatCard $soft={palette.tealSoft}>
              <StatLabel>Зареждания</StatLabel>
              <StatValue $color={palette.teal}>{fmt(topUps?.total ?? 0)}</StatValue>
              <StatSub>{(topUps?.count ?? 0).toLocaleString()} транзакции</StatSub>
              {(queryPartnerId || queryPlan) && <StatSub style={{ color: palette.textSubtle, fontStyle: 'italic' }}>за цялата платформа</StatSub>}
            </StatCard>

            <StatCard>
              <StatLabel>Оборот при партньори</StatLabel>
              <StatValue>{fmt(report.cashbackInvoices.turnoverTotal)}</StatValue>
              <StatSub>{report.cashbackInvoices.count} фактури</StatSub>
              {queryPlan && <StatSub style={{ color: palette.textSubtle, fontStyle: 'italic' }}>всички планове</StatSub>}
            </StatCard>

            <StatCard $soft={palette.accentSoft}>
              <StatLabel>Кешбек за фактуриране</StatLabel>
              <StatValue $color={palette.accent}>{fmt(report.cashbackInvoices.total)}</StatValue>
              <StatSub>{report.cashbackInvoices.count} {BG_PLURAL.select(report.cashbackInvoices.count) === 'one' ? 'фактура' : 'фактури'}</StatSub>
              {queryPlan && <StatSub style={{ color: palette.textSubtle, fontStyle: 'italic' }}>всички планове</StatSub>}
            </StatCard>

            <StatCard>
              <StatLabel>Марджин BoomCard</StatLabel>
              <StatValue>{fmt(report.cashbackInvoices.marginTotal)}</StatValue>
              <StatSub>
                {report.cashbackInvoices.turnoverTotal > 0
                  ? `${((report.cashbackInvoices.marginTotal / report.cashbackInvoices.turnoverTotal) * 100).toFixed(1)}% от оборота`
                  : '—'}
              </StatSub>
              {queryPlan && <StatSub style={{ color: palette.textSubtle, fontStyle: 'italic' }}>всички планове</StatSub>}
            </StatCard>
          </StatsGrid>

          {/* Period status summary — quick reference for which months are in range */}
          {report.periodStatuses.length > 0 && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <SectionTitle style={{ margin: 0 }}>Отчетни периоди в диапазона</SectionTitle>
                <Link to="/admin/finance/periods" style={{ fontSize: '0.8125rem', color: palette.accent, textDecoration: 'none', fontWeight: 600 }}>
                  Управление на периоди →
                </Link>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Период</Th>
                    <Th>Статус</Th>
                    <Th>Неплатени фактури</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.periodStatuses.map((p) => (
                    <tr key={p.month}>
                      <Td style={{ fontWeight: 600, color: palette.text }}>{p.month}</Td>
                      <Td>
                        {p.status === null
                          ? <PeriodStatusBadge $status="NO_RECORD">Без запис</PeriodStatusBadge>
                          : <PeriodStatusBadge $status={p.status}>{PERIOD_STATUS_LABELS[p.status] ?? p.status}</PeriodStatusBadge>
                        }
                      </Td>
                      <Td>
                        {p.pendingCount > 0 && (
                          <InvoiceStatusBadge $status="PENDING" style={{ marginRight: '0.375rem' }}>
                            Чакащи ×{p.pendingCount}
                          </InvoiceStatusBadge>
                        )}
                        {p.overdueCount > 0 && (
                          <InvoiceStatusBadge $status="OVERDUE">
                            Просрочени ×{p.overdueCount}
                          </InvoiceStatusBadge>
                        )}
                        {p.pendingCount === 0 && p.overdueCount === 0 && (
                          <span style={{ color: palette.textSubtle, fontSize: '0.8125rem' }}>—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {/* Per-partner breakdown (spec §6.4: partner dimension) */}
          <Card>
            <SectionTitle>
              Разбивка по партньор
              {queryPlan && (
                <span style={{ fontWeight: 400, fontSize: '0.8rem', color: palette.textSubtle, marginLeft: '0.5rem', fontStyle: 'italic' }}>
                  (фактурите по партньор не са филтрирани по план)
                </span>
              )}
            </SectionTitle>
            {report.partnerBreakdown.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: palette.textSubtle, margin: 0 }}>
                {queryPartnerId
                  ? 'Няма фактури или сканирания за избрания партньор в избрания период.'
                  : 'Няма партньорски данни за избрания период.'}
              </p>
            ) : (() => {
              const totals = report.partnerBreakdown.reduce(
                (acc, r) => ({ turnover: acc.turnover + r.turnover, cashback: acc.cashback + r.cashback, margin: acc.margin + r.margin }),
                { turnover: 0, cashback: 0, margin: 0 },
              );
              return (
                <Table>
                  <thead>
                    <tr>
                      <Th>Партньор</Th>
                      <Th>Град</Th>
                      <ThRight>Оборот</ThRight>
                      <ThRight>Договорен %</ThRight>
                      <ThRight>Кешбек</ThRight>
                      <ThRight>Марджин</ThRight>
                      <ThRight>Фактури</ThRight>
                      <Th>Статус на фактури</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.partnerBreakdown.map((row) => (
                      <tr key={row.partnerId}>
                        <TdBold>{row.partnerName}</TdBold>
                        <Td>{row.partnerCity ?? '—'}</Td>
                        <TdRight style={{ fontWeight: 600, color: palette.text }}>{fmt(row.turnover)}</TdRight>
                        <TdRight>
                          {row.contractedRate != null ? `${row.contractedRate}%` : '—'}
                          {row.ratesVary && (
                            <span style={{ fontSize: '0.65rem', color: palette.textSubtle, marginLeft: '0.25rem' }}>
                              (различни)
                            </span>
                          )}
                        </TdRight>
                        <TdRight>{fmt(row.cashback)}</TdRight>
                        <TdRight>{fmt(row.margin)}</TdRight>
                        <TdRight>{row.invoiceCount}</TdRight>
                        <Td>
                          {Object.entries(row.statuses).map(([st, count]) => (
                            <span key={st} style={{ marginRight: '0.375rem' }}>
                              <InvoiceStatusBadge $status={st}>
                                {INVOICE_STATUS_LABELS[st] ?? st} ×{count}
                              </InvoiceStatusBadge>
                            </span>
                          ))}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                  {report.partnerBreakdown.length > 1 && (
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${palette.border}` }}>
                        <td colSpan={2} style={{ padding: '0.625rem 0.75rem', fontWeight: 700, fontSize: '0.8125rem', color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Общо</td>
                        <TdRight style={{ fontWeight: 700, color: palette.text }}>{fmt(totals.turnover)}</TdRight>
                        <TdRight>—</TdRight>
                        <TdRight style={{ fontWeight: 700, color: palette.text }}>{fmt(totals.cashback)}</TdRight>
                        <TdRight style={{ fontWeight: 700, color: palette.text }}>{fmt(totals.margin)}</TdRight>
                        <TdRight style={{ fontWeight: 700, color: palette.text }}>
                          {report.partnerBreakdown.reduce((s, r) => s + r.invoiceCount, 0)}
                        </TdRight>
                        <td style={{ padding: '0.625rem 0.75rem' }} />
                      </tr>
                    </tfoot>
                  )}
                </Table>
              );
            })()}
          </Card>

          {/* Subscription plan breakdown (spec §6.4: абонатен план dimension) */}
          {(report.planBreakdown.length > 0 || queryPlan) && (
            <Card>
              <SectionTitle>
                Разбивка по абонатен план
                {queryPlan && (
                  <span style={{ fontWeight: 400, fontSize: '0.8rem', color: palette.textSubtle, marginLeft: '0.5rem', fontStyle: 'italic' }}>
                    (филтрирано по план — фактурите и портфейлът показват всички планове)
                  </span>
                )}
              </SectionTitle>
              {report.planBreakdown.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: palette.textSubtle, margin: 0 }}>
                  Няма сканирания за план „{PLAN_LABELS[queryPlan] ?? queryPlan}" в избрания период.
                </p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>План</Th>
                      <ThRight>Брой сканирания</ThRight>
                      <ThRight>Кешбек</ThRight>
                      <ThRight>Оборот</ThRight>
                    </tr>
                  </thead>
                  <tbody>
                    {report.planBreakdown.map((row: PlanBreakdownRow) => (
                      <tr key={row.plan}>
                        <TdBold>{PLAN_LABELS[row.plan] ?? row.plan}</TdBold>
                        <TdRight>{row.scanCount.toLocaleString()}</TdRight>
                        <TdRight>{fmt(row.cashback)}</TdRight>
                        <TdRight>{fmt(row.turnover)}</TdRight>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}

          {/* Wallet transaction breakdown (spec §6.4: payments dimension) */}
          <Card>
            <SectionTitle>
              Разбивка на портфейлни транзакции
              {(queryPartnerId || queryPlan) && (
                <span style={{ fontWeight: 400, fontSize: '0.8rem', color: palette.textSubtle, marginLeft: '0.5rem', fontStyle: 'italic' }}>
                  (за цялата платформа —{queryPartnerId ? ' не са филтрирани по партньор' : ''}{queryPartnerId && queryPlan ? ',' : ''}{queryPlan ? ' не са филтрирани по план' : ''})
                </span>
              )}
            </SectionTitle>
            <Table>
              <thead>
                <tr>
                  <Th>Тип</Th>
                  <Th>Описание</Th>
                  <ThRight>Общо</ThRight>
                  <ThRight>Брой</ThRight>
                  <ThRight>Средно</ThRight>
                </tr>
              </thead>
              <tbody>
                {Object.entries(walletTx).map(([type, stats]) => (
                  <tr key={type}>
                    <Td><TypeBadge>{type.replace(/_/g, ' ')}</TypeBadge></Td>
                    <Td style={{ color: palette.textMuted }}>{WALLET_TYPE_LABELS[type] ?? type}</Td>
                    <TdRight style={{ fontWeight: 600, color: palette.text }}>{fmt(stats.total)}</TdRight>
                    <TdRight>{stats.count.toLocaleString()}</TdRight>
                    <TdRight>{stats.count > 0 ? fmt(stats.total / stats.count) : '—'}</TdRight>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {isLoading && !report && (
        <div style={{ color: palette.textSubtle, fontSize: '0.9375rem', textAlign: 'center', paddingTop: '3rem' }}>
          Зареждане…
        </div>
      )}

      {error && !isLoading && (
        <div style={{ color: palette.danger, fontSize: '0.9375rem', textAlign: 'center', background: palette.dangerSoft, border: `1px solid ${palette.danger}`, borderRadius: '0.75rem', padding: '1.25rem' }}>
          Грешка при зареждане на справката. Проверете връзката и опитайте отново.
        </div>
      )}
    </PageShell>
  );
}
