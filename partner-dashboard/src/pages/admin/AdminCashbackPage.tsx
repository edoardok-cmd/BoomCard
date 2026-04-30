import { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminCashbackService,
  CashbackSummaryEntry,
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

/* ─── Cell helpers ──────────────────────────────────────────────────────────── */
const PartnerCell = styled.div`
  font-weight: 600;
  color: ${palette.text};
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

type PaymentStatus = CashbackSummaryEntry['paymentStatus'];

const StatusBadge = styled.span<{ $status: PaymentStatus }>`
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
      case 'PAID':    return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'OVERDUE': return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      default:        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    }
  }}
`;

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

// Payout thresholds per plan (BGN; mirror of backend constants × 1.95583)
const PAYOUT_THRESHOLDS: Record<string, number> = {
  BASIC:   Math.round(20 * 1.95583 * 100) / 100,   // ~39.12 лв.
  LIGHT:   Math.round(10 * 1.95583 * 100) / 100,   // ~19.56 лв. (weekly)
  PREMIUM: Math.round(15 * 1.95583 * 100) / 100,   // ~29.34 лв. (monthly)
};

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMoney(n: number): string {
  return n.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Component ─────────────────────────────────────────────────────────────── */
export default function AdminCashbackPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [view, setView] = useState<'partners' | 'entries'>('entries');
  const [month, setMonth] = useState(currentMonthStr());
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | ''>('');
  const [entryStatus, setEntryStatus] = useState<CashbackEntryStatus | ''>('');
  const [entryPage, setEntryPage] = useState(1);
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ['admin-cashback-summary', month, statusFilter],
    queryFn: () => adminCashbackService.getSummary({ month: month || undefined, status: statusFilter || undefined }),
    enabled: view === 'partners',
  });

  const { data: entriesData, isLoading: isEntriesLoading } = useQuery({
    queryKey: ['admin-cashback-entries', entryPage, entryStatus],
    queryFn: () => adminCashbackService.getEntries({ page: entryPage, limit: 25, status: entryStatus || undefined }),
    enabled: view === 'entries',
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ partnerId, notes }: { partnerId: string; notes?: string }) =>
      adminCashbackService.markPaid(partnerId, month, notes),
    onSuccess: () => {
      toast.success('Кешбекът е отбелязан като платен');
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: () => toast.error('Грешка при маркиране като платен'),
  });

  const reminderMutation = useMutation({
    mutationFn: (partnerId: string) => adminCashbackService.sendReminder(partnerId, month || undefined),
    onSuccess: () => toast.success('Напомнянето е изпратено'),
    onError: () => toast.error('Грешка при изпращане на напомняне'),
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

  const expireMutation = useMutation({
    mutationFn: (entryId: string) => adminCashbackService.expireEntry(entryId),
    onSuccess: () => {
      toast.success('Записът е изтекъл');
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-entries'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-stats'] });
    },
    onError: () => toast.error('Грешка при изтичане'),
  });

  const backfillMutation = useMutation({
    mutationFn: () => adminCashbackService.backfillExpiry(),
    onSuccess: (res) => toast.success(res.message),
    onError: () => toast.error('Грешка при backfill'),
  });

  // Client-side filters — apply only to the currently loaded page (25 rows).
  // Entries across other pages are NOT searched. Use the status dropdown for
  // server-side filtering across the full dataset.
  const filteredEntries = (entriesData?.data ?? []).filter(row => {
    if (!subscriberSearch) return true;
    const q = subscriberSearch.toLowerCase();
    const name = `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim().toLowerCase();
    return name.includes(q) || row.user.email.toLowerCase().includes(q);
  }).filter(row => {
    if (!dateFrom && !dateTo) return true;
    const created = new Date(row.createdAt).getTime();
    if (dateFrom && created < new Date(dateFrom).getTime()) return false;
    if (dateTo && created > new Date(dateTo + 'T23:59:59').getTime()) return false;
    return true;
  });

  const partnerColumns: ColumnDef<CashbackSummaryEntry>[] = [
    {
      key: 'partner',
      header: 'Партньор',
      render: (row) => (
        <PartnerCell>
          {row.partnerName}
          {row.partnerEmail && <MetaLine>{row.partnerEmail}</MetaLine>}
        </PartnerCell>
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
      render: (row) => <span style={{ fontWeight: 700, color: palette.text }}>{fmtMoney(row.totalOwed)} лв.</span>,
    },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <StatusBadge $status={row.paymentStatus}>
            {row.paymentStatus === 'PAID' ? 'Платено' : row.paymentStatus === 'OVERDUE' ? 'Просрочено' : 'Изчакващо'}
          </StatusBadge>
          {row.paidAt && <MetaLine>Платено {fmtDate(row.paidAt)}</MetaLine>}
          {row.paidBy && <MetaLine>от {row.paidBy}</MetaLine>}
          {row.notes && <MetaLine style={{ fontStyle: 'italic' }}>{row.notes}</MetaLine>}
        </span>
      ),
    },
  ];

  const entryColumns: ColumnDef<CashbackEntry>[] = [
    {
      key: 'subscriber',
      header: 'Абонат',
      render: (row) => (
        <PartnerCell>
          {row.user.firstName || row.user.lastName
            ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim()
            : row.user.email}
          <MetaLine>{row.user.email}</MetaLine>
        </PartnerCell>
      ),
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
          {row.daysUntilExpiry != null && row.status === 'Cleared' && (
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
      key: 'receipt',
      header: 'Бележка',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.receipt?.merchantName ?? row.description ?? '—'}
          {row.receipt?.totalAmount != null && <MetaLine>{fmtMoney(row.receipt.totalAmount)} лв.</MetaLine>}
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
    markPaidMutation.isPending || reminderMutation.isPending ||
    approveMutation.isPending || lockMutation.isPending || expireMutation.isPending;

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Абонати</Eyebrow>
          <PageTitle>Кешбек</PageTitle>
          <PageSubtitle>
            {view === 'entries'
              ? 'Записи по статус (Изчакващ / Одобрен / Заключен / Платен / Изтекъл) — спец. §4.4'
              : 'Месечни задължения на партньори от транзакции на абонати'}
          </PageSubtitle>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <ViewTab $active={view === 'entries'} onClick={() => setView('entries')}>
              Всички записи
            </ViewTab>
            <ViewTab $active={view === 'partners'} onClick={() => setView('partners')}>
              По партньор / месец
            </ViewTab>
          </div>
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

      {/* Payout threshold reference */}
      <div style={{ fontSize: '0.8rem', color: palette.textSubtle, marginBottom: '1rem' }}>
        Прагове за изплащане (само одобрен кешбек се брои — спец. §4.4):
        {' '}Basic {fmtMoney(PAYOUT_THRESHOLDS.BASIC)} лв. ·
        {' '}Light {fmtMoney(PAYOUT_THRESHOLDS.LIGHT)} лв. ·
        {' '}Premium {fmtMoney(PAYOUT_THRESHOLDS.PREMIUM)} лв.
      </div>

      <Card>
        <FilterRow>
          {view === 'partners' ? (
            <>
              <MonthInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PaymentStatus | '')}>
                <option value="">Всички статуси</option>
                <option value="PENDING">Изчакващо</option>
                <option value="PAID">Платено</option>
                <option value="OVERDUE">Просрочено</option>
              </Select>
            </>
          ) : (
            <>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <SearchInput
                  type="text"
                  placeholder="Търси абонат (имe / имейл)…"
                  value={subscriberSearch}
                  onChange={(e) => setSubscriberSearch(e.target.value)}
                  title="Търсенето важи само за текущата страница (25 реда)"
                />
                {subscriberSearch && (
                  <span style={{ fontSize: '0.7rem', color: palette.textSubtle }}>
                    Само текуща страница — сменете статус за глобален филтър
                  </span>
                )}
              </div>
              <MonthInput
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="От дата"
              />
              <MonthInput
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="До дата"
              />
            </>
          )}
        </FilterRow>

        {view === 'entries' ? (
          <DataTable
            columns={entryColumns}
            data={filteredEntries}
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
                label: 'Изтечи',
                hidden: (row) => ['Paid', 'Expired', 'Locked'].includes(row.status),
                onClick: (row) => {
                  if (!window.confirm(`Принудително изтичане на кешбек за ${row.user.email}?\nТова действие не може да се отмени.`)) return;
                  expireMutation.mutate(row.id);
                },
              },
            ]}
          />
        ) : (
          <DataTable
            columns={partnerColumns}
            data={summary}
            rowKey={(row) => `${row.partnerId}-${row.month}`}
            loading={isLoading}
            emptyMessage="Няма записи за периода"
            rowActions={[
              {
                label: 'Маркирай като платено',
                hidden: (row) => row.paymentStatus === 'PAID',
                onClick: (row) => {
                  if (!window.confirm(`Маркирай кешбек за ${row.partnerName} (${row.month}) като платен?\nСума: ${fmtMoney(row.totalOwed)} лв.`)) return;
                  const notes = window.prompt('Бележки (референция за плащане и др.):') ?? undefined;
                  markPaidMutation.mutate({ partnerId: row.partnerId, notes: notes || undefined });
                },
              },
              {
                label: 'Изпрати напомняне',
                hidden: (row) => row.paymentStatus === 'PAID',
                onClick: (row) => {
                  if (!window.confirm(`Изпрати имейл напомняне до ${row.partnerEmail ?? row.partnerName}?`)) return;
                  reminderMutation.mutate(row.partnerId);
                },
              },
            ]}
          />
        )}

        {isMutating && (
          <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.8125rem', color: palette.textSubtle }}>
            Обновяване…
          </div>
        )}
      </Card>

      {/* Backfill action for legacy entries */}
      <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
        <ViewTab
          $active={false}
          disabled={backfillMutation.isPending}
          onClick={() => {
            if (!window.confirm('Попълни дата на изтичане за всички записи без такава (legacy данни)?\nТова е еднократна операция.')) return;
            backfillMutation.mutate();
          }}
          style={{ fontSize: '0.75rem', opacity: backfillMutation.isPending ? 0.6 : 1, cursor: backfillMutation.isPending ? 'not-allowed' : 'pointer' }}
        >
          {backfillMutation.isPending ? 'Обработва се…' : 'Backfill дати на изтичане'}
        </ViewTab>
      </div>
    </PageShell>
  );
}
