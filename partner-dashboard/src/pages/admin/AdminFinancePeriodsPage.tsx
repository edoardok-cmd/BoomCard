import { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { palette } from '../../styles/adminTheme';
import {
  adminFinanceService,
  PeriodRow,
  ReportingPeriodRow,
  ReportingPeriodStatus,
} from '../../services/adminFinance.service';


const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const Controls = styled.div`display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;`;
const YearPicker = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.surface}; color: ${palette.text}; outline: none; cursor: pointer;`;
const ExportBtn = styled.button`
  padding: 0.5rem 1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600;
  border: 1px solid ${palette.border}; background: ${palette.surface}; color: ${palette.textMuted};
  cursor: pointer; white-space: nowrap;
  &:hover { border-color: ${palette.accent}; color: ${palette.accent}; }
  &:disabled { opacity: 0.5; cursor: default; }
`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; overflow: hidden;`;
const Table = styled.table`width: 100%; border-collapse: collapse;`;
const Th = styled.th`text-align: left; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${palette.textSubtle}; padding: 0.875rem 1.25rem; border-bottom: 1px solid ${palette.border}; background: ${palette.bg};`;
const Td = styled.td`padding: 0.875rem 1.25rem; border-bottom: 1px solid ${palette.border}; font-size: 0.875rem; color: ${palette.textMuted}; vertical-align: middle;`;
const MonthLink = styled(Link)`font-weight: 700; font-size: 0.9375rem; color: ${palette.text}; text-decoration: none; &:hover { color: ${palette.accent}; text-decoration: underline; }`;
const AmountLabel = styled.span`font-weight: 700; font-size: 0.9375rem; color: ${palette.text};`;

const StatusPill = styled.span<{ $color: string; $bg: string }>`
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-size: 0.7rem; font-weight: 700; border-radius: 0.375rem;
  padding: 0.125rem 0.45rem;
  background: ${({ $bg }) => $bg}; color: ${({ $color }) => $color};
  margin-right: 0.25rem;
`;

const LifecycleBadge = styled.span<{ $status: ReportingPeriodStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'LOCKED':     return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'INVOICED':   return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'FOR_REVIEW': return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      default:           return `background: ${palette.infoSoft}; color: ${palette.info};`;
    }
  }}
`;

const UnbilledBadge = styled.span`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  background: ${palette.warningSoft}; color: ${palette.warning};
`;

const AuditLine = styled.div`font-size: 0.7rem; color: ${palette.textSubtle}; margin-top: 0.25rem;`;

/* Warning shown in the lifecycle cell when a LOCKED or INVOICED period is missing
   one of the prior audit timestamps (openedAt / reviewedAt) — indicates the period
   was advanced through the workflow before full lifecycle enforcement was in place,
   so the audit trail is incomplete and that historical record can't be fully reconstructed. */
const AuditWarning = styled.div`
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  background: ${palette.dangerSoft}; color: ${palette.danger};
  border-radius: 0.25rem; padding: 0.1rem 0.4rem; margin-top: 0.375rem;
