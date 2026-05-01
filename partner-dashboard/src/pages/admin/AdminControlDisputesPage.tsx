import { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import { adminControlService, AdminDispute } from '../../services/adminControl.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  warning: '#b5803a', warningSoft: '#f5ead2',
  info: '#2563eb', infoSoft: '#dbeafe',
};

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.warningSoft}; color: ${palette.warning}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

const ScoreBadge = styled.span<{ $score: number }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  border-radius: 0.375rem; padding: 0.125rem 0.45rem;
  ${({ $score }) => {
    if ($score >= 61) return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
    if ($score >= 31) return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    return `background: ${palette.successSoft}; color: ${palette.success};`;
  }}
`;

const FlagsPill = styled.span`
  display: inline-flex; font-size: 0.65rem; font-weight: 600; font-family: monospace;
  border-radius: 0.25rem; padding: 0.1rem 0.375rem;
  background: ${palette.dangerSoft}; color: ${palette.danger};
  max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex; align-items: center; font-size: 0.72rem; font-weight: 700;
  border-radius: 9999px; padding: 0.15rem 0.6rem;
  ${({ $status }) => {
    if ($status === 'OPEN') return `background: ${palette.infoSoft}; color: ${palette.info};`;
    if ($status === 'IN_REVIEW' || $status === 'MANUAL_REVIEW' || $status === 'PROCESSING') return `background: ${palette.warningSoft}; color: ${palette.warning};`;
    if ($status === 'RESOLVED') return `background: ${palette.successSoft}; color: ${palette.success};`;
    if ($status === 'CLOSED') return `background: #f1f0ed; color: ${palette.textSubtle};`;
    return `background: ${palette.warningSoft}; color: ${palette.warning};`;
  }}
