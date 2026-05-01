import { useState } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import { adminControlService, AdminAuditLog } from '../../services/adminControl.service';

// Spec §10 Администратори > История на действията — surfaced inside Control section.
// Shows security-relevant admin actions: auth, permissions, suspensions, approvals.

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  warning: '#b5803a', warningSoft: '#f5ead2',
  success: '#4a7c59', successSoft: '#e6efe3',
  info: '#2563eb', infoSoft: '#dbeafe',
};

const PageShell = styled.div`background:${palette.bg};min-height:calc(100vh - 4rem);padding:2rem 2.5rem;`;
const PageHeader = styled.div`display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;gap:1rem;flex-wrap:wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${palette.textSubtle};margin-bottom:.25rem;`;
const PageTitle = styled.h1`font-size:1.75rem;font-weight:800;color:${palette.text};margin:0 0 .25rem;`;
const PageSubtitle = styled.p`font-size:.9375rem;color:${palette.textMuted};margin:0;`;
const TotalBadge = styled.span`
  display:inline-flex;align-items:center;justify-content:center;
  background:${palette.infoSoft};color:${palette.info};
  font-size:.75rem;font-weight:700;border-radius:9999px;
  padding:.125rem .6rem;margin-left:.5rem;
`;
const Card = styled.div`background:${palette.surface};border:1px solid ${palette.border};border-radius:.75rem;padding:1.5rem;`;
const FilterRow = styled.div`display:flex;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap;align-items:center;`;
const Input = styled.input`padding:.5rem .75rem;border:1px solid ${palette.border};border-radius:.5rem;font-size:.875rem;background:${palette.bg};color:${palette.text};outline:none;min-width:13rem;&:focus{border-color:${palette.accent};}`;
const DateInput = styled.input`padding:.5rem .75rem;border:1px solid ${palette.border};border-radius:.5rem;font-size:.875rem;background:${palette.bg};color:${palette.text};outline:none;&:focus{border-color:${palette.accent};}`;
const Btn = styled.button<{ $variant?: 'danger' }>`
  padding:.5rem 1rem;border-radius:.5rem;font-size:.875rem;font-weight:600;cursor:pointer;
  ${p => p.$variant === 'danger'
    ? `border:1px solid ${palette.danger};background:${palette.dangerSoft};color:${palette.danger};`
    : `border:1px solid ${palette.border};background:${palette.surface};color:${palette.text};`
  }
  &:hover{opacity:.85;}
`;
const PrimaryLine = styled.div`font-weight:600;color:${palette.text};`;
const MetaLine = styled.div`font-size:.75rem;color:${palette.textSubtle};margin-top:.125rem;`;
const ActionTag = styled.span`
  display:inline-block;padding:.15rem .5rem;border-radius:.25rem;font-size:.72rem;font-weight:700;
  font-family:monospace;background:${palette.infoSoft};color:${palette.info};max-width:18rem;
  word-break:break-all;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
`;
const RoleBadge = styled.span<{ $super?: boolean }>`
  display:inline-block;padding:.1rem .45rem;border-radius:.25rem;font-size:.68rem;font-weight:700;
  margin-left:.35rem;vertical-align:middle;
  background:${p => p.$super ? palette.dangerSoft : palette.warningSoft};
  color:${p => p.$super ? palette.danger : palette.warning};
`;
const ObjectTag = styled.span`
  display:inline-block;padding:.15rem .5rem;border-radius:.25rem;font-size:.72rem;font-weight:600;
  font-family:monospace;background:${palette.warningSoft};color:${palette.warning};max-width:12rem;
  word-break:break-all;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
`;
const DiffToggle = styled.button`
  font-size:.72rem;font-weight:600;color:${palette.info};background:none;border:none;
  cursor:pointer;padding:0;text-decoration:underline;margin-top:.25rem;display:block;
  &:hover{opacity:.75;}
`;
const DiffBlock = styled.pre`
  margin:.25rem 0 0;padding:.5rem .75rem;border-radius:.375rem;
  font-size:.7rem;font-family:monospace;background:${palette.bg};
  border:1px solid ${palette.border};white-space:pre-wrap;word-break:break-all;
  max-height:12rem;overflow-y:auto;color:${palette.textMuted};
`;

const PAGE_SIZE = 25;