`;

const AdvanceBtn = styled.button`
  padding: 0.3rem 0.7rem; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 600;
  border: 1px solid ${palette.border}; background: ${palette.bg}; color: ${palette.textMuted};
  cursor: pointer; white-space: nowrap;
  &:hover { border-color: ${palette.accent}; color: ${palette.accent}; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const GenerateLink = styled(Link)`
  display: inline-block; padding: 0.3rem 0.7rem; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 600;
  border: 1px solid ${palette.warning}; background: ${palette.warningSoft}; color: ${palette.warning};
  text-decoration: none; white-space: nowrap;
  &:hover { background: ${palette.warning}; color: ${palette.onAccent}; }
`;

const ProgressBar = styled.div<{ $pct: number }>`
  height: 6px; border-radius: 3px; background: ${palette.border}; margin-top: 0.375rem; overflow: hidden;
  &::after {
    content: ''; display: block; height: 100%;
    width: ${({ $pct }) => Math.min(100, $pct)}%;
    background: ${palette.success}; border-radius: 3px;
  }
`;

const EmptyState = styled.div`padding: 3rem; text-align: center; color: ${palette.textSubtle}; font-size: 0.9375rem;`;

const NoBadge = styled.span`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  background: ${palette.surfaceAlt}; color: ${palette.textMuted};
`;

const AccentAdvanceBtn = styled(AdvanceBtn)`
  border-color: ${palette.success}; color: ${palette.success}; background: ${palette.successSoft};
  &:hover { background: ${palette.success}; color: ${palette.onAccent}; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const CurrentMonthBanner = styled.div`
  display: flex; align-items: center; gap: 1rem;
  padding: 1rem 1.25rem; margin-bottom: 1.5rem;
  background: ${palette.warningSoft}; border: 1px solid ${palette.warningBorder};
  border-left: 3px solid ${palette.warning}; border-radius: 0.75rem;
`;
const BannerText = styled.div`flex: 1; font-size: 0.9rem; color: ${palette.text};`;
const BannerOpenBtn = styled.button`
  flex-shrink: 0; padding: 0.5rem 0.875rem; background: ${palette.text}; color: ${palette.onAccent};
  border: none; border-radius: 0.5rem; font-size: 0.8125rem; font-weight: 600; cursor: pointer;
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: default; }
`;
/* Stronger banner for past-month attention (red border) — used when there are
   completed months with unbilled scans waiting for invoice generation. */
const PastMonthsBanner = styled.div`
  display: flex; align-items: flex-start; gap: 1rem;
  padding: 1rem 1.25rem; margin-bottom: 1.5rem;
  background: ${palette.dangerSoft}; border: 1px solid ${palette.dangerBorder};
  border-left: 3px solid ${palette.danger}; border-radius: 0.75rem;
`;

/* ── Confirmation modal ─────────────────────────────────────────────────────── */
const Overlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
`;
const Modal = styled.div`
  background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.875rem;
  padding: 1.75rem; width: 100%; max-width: 440px; box-shadow: 0 8px 32px rgba(0,0,0,0.12);
`;
const ModalTitle = styled.h2`font-size: 1.125rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.5rem;`;
const ModalBody  = styled.p`font-size: 0.9rem; color: ${palette.textMuted}; margin: 0 0 0.25rem; line-height: 1.5;`;
const ModalWarn  = styled.p`
  font-size: 0.825rem; color: ${palette.danger}; background: ${palette.dangerSoft};
  border-radius: 0.5rem; padding: 0.625rem 0.875rem; margin: 0.875rem 0 0; line-height: 1.5;
`;
const ModalActions = styled.div`display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.25rem;`;
const ModalCancel  = styled.button`
  padding: 0.5rem 1.1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600;
  border: 1px solid ${palette.border}; background: ${palette.bg}; color: ${palette.textMuted}; cursor: pointer;
  &:hover { border-color: ${palette.textMuted}; }
`;
const ModalConfirm = styled.button<{ $danger?: boolean }>`
  padding: 0.5rem 1.1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600;
  border: none; cursor: pointer;
  background: ${({ $danger }) => ($danger ? palette.danger : palette.accent)};
  color: ${palette.onAccent};
  &:hover { opacity: 0.88; }
  &:disabled { opacity: 0.5; cursor: default; }
`;
const NotesTextarea = styled.textarea`
  width: 100%; box-sizing: border-box; padding: 0.625rem 0.875rem;
  border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem;
  background: ${palette.bg}; color: ${palette.text}; resize: vertical; min-height: 5rem;
  font-family: inherit; outline: none; margin-top: 0.75rem;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;
const EditNotesBtn = styled.button`
  background: none; border: none; padding: 0; font-size: 0.7rem; font-weight: 600;
  color: ${palette.textSubtle}; cursor: pointer; text-decoration: underline; text-underline-offset: 2px;
  &:hover { color: ${palette.accent}; }
