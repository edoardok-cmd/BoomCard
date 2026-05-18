import { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import { adminAdminsService, AuditLogEntry } from '../../services/adminAdmins.service';
import { labelForAction } from '../../utils/auditActionLabel';

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

// ─── Label maps ──────────────────────────────────────────────────────────────


const OBJECT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '',             label: 'Всички обекти' },
  { value: 'admin',        label: 'Администратор' },
  { value: 'user',         label: 'Потребител' },
  { value: 'subscriber',   label: 'Абонат' },
  { value: 'partner',      label: 'Партньор' },
  { value: 'location',     label: 'Локация' },
  { value: 'subscription', label: 'Абонамент' },
  { value: 'transaction',  label: 'Транзакция' },
  { value: 'receipt',      label: 'Касова бележка' },
  { value: 'cashback',     label: 'Кешбек' },
  { value: 'payout',       label: 'Плащане' },
  { value: 'dispute',      label: 'Спор' },
  { value: 'campaign',     label: 'Кампания' },
  { value: 'template',     label: 'Шаблон' },
  { value: 'marketing',    label: 'Маркетинг' },
  { value: 'settings',     label: 'Настройки' },
  { value: 'system',       label: 'Система' },
  { value: 'period',       label: 'Отчетен период' },
  { value: 'risk',             label: 'Риск' },
  { value: 'limit',            label: 'Лимит' },
  { value: 'receipt-template', label: 'Шаблон касова бележка' },
  { value: 'help',             label: 'Вътрешна заявка' },
];

const ACTION_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: '',            label: 'Всички действия' },
  { value: 'auth',        label: 'Автентикация' },
  { value: 'admin',       label: 'Администратори' },
  { value: 'subscriber',  label: 'Абонати' },
  { value: 'user',        label: 'Потребители' },
  { value: 'partner',     label: 'Партньори' },
  { value: 'location',    label: 'Локации' },
  { value: 'subscription','label': 'Абонаменти' },
  { value: 'transaction', label: 'Транзакции' },
  { value: 'receipt',     label: 'Касови бележки' },
  { value: 'cashback',    label: 'Кешбек' },
  { value: 'payout',      label: 'Плащания' },
  { value: 'dispute',     label: 'Спорове' },
  { value: 'marketing',   label: 'Маркетинг' },
  { value: 'campaign',    label: 'Кампании' },
  { value: 'settings',    label: 'Настройки' },
  { value: 'system',      label: 'Система' },
  { value: 'period',      label: 'Отчетни периоди' },
  { value: 'risk',             label: 'Риск' },
  { value: 'limit',            label: 'Лимити' },
  { value: 'receipt-template', label: 'Шаблони касови бележки' },
  { value: 'help',             label: 'Вътрешни заявки' },
];

const OBJECT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  OBJECT_TYPE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
);

// ─── Styled components ────────────────────────────────────────────────────────

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
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
`;

const FilterRowSecond = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 14rem;
  max-width: 22rem;
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

const DateInput = styled.input`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const SelectFilter = styled.select`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const SearchBtn = styled.button`
  padding: 0.5rem 1rem;
  background: ${palette.accent};
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  white-space: nowrap;
  &:hover { opacity: 0.9; }
`;

const ClearBtn = styled.button`
  padding: 0.5rem 0.875rem;
  background: transparent;
  color: ${palette.textMuted};
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  cursor: pointer;
  white-space: nowrap;
  &:hover { border-color: ${palette.text}; color: ${palette.text}; }
