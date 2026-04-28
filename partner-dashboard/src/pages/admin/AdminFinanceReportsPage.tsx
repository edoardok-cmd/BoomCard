import { useState } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { adminFinanceService } from '../../services/adminFinance.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  warning: '#b5803a', warningSoft: '#f5ead2',
  info: '#2563eb', infoSoft: '#dbeafe',
  purple: '#7c3aed', purpleSoft: '#ede9fe',
  teal: '#0f766e', tealSoft: '#ccfbf1',
};

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;

const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 2rem; flex-wrap: wrap; align-items: center;`;
const DateInput = styled.input`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.surface}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; }`;
const FilterLabel = styled.span`font-size: 0.8125rem; color: ${palette.textMuted}; font-weight: 600;`;
const RunBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.accent}; color: #fff; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { opacity: 0.9; } &:disabled { opacity: 0.5; cursor: default; }`;

const StatsGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 1rem; margin-bottom: 2rem;`;
const StatCard = styled.div<{ $accent?: string; $soft?: string }>`
  background: ${({ $soft }) => $soft ?? palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.25rem 1.5rem;
`;
const StatLabel = styled.p`font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: ${palette.textSubtle}; margin: 0 0 0.375rem;`;
const StatValue = styled.p<{ $color?: string }>`font-size: 1.75rem; font-weight: 800; color: ${({ $color }) => $color ?? palette.text}; margin: 0;`;
const StatSub = styled.p`font-size: 0.8rem; color: ${palette.textMuted}; margin: 0.25rem 0 0;`;

const SectionTitle = styled.h2`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0 0 1rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem;`;
const TxTable = styled.table`width: 100%; border-collapse: collapse; font-size: 0.875rem;`;
const Th = styled.th`text-align: left; color: ${palette.textSubtle}; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.5rem 0.75rem; border-bottom: 1px solid ${palette.border};`;
const Td = styled.td`padding: 0.625rem 0.75rem; border-bottom: 1px solid ${palette.border}; color: ${palette.textMuted};`;

const TypeBadge = styled.span`
  display: inline-flex; font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; border-radius: 0.375rem; padding: 0.125rem 0.45rem;
  background: ${palette.infoSoft}; color: ${palette.info};
`;

const now = new Date();
const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  .toISOString().split('T')[0];

export default function AdminFinanceReportsPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [queryFrom, setQueryFrom] = useState(defaultFrom);
  const [queryTo, setQueryTo] = useState(defaultTo);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-finance-reports', queryFrom, queryTo],
    queryFn: () => adminFinanceService.getReports(queryFrom, queryTo),
  });

  const report = data?.data;
  const walletTx = report?.walletTransactions ?? {};

  const totalVolume = Object.values(walletTx).reduce((s, v) => s + v.total, 0);
  const cashback = walletTx['CASHBACK_CREDIT'];
  const withdrawals = walletTx['WITHDRAWAL'];
  const topUps = walletTx['TOP_UP'];

  const fmt = (n: number) =>
    n.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 });

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Finance</Eyebrow>
          <PageTitle>Reports</PageTitle>
          <PageSubtitle>Aggregate financial statistics for a given date range</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <FilterRow>
        <FilterLabel>From</FilterLabel>
        <DateInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <FilterLabel>To</FilterLabel>
        <DateInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <RunBtn
          disabled={isLoading}
          onClick={() => { setQueryFrom(from); setQueryTo(to); }}
        >
          {isLoading ? 'Loading…' : 'Run report'}
        </RunBtn>
      </FilterRow>

      {report && (
        <>
          <StatsGrid>
            <StatCard $soft={palette.infoSoft}>
              <StatLabel>Total wallet volume</StatLabel>
              <StatValue $color={palette.info}>{fmt(totalVolume)}</StatValue>
              <StatSub>{Object.values(walletTx).reduce((s, v) => s + v.count, 0)} transactions</StatSub>
            </StatCard>
            {cashback && (
              <StatCard $soft={palette.successSoft}>
                <StatLabel>Cashback credited</StatLabel>
                <StatValue $color={palette.success}>{fmt(cashback.total)}</StatValue>
                <StatSub>{cashback.count} transactions</StatSub>
              </StatCard>
            )}
            {withdrawals && (
              <StatCard $soft={palette.purpleSoft}>
                <StatLabel>Withdrawals</StatLabel>
                <StatValue $color={palette.purple}>{fmt(withdrawals.total)}</StatValue>
                <StatSub>{withdrawals.count} transactions</StatSub>
              </StatCard>
            )}
            {topUps && (
              <StatCard $soft={palette.tealSoft}>
                <StatLabel>Top-ups</StatLabel>
                <StatValue $color={palette.teal}>{fmt(topUps.total)}</StatValue>
                <StatSub>{topUps.count} transactions</StatSub>
              </StatCard>
            )}
            <StatCard>
              <StatLabel>Partner invoices</StatLabel>
              <StatValue>{fmt(report.cashbackInvoices.total)}</StatValue>
              <StatSub>{report.cashbackInvoices.count} invoices generated</StatSub>
            </StatCard>
          </StatsGrid>

          {Object.keys(walletTx).length > 0 && (
            <Card>
              <SectionTitle>Wallet Transaction Breakdown</SectionTitle>
              <TxTable>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th>Total amount</Th>
                    <Th>Count</Th>
                    <Th>Avg per transaction</Th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(walletTx).map(([type, stats]) => (
                    <tr key={type}>
                      <Td><TypeBadge>{type.replace(/_/g, ' ')}</TypeBadge></Td>
                      <Td style={{ fontWeight: 600, color: palette.text }}>{fmt(stats.total)}</Td>
                      <Td>{stats.count.toLocaleString()}</Td>
                      <Td>{stats.count > 0 ? fmt(stats.total / stats.count) : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TxTable>
            </Card>
          )}
        </>
      )}

      {!report && !isLoading && (
        <div style={{ color: palette.textSubtle, fontSize: '0.9375rem', textAlign: 'center', paddingTop: '3rem' }}>
          Select a date range and click "Run report" to view financial data.
        </div>
      )}
    </PageShell>
  );
}
