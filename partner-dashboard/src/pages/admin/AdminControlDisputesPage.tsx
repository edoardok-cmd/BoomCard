import { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminControlService,
  DisputeCase,
  DisputeCaseDetail,
  DisputeNoteItem,
  DisputeStatus,
} from '../../services/adminControl.service';

// ── Palette ──────────────────────────────────────────────────────────────────

const P = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', muted: '#605a50', subtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  warn: '#b5803a', warnSoft: '#f5ead2',
  info: '#2563eb', infoSoft: '#dbeafe',
};

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_META: Record<DisputeStatus, { label: string; bg: string; color: string }> = {
  OPEN:      { label: 'Отворен',    bg: P.infoSoft,    color: P.info },
  IN_REVIEW: { label: 'В преглед',  bg: P.warnSoft,    color: P.warn },
  RESOLVED:  { label: 'Решен',      bg: P.successSoft, color: P.success },
  CLOSED:    { label: 'Затворен',   bg: '#f1f0ed',     color: P.subtle },
};

const NEXT_STATUS: Partial<Record<DisputeStatus, DisputeStatus>> = {
  OPEN:      'IN_REVIEW',
  IN_REVIEW: 'RESOLVED',
  RESOLVED:  'CLOSED',
};

const NEXT_LABEL: Partial<Record<DisputeStatus, string>> = {
  OPEN:      'Поеми → В преглед',
  IN_REVIEW: 'Реши → Решен',
  RESOLVED:  'Затвори',
};

const ALL_FILTER = '' as DisputeStatus;

const FILTER_OPTIONS: { value: DisputeStatus | ''; label: string }[] = [
  { value: ALL_FILTER,   label: 'Всички' },
  { value: 'OPEN',       label: 'Отворен' },
  { value: 'IN_REVIEW',  label: 'В преглед' },
  { value: 'RESOLVED',   label: 'Решен' },
  { value: 'CLOSED',     label: 'Затворен' },
];

// ── Styled components ─────────────────────────────────────────────────────────

const Shell     = styled.div`background:${P.bg};min-height:calc(100vh - 4rem);padding:2rem 2.5rem;`;
const Header    = styled.div`display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;gap:1rem;flex-wrap:wrap;`;
const Eyebrow   = styled.p`font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${P.subtle};margin-bottom:.25rem;`;
const PageTitle = styled.h1`font-size:1.75rem;font-weight:800;color:${P.text};margin:0 0 .25rem;`;
const Subtitle  = styled.p`font-size:.9375rem;color:${P.muted};margin:0;`;
const Badge     = styled.span`display:inline-flex;align-items:center;justify-content:center;background:${P.warnSoft};color:${P.warn};font-size:.75rem;font-weight:700;border-radius:9999px;padding:.125rem .6rem;margin-left:.5rem;`;
const Card      = styled.div`background:${P.surface};border:1px solid ${P.border};border-radius:.75rem;padding:1.5rem;`;
const FilterRow = styled.div`display:flex;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap;align-items:center;`;
const Select    = styled.select`padding:.5rem .75rem;border:1px solid ${P.border};border-radius:.5rem;font-size:.875rem;background:${P.bg};color:${P.text};outline:none;cursor:pointer;&:focus{border-color:${P.accent};}`;

const PrimaryLine = styled.div`font-weight:600;color:${P.text};`;
const MetaLine    = styled.div`font-size:.75rem;color:${P.subtle};margin-top:.125rem;`;

const StatusPill = styled.span<{ $status: DisputeStatus }>`
  display:inline-flex;align-items:center;font-size:.72rem;font-weight:700;
  border-radius:9999px;padding:.15rem .6rem;
  background:${p => STATUS_META[p.$status]?.bg ?? P.warnSoft};
  color:${p => STATUS_META[p.$status]?.color ?? P.warn};
`;

const NoteCount = styled.span`
  display:inline-flex;align-items:center;gap:.25rem;font-size:.75rem;
  color:${P.muted};font-weight:600;
`;

// ── Slide-over panel ──────────────────────────────────────────────────────────

const Backdrop = styled.div<{ $open: boolean }>`
  position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1030;
  opacity:${p => p.$open ? 1 : 0};
  pointer-events:${p => p.$open ? 'auto' : 'none'};
  transition:opacity .2s;
`;

