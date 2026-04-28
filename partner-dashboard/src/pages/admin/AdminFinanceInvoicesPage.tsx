import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminFinanceService,
  AdminInvoice,
  InvoiceStatus,
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
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.infoSoft}; color: ${palette.info}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const SearchInput = styled.input`flex: 1; max-width: 18rem; padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; } &::placeholder { color: ${palette.textSubtle}; }`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

const StatusBadge = styled.span<{ $status: InvoiceStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'PAID':    return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'OVERDUE': return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      default:        return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    }
  }}
`;

const PartnerTypePill = styled.span<{ $color: string }>`
  display: inline-flex; align-items: center; font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; border-radius: 0.25rem;
  padding: 0.1rem 0.4rem;
  background: ${({ $color }) => $color}22; color: ${({ $color }) => $color};
  margin-left: 0.375rem;
`;

const STATUS_OPTIONS: Array<{ value: InvoiceStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
];

const PAGE_SIZE = 25;

export default function AdminFinanceInvoicesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [month, setMonth] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-finance-invoices', page, search, status, month],
    queryFn: () =>
      adminFinanceService.listInvoices({
        page, limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
        month: month || undefined,
      }),
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => adminFinanceService.markInvoicePaid(id),
    onSuccess: () => {
      toast.success('Invoice marked as paid');
      queryClient.invalidateQueries({ queryKey: ['admin-finance-invoices'] });
    },
    onError: () => toast.error('Failed to mark as paid'),
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const columns: ColumnDef<AdminInvoice>[] = [
    {
      key: 'partner',
      header: 'Partner',
      render: (row) => (
        <span>
          <PrimaryLine>{row.partner.businessName}</PrimaryLine>
          {row.partner.city && <MetaLine>{row.partner.city}</MetaLine>}
          {row.partner.partnerType && (
            <PartnerTypePill $color={row.partner.partnerType.color}>
              {row.partner.partnerType.name}
            </PartnerTypePill>
          )}
        </span>
      ),
    },
    {
      key: 'month',
      header: 'Month',
      render: (row) => (
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: palette.text }}>{row.month}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount owed',
      render: (row) => (
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
          {row.totalCashbackOwed.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <StatusBadge $status={row.status}>{row.status}</StatusBadge>
          {row.paidAt && <MetaLine>Paid {fmt(row.paidAt)}</MetaLine>}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{row.notes ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Finance</Eyebrow>
          <PageTitle>
            Partner Invoices
            {data && data.meta.total > 0 && <TotalBadge>{data.meta.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Monthly cashback invoices owed to partners</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search partner name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <Select value={status} onChange={(e) => { setStatus(e.target.value as InvoiceStatus | ''); setPage(1); }}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <input
            type="month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); setPage(1); }}
            style={{
              padding: '0.5rem 0.75rem', border: `1px solid ${palette.border}`,
              borderRadius: '0.5rem', fontSize: '0.875rem', background: palette.bg,
              color: palette.text, outline: 'none',
            }}
          />
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="No invoices found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'Mark as paid',
              hidden: (row) => row.status === 'PAID',
              onClick: (row) => {
                if (!window.confirm(`Mark invoice for ${row.partner.businessName} (${row.month}) as paid?`)) return;
                payMutation.mutate(row.id);
              },
            },
          ]}
        />
      </Card>
    </PageShell>
  );
}