`;
const PeriodNotesText = styled.div`
  font-size: 0.75rem; color: ${palette.textMuted}; font-style: italic;
  margin-top: 0.375rem; max-width: 22ch; word-break: break-word;
`;

/* ── Constants ──────────────────────────────────────────────────────────────── */
const CURRENT_YEAR = new Date().getFullYear();
const now = new Date();
const CURRENT_MONTH_STR = `${CURRENT_YEAR}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const MONTH_NAMES: Record<string, string> = {
  '01': 'Януари', '02': 'Февруари', '03': 'Март', '04': 'Април',
  '05': 'Май', '06': 'Юни', '07': 'Юли', '08': 'Август',
  '09': 'Септември', '10': 'Октомври', '11': 'Ноември', '12': 'Декември',
};

const LIFECYCLE_LABELS: Record<ReportingPeriodStatus, string> = {
  OPEN:       'Отворен',
  FOR_REVIEW: 'За проверка',
  LOCKED:     'Заключен',
  INVOICED:   'Фактуриран',
};

const NEXT_STATUS: Partial<Record<ReportingPeriodStatus, ReportingPeriodStatus>> = {
  OPEN:       'FOR_REVIEW',
  FOR_REVIEW: 'LOCKED',
  LOCKED:     'INVOICED',
};

const IRREVERSIBLE_STATUSES = new Set<ReportingPeriodStatus>(['LOCKED', 'INVOICED']);

const IRREVERSIBLE_WARN: Partial<Record<ReportingPeriodStatus, string>> = {
  LOCKED:   'След заключване данните за фактуриране не могат да се променят свободно. Тази операция не може да бъде отменена.',
  INVOICED: 'След фактуриране периодът е окончателно приключен. Тази операция не може да бъде отменена.',
};

/** A period row that may originate from payment aggregation, reporting-periods, or both. */
interface MergedRow extends PeriodRow {
  lifecycleOnly: boolean;
}

