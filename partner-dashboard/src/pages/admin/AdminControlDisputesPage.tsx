import { useState, useEffect, useCallback } from 'react';
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
  DisputeSubjectType,
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
  { value: ALL_FILTER,   label: 'Всички статуси' },
  { value: 'OPEN',       label: 'Отворен' },
  { value: 'IN_REVIEW',  label: 'В преглед' },
  { value: 'RESOLVED',   label: 'Решен' },
  { value: 'CLOSED',     label: 'Затворен' },
];

const SUBJECT_TYPE_LABELS: Record<DisputeSubjectType, string> = {
  RECEIPT:  'Транзакция',
  CASHBACK: 'Кешбек',
  PAYOUT:   'Плащане',
  INVOICE:  'Фактуриране',
};

const SUBJECT_TYPE_FILTER_OPTIONS: { value: DisputeSubjectType | ''; label: string }[] = [
  { value: '',         label: 'Всички типове' },
  { value: 'RECEIPT',  label: 'Транзакция' },
  { value: 'CASHBACK', label: 'Кешбек' },
  { value: 'PAYOUT',   label: 'Плащане' },
  { value: 'INVOICE',  label: 'Фактуриране' },
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

const FieldError = styled.p`font-size:.75rem;color:${P.danger};margin:.25rem 0 0;`;

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

const AssigneeRow = styled.div`display:flex;gap:.5rem;align-items:center;margin-top:.625rem;`;
const AssigneeSelect = styled.select`
  flex:1;padding:.4rem .6rem;border:1px solid ${P.border};border-radius:.5rem;
  font-size:.8125rem;background:${P.surface};color:${P.text};outline:none;
  cursor:pointer;&:focus{border-color:${P.accent};}
`;
const SmallBtn = styled.button`
  padding:.4rem .8rem;border:none;border-radius:.5rem;font-size:.8125rem;font-weight:700;
  cursor:pointer;background:${P.accent};color:#fff;white-space:nowrap;
  &:disabled{opacity:.5;cursor:not-allowed;}
`;

const ReceiptImg = styled.img`
  width:100%;border-radius:.5rem;border:1px solid ${P.border};
  display:block;object-fit:contain;max-height:22rem;background:#f5f4f0;
`;

// ── Modal ─────────────────────────────────────────────────────────────────────

const ModalOverlay = styled.div`
  position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1040;
  display:flex;align-items:center;justify-content:center;padding:1rem;
`;

const ModalCard = styled.div`
  background:${P.surface};border-radius:.875rem;padding:1.75rem;
  width:100%;max-width:480px;box-shadow:0 16px 48px rgba(0,0,0,.18);
`;

const ModalTitle = styled.h2`font-size:1.125rem;font-weight:800;color:${P.text};margin:0 0 1.25rem;`;

const FieldLabel = styled.label`
  display:block;font-size:.8125rem;font-weight:600;color:${P.muted};margin-bottom:.375rem;
`;

const TextInput = styled.input`
  width:100%;box-sizing:border-box;padding:.6rem .75rem;
  border:1px solid ${P.border};border-radius:.5rem;font-size:.875rem;
  background:${P.bg};color:${P.text};outline:none;
  &:focus{border-color:${P.accent};}
`;

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
  const [pendingAssignee, setPendingAssignee] = useState<string>('');
  const [assigneeDirty, setAssigneeDirty] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const [confirmReceiptAction, setConfirmReceiptAction] = useState<null | 'approve' | 'reject'>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Escape key dismissal
  const handleClose = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // Escape key dismissal for receipt confirm modal
  useEffect(() => {
    if (!confirmReceiptAction) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setConfirmReceiptAction(null); setRejectReason(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmReceiptAction]);

  const { data, isLoading } = useQuery({
    queryKey: ['dispute-case', id],
    queryFn: () => adminControlService.getDisputeCase(id),
    enabled: !!id,
  });

  const { data: adminsData } = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: () => adminControlService.getAdminUsers(),
    staleTime: 5 * 60 * 1000,
  });

  const dc: DisputeCaseDetail | undefined = data?.data;
  const adminUsers = adminsData?.admins ?? [];

  // Sync assignee dropdown when case loads / changes
  useEffect(() => {
    if (dc) {
      setPendingAssignee(dc.assignedTo ?? '');
      setAssigneeDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dc?.assignedTo]);

  const patchMutation = useMutation({
    mutationFn: (patch: { status?: DisputeStatus; decision?: string | null; assignedTo?: string | null }) =>
      adminControlService.patchDisputeCase(id, patch),
    onSuccess: () => {
      toast.success('Случаят е обновен');
      qc.invalidateQueries({ queryKey: ['dispute-cases'] });
      qc.invalidateQueries({ queryKey: ['dispute-case', id] });
      setConfirmAdvance(null);
      setDecision('');
      setAssigneeDirty(false);
    },
    onError: () => toast.error('Грешка при обновяване'),
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

  const receiptApproveMutation = useMutation({
    mutationFn: ({ receiptId, notes }: { receiptId: string; notes?: string }) =>
      adminControlService.approveDispute(receiptId, notes),
    onSuccess: (result) => {
      if (result?.fraudWarning) {
        toast(`⚠ ${result.fraudWarning}`, {
          style: { background: '#d97706', color: '#fff', fontWeight: 600 },
          duration: 6000,
        });
      } else {
        toast.success('Бележката е одобрена');
      }
      qc.invalidateQueries({ queryKey: ['dispute-case', id] });
      qc.invalidateQueries({ queryKey: ['dispute-cases'] });
      setConfirmReceiptAction(null);
    },
    onError: () => {
      toast.error('Грешка при одобряване на бележката');
      setConfirmReceiptAction(null);
    },
  });

  const receiptRejectMutation = useMutation({
    mutationFn: ({ receiptId, reason }: { receiptId: string; reason?: string }) =>
      adminControlService.rejectDispute(receiptId, reason),
    onSuccess: () => {
      toast.success('Бележката е отхвърлена');
      qc.invalidateQueries({ queryKey: ['dispute-case', id] });
      qc.invalidateQueries({ queryKey: ['dispute-cases'] });
      setConfirmReceiptAction(null);
      setRejectReason('');
    },
    onError: () => {
      toast.error('Грешка при отхвърляне на бележката');
      setConfirmReceiptAction(null);
      setRejectReason('');
    },
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

  const nextStatus = dc ? NEXT_STATUS[dc.status] : undefined;

  // Decision is required when advancing to RESOLVED; CLOSED reuses the already-saved decision.
  const decisionMissing = confirmAdvance === 'RESOLVED' && !decision.trim();

  const handleAdvance = () => {
    if (!confirmAdvance || !dc || decisionMissing) return;
    patchMutation.mutate({
      status: confirmAdvance,
      ...(confirmAdvance === 'RESOLVED' ? { decision: decision.trim() || null } : {}),
    });
  };

  const handleReassign = () => {
    patchMutation.mutate({ assignedTo: pendingAssignee || null });
  };

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
        <CloseBtn onClick={handleClose} aria-label="Затвори">✕</CloseBtn>
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

            {/* Subject section — receipt details or generic reference */}
            <div>
              <SectionLabel>{SUBJECT_TYPE_LABELS[dc.subjectType]}</SectionLabel>
              {dc.receipt ? (
                <>
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

                  {!['APPROVED', 'REJECTED', 'EXPIRED'].includes(dc.receipt.status) && (
                    <BtnRow style={{ marginTop: '.75rem' }}>
                      <Btn
                        $variant="danger"
                        disabled={receiptApproveMutation.isPending || receiptRejectMutation.isPending}
                        onClick={() => setConfirmReceiptAction('reject')}
                      >
                        Откажи бележката
                      </Btn>
                      <Btn
                        $variant="primary"
                        disabled={receiptApproveMutation.isPending || receiptRejectMutation.isPending}
                        onClick={() => setConfirmReceiptAction('approve')}
                      >
                        Одобри бележката
                      </Btn>
                    </BtnRow>
                  )}

                  {/* Receipt action confirm modal */}
                  {confirmReceiptAction && dc.receipt && (
                    <ModalOverlay>
                      <ModalCard>
                        <ModalTitle>
                          {confirmReceiptAction === 'approve' ? 'Одобри бележката' : 'Откажи бележката'}
                        </ModalTitle>

                        {confirmReceiptAction === 'approve' && (
                          <p style={{ fontSize: '.875rem', color: P.muted, margin: '0 0 1.25rem' }}>
                            Действието е необратимо.
                          </p>
                        )}

                        {confirmReceiptAction === 'reject' && (
                          <div style={{ marginBottom: '1.25rem' }}>
                            <FieldLabel htmlFor="receipt-reject-reason">
                              Причина (незадължително)
                            </FieldLabel>
                            <DecisionArea
                              id="receipt-reject-reason"
                              placeholder="Опишете причината за отказ…"
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                            />
                          </div>
                        )}

                        <BtnRow>
                          <Btn
                            $variant="neutral"
                            onClick={() => { setConfirmReceiptAction(null); setRejectReason(''); }}
                            disabled={receiptApproveMutation.isPending || receiptRejectMutation.isPending}
                          >
                            Откажи
                          </Btn>
                          <Btn
                            $variant={confirmReceiptAction === 'approve' ? 'primary' : 'danger'}
                            disabled={receiptApproveMutation.isPending || receiptRejectMutation.isPending}
                            onClick={() => {
                              if (confirmReceiptAction === 'approve') {
                                receiptApproveMutation.mutate({ receiptId: dc.receipt!.id });
                              } else {
                                receiptRejectMutation.mutate({
                                  receiptId: dc.receipt!.id,
                                  reason: rejectReason.trim() || undefined,
                                });
                              }
                            }}
                          >
                            {(receiptApproveMutation.isPending || receiptRejectMutation.isPending)
                              ? 'Обработва се…'
                              : 'Потвърди'}
                          </Btn>
                        </BtnRow>
                      </ModalCard>
                    </ModalOverlay>
                  )}

                  {dc.receipt.imageUrl && !imgBroken && (
                    <div style={{ marginTop: '.75rem' }}>
                      <a href={dc.receipt.imageUrl} target="_blank" rel="noopener noreferrer">
                        <ReceiptImg
                          src={dc.receipt.imageUrl}
                          alt="Снимка на касова бележка"
                          onError={() => setImgBroken(true)}
                        />
                      </a>
                      <MetaLine style={{ marginTop: '.3rem', textAlign: 'center' }}>
                        Клик за пълен размер
                      </MetaLine>
                    </div>
                  )}
                </>
              ) : (
                <SectionCard>
                  <KV><KLabel>ID на обект</KLabel><KVal style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{dc.subjectId ?? '—'}</KVal></KV>
                </SectionCard>
              )}
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

                {dc.status !== 'CLOSED' && (
                  <AssigneeRow>
                    <AssigneeSelect
                      value={pendingAssignee}
                      onChange={e => {
                        setPendingAssignee(e.target.value);
                        setAssigneeDirty(e.target.value !== (dc.assignedTo ?? ''));
                      }}
                    >
                      <option value="">— Без отговорник —</option>
                      {adminUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {(u.firstName || u.lastName)
                            ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
                            : u.email}
                        </option>
                      ))}
                    </AssigneeSelect>
                    <SmallBtn
                      onClick={handleReassign}
                      disabled={!assigneeDirty || patchMutation.isPending}
                    >
                      Запази
                    </SmallBtn>
                  </AssigneeRow>
                )}
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
                      {confirmAdvance === 'RESOLVED' && (
                        <>
                          <SectionLabel style={{ marginTop: 0 }}>
                            Финално решение (текст) <span style={{ color: P.danger }}>*</span>
                          </SectionLabel>
                          <DecisionArea
                            placeholder="Опишете финалното решение по спора…"
                            value={decision}
                            onChange={e => setDecision(e.target.value)}
                          />
                          {decisionMissing && (
                            <FieldError>
                              Финалното решение е задължително при преход към „Решен".
                            </FieldError>
                          )}
                        </>
                      )}
                      <BtnRow>
                        <Btn $variant="neutral" onClick={() => { setConfirmAdvance(null); setDecision(''); }}>
                          Откажи
                        </Btn>
                        <AdvanceBtn
                          $variant={nextStatus === 'RESOLVED' ? 'resolve' : nextStatus === 'CLOSED' ? 'close' : 'next'}
                          onClick={handleAdvance}
                          disabled={patchMutation.isPending || decisionMissing}
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

// ── Create dispute modal ──────────────────────────────────────────────────────

function CreateDisputeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [subjectType, setSubjectType] = useState<DisputeSubjectType>('RECEIPT');
  const [receiptId, setReceiptId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [userId, setUserId] = useState('');
  const [notes, setNotes] = useState('');

  const isReceiptType = subjectType === 'RECEIPT';
  const canSubmit = isReceiptType ? !!receiptId.trim() : (!!subjectId.trim() && !!userId.trim());

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const createMutation = useMutation({
    mutationFn: () => {
      if (isReceiptType) {
        return adminControlService.createDisputeCase({
          subjectType: 'RECEIPT',
          receiptId: receiptId.trim(),
          notes: notes.trim() || undefined,
        });
      }
      return adminControlService.createDisputeCase({
        subjectType: subjectType as 'CASHBACK' | 'PAYOUT' | 'INVOICE',
        subjectId: subjectId.trim(),
        userId: userId.trim(),
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      toast.success('Спорът е открит');
      onCreated(res.data.id);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Грешка при отваряне на спор');
    },
  });

  return (
    <ModalOverlay onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <ModalCard>
        <ModalTitle>Отвори нов спор</ModalTitle>

        <div style={{ marginBottom: '1rem' }}>
          <FieldLabel htmlFor="create-subject-type">Тип на спора *</FieldLabel>
          <Select
            id="create-subject-type"
            value={subjectType}
            onChange={e => {
              setSubjectType(e.target.value as DisputeSubjectType);
              setReceiptId('');
              setSubjectId('');
              setUserId('');
            }}
            style={{ width: '100%' }}
          >
            {SUBJECT_TYPE_FILTER_OPTIONS.filter(o => o.value !== '').map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>

        {isReceiptType ? (
          <div style={{ marginBottom: '1rem' }}>
            <FieldLabel htmlFor="create-receipt-id">ID на касова бележка *</FieldLabel>
            <TextInput
              id="create-receipt-id"
              placeholder="uuid на Receipt…"
              value={receiptId}
              onChange={e => setReceiptId(e.target.value)}
              autoFocus
            />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <FieldLabel htmlFor="create-subject-id">ID на обекта *</FieldLabel>
              <TextInput
                id="create-subject-id"
                placeholder={`uuid на ${SUBJECT_TYPE_LABELS[subjectType]}…`}
                value={subjectId}
                onChange={e => setSubjectId(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <FieldLabel htmlFor="create-user-id">ID на потребителя *</FieldLabel>
              <TextInput
                id="create-user-id"
                placeholder="uuid на User…"
                value={userId}
                onChange={e => setUserId(e.target.value)}
              />
            </div>
          </>
        )}

        <div style={{ marginBottom: '1.25rem' }}>
          <FieldLabel htmlFor="create-notes">Начална бележка (по избор)</FieldLabel>
          <NoteInput
            id="create-notes"
            placeholder="Защо се отваря спорът…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <BtnRow style={{ marginTop: 0 }}>
          <Btn $variant="neutral" onClick={onClose}>Откажи</Btn>
          <Btn
            $variant="primary"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? 'Отваряне…' : 'Отвори спор'}
          </Btn>
        </BtnRow>
      </ModalCard>
    </ModalOverlay>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function AdminControlDisputesPage() {
  const qc = useQueryClient();
  const [page, setPage]                   = useState(1);
  const [status, setStatus]               = useState<DisputeStatus | ''>('OPEN');
  const [subjectType, setSubjectType]     = useState<DisputeSubjectType | ''>('');
  const [assignedTo, setAssignedTo]       = useState<string>('');
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [showCreate, setShowCreate]       = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['dispute-cases', page, status, subjectType, assignedTo],
    queryFn: () => adminControlService.getDisputeCases({ page, limit: PAGE_SIZE, status, subjectType, assignedTo: assignedTo || undefined }),
  });

  const { data: adminsData } = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: () => adminControlService.getAdminUsers(),
    staleTime: 5 * 60 * 1000,
  });
  const adminUsers = adminsData?.admins ?? [];

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('bg-BG', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const fmtBgn = (n: number | null | undefined) =>
    n == null ? '—' : n.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 });

  const fullName = (u: { firstName: string | null; lastName: string | null; email: string }) =>
    (u.firstName || u.lastName) ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : u.email;

  const columns: ColumnDef<DisputeCase>[] = [
    {
      key: 'user',
      header: 'Потребител',
      render: (row) => (
        <span>
          <PrimaryLine>{fullName(row.user)}</PrimaryLine>
          <MetaLine>{row.user.email}</MetaLine>
          <div style={{ marginTop: 4 }}>
            <StatusPill $status={row.status}>{STATUS_META[row.status].label}</StatusPill>
          </div>
        </span>
      ),
    },
    {
      key: 'subject',
      header: 'Обект',
      render: (row) => (
        <span>
          <MetaLine style={{ fontWeight: 600, color: P.muted, marginBottom: '.1rem' }}>
            {SUBJECT_TYPE_LABELS[row.subjectType]}
          </MetaLine>
          {row.receipt ? (
            <>
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
            </>
          ) : (
            <MetaLine style={{ fontFamily: 'monospace', fontSize: '.75rem' }}>
              {row.subjectId ? row.subjectId.slice(-12) : '—'}
            </MetaLine>
          )}
        </span>
      ),
    },
    {
      key: 'assignee',
      header: 'Отговорник',
      render: (row) => (
        <MetaLine>{row.assignee ? fullName(row.assignee) : '—'}</MetaLine>
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
      {/* Create dispute modal */}
      {showCreate && (
        <CreateDisputeModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['dispute-cases'] });
            setSelectedId(id);
          }}
        />
      )}

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
        <Btn $variant="primary" onClick={() => setShowCreate(true)}>
          + Отвори спор
        </Btn>
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
          <Select
            value={subjectType}
            onChange={e => { setSubjectType(e.target.value as DisputeSubjectType | ''); setPage(1); }}
          >
            {SUBJECT_TYPE_FILTER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select
            value={assignedTo}
            onChange={e => { setAssignedTo(e.target.value); setPage(1); }}
          >
            <option value="">Всички отговорници</option>
            {adminUsers.map(u => (
              <option key={u.id} value={u.id}>
                {(u.firstName || u.lastName)
                  ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
                  : u.email}
              </option>
            ))}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={row => row.id}
          loading={isLoading}
          emptyMessage="Няма спорове за избраните филтри"
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