const Panel = styled.div<{ $open: boolean }>`
  position:fixed;top:0;right:0;bottom:0;width:min(620px,100vw);
  background:${P.surface};z-index:1031;
  box-shadow:-4px 0 32px rgba(0,0,0,.14);
  transform:${p => p.$open ? 'translateX(0)' : 'translateX(100%)'};
  transition:transform .22s cubic-bezier(.4,0,.2,1);
  display:flex;flex-direction:column;overflow:hidden;
`;

const PanelHeader = styled.div`
  padding:1.25rem 1.5rem;border-bottom:1px solid ${P.border};
  display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;flex-shrink:0;
`;

const PanelBody = styled.div`flex:1;overflow-y:auto;padding:1.5rem;display:flex;flex-direction:column;gap:1.5rem;`;

const CloseBtn = styled.button`
  width:2rem;height:2rem;border:none;background:none;cursor:pointer;
  color:${P.muted};font-size:1.2rem;display:flex;align-items:center;justify-content:center;
  border-radius:.375rem;flex-shrink:0;
  &:hover{background:${P.border};}
`;

const SectionLabel = styled.p`
  font-size:.7rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
  color:${P.subtle};margin:0 0 .625rem;
`;

const SectionCard = styled.div`
  background:${P.bg};border:1px solid ${P.border};border-radius:.625rem;
  padding:1rem 1.125rem;
`;

const KV = styled.div`display:flex;gap:.5rem;justify-content:space-between;align-items:flex-start;font-size:.875rem;&+&{margin-top:.5rem;}`;
const KLabel = styled.span`color:${P.muted};white-space:nowrap;`;
const KVal   = styled.span`color:${P.text};font-weight:600;text-align:right;word-break:break-all;`;

const AdvanceBtn = styled.button<{ $variant: 'resolve' | 'next' | 'close' }>`
  padding:.55rem 1.1rem;border:none;border-radius:.5rem;font-size:.875rem;font-weight:700;cursor:pointer;
  background:${p => p.$variant === 'resolve' ? P.success : p.$variant === 'close' ? P.subtle : P.accent};
  color:${p => p.$variant === 'close' ? P.muted : '#fff'};
  &:disabled{opacity:.5;cursor:not-allowed;}
`;

const DecisionArea = styled.textarea`
  width:100%;box-sizing:border-box;min-height:5rem;padding:.75rem;
  border:1px solid ${P.border};border-radius:.5rem;font-size:.875rem;
  font-family:inherit;resize:vertical;background:${P.bg};color:${P.text};
  outline:none;&:focus{border-color:${P.accent};}
`;

const NoteItem = styled.div`
  padding:.75rem .875rem;background:${P.bg};border-radius:.5rem;
  border:1px solid ${P.border};
`;

const NoteBody   = styled.p`font-size:.875rem;color:${P.text};margin:0 0 .3rem;white-space:pre-wrap;`;
const NoteMeta   = styled.p`font-size:.72rem;color:${P.subtle};margin:0;`;
const NoteInput  = styled.textarea`
  width:100%;box-sizing:border-box;min-height:4.5rem;padding:.75rem;
  border:1px solid ${P.border};border-radius:.5rem;font-size:.875rem;
  font-family:inherit;resize:vertical;background:${P.bg};color:${P.text};
  outline:none;&:focus{border-color:${P.accent};}
`;

const Btn = styled.button<{ $variant?: 'primary' | 'danger' | 'neutral' }>`
  padding:.5rem 1.25rem;border:none;border-radius:.5rem;font-weight:700;
  font-size:.875rem;cursor:pointer;
  background:${p => p.$variant === 'primary' ? P.accent : p.$variant === 'danger' ? P.danger : P.border};
  color:${p => (p.$variant === 'primary' || p.$variant === 'danger') ? '#fff' : P.text};
  &:disabled{opacity:.5;cursor:not-allowed;}
`;

const BtnRow = styled.div`display:flex;gap:.625rem;justify-content:flex-end;margin-top:.625rem;`;

const Divider = styled.hr`border:none;border-top:1px solid ${P.border};margin:0;`;

// ── Detail panel component ────────────────────────────────────────────────────

