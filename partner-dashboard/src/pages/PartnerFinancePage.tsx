import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { usePartnerFinance } from '../hooks/usePartnerPortal';
import { PartnerFinanceRow } from '../services/partnerPortal.service';
import { useCurrencyDisplay, formatWithCurrency } from '../utils/currencyDisplay';
import { csvEscape, downloadBlob } from '../utils/csvExport';

/* ── Layout ── */

const PageContainer = styled.div`
  max-width: 80rem;
  margin: 0 auto;
  padding: 2rem 1rem;
  min-height: calc(100vh - 4rem);
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2.25rem;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.02em;
  margin-bottom: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const Section = styled.section`
  margin-bottom: 2.5rem;
`;

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const SectionTitle = styled.h2`
  font-size: 1.35rem;
  font-weight: 700;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const ExportButton = styled.button`
  padding: 0.5rem 1rem;
  border: 1px solid #6366f1;
  border-radius: 0.5rem;
  background: #6366f1;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &:hover { background: #4f46e5; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const TableWrap = styled.div`
  overflow-x: auto;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 1rem;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: rgba(255, 255, 255, 0.1);
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
`;

const Th = styled.th`
  text-align: left;
  padding: 0.85rem 1rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  white-space: nowrap;

  [data-theme="dark"] & {
    color: #9ca3af;
    border-color: rgba(255, 255, 255, 0.1);
  }
`;

const Td = styled.td`
  padding: 0.85rem 1rem;
  color: #111827;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  white-space: nowrap;

  [data-theme="dark"] & {
    color: #f9fafb;
    border-color: rgba(255, 255, 255, 0.06);
  }
`;

const Pill = styled.span<{ $status: string }>`
  display: inline-flex;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
  background: ${({ $status }) => {
    const s = $status.toUpperCase();
    if (s === 'PAID' || s === 'INVOICED') return '#d1fae5';
    if (s === 'PENDING' || s === 'OPEN' || s === 'FOR_REVIEW') return '#fef3c7';
    if (s === 'OVERDUE') return '#fee2e2';
    if (s === 'LOCKED') return '#dbeafe';
    return '#f3f4f6';
  }};
  color: ${({ $status }) => {
    const s = $status.toUpperCase();
    if (s === 'PAID' || s === 'INVOICED') return '#065f46';
    if (s === 'PENDING' || s === 'OPEN' || s === 'FOR_REVIEW') return '#92400e';
    if (s === 'OVERDUE') return '#991b1b';
    if (s === 'LOCKED') return '#1e40af';
    return '#374151';
  }};
`;

const StateBox = styled.div`
  text-align: center;
  padding: 3rem 1rem;
  color: #6b7280;
  font-size: 0.95rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const ErrorBox = styled.div`
  background: #fffbeb;
  border: 1.5px solid #fcd34d;
  border-radius: 0.75rem;
  padding: 1.25rem 1.5rem;
  color: #78350f;
  font-size: 0.95rem;
`;

/* ── Component ── */

