import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminControlService,
  AdminAuditLog,
} from '../../services/adminControl.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  warning: '#b5803a', warningSoft: '#f5ead2',
  info: '#2563eb', infoSoft: '#dbeafe',
  purple: '#7c3aed', purpleSoft: '#ede9fe',
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
const DateInput = styled.input`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

const ActionBadge = styled.span`
  display: inline-flex; font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.04em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  background: ${palette.purpleSoft}; color: ${palette.purple};
  font-family: monospace;
`;

const ObjectBadge = styled.span`
  display: inline-flex; font-size: 0.7rem; font-weight: 600;
  border-radius: 0.375rem; padding: 0.125rem 0.45rem;
  background: ${palette.infoSoft}; color: ${palette.info};
`;

const DiffCell = styled.div`
  font-size: 0.75rem;
  max-width: 16rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${palette.textSubtle};
  font-family: monospace;
`;

const PAGE_SIZE = 25;

export default function AdminControlSecurityPage() {
  const [page, setPage] = useState(1);
  const [actionInput, setActionInput] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [queryFrom, setQueryFrom] = useState('');
  const [queryTo, setQueryTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-security-logs', page, action, queryFrom, queryTo],
    queryFn: () =>
      adminControlService.getSecurityLogs({
        page, limit: PAGE_SIZE,
        action: action || undefined,
        from: queryFrom || undefined,
        to: queryTo || undefined,
      }),
  });

  const handleActionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { setAction(actionInput); setPage(1); }
  };

  const applyDates = () => {
    setQueryFrom(from);
    setQueryTo(to);
    setPage(1);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const columns: ColumnDef<AdminAuditLog>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <ActionBadge>{row.action}</ActionBadge>
          <ObjectBadge>{row.objectType}{row.objectId ? ` #${row.objectId.slice(0, 8)}` : ''}</ObjectBadge>
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) =>
        row.actor ? (
          <span>
            <PrimaryLine>
              {row.actor.firstName || row.actor.lastName
                ? `${row.actor.firstName ?? ''} ${row.actor.lastName ?? ''}`.trim()
                : '—'}
            </PrimaryLine>
            <MetaLine>{row.actor.email}</MetaLine>
          </span>
        ) : (
          <MetaLine>System</MetaLine>
        ),
    },
    {
      key: 'diff',
      header: 'Changes',
      render: (row) => {
        const before = row.before ? JSON.stringify(row.before).slice(0, 60) : null;
        const after = row.after ? JSON.stringify(row.after).slice(0, 60) : null;
        if (!before && !after) return <MetaLine>—</MetaLine>;
        return (
          <span>
            {before && <DiffCell style={{ color: palette.danger }}>− {before}</DiffCell>}
            {after && <DiffCell style={{ color: palette.success }}>+ {after}</DiffCell>}
          </span>
        );
      },
    },
    {
      key: 'ip',
      header: 'IP',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted, fontFamily: 'monospace' }}>
          {row.ip ?? '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'When',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted, whiteSpace: 'nowrap' }}>
          {fmt(row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Control</Eyebrow>
          <PageTitle>
            Security Log
            {data && data.meta.total > 0 && <TotalBadge>{data.meta.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Admin actions, permission changes, and security events</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Filter by action (e.g. admin.create)…"
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            onKeyDown={handleActionKeyDown}
          />
          <DateInput
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            title="From date"
          />
          <DateInput
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            title="To date"
          />
          <button
            onClick={applyDates}
            style={{
              padding: '0.5rem 1rem', background: palette.accent, color: '#fff',
              border: 'none', borderRadius: '0.5rem', fontSize: '0.875rem',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="No security events found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
        />
      </Card>
    </PageShell>
  );
}