`;

// Spec §7.3 statuses: Open → In review → Resolved → Closed
const STATUS_OPTIONS = [
  { value: 'MANUAL_REVIEW', label: 'В преглед' },
  { value: 'PROCESSING', label: 'Обработва се' },
  { value: 'OPEN', label: 'Отворен' },
  { value: 'RESOLVED', label: 'Решен' },
  { value: 'CLOSED', label: 'Затворен' },
];

function statusLabel(status: string): string {
  return STATUS_OPTIONS.find(o => o.value === status)?.label ?? status;
}

// ── Notes modal ─────────────────────────────────────────────────────────────
const Overlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
`;
const ModalBox = styled.div`
  background: ${palette.surface}; border-radius: 0.875rem; padding: 2rem;
  width: 100%; max-width: 28rem; box-shadow: 0 12px 40px rgba(0,0,0,0.18);
`;
const ModalTitle = styled.h2`font-size: 1.125rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.5rem;`;
const ModalSub = styled.p`font-size: 0.875rem; color: ${palette.textMuted}; margin: 0 0 1.25rem;`;
const Textarea = styled.textarea`
  width: 100%; box-sizing: border-box; min-height: 6rem; padding: 0.75rem;
  border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem;
  font-family: inherit; resize: vertical; background: ${palette.bg}; color: ${palette.text};
  outline: none;
  &:focus { border-color: ${palette.accent}; }
`;
const ModalActions = styled.div`display: flex; gap: 0.75rem; margin-top: 1rem; justify-content: flex-end;`;
const Btn = styled.button<{ $variant?: 'approve' | 'reject' | 'neutral' }>`
  padding: 0.5rem 1.25rem; border: none; border-radius: 0.5rem; font-weight: 700;
  font-size: 0.875rem; cursor: pointer;
  background: ${p => p.$variant === 'approve' ? palette.success : p.$variant === 'reject' ? palette.danger : palette.border};
  color: ${p => (p.$variant === 'approve' || p.$variant === 'reject') ? '#fff' : palette.text};
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

interface DecisionModal {
  disputeId: string;
  userEmail: string;
  cashbackAmount: number | null;
  action: 'approve' | 'reject';
}

const PAGE_SIZE = 25;

export default function AdminControlDisputesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('MANUAL_REVIEW');
  const [modal, setModal] = useState<DecisionModal | null>(null);
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-disputes', page, status],
    queryFn: () => adminControlService.getDisputes({ page, limit: PAGE_SIZE, status }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      adminControlService.approveDispute(id, notes),
    onSuccess: () => {
      toast.success('Спорът е одобрен — кешбекът ще бъде начислен');
      queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
      setModal(null);
      setNotes('');
    },
    onError: () => toast.error('Грешка при одобрение'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      adminControlService.rejectDispute(id, notes),
    onSuccess: () => {
      toast.success('Спорът е отхвърлен');
      queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
      setModal(null);
      setNotes('');
    },
    onError: () => toast.error('Грешка при отхвърляне'),
  });

  const openModal = (row: AdminDispute, action: 'approve' | 'reject') => {
    setNotes('');
    setModal({
      disputeId: row.id,
      userEmail: row.user.email,
      cashbackAmount: row.cashbackAmount,
      action,
    });
  };

  const handleConfirm = () => {
    if (!modal) return;
    const payload = { id: modal.disputeId, notes: notes.trim() || undefined };
    if (modal.action === 'approve') approveMutation.mutate(payload);
    else rejectMutation.mutate(payload);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('bg-BG', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const fmtBgn = (n: number | null) =>
    n == null ? '—' : n.toLocaleString('bg-BG', { style: 'currency', currency: 'BGN', minimumFractionDigits: 2 });

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  const columns: ColumnDef<AdminDispute>[] = [
    {
      key: 'user',
      header: 'Потребител',
      render: (row) => (
        <span>
          <PrimaryLine>
            {row.user.firstName || row.user.lastName
              ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim()
              : '—'}
          </PrimaryLine>
          <MetaLine>{row.user.email}</MetaLine>
          <div style={{ marginTop: 4 }}>
            <StatusBadge $status={row.status}>{statusLabel(row.status)}</StatusBadge>
          </div>
        </span>
      ),
    },
    {
      key: 'venue',
      header: 'Обект',
      render: (row) =>
        row.venue ? (
          <span>
            <PrimaryLine style={{ fontWeight: 500 }}>{row.venue.name}</PrimaryLine>
            <MetaLine>{row.venue.partner.businessName} · {row.venue.city}</MetaLine>
          </span>
        ) : (
          <MetaLine>—</MetaLine>
        ),
    },
    {
      key: 'amount',
      header: 'Сума',
      render: (row) => (
        <span>
          <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
            {fmtBgn(row.total)}
          </span>
          <MetaLine>Кешбек: {fmtBgn(row.cashbackAmount)}</MetaLine>
        </span>
      ),
    },
    {
      key: 'risk',
      header: 'Риск',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {row.verificationScore != null && (
            <ScoreBadge $score={row.verificationScore}>
              Бал: {row.verificationScore}
            </ScoreBadge>
          )}
          {row.fraudFlags && <FlagsPill title={row.fraudFlags}>{row.fraudFlags}</FlagsPill>}
          {!row.verificationScore && !row.fraudFlags && <MetaLine>—</MetaLine>}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Подадено',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      {/* Decision modal with notes — spec §7.3 requires notes and final decision */}
      {modal && (
        <Overlay onClick={() => setModal(null)}>
          <ModalBox onClick={e => e.stopPropagation()}>
            <ModalTitle>
              {modal.action === 'approve' ? '✓ Одобри спора' : '✗ Отхвърли спора'}
            </ModalTitle>
            <ModalSub>
              {modal.action === 'approve'
                ? `Одобряване за ${modal.userEmail}${modal.cashbackAmount != null ? ` · кешбек ${fmtBgn(modal.cashbackAmount)}` : ''}`
                : `Отхвърляне на спора от ${modal.userEmail}`}
            </ModalSub>
            <Textarea
              placeholder="Бележки към финалното решение (по желание)..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <ModalActions>
              <Btn $variant="neutral" onClick={() => setModal(null)} disabled={isPending}>
                Откажи
              </Btn>
              <Btn
                $variant={modal.action}
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending
                  ? 'Запазване...'
                  : modal.action === 'approve'
                    ? 'Потвърди одобрение'
                    : 'Потвърди отхвърляне'}
              </Btn>
            </ModalActions>
          </ModalBox>
        </Overlay>
      )}

      <PageHeader>
        <TitleBlock>
          <Eyebrow>Контрол</Eyebrow>
          <PageTitle>
            Спорове
            {data && data.meta.total > 0 && <TotalBadge>{data.meta.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>
            Официални случаи по транзакции, кешбек, изплащания или фактуриране — изисква преглед и финално решение
          </PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="Няма спорове за преглед"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'Одобри',
              onClick: (row) => openModal(row, 'approve'),
            },
            {
              label: 'Отхвърли',
              danger: true,
              onClick: (row) => openModal(row, 'reject'),
            },
          ]}
        />
      </Card>
    </PageShell>
  );
}