const PartnerFinancePage: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const currencyMode = useCurrencyDisplay();
  const isPartner = user?.role === 'partner';

  const { data, isLoading, isError } = usePartnerFinance(isPartner);

  const t = (bg: string, en: string) => (language === 'bg' ? bg : en);
  const locale = language === 'bg' ? 'bg-BG' : 'en-US';
  const fmtMoney = (n: number) => formatWithCurrency(n, currencyMode, language === 'bg' ? 'bg' : 'en');
  const fmtMonth = (m: string) => {
    // `month` is typically YYYY-MM or an ISO date; render a short month label.
    const d = new Date(m.length === 7 ? `${m}-01` : m);
    if (Number.isNaN(d.getTime())) return m;
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  };
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : '—');
  const fmtRate = (rate: number | null | undefined) =>
    rate === null || rate === undefined ? '—' : `${rate}%`;

  const rows: PartnerFinanceRow[] = data?.data ?? [];

  const periodStatusLabel = (s: string | null): string => {
    if (!s) return '—';
    const map: Record<string, [string, string]> = {
      OPEN: ['Отворен', 'Open'],
      FOR_REVIEW: ['За преглед', 'Under Review'],
      LOCKED: ['Затворен', 'Closed'],
      INVOICED: ['Фактуриран', 'Invoiced'],
    };
    const e = map[s.toUpperCase()];
    return e ? (language === 'bg' ? e[0] : e[1]) : s;
  };

  const payStatusLabel = (s: string): string => {
    const map: Record<string, [string, string]> = {
      PAID: ['Платено', 'Paid'],
      PENDING: ['Неплатено', 'Unpaid'],
      OVERDUE: ['Просрочено', 'Overdue'],
    };
    const e = map[s.toUpperCase()];
    return e ? (language === 'bg' ? e[0] : e[1]) : s;
  };

  /* F4 — client-side CSV export (partner-safe fields only). */
  const exportMonthly = () => {
    const header = [
      t('Месец', 'Month'),
      t('Оборот', 'Turnover'),
      t('Договорена комисионна %', 'Contracted commission %'),
      t('Дължимо', 'Liability'),
      t('Статус', 'Status'),
      t('Платено на', 'Paid at'),
      t('Период', 'Period state'),
    ];
    const lines = rows.map((r) =>
      [
        fmtMonth(r.month),
        fmtMoney(r.turnoverAmount),
        fmtRate(r.contractedRate),
        fmtMoney(r.totalCashbackOwed),
        payStatusLabel(r.status),
        fmtDate(r.paidAt),
        periodStatusLabel(r.periodStatus),
      ]
        .map(csvEscape)
        .join(','),
    );
    const csv = [header.map(csvEscape).join(','), ...lines].join('\n');
    downloadBlob('﻿' + csv, `finance-monthly-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportPayments = () => {
    const header = [
      t('Период', 'Period'),
      t('Статус', 'Status'),
      t('Сума', 'Amount'),
      t('Дата на плащане', 'Payment date'),
      t('Фактура', 'Invoice'),
    ];
    const lines = rows.map((r) =>
      [
        fmtMonth(r.month),
        payStatusLabel(r.status),
        fmtMoney(r.totalCashbackOwed),
        fmtDate(r.paidAt),
        r.invoiceNumber ?? '—',
      ]
        .map(csvEscape)
        .join(','),
    );
    const csv = [header.map(csvEscape).join(','), ...lines].join('\n');
    downloadBlob('﻿' + csv, `finance-payments-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const empty = !isLoading && rows.length === 0;

  return (
    <PageContainer>
      <PageHeader>
        <Title>{t('Финанси', 'Finance')}</Title>
        <Subtitle>
          {t(
            'Месечни справки и история на плащанията (само за четене).',
            'Monthly reports and payment history (read-only).',
          )}
        </Subtitle>
      </PageHeader>

      {isError ? (
        <ErrorBox>
          {t(
            'Финансовите данни не можаха да се заредят. Моля, опитайте отново.',
            'Finance data could not be loaded. Please try again.',
          )}
        </ErrorBox>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {/* §7.1 Месечни справки */}
          <Section>
            <SectionHead>
              <SectionTitle>{t('Месечни справки', 'Monthly reports')}</SectionTitle>
              <ExportButton type="button" onClick={exportMonthly} disabled={empty || isLoading}>
                {t('Експорт CSV', 'Export CSV')}
              </ExportButton>
            </SectionHead>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('Месец', 'Month')}</Th>
                    <Th>{t('Оборот', 'Turnover')}</Th>
                    <Th>{t('Комисионна %', 'Commission %')}</Th>
                    <Th>{t('Дължимо', 'Liability')}</Th>
                    <Th>{t('Плащане', 'Payment')}</Th>
                    <Th>{t('Период', 'Period state')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <Td colSpan={6}>
                        <StateBox>{t('Зареждане…', 'Loading…')}</StateBox>
                      </Td>
                    </tr>
                  ) : empty ? (
                    <tr>
                      <Td colSpan={6}>
                        <StateBox>{t('Няма финансови справки.', 'No financial reports yet.')}</StateBox>
                      </Td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={`m-${r.month}`}>
                        <Td>{fmtMonth(r.month)}</Td>
                        <Td>{fmtMoney(r.turnoverAmount)}</Td>
                        <Td>{fmtRate(r.contractedRate)}</Td>
                        <Td>{fmtMoney(r.totalCashbackOwed)}</Td>
                        <Td>
                          <Pill $status={r.status}>{payStatusLabel(r.status)}</Pill>
                          {r.paidAt ? ` · ${fmtDate(r.paidAt)}` : ''}
                        </Td>
                        <Td>
                          <Pill $status={r.periodStatus ?? ''}>{periodStatusLabel(r.periodStatus)}</Pill>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </Section>

          {/* §7.1 История на плащания */}
          <Section>
            <SectionHead>
              <SectionTitle>{t('История на плащания', 'Payment history')}</SectionTitle>
              <ExportButton type="button" onClick={exportPayments} disabled={empty || isLoading}>
                {t('Експорт CSV', 'Export CSV')}
              </ExportButton>
            </SectionHead>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>{t('Период', 'Period')}</Th>
                    <Th>{t('Статус', 'Status')}</Th>
                    <Th>{t('Сума', 'Amount')}</Th>
                    <Th>{t('Дата на плащане', 'Payment date')}</Th>
                    <Th>{t('Фактура', 'Invoice')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <Td colSpan={5}>
                        <StateBox>{t('Зареждане…', 'Loading…')}</StateBox>
                      </Td>
                    </tr>
                  ) : empty ? (
                    <tr>
                      <Td colSpan={5}>
                        <StateBox>{t('Няма плащания.', 'No payments yet.')}</StateBox>
                      </Td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={`p-${r.month}`}>
                        <Td>{fmtMonth(r.month)}</Td>
                        <Td>
                          <Pill $status={r.status}>{payStatusLabel(r.status)}</Pill>
                        </Td>
                        <Td>{fmtMoney(r.totalCashbackOwed)}</Td>
                        <Td>{fmtDate(r.paidAt)}</Td>
                        <Td>{r.invoiceNumber ?? '—'}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </Section>
        </motion.div>
      )}
    </PageContainer>
  );
};

export default PartnerFinancePage;
