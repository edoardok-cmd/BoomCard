import { useState } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { adminFinanceService, PeriodRow } from '../../services/adminFinance.service';

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
const YearPicker = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.surface}; color: ${palette.text}; outline: none; cursor: pointer;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; overflow: hidden;`;
const Table = styled.table`width: 100%; border-collapse: collapse;`;
const Th = styled.th`text-align: left; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${palette.textSubtle}; padding: 0.875rem 1.25rem; border-bottom: 1px solid ${palette.border}; background: ${palette.bg};`;
const Td = styled.td`padding: 0.875rem 1.25rem; border-bottom: 1px solid ${palette.border}; font-size: 0.875rem; color: ${palette.textMuted};`;
const MonthLabel = styled.span`font-weight: 700; font-size: 0.9375rem; color: ${palette.text};`;
const AmountLabel = styled.span`font-weight: 700; font-size: 0.9375rem; color: ${palette.text};`;

const StatusPill = styled.span<{ $color: string; $bg: string }>`
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-size: 0.7rem; font-weight: 700; border-radius: 0.375rem;
  padding: 0.125rem 0.45rem;
  background: ${({ $bg }) => $bg}; color: ${({ $color }) => $color};
  margin-right: 0.25rem;
`;

const ProgressBar = styled.div<{ $pct: number }>`
  height: 6px;
  border-radius: 3px;
  background: ${palette.border};
  margin-top: 0.375rem;
  overflow: hidden;
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ $pct }) => Math.min(100, $pct)}%;
    background: ${palette.success};
    border-radius: 3px;
  }
`;

const EmptyState = styled.div`
  padding: 3rem;
  text-align: center;
  color: ${palette.textSubtle};
  font-size: 0.9375rem;
`;

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const MONTH_NAMES: Record<string, string> = {
  '01': 'January', '02': 'February', '03': 'March', '04': 'April',
  '05': 'May', '06': 'June', '07': 'July', '08': 'August',
  '09': 'September', '10': 'October', '11': 'November', '12': 'December',
};

function monthLabel(m: string) {
  const [year, month] = m.split('-');
  return `${MONTH_NAMES[month] ?? month} ${year}`;
}

export default function AdminFinancePeriodsPage() {
  const [year, setYear] = useState(CURRENT_YEAR);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-finance-periods', year],
    queryFn: () => adminFinanceService.getPeriods(year),
  });

  const rows = data?.data ?? [];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Finance</Eyebrow>
          <PageTitle>Billing Periods</PageTitle>
          <PageSubtitle>Monthly cashback totals across all partners</PageSubtitle>
        </TitleBlock>
        <YearPicker value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
        </YearPicker>
      </PageHeader>

      <Card>
        {isLoading ? (
          <EmptyState>Loading…</EmptyState>
        ) : !rows.length ? (
          <EmptyState>No billing data for {year}.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Period</Th>
                <Th>Total owed</Th>
                <Th>Partners</Th>
                <Th>Payment status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: PeriodRow) => {
                const paidPct = row.count > 0 ? (row.paid / row.count) * 100 : 0;
                return (
                  <tr key={row.month}>
                    <Td><MonthLabel>{monthLabel(row.month)}</MonthLabel></Td>
                    <Td>
                      <AmountLabel>
                        {row.total.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 })}
                      </AmountLabel>
                    </Td>
                    <Td style={{ color: palette.text, fontWeight: 600 }}>{row.count}</Td>
                    <Td>
                      <div>
                        {row.paid > 0 && (
                          <StatusPill $color={palette.success} $bg={palette.successSoft}>{row.paid} paid</StatusPill>
                        )}
                        {row.pending > 0 && (
                          <StatusPill $color={palette.warning} $bg={palette.warningSoft}>{row.pending} pending</StatusPill>
                        )}
                        {row.overdue > 0 && (
                          <StatusPill $color={palette.danger} $bg={palette.dangerSoft}>{row.overdue} overdue</StatusPill>
                        )}
                        <ProgressBar $pct={paidPct} />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </PageShell>
  );
}
