import { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  adminFinanceService,
  PeriodRow,
  ReportingPeriodRow,
  ReportingPeriodStatus,
} from '../../services/adminFinance.service';

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
  &:hover { background: ${palette.warning}; color: #fff; }
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
  color: #fff;
  &:hover { opacity: 0.88; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

/* ── Constants ──────────────────────────────────────────────────────────────── */
const CURRENT_YEAR = new Date().getFullYear();
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
  row: PeriodRow;
  rp: ReportingPeriodRow;
}

export default function AdminFinancePeriodsPage() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [exporting, setExporting] = useState(false);

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

  const handleExport = async () => {
    setExporting(true);
    try {
      await adminFinanceService.exportPeriods({ year });
    } catch {
      toast.error('Грешка при експорт');
    } finally {
      setExporting(false);
    }
  };

  const rows = periodsData?.data ?? [];
  const rpByMonth = new Map((rpData?.data ?? []).map((r: ReportingPeriodRow) => [r.month, r]));
  const isLoading = periodsLoading || rpLoading;

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Финанси</Eyebrow>
          <PageTitle>Отчетни периоди</PageTitle>
          <PageSubtitle>Месечни суми по партньори и жизнен цикъл на периодите</PageSubtitle>
        </TitleBlock>
        <Controls>
          <ExportBtn onClick={handleExport} disabled={exporting || isLoading || rows.length === 0}>
            {exporting ? 'Експортиране…' : '↓ Експорт XLSX'}
          </ExportBtn>
          <YearPicker value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </YearPicker>
        </Controls>
      </PageHeader>

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
              {rows.map((row: PeriodRow) => {
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
                      {row.hasUnbilledScans && row.count === 0 ? (
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

                    {/* Payment status pills + progress */}
                    <Td>
                      {row.hasUnbilledScans && row.count === 0 ? (
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
                          {row.count > 0 && <ProgressBar $pct={paidPct} />}
                        </div>
                      )}
                    </Td>

                    {/* Lifecycle badge + audit trail */}
                    <Td>
                      {rp ? (
                        <>
                          <LifecycleBadge $status={rp.status}>
                            {LIFECYCLE_LABELS[rp.status]}
                          </LifecycleBadge>
                          {rp.lockedAt && (
                            <AuditLine>
                              Заключен: {fmtDateTime(rp.lockedAt)}
                              {rp.lockedBy && ` · ${rp.lockedBy.slice(0, 8)}…`}
                            </AuditLine>
                          )}
                          {rp.invoicedAt && (
                            <AuditLine>
                              Фактуриран: {fmtDateTime(rp.invoicedAt)}
                              {rp.invoicedBy && ` · ${rp.invoicedBy.slice(0, 8)}…`}
                            </AuditLine>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: '0.8125rem', color: palette.textSubtle }}>—</span>
                      )}
                    </Td>

                    {/* Action */}
                    <Td>
                      {row.hasUnbilledScans && row.count === 0 && !rp ? (
                        /* Month has scan activity but no invoices generated yet */
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
                        <AdvanceBtn
                          disabled={advanceMutation.isPending}
                          onClick={() => setConfirmState({ month: row.month, nextStatus, row, rp })}
                        >
                          → {LIFECYCLE_LABELS[nextStatus]}
                        </AdvanceBtn>
                      ) : (
                        <span style={{ fontSize: '0.8125rem', color: palette.textSubtle }}>Финализиран</span>
                      )}
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
                ⚠ След заключване данните за фактуриране не могат да се променят свободно.
                Тази операция не може да бъде отменена.
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
    </PageShell>
  );
}
