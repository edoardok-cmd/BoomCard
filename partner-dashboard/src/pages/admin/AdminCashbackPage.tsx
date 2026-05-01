import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminCashbackService,
  CashbackEntry,
  CashbackEntryStatus,
} from '../../services/adminCashback.service';

/* ─── Palette ──────────────────────────────────────────────────────────────── */
const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  border: '#e8e5dc',
  text: '#141413',
  textMuted: '#605a50',
  textSubtle: '#8c8678',
  accent: '#c96442',
  accentSoft: '#f3e8de',
  success: '#4a7c59',
  successSoft: '#e6efe3',
  warning: '#b5803a',
  warningSoft: '#f5ead2',
  danger: '#b54327',
  dangerSoft: '#f4dcd2',
  info: '#2563eb',
  infoSoft: '#dbeafe',
  amber: '#92400e',
  amberSoft: '#fef3c7',
};

/* ─── Layout ────────────────────────────────────────────────────────────────── */
const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  gap: 1rem;
  flex-wrap: wrap;
`;

const TitleBlock = styled.div``;

const Eyebrow = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${palette.textSubtle};
  margin-bottom: 0.25rem;
`;

const PageTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 800;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;

const PageSubtitle = styled.p`
  font-size: 0.9375rem;
  color: ${palette.textMuted};
  margin: 0;
`;

/* ─── Stat cards ────────────────────────────────────────────────────────────── */
const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const StatCard = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.25rem 1.5rem;
`;

const StatLabel = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  margin: 0 0 0.375rem;
`;

const StatValue = styled.p<{ $color?: string }>`
  font-size: 1.625rem;
  font-weight: 800;
  color: ${({ $color }) => $color ?? palette.text};
  margin: 0;
  line-height: 1;
`;