`;

const ExportBtn = styled.button`
  padding: 0.5rem 1rem;
  background: transparent;
  color: ${palette.info};
  font-size: 0.875rem;
  font-weight: 600;
  border: 1px solid ${palette.info};
  border-radius: 0.5rem;
  cursor: pointer;
  white-space: nowrap;
  margin-left: auto;
  &:hover { background: ${palette.infoSoft}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const DateLabel = styled.span`
  font-size: 0.8125rem;
  color: ${palette.textSubtle};
  white-space: nowrap;
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

const ActionTag = styled.span`
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${palette.text};
`;

const ActionRaw = styled.code`
  display: block;
  font-size: 0.7rem;
  font-family: ui-monospace, 'Cascadia Code', monospace;
  color: ${palette.textSubtle};
  margin-top: 0.15rem;
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
  max-width: 46rem;
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

const MetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-bottom: 1rem;
`;

const MetaItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const MetaItemLabel = styled.span`
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
`;

const MetaItemValue = styled.span`
  font-size: 0.8125rem;
  color: ${palette.textMuted};
  font-family: ui-monospace, monospace;
  word-break: break-all;
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

// ─── CSV export ───────────────────────────────────────────────────────────────

function escapeCsv(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(rows: AuditLogEntry[]) {
  const headers = ['ID', 'Дата', 'Действие', 'Тип обект', 'Обект ID', 'Извършено от', 'Имейл', 'IP адрес', 'User Agent'];
  const lines = [
    headers.join(','),
    ...rows.map((r) => [
      r.id,
      r.createdAt,
      r.action,
      r.objectType,
      r.objectId ?? '',
      r.actor ? `${r.actor.firstName ?? ''} ${r.actor.lastName ?? ''}`.trim() : 'Система',
      r.actor?.email ?? '',
      r.ip ?? '',
      r.userAgent ?? '',
    ].map(escapeCsv).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminAdminsAuditPage() {
  const { language } = useLanguage();
  const [searchParams] = useSearchParams();

  // Committed filter state (drives the query)
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [objectType, setObjectType]   = useState('');
  const [actionCat, setActionCat]     = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [actorId, setActorId]         = useState(() => searchParams.get('actorId') ?? '');

  // Pending input state for the search box (committed on button click or Enter)
  const [searchDraft, setSearchDraft] = useState('');
  // Draft for actor ID — debounced to avoid one query per keystroke when typing a UUID
  const [actorIdDraft, setActorIdDraft] = useState(() => searchParams.get('actorId') ?? '');

  useEffect(() => {
    const t = setTimeout(() => { setActorId(actorIdDraft); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [actorIdDraft]);

  const [detail, setDetail]           = useState<AuditLogEntry | null>(null);
  const [exporting, setExporting]     = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit', page, search, objectType, actionCat, dateFrom, dateTo, actorId],
    queryFn: () =>
      adminAdminsService.listAudit({
        page,
        limit: PAGE_SIZE,
        search:     search     || undefined,
        objectType: objectType || undefined,
        action:     actionCat  || undefined,
        dateFrom:   dateFrom   || undefined,
        dateTo:     dateTo     || undefined,
        actorId:    actorId    || undefined,
      }),
  });

  const commitSearch = useCallback(() => {
    setSearch(searchDraft);
    setPage(1);
  }, [searchDraft]);

  const clearFilters = useCallback(() => {
    setSearchDraft('');
    setSearch('');
    setObjectType('');
    setActionCat('');
    setDateFrom('');
    setDateTo('');
    setActorIdDraft('');
    setActorId('');
    setPage(1);
  }, []);

  const hasActiveFilters = search || objectType || actionCat || dateFrom || dateTo || actorId;

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await adminAdminsService.listAudit({
        page:       1,
        limit:      10000,
        search:     search     || undefined,
        objectType: objectType || undefined,
        action:     actionCat  || undefined,
        dateFrom:   dateFrom   || undefined,
        dateTo:     dateTo     || undefined,
        actorId:    actorId    || undefined,
      });
      downloadCsv(result.logs);
    } catch {
      toast.error('Грешка при експорт на одит лог');
    } finally {
      setExporting(false);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const columns: ColumnDef<AuditLogEntry>[] = [
    {
      key: 'actor',
      header: 'Извършено от',
      render: (row) =>
        row.actor ? (
          <ActorCell>
            {row.actor.firstName || row.actor.lastName
              ? `${row.actor.firstName ?? ''} ${row.actor.lastName ?? ''}`.trim()
              : '—'}
            <MetaLine>{row.actor.email}</MetaLine>
          </ActorCell>
        ) : (
          <span style={{ color: palette.textSubtle, fontSize: '0.8125rem' }}>Система</span>
        ),
    },
    {
      key: 'action',
      header: 'Действие',
      render: (row) => (
        <div>
          <ActionTag>{labelForAction(row.action)}</ActionTag>
          <ActionRaw>{row.action}</ActionRaw>
        </div>
      ),
    },
    {
      key: 'object',
      header: 'Обект',
      render: (row) => (
        <ObjectCell>
          {OBJECT_TYPE_LABEL[row.objectType] ?? row.objectType}
          {row.objectId && <ObjectId>{row.objectId}</ObjectId>}
        </ObjectCell>
      ),
    },
    {
      key: 'ip',
      header: 'IP адрес',
      render: (row) => (
        <span style={{ color: palette.textSubtle, fontSize: '0.75rem', fontFamily: 'ui-monospace, monospace' }}>
          {row.ip ?? '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Дата и час',
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
        <Eyebrow>Администратори</Eyebrow>
        <PageTitle>
          История на действията
          {data && <TotalBadge>{(data.total ?? 0).toLocaleString()}</TotalBadge>}
        </PageTitle>
        <PageSubtitle>Всички действия в администраторския панел — кой, какво, кога, върху кой обект, преди и след</PageSubtitle>
      </PageHeader>

      <Card>
        {/* Row 1: text search + object type + action category */}
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Търси по действие, тип обект, ID или извършител…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitSearch(); }}
          />
          <SearchBtn onClick={commitSearch}>Търси</SearchBtn>

          <SelectFilter
            value={objectType}
            onChange={(e) => { setObjectType(e.target.value); setPage(1); }}
          >
            {OBJECT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </SelectFilter>

          <SelectFilter
            value={actionCat}
            onChange={(e) => { setActionCat(e.target.value); setPage(1); }}
          >
            {ACTION_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </SelectFilter>

          {hasActiveFilters && (
            <ClearBtn onClick={clearFilters}>Изчисти</ClearBtn>
          )}

          <ExportBtn onClick={handleExport} disabled={exporting}>
            {exporting ? 'Експортира…' : 'Експорт CSV'}
          </ExportBtn>
        </FilterRow>

        {/* Row 2: date range + actor ID filter */}
        <FilterRowSecond>
          <DateLabel>От:</DateLabel>
          <DateInput
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
          <DateLabel>До:</DateLabel>
          <DateInput
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
          <DateLabel>Администратор ID:</DateLabel>
          <SearchInput
            type="text"
            placeholder="UUID на администратора…"
            value={actorIdDraft}
            onChange={(e) => setActorIdDraft(e.target.value)}
            style={{ flex: '0 1 18rem', minWidth: '12rem' }}
          />
        </FilterRowSecond>

        <DataTable
          columns={columns}
          data={data?.logs ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="Няма намерени записи"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'Виж детайли',
              onClick: (row) => setDetail(row),
            },
          ]}
        />
      </Card>

      {detail && (
        <OverlayBackdrop onClick={() => setDetail(null)}>
          <OverlayCard onClick={(e) => e.stopPropagation()}>
            <OverlayTitle>
              {labelForAction(detail.action)}
              {detail.objectId && (
                <span style={{ fontSize: '0.75rem', color: palette.textSubtle, marginLeft: '0.5rem', fontWeight: 400 }}>
                  #{detail.objectId.slice(0, 8)}
                </span>
              )}
            </OverlayTitle>

            {/* Meta row: actor, IP, user agent, timestamp */}
            <MetaRow>
              <MetaItem>
                <MetaItemLabel>Извършено от</MetaItemLabel>
                <MetaItemValue>{detail.actor?.email ?? 'Система'}</MetaItemValue>
              </MetaItem>
              <MetaItem>
                <MetaItemLabel>IP адрес</MetaItemLabel>
                <MetaItemValue>{detail.ip ?? '—'}</MetaItemValue>
              </MetaItem>
              <MetaItem>
                <MetaItemLabel>Дата и час</MetaItemLabel>
                <MetaItemValue>{fmt(detail.createdAt)}</MetaItemValue>
              </MetaItem>
              <MetaItem>
                <MetaItemLabel>Тип обект</MetaItemLabel>
                <MetaItemValue>{OBJECT_TYPE_LABEL[detail.objectType] ?? detail.objectType}</MetaItemValue>
              </MetaItem>
              {detail.objectId && (
                <MetaItem>
                  <MetaItemLabel>Обект ID</MetaItemLabel>
                  <MetaItemValue>{detail.objectId}</MetaItemValue>
                </MetaItem>
              )}
              {detail.userAgent && (
                <MetaItem>
                  <MetaItemLabel>User Agent</MetaItemLabel>
                  <MetaItemValue style={{ fontFamily: 'ui-sans-serif, sans-serif', fontSize: '0.75rem' }}>
                    {detail.userAgent}
                  </MetaItemValue>
                </MetaItem>
              )}
            </MetaRow>

            {/* Before / After diff */}
            <DiffGrid>
              <DiffPanel>
                <DiffLabel>Преди</DiffLabel>
                <DiffCode>
                  {detail.before != null ? JSON.stringify(detail.before, null, 2) : '—'}
                </DiffCode>
              </DiffPanel>
              <DiffPanel>
                <DiffLabel>След / Заявка</DiffLabel>
                <DiffCode>
                  {detail.after != null ? JSON.stringify(detail.after, null, 2) : '—'}
                </DiffCode>
              </DiffPanel>
            </DiffGrid>

            <CloseBtn onClick={() => setDetail(null)}>Затвори</CloseBtn>
          </OverlayCard>
        </OverlayBackdrop>
      )}
    </PageShell>
  );
}