function DiffCell({ before, after }: { before: unknown; after: unknown }) {
  const [open, setOpen] = useState(false);
  const hasDiff = before !== null || after !== null;
  if (!hasDiff) return <MetaLine>—</MetaLine>;
  return (
    <span>
      <DiffToggle onClick={() => setOpen(o => !o)}>{open ? 'скрий' : 'виж промени'}</DiffToggle>
      {open && (
        <DiffBlock>
          {before !== null && `← преди:\n${JSON.stringify(before, null, 2)}\n`}
          {after  !== null && `→ след:\n${JSON.stringify(after,  null, 2)}`}
        </DiffBlock>
      )}
    </span>
  );
}

export default function AdminControlAuditLogPage() {
  const [page, setPage] = useState(1);

  const [draftAction, setDraftAction] = useState('');
  const [draftActor,  setDraftActor]  = useState('');
  const [draftFrom,   setDraftFrom]   = useState('');
  const [draftTo,     setDraftTo]     = useState('');

  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter,  setActorFilter]  = useState('');
  const [fromFilter,   setFromFilter]   = useState('');
  const [toFilter,     setToFilter]     = useState('');

  const hasActiveFilter = !!(actionFilter || actorFilter || fromFilter || toFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-security-logs', page, actionFilter, actorFilter, fromFilter, toFilter],
    queryFn: () => adminControlService.getSecurityLogs({
      page,
      limit: PAGE_SIZE,
      action:  actionFilter || undefined,
      actorId: actorFilter  || undefined,
      from:    fromFilter   || undefined,
      to:      toFilter     || undefined,
    }),
  });

  const applyFilters = () => {
    setActionFilter(draftAction.trim());
    setActorFilter(draftActor.trim());
    setFromFilter(draftFrom);
    setToFilter(draftTo);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftAction(''); setActionFilter('');
    setDraftActor('');  setActorFilter('');
    setDraftFrom('');   setFromFilter('');
    setDraftTo('');     setToFilter('');
    setPage(1);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('bg-BG', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const fullName = (actor: AdminAuditLog['actor']) => {
    if (!actor) return '—';
    if (actor.firstName || actor.lastName) return `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim();
    return actor.email;
  };

  const columns: ColumnDef<AdminAuditLog>[] = [
    {
      key: 'actor',
      header: 'Извършено от',
      render: (row) => (
        <span>
          <PrimaryLine>
            {fullName(row.actor)}
            {row.actor?.role && (
              <RoleBadge $super={row.actor.role === 'SUPER_ADMIN'}>
                {row.actor.role === 'SUPER_ADMIN' ? 'СУПЕР' : 'ADMIN'}
              </RoleBadge>
            )}
          </PrimaryLine>
          {row.actor && <MetaLine>{row.actor.email}</MetaLine>}
          {row.ip && <MetaLine>IP: {row.ip}</MetaLine>}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Действие',
      render: (row) => <ActionTag title={row.action}>{row.action}</ActionTag>,
    },
    {
      key: 'object',
      header: 'Обект',
      render: (row) => (
        <span>
          {row.objectType && <MetaLine style={{ fontWeight: 600, color: palette.textMuted }}>{row.objectType}</MetaLine>}
          {row.objectId && <ObjectTag title={row.objectId}>{row.objectId.slice(-12)}</ObjectTag>}
        </span>
      ),
    },
    {
      key: 'diff',
      header: 'Промени',
      render: (row) => <DiffCell before={row.before} after={row.after} />,
    },
    {
      key: 'createdAt',
      header: 'Дата',
      render: (row) => <MetaLine>{fmt(row.createdAt)}</MetaLine>,
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Контрол</Eyebrow>
          <PageTitle>
            Сигурност и одит
            {data && data.meta.total > 0 && (
              <TotalBadge>{data.meta.total.toLocaleString()}</TotalBadge>
            )}
          </PageTitle>
          <PageSubtitle>
            Одит лог на действия свързани със сигурността — вход, права, спиране, одобрения
          </PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <Input
            placeholder="Действие (напр. risk-queue.POST)…"
            value={draftAction}
            onChange={e => setDraftAction(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
          />
          <Input
            placeholder="ID на актор (UUID)…"
            value={draftActor}
            onChange={e => setDraftActor(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
          />
          <DateInput
            type="date"
            title="От дата"
            value={draftFrom}
            onChange={e => setDraftFrom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
          />
          <DateInput
            type="date"
            title="До дата"
            value={draftTo}
            onChange={e => setDraftTo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
          />
          <Btn onClick={applyFilters}>Търси</Btn>
          {hasActiveFilter && (
            <Btn $variant="danger" onClick={clearFilters}>Изчисти</Btn>
          )}
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={row => row.id}
          loading={isLoading}
          emptyMessage="Няма записи за избраните филтри"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
        />
      </Card>
    </PageShell>
  );
}
