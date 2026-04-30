import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { adminFinanceService } from '../../services/adminFinance.service';
import { adminAlertsService, AdminAlert } from '../../services/adminAlerts.service';
import { useLanguage } from '../../contexts/LanguageContext';

// Bulgarian + English have a binary one/other plural distinction. Intl.PluralRules
// formalizes this so we don't drift to "1 things" / "2 thing" if a future translator
// tries something cute. Reused per render — instantiation is cheap but cached.
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

// Focus banner — surfaced when the page is reached via an alert deep-link
// (`?focus=...`). Lets us satisfy spec §3.2 (alerts must lead to Финанси)
// while preserving the drill-down to where the underlying data actually lives.
const FocusBanner = styled.div`
  display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem;
  background: ${palette.warningSoft}; border: 1px solid #e8d8ad;
  border-left: 3px solid ${palette.warning}; border-radius: 0.75rem;
  margin-bottom: 1.5rem;
`;
const FocusContent = styled.div`flex: 1;`;
const FocusEyebrow = styled.p`font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${palette.warning}; margin: 0 0 0.25rem;`;
const FocusTitle = styled.p`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0;`;
const FocusCount = styled.span`font-feature-settings: 'tnum'; color: ${palette.danger};`;
const FocusBtn = styled(Link)`
  flex-shrink: 0; padding: 0.5rem 0.875rem; background: ${palette.text};
  color: #fff; border: none; border-radius: 0.5rem; font-size: 0.8125rem;
  font-weight: 600; text-decoration: none; cursor: pointer;
  &:hover { opacity: 0.9; }
`;

interface FocusCopy {
  eyebrow: string;
  // Singular / plural body text rendered after the count badge. Receives the
  // Intl.PluralRules category for the active locale ('one' | 'other').
  body: (category: Intl.LDMLPluralRule) => string;
  cta: string;
}
interface FocusConfig {
  alertId: string;
  bg: FocusCopy;
  en: FocusCopy;
  // Function so we can interpolate alert.meta values (e.g. dateFrom from the
  // failed_transactions 24h window) into the deep-link, keeping the landing
  // page's row count in lock-step with the alert badge.
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
      // "абонамент" is masculine inanimate — count form is "абонамента" after numerals ≥ 2.
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
      // "транзакция" is feminine — plural "транзакции".
      body: (c) =>
        `неуспешн${c === 'one' ? 'а' : 'и'} транзакци${c === 'one' ? 'я' : 'и'} (последните 24ч)`,
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

const now = new Date();
const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  .toISOString().split('T')[0];

export default function AdminFinanceReportsPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [queryFrom, setQueryFrom] = useState(defaultFrom);
  const [queryTo, setQueryTo] = useState(defaultTo);
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const focusKey = searchParams.get('focus');
  const focusConfig = focusKey ? FOCUS_CONFIGS[focusKey] : undefined;

  // Shares the ['admin-alerts'] cache with AdminAlertsPage. If the user
  // reached this page via "View on Alerts → click an alert", the query is
  // already warm and we use the cached value; otherwise we fetch on focus.
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