function monthLabel(m: string) {
  const [year, month] = m.split('-');
  return `${MONTH_NAMES[month] ?? month} ${year}`;
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('bg-BG', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface ConfirmState {
  month: string;
  nextStatus: ReportingPeriodStatus;
  row: MergedRow;
  rp: ReportingPeriodRow;
}

export default function AdminFinancePeriodsPage() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [deleteMonth, setDeleteMonth] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notesModal, setNotesModal] = useState<{ month: string; current: string } | null>(null);
  const [notesValue, setNotesValue] = useState('');

  const { data: periodsData, isLoading: periodsLoading } = useQuery({
    queryKey: ['admin-finance-periods', year],
    queryFn: () => adminFinanceService.getPeriods(year),
  });

  const { data: rpData, isLoading: rpLoading } = useQuery({
    queryKey: ['admin-finance-reporting-periods', year],
    queryFn: () => adminFinanceService.getReportingPeriods(year),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-finance-periods'] });
    queryClient.invalidateQueries({ queryKey: ['admin-finance-reporting-periods'] });
    queryClient.invalidateQueries({ queryKey: ['admin-finance-invoices'] });
  };

  const advanceMutation = useMutation({
    mutationFn: ({ month, status }: { month: string; status: ReportingPeriodStatus }) =>
      adminFinanceService.advanceReportingPeriod(month, status),
    onSuccess: (_, vars) => {
      toast.success(`Период ${vars.month} преместен в: ${LIFECYCLE_LABELS[vars.status]}`);
      setConfirmState(null);
      invalidate();
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при промяна на статус';
      toast.error(msg);
      setConfirmState(null);
    },
  });

  const ensureMutation = useMutation({
    mutationFn: (month: string) => adminFinanceService.upsertReportingPeriod(month),
    onSuccess: (_, month) => {
      toast.success(`Период ${month} е създаден`);
      invalidate();
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при създаване на период';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (month: string) => adminFinanceService.deleteReportingPeriod(month),
    onSuccess: (_, month) => {
      toast.success(`Период ${month} е изтрит`);
      setDeleteMonth(null);
      invalidate();
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при изтриване';
      toast.error(msg);
      setDeleteMonth(null);
    },
  });

  const notesMutation = useMutation({
    mutationFn: ({ month, notes }: { month: string; notes: string }) =>
      adminFinanceService.updatePeriodNotes(month, notes),
    onSuccess: () => {
      toast.success('Бележките са запазени');
      setNotesModal(null);
      invalidate();
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.error ?? 'Грешка при запазване';
      toast.error(msg);
    },
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      await adminFinanceService.exportPeriods({ year, format: exportFormat });
    } catch {
      toast.error('Грешка при експорт');
    } finally {
      setExporting(false);
    }
  };

  const paymentRows: PeriodRow[] = periodsData?.data ?? [];
  const rpRows: ReportingPeriodRow[] = rpData?.data ?? [];
  const rpByMonth = new Map(rpRows.map((r) => [r.month, r]));
  const isLoading = periodsLoading || rpLoading;

  // Merge: payment rows + any lifecycle-only periods (no payments/scans for that month).
  const paymentMonths = new Set(paymentRows.map(r => r.month));
  const lifecycleOnlyRows: MergedRow[] = rpRows
    .filter(rp => !paymentMonths.has(rp.month))
    .map(rp => ({
      month: rp.month, total: 0, pending: 0, paid: 0, overdue: 0, count: 0,
      hasUnbilledScans: false, lifecycleOnly: true,
    }));

  // For the current year, inject every month from January through the current
  // calendar month that has no payment row and no reporting-period row, so the
  // admin always sees the full Jan–now grid and can open any period immediately.
  const allMonths = new Set([...paymentMonths, ...rpRows.map(r => r.month)]);
  const injectedRows: MergedRow[] = [];
  if (year === CURRENT_YEAR) {
    const currentMonthNum = new Date().getMonth() + 1;
    for (let m = 1; m <= currentMonthNum; m++) {
      const monthStr = `${CURRENT_YEAR}-${String(m).padStart(2, '0')}`;
      if (!allMonths.has(monthStr)) {
        injectedRows.push({ month: monthStr, total: 0, pending: 0, paid: 0, overdue: 0, count: 0, hasUnbilledScans: false, lifecycleOnly: true });
      }
    }
  }

  const rows: MergedRow[] = [
    ...paymentRows.map(r => ({ ...r, lifecycleOnly: false })),
    ...lifecycleOnlyRows,
    ...injectedRows,
  ].sort((a, b) => b.month.localeCompare(a.month));

  // Past months (strictly before current month) that still have unbilled scans —
  // these silently slip through the per-row "Генерирай фактури →" CTA when scrolling,
  // so we surface a top-of-page banner so finance can spot them at a glance.
  // Spec §6.3: month must be closeable; unbilled past months block period closure.
  const pastUnbilled = rows.filter(r =>
    r.month < CURRENT_MONTH_STR && r.hasUnbilledScans && r.count === 0 && !rpByMonth.get(r.month)
  );

  // Periods with incomplete audit trail (LOCKED/INVOICED but missing earlier timestamps,
  // or LOCKED with a null lockedAt — a schema invariant violation that should still surface).
  // Surface count so finance can prioritise reviewing/backfilling these records.
  // Mirrors the per-row warning logic: a LOCKED or INVOICED record must have all three
  // prior timestamps (openedAt, reviewedAt, lockedAt).  A LOCKED record with null lockedAt
  // is a schema-invariant violation but we still want it visible.
  const incompleteAuditPeriods = rpRows.filter(rp => {
    const reachedLocked = rp.status === 'LOCKED' || rp.status === 'INVOICED';
    return reachedLocked && (!rp.openedAt || !rp.reviewedAt || !rp.lockedAt);
  });

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Финанси</Eyebrow>
          <PageTitle>Отчетни периоди</PageTitle>
          <PageSubtitle>Месечни суми по партньори и жизнен цикъл на периодите</PageSubtitle>
        </TitleBlock>
        <Controls>
          <div style={{ display: 'flex', gap: 0 }}>
            <ExportBtn
              style={{ borderRadius: '0.5rem 0 0 0.5rem', background: exportFormat === 'xlsx' ? palette.accent : palette.surface, color: exportFormat === 'xlsx' ? '#fff' : palette.textMuted, borderRight: 'none' }}
              onClick={() => setExportFormat('xlsx')} disabled={exporting}
            >XLSX</ExportBtn>
            <ExportBtn
              style={{ borderRadius: '0 0.5rem 0.5rem 0', background: exportFormat === 'csv' ? palette.accent : palette.surface, color: exportFormat === 'csv' ? '#fff' : palette.textMuted }}
              onClick={() => setExportFormat('csv')} disabled={exporting}
            >CSV</ExportBtn>
          </div>
          <ExportBtn onClick={handleExport} disabled={exporting || isLoading || rows.length === 0}>
            {exporting ? 'Експортиране…' : '↓ Експорт'}
          </ExportBtn>
          <YearPicker value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </YearPicker>
        </Controls>
      </PageHeader>

      {/* Current-month no-record banner */}
      {year === CURRENT_YEAR && !rpByMonth.get(CURRENT_MONTH_STR) && !isLoading && (
        <CurrentMonthBanner>
          <BannerText>
            <strong>Текущият месец ({CURRENT_MONTH_STR}) няма отчетен период.</strong>{' '}
            Отворете периода, за да започнете проследяването на жизнения цикъл.
          </BannerText>
          <BannerOpenBtn
            disabled={ensureMutation.isPending}
            onClick={() => ensureMutation.mutate(CURRENT_MONTH_STR)}
          >
            {ensureMutation.isPending ? 'Отваряне…' : 'Отвори период'}
          </BannerOpenBtn>
        </CurrentMonthBanner>
      )}

      {/* Past months with unbilled scans — must generate invoices and close those periods */}
      {pastUnbilled.length > 0 && !isLoading && (
        <PastMonthsBanner>
          <span style={{ fontSize: '1.1rem', color: palette.danger }}>⚠</span>
          <BannerText>
            <strong>{pastUnbilled.length} {pastUnbilled.length === 1 ? 'минал месец' : 'минали месеца'} с неофактурирани сканирания:</strong>{' '}
            {pastUnbilled.map((p, i) => (
              <span key={p.month}>
                {i > 0 && ', '}
                <Link to={`/admin/finance/invoices?month=${p.month}`} style={{ color: palette.danger, fontWeight: 600 }}>
                  {monthLabel(p.month)}
                </Link>
              </span>
            ))}
            . Генерирайте фактури и затворете периодите, за да приключите отчетността.
          </BannerText>
        </PastMonthsBanner>
      )}

      {/* Incomplete audit trail — periods that bypassed OPEN/FOR_REVIEW before enforcement */}
      {incompleteAuditPeriods.length > 0 && !isLoading && (
        <PastMonthsBanner>
          <span style={{ fontSize: '1.1rem', color: palette.danger }}>⚠</span>
          <BannerText>
            <strong>{incompleteAuditPeriods.length} {incompleteAuditPeriods.length === 1 ? 'период' : 'периода'} с непълен одит:</strong>{' '}
            {incompleteAuditPeriods.map((rp, i) => (
              <span key={rp.month}>
                {i > 0 && ', '}
                <strong>{monthLabel(rp.month)}</strong>
              </span>
            ))}
            . Тези записи са преминали в {LIFECYCLE_LABELS.LOCKED}/{LIFECYCLE_LABELS.INVOICED} без преминаване през всички междинни статуси.
            Бъдещите периоди следват пълния жизнен цикъл (Отворен → За проверка → Заключен → Фактуриран).
          </BannerText>
        </PastMonthsBanner>
      )}

      <Card>
        {isLoading ? (
          <EmptyState>Зареждане…</EmptyState>
        ) : !rows.length ? (
          <EmptyState>Няма данни за {year}.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Период</Th>
                <Th>Общо задължение</Th>
                <Th>Партньори</Th>
                <Th>Статус плащания</Th>
                <Th>Жизнен цикъл</Th>
                <Th>Действие</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: MergedRow) => {
                const paidPct = row.count > 0 ? (row.paid / row.count) * 100 : 0;
                const rp = rpByMonth.get(row.month);
                const nextStatus = rp ? NEXT_STATUS[rp.status] : undefined;

                return (
                  <tr key={row.month}>
                    {/* Period — links to invoices filtered by this month */}
                    <Td>
                      <MonthLink to={`/admin/finance/invoices?month=${row.month}`}>
                        {monthLabel(row.month)}
                      </MonthLink>
                    </Td>

                    {/* Total obligation */}
                    <Td>
                      {row.lifecycleOnly || (row.hasUnbilledScans && row.count === 0) ? (
                        <span style={{ fontSize: '0.8125rem', color: palette.textSubtle, fontStyle: 'italic' }}>
                          Няма фактури
                        </span>
                      ) : (
                        <AmountLabel>
                          {row.total.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 })}
                        </AmountLabel>
                      )}
                    </Td>

                    {/* Partner count */}
                    <Td style={{ color: palette.text, fontWeight: 600 }}>
                      {row.count > 0 ? row.count : '—'}
                    </Td>

                    {/* Payment status pills + partial-coverage warning */}
                    <Td>
                      {row.lifecycleOnly ? (
                        <span style={{ fontSize: '0.8125rem', color: palette.textSubtle }}>—</span>
                      ) : row.hasUnbilledScans && row.count === 0 ? (
                        <UnbilledBadge>Сканирания без фактури</UnbilledBadge>
                      ) : (
                        <div>
                          {row.paid > 0 && (
                            <StatusPill $color={palette.success} $bg={palette.successSoft}>{row.paid} платено</StatusPill>
                          )}
                          {row.pending > 0 && (
                            <StatusPill $color={palette.warning} $bg={palette.warningSoft}>{row.pending} чака</StatusPill>
                          )}
                          {row.overdue > 0 && (
                            <StatusPill $color={palette.danger} $bg={palette.dangerSoft}>{row.overdue} просрочено</StatusPill>
                          )}
                          {/* Partial-coverage: newer approved scans are not yet invoiced */}
                          {row.hasUnbilledScans && row.count > 0 && (
                            <UnbilledBadge style={{ marginTop: '0.25rem', display: 'block' }}>
                              ⚠ Нови сканирания без фактури
                            </UnbilledBadge>
                          )}
                          {row.count > 0 && <ProgressBar $pct={paidPct} />}
                        </div>
                      )}
                    </Td>

                    {/* Lifecycle badge + 4-state audit trail with resolved admin names */}
                    <Td>
                      {rp ? (() => {
                        // Detect incomplete audit trail: a LOCKED or INVOICED period must have
                        // passed through OPEN, FOR_REVIEW, and LOCKED per the spec's enforced
                        // lifecycle.  Any missing prior timestamp means the record was advanced
                        // before full enforcement was in place — flag it so admins know the audit
                        // trail is partial.  A LOCKED record without lockedAt is a schema-invariant
                        // violation but is still flagged via the same badge.
                        const reachedLocked = rp.status === 'LOCKED' || rp.status === 'INVOICED';
                        const missingOpened = reachedLocked && !rp.openedAt;
                        const missingReviewed = reachedLocked && !rp.reviewedAt;
                        const missingLocked = reachedLocked && !rp.lockedAt;
                        const missingSteps: string[] = [];
                        if (missingOpened) missingSteps.push('Отворен');
                        if (missingReviewed) missingSteps.push('За проверка');
                        if (missingLocked) missingSteps.push('Заключен');
                        return (
                          <>
                            <LifecycleBadge $status={rp.status}>
                              {LIFECYCLE_LABELS[rp.status]}
                            </LifecycleBadge>
                            {rp.openedAt && (
                              <AuditLine>
                                Отворен: {fmtDateTime(rp.openedAt)}
                                {rp.openedByName && ` · ${rp.openedByName}`}
                              </AuditLine>
                            )}
                            {rp.reviewedAt && (
                              <AuditLine>
                                За проверка: {fmtDateTime(rp.reviewedAt)}
                                {rp.reviewedByName && ` · ${rp.reviewedByName}`}
                              </AuditLine>
                            )}
                            {rp.lockedAt && (
                              <AuditLine>
                                Заключен: {fmtDateTime(rp.lockedAt)}
                                {rp.lockedByName && ` · ${rp.lockedByName}`}
                              </AuditLine>
                            )}
                            {rp.invoicedAt && (
                              <AuditLine>
                                Фактуриран: {fmtDateTime(rp.invoicedAt)}
                                {rp.invoicedByName && ` · ${rp.invoicedByName}`}
                              </AuditLine>
                            )}
                            {missingSteps.length > 0 && (
                              <AuditWarning title={`Жизненият цикъл не е минал през: ${missingSteps.join(', ')}. Записът е създаден преди въвеждането на пълната проследимост.`}>
                                ⚠ Непълен одит ({missingSteps.join(', ')})
                              </AuditWarning>
                            )}
                            {rp.notes && (
                              <PeriodNotesText title={rp.notes}>📝 {rp.notes}</PeriodNotesText>
                            )}
                            <EditNotesBtn
                              onClick={() => {
                                setNotesValue(rp.notes ?? '');
                                setNotesModal({ month: rp.month, current: rp.notes ?? '' });
                              }}
                            >
                              {rp.notes ? 'редактирай бележка' : '+ добави бележка'}
                            </EditNotesBtn>
                          </>
                        );
                      })() : (
                        <NoBadge>Без запис</NoBadge>
                      )}
                    </Td>

                    {/* Action */}
                    <Td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', alignItems: 'flex-start' }}>
                        {row.hasUnbilledScans && row.count === 0 && !rp ? (
                          <GenerateLink to={`/admin/finance/invoices?month=${row.month}`}>
                            Генерирай фактури →
                          </GenerateLink>
                        ) : !rp ? (
                          <AdvanceBtn
                            disabled={ensureMutation.isPending}
                            onClick={() => ensureMutation.mutate(row.month)}
                          >
                            Отвори период
                          </AdvanceBtn>
                        ) : nextStatus ? (
                          <>
                            {/* OPEN periods with no invoices: show disabled button with tooltip instead of hiding */}
                            {(row.count === 0 && nextStatus === 'FOR_REVIEW') ? (
                              <AdvanceBtn
                                disabled
                                title="Генерирайте фактури за периода, преди да го изпратите за преглед"
                                style={{ opacity: 0.45, cursor: 'not-allowed' }}
                              >
                                → {LIFECYCLE_LABELS[nextStatus]}
                              </AdvanceBtn>
                            ) : (() => {
                              const allPaid = rp.status === 'LOCKED' && row.count > 0 && row.paid === row.count;
                              const Btn = allPaid ? AccentAdvanceBtn : AdvanceBtn;
                              return (
                                <Btn
                                  disabled={advanceMutation.isPending}
                                  onClick={() => setConfirmState({ month: row.month, nextStatus, row, rp })}
                                  title={allPaid ? 'Всички фактури са платени — финализирай периода' : undefined}
                                >
                                  → {LIFECYCLE_LABELS[nextStatus]}
                                </Btn>
                              );
                            })()}
                            {/* Show generate link whenever there are unbilled scans (covers both 0-invoice and partial-coverage cases) */}
                            {row.hasUnbilledScans && (
                              <GenerateLink to={`/admin/finance/invoices?month=${row.month}`}>
                                Генерирай фактури →
                              </GenerateLink>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: '0.8125rem', color: palette.textSubtle }}>Финализиран</span>
                        )}
                        {/* Delete — only lifecycle-only OPEN/FOR_REVIEW periods */}
                        {rp && row.lifecycleOnly && (rp.status === 'OPEN' || rp.status === 'FOR_REVIEW') && (
                          <button
                            style={{ padding: '0.3rem 0.7rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 600, border: `1px solid ${palette.danger}`, background: 'transparent', color: palette.danger, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            disabled={deleteMutation.isPending}
                            onClick={() => setDeleteMonth(row.month)}
                          >
                            Изтрий период
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Confirmation modal — replaces window.confirm() for lifecycle transitions */}
      {confirmState && (
        <Overlay onClick={() => !advanceMutation.isPending && setConfirmState(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Промяна на статус</ModalTitle>
            <ModalBody>
              <strong>{monthLabel(confirmState.month)}</strong>
              {' '}→{' '}
              <strong>{LIFECYCLE_LABELS[confirmState.nextStatus]}</strong>
            </ModalBody>
            {confirmState.row.count > 0 && (
              <ModalBody>
                Засяга <strong>{confirmState.row.count} партньора</strong> с общо{' '}
                <strong>
                  {confirmState.row.total.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 })}
                </strong>{' '}задължение.
              </ModalBody>
            )}
            {IRREVERSIBLE_STATUSES.has(confirmState.nextStatus) && (
              <ModalWarn>
                ⚠ {IRREVERSIBLE_WARN[confirmState.nextStatus]}
              </ModalWarn>
            )}
            <ModalActions>
              <ModalCancel onClick={() => setConfirmState(null)} disabled={advanceMutation.isPending}>
                Отказ
              </ModalCancel>
              <ModalConfirm
                $danger={IRREVERSIBLE_STATUSES.has(confirmState.nextStatus)}
                disabled={advanceMutation.isPending}
                onClick={() =>
                  advanceMutation.mutate({ month: confirmState.month, status: confirmState.nextStatus })
                }
              >
                {advanceMutation.isPending ? 'Запазване…' : 'Потвърди'}
              </ModalConfirm>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Period notes modal */}
      {notesModal && (
        <Overlay onClick={() => !notesMutation.isPending && setNotesModal(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Бележки към период</ModalTitle>
            <ModalBody>{monthLabel(notesModal.month)}</ModalBody>
            <NotesTextarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Вътрешни бележки за периода…"
              autoFocus
            />
            <ModalActions>
              <ModalCancel onClick={() => setNotesModal(null)} disabled={notesMutation.isPending}>
                Отказ
              </ModalCancel>
              <ModalConfirm
                disabled={notesMutation.isPending}
                onClick={() => notesMutation.mutate({ month: notesModal.month, notes: notesValue })}
              >
                {notesMutation.isPending ? 'Запазване…' : 'Запази'}
              </ModalConfirm>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Confirmation modal — delete lifecycle-only period */}
      {deleteMonth && (
        <Overlay onClick={() => !deleteMutation.isPending && setDeleteMonth(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Изтриване на период</ModalTitle>
            <ModalBody>
              Сигурни ли сте, че искате да изтриете период{' '}
              <strong>{monthLabel(deleteMonth)}</strong>?
            </ModalBody>
            <ModalWarn>
              ⚠ Периодът ще бъде премахнат от системата. Действието е необратимо.
            </ModalWarn>
            <ModalActions>
              <ModalCancel onClick={() => setDeleteMonth(null)} disabled={deleteMutation.isPending}>
                Отказ
              </ModalCancel>
              <ModalConfirm $danger disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteMonth)}>
                {deleteMutation.isPending ? 'Изтриване…' : 'Изтрий'}
              </ModalConfirm>
            </ModalActions>
          </Modal>
        </Overlay>
      )}
    </PageShell>
  );
}