/* ─── Table card ────────────────────────────────────────────────────────────── */
const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  align-items: center;
`;

const MonthInput = styled.input`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const SearchInput = styled.input`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  min-width: 200px;
  &::placeholder { color: ${palette.textSubtle}; }
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const Select = styled.select`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const ExportBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${palette.textMuted};
  background: ${palette.surface};
  cursor: pointer;
  white-space: nowrap;
  &:hover { border-color: ${palette.accent}; color: ${palette.accent}; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

/* ─── Cell helpers ──────────────────────────────────────────────────────────── */
const SubscriberCell = styled(Link)`
  display: block;
  font-weight: 600;
  color: ${palette.text};
  text-decoration: none;
  &:hover { color: ${palette.accent}; text-decoration: underline; }
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const ExpiryWarning = styled.span`
  font-size: 0.7rem;
  font-weight: 700;
  color: ${palette.danger};
`;

const EntryStatusBadge = styled.span<{ $status: CashbackEntryStatus }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'Cleared': return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'Paid':    return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'Pending': return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'Locked':  return `background: ${palette.amberSoft}; color: ${palette.amber};`;
      case 'Expired':
      default:        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
    }
  }}
`;

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function fmtMoney(n: number): string {
  return n.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function exportCsv(rows: CashbackEntry[]): void {
  const header = ['ID', 'Абонат', 'Имейл', 'Сума (лв.)', 'Статус', 'Изтича', 'Партньор', 'Бележка', 'Начислен'];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    header.join(','),
    ...rows.map(r => [
      escape(r.id),
      escape(`${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || r.user.email),
      escape(r.user.email),
      escape(fmtMoney(r.amount)),
      escape(r.status),
      escape(r.cashbackExpiresAt ? new Date(r.cashbackExpiresAt).toLocaleDateString('bg-BG') : ''),
      escape(r.receipt?.merchantName ?? ''),
      escape(r.description ?? ''),
      escape(new Date(r.createdAt).toLocaleDateString('bg-BG')),
    ].join(',')),
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cashback-entries-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Component ─────────────────────────────────────────────────────────────── */
export default function AdminCashbackPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [entryStatus, setEntryStatus] = useState<CashbackEntryStatus | ''>('');
  const [entryPage, setEntryPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce subscriber search — server-side across all pages
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setEntryPage(1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : '—';

  const { data: stats } = useQuery({
    queryKey: ['admin-cashback-stats'],
    queryFn: () => adminCashbackService.getStats(),
  });

  const { data: thresholds } = useQuery({
    queryKey: ['admin-cashback-payout-thresholds'],
    queryFn: () => adminCashbackService.getPayoutThresholds(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: entriesData, isLoading: isEntriesLoading } = useQuery({
    queryKey: ['admin-cashback-entries', entryPage, entryStatus, search, dateFrom, dateTo],
    queryFn: () => adminCashbackService.getEntries({
      page: entryPage,
      limit: 25,
      status: entryStatus || undefined,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  });

  const approveMutation = useMutation({
    mutationFn: (entryId: string) => adminCashbackService.approveEntry(entryId),
    onSuccess: () => {
      toast.success('Записът е одобрен');
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-entries'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: () => toast.error('Грешка при одобряване'),
  });

  const lockMutation = useMutation({
    mutationFn: (entryId: string) => adminCashbackService.lockEntry(entryId),
    onSuccess: () => {
      toast.success('Записът е заключен');
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-entries'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: () => toast.error('Грешка при заключване'),
  });

  const payMutation = useMutation({
    mutationFn: (entryId: string) => adminCashbackService.payEntry(entryId),
    onSuccess: () => {
      toast.success('Записът е маркиран като платен');
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-entries'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Грешка при маркиране като платен'),
  });

  const expireMutation = useMutation({
    mutationFn: (entryId: string) => adminCashbackService.expireEntry(entryId),
    onSuccess: () => {
      toast.success('Записът е изтекъл');
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-entries'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: () => toast.error('Грешка при изтичане'),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await adminCashbackService.getEntries({
        page: 1,
        limit: 10000,
        status: entryStatus || undefined,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (result.total > result.data.length) {
        toast(`Внимание: експортирани са ${result.data.length} от ${result.total} записа. Приложи по-тесен филтър за пълен извлечен файл.`, { icon: '⚠️' });
      }
      exportCsv(result.data);
    } catch {
      toast.error('Грешка при експорт');
    } finally {
      setExporting(false);
    }
  };

  const entryColumns: ColumnDef<CashbackEntry>[] = [
    {
      key: 'subscriber',
      header: 'Абонат',
      render: (row) => {
        const name = row.user.firstName || row.user.lastName
          ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim()
          : row.user.email;
        return (
          <div>
            <SubscriberCell to={`/admin/subscribers/all?user=${row.user.id}`}>
              {name}
            </SubscriberCell>
            <MetaLine>{row.user.email}</MetaLine>
          </div>
        );
      },
    },
    {
      key: 'amount',
      header: 'Сума',
      render: (row) => <span style={{ fontWeight: 700, color: palette.text }}>{fmtMoney(row.amount)} лв.</span>,
    },
    {
      key: 'state',
      header: 'Статус',
      render: (row) => {
        const labels: Record<CashbackEntryStatus, string> = {
          Pending: 'Изчакващ', Cleared: 'Одобрен', Locked: 'Заключен', Paid: 'Платен', Expired: 'Изтекъл',
        };
        return <EntryStatusBadge $status={row.status}>{labels[row.status]}</EntryStatusBadge>;
      },
    },
    {
      key: 'expires',
      header: 'Изтича',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.cashbackExpiresAt ? fmtDate(row.cashbackExpiresAt) : '—'}
          {/* Show countdown for Pending, Cleared, and Locked — all have rolling 60-day expiry (spec §4.4) */}
          {row.daysUntilExpiry != null && (row.status === 'Cleared' || row.status === 'Pending' || row.status === 'Locked') && (
            <MetaLine>
              {row.daysUntilExpiry <= 7
                ? <ExpiryWarning>⚠ {row.daysUntilExpiry} дни</ExpiryWarning>
                : `${row.daysUntilExpiry} дни`}
            </MetaLine>
          )}
        </span>
      ),
    },
    {
      key: 'partner',
      header: 'Партньор',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.receipt?.merchantName ?? '—'}
          {row.receipt?.totalAmount != null && <MetaLine>{fmtMoney(row.receipt.totalAmount)} лв.</MetaLine>}
        </span>
      ),
    },
    {
      key: 'receipt',
      header: 'Бележка',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.description ?? '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Начислен',
      render: (row) => <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmtDate(row.createdAt)}</span>,
    },
  ];

  const isMutating =
    approveMutation.isPending || lockMutation.isPending ||
    payMutation.isPending || expireMutation.isPending;

  // Build threshold hint from backend data; fall back to em-dashes if not yet loaded
  const thresholdHint = thresholds
    ? Object.entries({ 'Basic': thresholds.BASIC, 'Premium седм.': thresholds.LIGHT, 'Premium мес.': thresholds.PREMIUM })
        .map(([label, val]) => `${label} ${fmtMoney(val)} лв.`)
        .join(' · ')
    : '…';

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Абонати</Eyebrow>
          <PageTitle>Кешбек</PageTitle>
          <PageSubtitle>Записи по статус (Изчакващ / Одобрен / Заключен / Платен / Изтекъл) — спец. §4.4</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      {/* Spec §3.1 — начислен / одобрен / изчакващ / изтичащ */}
      <StatsRow>
        <StatCard>
          <StatLabel>Начислен</StatLabel>
          <StatValue $color={palette.text}>
            {stats ? `${fmtMoney(stats.totalAccrued)} лв.` : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Одобрен</StatLabel>
          <StatValue $color={palette.success}>
            {stats ? `${fmtMoney(stats.totalCleared)} лв.` : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Изчакващ</StatLabel>
          <StatValue $color={palette.warning}>
            {stats ? `${fmtMoney(stats.totalPending)} лв.` : '—'}
          </StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Изтичащ (14 дни)</StatLabel>
          <StatValue $color={stats && stats.expiringTotal > 0 ? palette.danger : palette.text}>
            {stats ? `${fmtMoney(stats.expiringTotal)} лв.` : '—'}
          </StatValue>
        </StatCard>
      </StatsRow>

      {/* Payout threshold reference — fetched from backend (spec §9 Настройки) */}
      <div style={{ fontSize: '0.8rem', color: palette.textSubtle, marginBottom: '1rem' }}>
        Прагове за изплащане (само одобрен кешбек се брои — спец. §4.4): {thresholdHint}
      </div>

      <Card>
        <FilterRow>
          <Select
            value={entryStatus}
            onChange={(e) => { setEntryStatus(e.target.value as CashbackEntryStatus | ''); setEntryPage(1); }}
          >
            <option value="">Всички статуси</option>
            <option value="Pending">Изчакващ</option>
            <option value="Cleared">Одобрен</option>
            <option value="Locked">Заключен</option>
            <option value="Paid">Платен</option>
            <option value="Expired">Изтекъл</option>
          </Select>
          <SearchInput
            type="text"
            placeholder="Търси абонат (име / имейл)…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <MonthInput
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setEntryPage(1); }}
            title="От дата"
          />
          <MonthInput
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setEntryPage(1); }}
            title="До дата"
          />
          <ExportBtn onClick={handleExport} disabled={exporting}>
            {exporting ? 'Зарежда…' : '↓ CSV'}
          </ExportBtn>
        </FilterRow>

        <DataTable
          columns={entryColumns}
          data={entriesData?.data ?? []}
          rowKey={(row) => row.id}
          loading={isEntriesLoading}
          emptyMessage="Няма кешбек записи"
          page={entryPage}
          pageSize={25}
          totalItems={entriesData?.total}
          onPageChange={setEntryPage}
          rowActions={[
            {
              label: 'Одобри',
              hidden: (row) => row.status !== 'Pending',
              onClick: (row) => {
                if (!window.confirm(`Одобри кешбек записа за ${row.user.email}?\nСума: ${fmtMoney(row.amount)} лв.`)) return;
                approveMutation.mutate(row.id);
              },
            },
            {
              label: 'Заключи',
              hidden: (row) => row.status !== 'Cleared',
              onClick: (row) => {
                if (!window.confirm(`Заключи кешбек записа за ${row.user.email}?\nСума: ${fmtMoney(row.amount)} лв.`)) return;
                lockMutation.mutate(row.id);
              },
            },
            {
              label: 'Маркирай платен',
              hidden: (row) => row.status !== 'Locked' || ['ANNULLED', 'FAILED'].includes(row.rawStatus),
              onClick: (row) => {
                if (!window.confirm(`Маркирай като платен кешбек за ${row.user.email}?\nСума: ${fmtMoney(row.amount)} лв.\nТова действие не може да се отмени.`)) return;
                payMutation.mutate(row.id);
              },
            },
            {
              label: 'Изтечи',
              hidden: (row) => ['Paid', 'Expired'].includes(row.status) || ['ANNULLED', 'FAILED'].includes(row.rawStatus),
              onClick: (row) => {
                const lockedWarning = row.status === 'Locked'
                  ? '\n⚠ Записът е ЗАКЛЮЧЕН — сумата НЯМА да бъде платена.'
                  : '';
                if (!window.confirm(`Принудително изтичане на кешбек за ${row.user.email}?\nСума: ${fmtMoney(row.amount)} лв.${lockedWarning}\nТова действие не може да се отмени.`)) return;
                expireMutation.mutate(row.id);
              },
            },
          ]}
        />

        {isMutating && (
          <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.8125rem', color: palette.textSubtle }}>
            Обновяване…
          </div>
        )}
      </Card>
    </PageShell>
  );
}
