import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import { adminAdminsService, AuditLogEntry } from '../../services/adminAdmins.service';

const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  border: '#e8e5dc',
  text: '#141413',
  textMuted: '#605a50',
  textSubtle: '#8c8678',
  accent: '#c96442',
  accentSoft: '#f3e8de',
  info: '#2563eb',
  infoSoft: '#dbeafe',
  success: '#4a7c59',
  successSoft: '#e6efe3',
  warning: '#b5803a',
  warningSoft: '#f5ead2',
  danger: '#b54327',
  dangerSoft: '#f4dcd2',
};

const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

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

const TotalBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${palette.infoSoft};
  color: ${palette.info};
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 9999px;
  padding: 0.125rem 0.6rem;
  margin-left: 0.5rem;
`;

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

const SearchInput = styled.input`
  flex: 1;
  max-width: 20rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
`;

const Input = styled.input`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
`;

const ActorCell = styled.div`
  font-weight: 600;
  color: ${palette.text};
  font-size: 0.875rem;
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const ActionTag = styled.code`
  font-size: 0.75rem;
  font-family: ui-monospace, 'Cascadia Code', monospace;
  background: #f1f0ec;
  color: ${palette.text};
  border-radius: 0.25rem;
  padding: 0.1rem 0.4rem;
`;

const ObjectCell = styled.div`
  font-size: 0.8125rem;
  color: ${palette.textMuted};
`;

const ObjectId = styled.span`
  font-size: 0.7rem;
  font-family: ui-monospace, monospace;
  color: ${palette.textSubtle};
  display: block;
  margin-top: 0.125rem;
`;

/* Expandable detail overlay */
const OverlayBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(20, 20, 19, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const OverlayCard = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.75rem;
  width: 100%;
  max-width: 42rem;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0,0,0,0.15);
`;

const OverlayTitle = styled.h2`
  font-size: 1.0625rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 1rem;
`;

const DiffGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
`;

const DiffPanel = styled.div`
  background: #f8f7f3;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  padding: 0.75rem;
`;

const DiffLabel = styled.p`
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: ${palette.textSubtle};
  margin: 0 0 0.5rem;
`;

const DiffCode = styled.pre`
  font-size: 0.75rem;
  font-family: ui-monospace, 'Cascadia Code', monospace;
  color: ${palette.text};
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
`;

const CloseBtn = styled.button`
  margin-top: 1rem;
  padding: 0.5rem 1.25rem;
  background: transparent;
  color: ${palette.textMuted};
  font-size: 0.875rem;
  font-weight: 600;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  cursor: pointer;
  &:hover { border-color: ${palette.text}; color: ${palette.text}; }
`;

const PAGE_SIZE = 20;

export default function AdminAdminsAuditPage() {
  const { language } = useLanguage();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [objectType, setObjectType] = useState('');
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit', page, search, objectType],
    queryFn: () =>
      adminAdminsService.listAudit({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        objectType: objectType.trim() || undefined,
      }),
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const columns: ColumnDef<AuditLogEntry>[] = [
    {
      key: 'actor',
      header: 'Actor',
      render: (row) =>
        row.actor ? (
          <ActorCell>
            {row.actor.firstName || row.actor.lastName
              ? `${row.actor.firstName ?? ''} ${row.actor.lastName ?? ''}`.trim()
              : '—'}
            <MetaLine>{row.actor.email}</MetaLine>
          </ActorCell>
        ) : (
          <span style={{ color: palette.textSubtle, fontSize: '0.8125rem' }}>System</span>
        ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <ActionTag>{row.action}</ActionTag>,
    },
    {
      key: 'object',
      header: 'Object',
      render: (row) => (
        <ObjectCell>
          {row.objectType}
          {row.objectId && <ObjectId>{row.objectId}</ObjectId>}
        </ObjectCell>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      render: (row) => (
        <span style={{ color: palette.textSubtle, fontSize: '0.75rem', fontFamily: 'ui-monospace, monospace' }}>
          {row.ip ?? '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
          {fmt(row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Admins</Eyebrow>
        <PageTitle>
          Audit Log
          {data && data.total > 0 && <TotalBadge>{data.total.toLocaleString()}</TotalBadge>}
        </PageTitle>
        <PageSubtitle>All admin-panel mutation events — who did what and when</PageSubtitle>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search by action, object type or actor…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <Input
            type="text"
            placeholder="Filter by object type…"
            value={objectType}
            style={{ width: '13rem' }}
            onChange={(e) => { setObjectType(e.target.value); setPage(1); }}
          />
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.logs ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="No audit log entries found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'View diff',
              hidden: (row) => row.before == null && row.after == null,
              onClick: (row) => setDetail(row),
            },
          ]}
        />
      </Card>

      {detail && (
        <OverlayBackdrop onClick={() => setDetail(null)}>
          <OverlayCard onClick={(e) => e.stopPropagation()}>
            <OverlayTitle>
              Diff — <code style={{ fontSize: '0.9em' }}>{detail.action}</code>
              {detail.objectId && (
                <span style={{ fontSize: '0.75rem', color: palette.textSubtle, marginLeft: '0.5rem' }}>
                  #{detail.objectId.slice(0, 8)}
                </span>
              )}
            </OverlayTitle>

            <DiffGrid>
              <DiffPanel>
                <DiffLabel>Before</DiffLabel>
                <DiffCode>{detail.before != null ? JSON.stringify(detail.before, null, 2) : '—'}</DiffCode>
              </DiffPanel>
              <DiffPanel>
                <DiffLabel>After</DiffLabel>
                <DiffCode>{detail.after != null ? JSON.stringify(detail.after, null, 2) : '—'}</DiffCode>
              </DiffPanel>
            </DiffGrid>

            <div style={{ fontSize: '0.75rem', color: palette.textSubtle }}>
              Actor: {detail.actor?.email ?? 'System'} · IP: {detail.ip ?? '—'} · {fmt(detail.createdAt)}
            </div>

            <CloseBtn onClick={() => setDetail(null)}>Close</CloseBtn>
          </OverlayCard>
        </OverlayBackdrop>
      )}
    </PageShell>
  );
}
