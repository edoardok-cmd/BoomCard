import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrentPartner } from '../hooks/usePartners';
import { usePartnerTransactions } from '../hooks/usePartnerPortal';
import { PartnerTransactionFilters } from '../services/partnerPortal.service';
import { useCurrencyDisplay, formatWithCurrency } from '../utils/currencyDisplay';

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

const FiltersBar = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 1rem;
  padding: 1.25rem;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: rgba(255, 255, 255, 0.1);
  }
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const Input = styled.input`
  padding: 0.5rem 0.65rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  color: #111827;
  background: white;

  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
    color: #f9fafb;
  }
`;

const Select = styled.select`
  padding: 0.5rem 0.65rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  color: #111827;
  background: white;

  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
    color: #f9fafb;
  }
`;

const ResetButton = styled.button`
  align-self: end;
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  background: #f9fafb;
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
  cursor: pointer;

  &:hover { background: #f3f4f6; }

  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
    color: #f9fafb;
  }
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

const StatusPill = styled.span<{ $status: string }>`
  display: inline-flex;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
  background: ${({ $status }) => {
    const s = $status.toUpperCase();
    if (s === 'VERIFIED' || s === 'APPROVED' || s === 'COMPLETED') return '#d1fae5';
    if (s === 'PENDING' || s === 'PROCESSING') return '#fef3c7';
    if (s === 'REJECTED' || s === 'FAILED' || s === 'FRAUD') return '#fee2e2';
    return '#f3f4f6';
  }};
  color: ${({ $status }) => {
    const s = $status.toUpperCase();
    if (s === 'VERIFIED' || s === 'APPROVED' || s === 'COMPLETED') return '#065f46';
    if (s === 'PENDING' || s === 'PROCESSING') return '#92400e';
    if (s === 'REJECTED' || s === 'FAILED' || s === 'FRAUD') return '#991b1b';
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

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1.25rem;
  flex-wrap: wrap;
`;

const PageButton = styled.button`
  padding: 0.45rem 0.9rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  background: white;
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: not-allowed; }

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    color: #f9fafb;
  }
`;

const PageInfo = styled.span`
  font-size: 0.85rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

/* ── Component ── */

const PAGE_SIZE = 20;