function DisputeDetailPanel({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [noteText, setNoteText] = useState('');
  const [decision, setDecision] = useState('');
  const [confirmAdvance, setConfirmAdvance] = useState<DisputeStatus | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dispute-case', id],
    queryFn: () => adminControlService.getDisputeCase(id),
    enabled: !!id,
  });

  const dc: DisputeCaseDetail | undefined = data?.data;

  const patchMutation = useMutation({
    mutationFn: (patch: { status?: DisputeStatus; decision?: string | null }) =>
      adminControlService.patchDisputeCase(id, patch),
    onSuccess: () => {
      toast.success('Статусът е обновен');
      qc.invalidateQueries({ queryKey: ['dispute-cases'] });
      qc.invalidateQueries({ queryKey: ['dispute-case', id] });
      setConfirmAdvance(null);
      setDecision('');
    },
    onError: () => toast.error('Грешка при обновяване на статус'),
  });

  const noteMutation = useMutation({
    mutationFn: (body: string) => adminControlService.addDisputeNote(id, body),
    onSuccess: () => {
      toast.success('Бележката е записана');
      qc.invalidateQueries({ queryKey: ['dispute-case', id] });
      setNoteText('');
    },
    onError: () => toast.error('Грешка при запис на бележка'),
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('bg-BG', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const fmtBgn = (n: number | null | undefined) =>
    n == null ? '—' : n.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 });

  const fullName = (u: { firstName: string | null; lastName: string | null; email: string }) =>
    (u.firstName || u.lastName) ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : u.email;

  const handleAdvance = () => {
    if (!confirmAdvance || !dc) return;
    const needsDecision = confirmAdvance === 'RESOLVED' || confirmAdvance === 'CLOSED';
    patchMutation.mutate({
      status: confirmAdvance,
      ...(needsDecision ? { decision: decision.trim() || null } : {}),
    });
  };

  const nextStatus = dc ? NEXT_STATUS[dc.status] : undefined;
  const needsDecision = confirmAdvance === 'RESOLVED' || confirmAdvance === 'CLOSED';

  return (
    <>
      <PanelHeader>
        <div>
          <Eyebrow style={{ marginBottom: '.125rem' }}>Спор #{id.slice(-8).toUpperCase()}</Eyebrow>
          {dc && (
            <StatusPill $status={dc.status} style={{ marginTop: '.25rem' }}>
              {STATUS_META[dc.status].label}
            </StatusPill>
          )}
        </div>
        <CloseBtn onClick={onClose} aria-label="Затвори">✕</CloseBtn>
      </PanelHeader>

      <PanelBody>
        {isLoading && <MetaLine>Зареждане…</MetaLine>}

        {dc && (
          <>
            {/* Subject */}
            <div>
              <SectionLabel>Потребител</SectionLabel>
              <SectionCard>
                <KV><KLabel>Име</KLabel><KVal>{fullName(dc.user)}</KVal></KV>
                <KV><KLabel>Имейл</KLabel><KVal>{dc.user.email}</KVal></KV>
              </SectionCard>
            </div>

            {/* Receipt */}
            <div>
              <SectionLabel>Касова бележка</SectionLabel>
              <SectionCard>
                <KV><KLabel>Търговец</KLabel><KVal>{dc.receipt.merchantName ?? '—'}</KVal></KV>
                <KV><KLabel>Сума</KLabel><KVal>{fmtBgn(dc.receipt.totalAmount)}</KVal></KV>
                <KV><KLabel>Верифицирана сума</KLabel><KVal>{fmtBgn(dc.receipt.verifiedAmount)}</KVal></KV>
                {dc.receipt.fraudScore != null && (
                  <KV>
                    <KLabel>Fraud score</KLabel>
                    <KVal style={{ color: dc.receipt.fraudScore >= 61 ? P.danger : dc.receipt.fraudScore >= 31 ? P.warn : P.success }}>
                      {dc.receipt.fraudScore}
                    </KVal>
                  </KV>
                )}
                {dc.receipt.fraudReasons && dc.receipt.fraudReasons.length > 0 && (
                  <KV>
                    <KLabel>Сигнали</KLabel>
                    <KVal style={{ color: P.danger, fontSize: '.75rem' }}>
                      {dc.receipt.fraudReasons.join(', ')}
                    </KVal>
                  </KV>
                )}
                <KV><KLabel>Статус на бележка</KLabel><KVal>{dc.receipt.status}</KVal></KV>
                <KV><KLabel>Подадена</KLabel><KVal>{fmt(dc.receipt.createdAt)}</KVal></KV>
              </SectionCard>
            </div>

            {/* Assignee */}
            <div>
              <SectionLabel>Отговорник</SectionLabel>
              <SectionCard>
                <KV>
                  <KLabel>Назначен</KLabel>
                  <KVal>{dc.assignee ? fullName(dc.assignee) : '—'}</KVal>
                </KV>
                <KV><KLabel>Отворен</KLabel><KVal>{fmt(dc.createdAt)}</KVal></KV>
                {dc.resolvedAt && <KV><KLabel>Решен на</KLabel><KVal>{fmt(dc.resolvedAt)}</KVal></KV>}
                {dc.closedAt   && <KV><KLabel>Затворен на</KLabel><KVal>{fmt(dc.closedAt)}</KVal></KV>}
              </SectionCard>
            </div>

            {/* Decision */}
            {dc.decision && (
              <div>
                <SectionLabel>Финално решение</SectionLabel>
                <SectionCard>
                  <p style={{ margin: 0, fontSize: '.875rem', color: P.text, whiteSpace: 'pre-wrap' }}>
                    {dc.decision}
                  </p>
                </SectionCard>
              </div>
            )}

            {/* Status lifecycle */}
            {dc.status !== 'CLOSED' && nextStatus && (
              <div>
                <SectionLabel>Напредък по случая</SectionLabel>
                <SectionCard>
                  <p style={{ fontSize: '.875rem', color: P.muted, margin: '0 0 .75rem' }}>
                    Текущ статус: <strong style={{ color: STATUS_META[dc.status].color }}>{STATUS_META[dc.status].label}</strong>
                    {' → '}<strong>{STATUS_META[nextStatus].label}</strong>
                  </p>

                  {confirmAdvance === nextStatus ? (
                    <>
                      {needsDecision && (
                        <>
                          <SectionLabel style={{ marginTop: 0 }}>Финално решение (текст)</SectionLabel>
                          <DecisionArea
                            placeholder="Опишете финалното решение по спора…"
                            value={decision}
                            onChange={e => setDecision(e.target.value)}
                          />
                        </>
                      )}
                      <BtnRow>
                        <Btn $variant="neutral" onClick={() => { setConfirmAdvance(null); setDecision(''); }}>
                          Откажи
                        </Btn>
                        <AdvanceBtn
                          $variant={nextStatus === 'RESOLVED' ? 'resolve' : nextStatus === 'CLOSED' ? 'close' : 'next'}
                          onClick={handleAdvance}
                          disabled={patchMutation.isPending}
                        >
                          {patchMutation.isPending ? 'Запазване…' : `Потвърди → ${STATUS_META[nextStatus].label}`}
                        </AdvanceBtn>
                      </BtnRow>
                    </>
                  ) : (
                    <AdvanceBtn
                      $variant={nextStatus === 'RESOLVED' ? 'resolve' : nextStatus === 'CLOSED' ? 'close' : 'next'}
                      onClick={() => setConfirmAdvance(nextStatus)}
                    >
                      {NEXT_LABEL[dc.status]}
                    </AdvanceBtn>
                  )}
                </SectionCard>
              </div>
            )}

            <Divider />

            {/* Notes thread */}
            <div>
              <SectionLabel>Бележки ({dc.notes.length})</SectionLabel>
              {dc.notes.length === 0 && (
                <MetaLine>Няма записани бележки.</MetaLine>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.625rem' }}>
                {dc.notes.map((note: DisputeNoteItem) => (
                  <NoteItem key={note.id}>
                    <NoteBody>{note.body}</NoteBody>
                    <NoteMeta>
                      {fullName(note.author)} · {fmt(note.createdAt)}
                      {note.isAdmin && ' · Администратор'}
                    </NoteMeta>
                  </NoteItem>
                ))}
              </div>
            </div>

            {/* Add note */}
            {dc.status !== 'CLOSED' && (
              <div>
                <SectionLabel>Добави бележка</SectionLabel>
                <NoteInput
                  placeholder="Напишете бележка по случая…"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                />
                <BtnRow>
                  <Btn
                    $variant="primary"
                    onClick={() => noteText.trim() && noteMutation.mutate(noteText.trim())}
                    disabled={!noteText.trim() || noteMutation.isPending}
                  >
                    {noteMutation.isPending ? 'Записване…' : 'Запази бележка'}
                  </Btn>
                </BtnRow>
              </div>
            )}
          </>
        )}
      </PanelBody>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function AdminControlDisputesPage() {
  const [page, setPage]           = useState(1);
  const [status, setStatus]       = useState<DisputeStatus | ''>('OPEN');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dispute-cases', page, status],
    queryFn: () => adminControlService.getDisputeCases({ page, limit: PAGE_SIZE, status }),
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('bg-BG', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const fmtBgn = (n: number | null | undefined) =>
    n == null ? '—' : n.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 });

  const fullName = (u: { firstName: string | null; lastName: string | null }) =>
    (u.firstName || u.lastName) ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : null;

  const columns: ColumnDef<DisputeCase>[] = [
    {
      key: 'user',
      header: 'Потребител',
      render: (row) => (
        <span>
          <PrimaryLine>{fullName(row.user) ?? '—'}</PrimaryLine>
          <MetaLine>{row.user.email}</MetaLine>
          <div style={{ marginTop: 4 }}>
            <StatusPill $status={row.status}>{STATUS_META[row.status].label}</StatusPill>
          </div>
        </span>
      ),
    },
    {
      key: 'receipt',
      header: 'Касова бележка',
      render: (row) => (
        <span>
          <PrimaryLine style={{ fontWeight: 500 }}>{row.receipt.merchantName ?? '—'}</PrimaryLine>
          <MetaLine>{fmtBgn(row.receipt.totalAmount)}</MetaLine>
          {row.receipt.fraudScore != null && (
            <MetaLine style={{
              color: row.receipt.fraudScore >= 61 ? P.danger
                   : row.receipt.fraudScore >= 31 ? P.warn : P.success,
              fontWeight: 700,
            }}>
              Fraud: {row.receipt.fraudScore}
            </MetaLine>
          )}
        </span>
      ),
    },
    {
      key: 'assignee',
      header: 'Отговорник',
      render: (row) => (
        <MetaLine>{row.assignee ? (fullName(row.assignee) ?? row.assignee.email) : '—'}</MetaLine>
      ),
    },
    {
      key: 'decision',
      header: 'Решение',
      render: (row) => (
        <MetaLine style={{ maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.decision ?? '—'}
        </MetaLine>
      ),
    },
    {
      key: 'notes',
      header: 'Бележки',
      render: (row) => (
        <NoteCount>
          💬 {row._count.notes}
        </NoteCount>
      ),
    },
    {
      key: 'createdAt',
      header: 'Подадено',
      render: (row) => (
        <span style={{ fontSize: '.8125rem', color: P.muted }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  const panelOpen = !!selectedId;

  return (
    <Shell>
      {/* Slide-over backdrop + panel */}
      <Backdrop $open={panelOpen} onClick={() => setSelectedId(null)} />
      <Panel $open={panelOpen}>
        {selectedId && (
          <DisputeDetailPanel
            key={selectedId}
            id={selectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </Panel>

      <Header>
        <div>
          <Eyebrow>Контрол</Eyebrow>
          <PageTitle>
            Спорове
            {data && data.meta.total > 0 && <Badge>{data.meta.total.toLocaleString()}</Badge>}
          </PageTitle>
          <Subtitle>
            Официални случаи по транзакции, кешбек, изплащания или фактуриране — изисква преглед и финално решение
          </Subtitle>
        </div>
      </Header>

      <Card>
        <FilterRow>
          <Select
            value={status}
            onChange={e => { setStatus(e.target.value as DisputeStatus | ''); setPage(1); }}
          >
            {FILTER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={row => row.id}
          loading={isLoading}
          emptyMessage="Няма спорове за избрания статус"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
          onRowClick={row => setSelectedId(row.id)}
          rowActions={[
            {
              label: 'Отвори',
              onClick: row => setSelectedId(row.id),
            },
          ]}
        />
      </Card>
    </Shell>
  );
}