const PartnerTransactionsPage: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const currencyMode = useCurrencyDisplay();
  const isPartner = user?.role === 'partner';

  const { data: partnerData } = useCurrentPartner(isPartner);

  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [venueId, setVenueId] = useState('');
  const [status, setStatus] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const filters: PartnerTransactionFilters = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      venueId: venueId || undefined,
      status: status || undefined,
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
    }),
    [page, dateFrom, dateTo, venueId, status, minAmount, maxAmount],
  );

  const { data, isLoading, isError, isFetching } = usePartnerTransactions(filters, isPartner);

  // Venue options come from the partner profile (own venues only).
  const venues = partnerData?.venues ?? [];

  const fmtMoney = (n: number) => formatWithCurrency(n, currencyMode, language === 'bg' ? 'bg' : 'en');
  const locale = language === 'bg' ? 'bg-BG' : 'en-US';

  const onFilterChange = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setVenueId('');
    setStatus('');
    setMinAmount('');
    setMaxAmount('');
    setPage(1);
  };

  const rows = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const hasDiscountColumn = rows.some((r) => r.discountPercent !== undefined && r.discountPercent !== null);

  const t = (bg: string, en: string) => (language === 'bg' ? bg : en);

  return (
    <PageContainer>
      <PageHeader>
        <Title>{t('Транзакции', 'Transactions')}</Title>
        <Subtitle>
          {t(
            'Преглед на транзакциите по вашите обекти (само за четене).',
            'Review transactions for your venues (read-only).',
          )}
        </Subtitle>
      </PageHeader>

      <FiltersBar>
        <Field>
          {t('От дата', 'From date')}
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => onFilterChange(setDateFrom)(e.target.value)}
          />
        </Field>
        <Field>
          {t('До дата', 'To date')}
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => onFilterChange(setDateTo)(e.target.value)}
          />
        </Field>
        <Field>
          {t('Обект', 'Location')}
          <Select value={venueId} onChange={(e) => onFilterChange(setVenueId)(e.target.value)}>
            <option value="">{t('Всички обекти', 'All locations')}</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          {t('Статус', 'Status')}
          <Select value={status} onChange={(e) => onFilterChange(setStatus)(e.target.value)}>
            <option value="">{t('Всички', 'All')}</option>
            <option value="APPROVED">{t('Одобрена', 'Approved')}</option>
            <option value="PENDING">{t('Изчакваща', 'Pending')}</option>
            <option value="REJECTED">{t('Отхвърлена', 'Rejected')}</option>
            <option value="MANUAL_REVIEW">{t('Ръчна проверка', 'Manual review')}</option>
            <option value="EXPIRED">{t('Изтекла', 'Expired')}</option>
          </Select>
        </Field>
        <Field>
          {t('Мин. сума', 'Min amount')}
          <Input
            type="number"
            min="0"
            step="0.01"
            value={minAmount}
            onChange={(e) => onFilterChange(setMinAmount)(e.target.value)}
          />
        </Field>
        <Field>
          {t('Макс. сума', 'Max amount')}
          <Input
            type="number"
            min="0"
            step="0.01"
            value={maxAmount}
            onChange={(e) => onFilterChange(setMaxAmount)(e.target.value)}
          />
        </Field>
        <ResetButton type="button" onClick={resetFilters}>
          {t('Изчисти филтрите', 'Clear filters')}
        </ResetButton>
      </FiltersBar>

      {isError ? (
        <ErrorBox>
          {t(
            'Транзакциите не можаха да се заредят. Моля, опитайте отново.',
            'Transactions could not be loaded. Please try again.',
          )}
        </ErrorBox>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>{t('ID на транзакция', 'Transaction ID')}</Th>
                  <Th>{t('Дата', 'Date')}</Th>
                  <Th>{t('Час', 'Time')}</Th>
                  <Th>{t('Обект', 'Location')}</Th>
                  <Th>{t('Сума', 'Amount')}</Th>
                  <Th>{t('Отстъпка', 'Discount')}</Th>
                  <Th>{t('Статус', 'Status')}</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <Td colSpan={7}>
                      <StateBox>{t('Зареждане…', 'Loading…')}</StateBox>
                    </Td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <Td colSpan={7}>
                      <StateBox>
                        {t('Няма транзакции за избраните филтри.', 'No transactions for the selected filters.')}
                      </StateBox>
                    </Td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const d = new Date(r.createdAt);
                    return (
                      <tr key={r.id}>
                        <Td>{r.transactionId ?? r.id}</Td>
                        <Td>{d.toLocaleDateString(locale)}</Td>
                        <Td>
                          {d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        </Td>
                        <Td>{r.venueName ?? '—'}</Td>
                        <Td>{fmtMoney(r.amount)}</Td>
                        <Td>
                          {hasDiscountColumn && r.discountPercent !== undefined && r.discountPercent !== null
                            ? `${r.discountPercent}%`
                            : '—'}
                        </Td>
                        <Td>
                          <StatusPill $status={r.status}>{r.status}</StatusPill>
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </TableWrap>

          {pagination && pagination.total > 0 && (
            <Pagination>
              <PageInfo>
                {t('Страница', 'Page')} {pagination.page} / {totalPages}
                {' · '}
                {pagination.total} {t('записа', 'records')}
                {isFetching ? ` · ${t('обновяване…', 'updating…')}` : ''}
              </PageInfo>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <PageButton type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  {t('Назад', 'Previous')}
                </PageButton>
                <PageButton
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('Напред', 'Next')}
                </PageButton>
              </div>
            </Pagination>
          )}
        </motion.div>
      )}
    </PageContainer>
  );
};

export default PartnerTransactionsPage;
