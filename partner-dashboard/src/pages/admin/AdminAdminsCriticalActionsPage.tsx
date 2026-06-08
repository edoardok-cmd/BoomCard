import { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import { palette } from '../../styles/adminTheme';
import {
  adminAdminsService,
  CriticalActionRequest,
  CriticalActionStatus,
} from '../../services/adminAdmins.service';


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

const FilterRow = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
`;

const FilterBtn = styled.button<{ $active?: boolean }>`
  padding: 0.375rem 0.875rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1.5px solid ${({ $active }) => ($active ? palette.accent : palette.border)};
  background: ${({ $active }) => ($active ? palette.accentSoft : palette.surface)};
  color: ${({ $active }) => ($active ? palette.accent : palette.textMuted)};
  cursor: pointer;
  transition: all 120ms;
  &:hover { border-color: ${palette.accent}; color: ${palette.accent}; }
`;

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;

const InfoBanner = styled.div`
  background: ${palette.infoSoft};
  border: 1px solid ${palette.infoBorder};
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
  color: ${palette.info};
  margin-bottom: 1.25rem;
`;

const ActorCell = styled.div`
  font-weight: 600;
  color: ${palette.text};
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const PayloadCell = styled.pre`
  font-size: 0.75rem;
  color: ${palette.textMuted};
  background: ${palette.bg};
  border: 1px solid ${palette.border};
  border-radius: 0.375rem;
  padding: 0.375rem 0.625rem;
  margin: 0;
  overflow: auto;
  max-width: 22rem;
  white-space: pre-wrap;
  word-break: break-all;
`;

const StatusBadge = styled.span<{ $status: CriticalActionStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ $status }) =>
    $status === 'PENDING' ? palette.warningSoft :
    $status === 'APPROVED' ? palette.successSoft :
    palette.dangerSoft};
  color: ${({ $status }) =>
    $status === 'PENDING' ? palette.warning :
    $status === 'APPROVED' ? palette.success :
    palette.danger};
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
  max-width: 28rem;
  box-shadow: 0 12px 40px rgba(0,0,0,0.15);
`;

const OverlayTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.5rem;
`;

const OverlaySubtitle = styled.p`
  font-size: 0.875rem;
  color: ${palette.textMuted};
  margin: 0 0 1rem;
`;

const Textarea = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  min-height: 5rem;
  resize: vertical;
  outline: none;
  margin-bottom: 1rem;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const OverlayActions = styled.div`
  display: flex;
  gap: 0.75rem;
`;

const PrimaryBtn = styled.button<{ $danger?: boolean; $loading?: boolean }>`
  flex: 1;
  padding: 0.625rem;
  background: ${({ $danger }) => ($danger ? palette.danger : palette.accent)};
  color: ${palette.onAccent};
  font-size: 0.9375rem;
  font-weight: 700;
  border: none;
  border-radius: 0.5rem;
  cursor: ${({ $loading }) => ($loading ? 'not-allowed' : 'pointer')};
  opacity: ${({ $loading }) => ($loading ? 0.7 : 1)};
  &:hover:not(:disabled) { opacity: 0.88; }
`;

const SecondaryBtn = styled.button`
  padding: 0.625rem 1rem;
  background: transparent;
  color: ${palette.textMuted};
  font-size: 0.875rem;
  font-weight: 600;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  cursor: pointer;
  &:hover { border-color: ${palette.text}; color: ${palette.text}; }
`;

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
type ModalMode = { type: 'approve'; item: CriticalActionRequest } | { type: 'reject'; item: CriticalActionRequest } | null;

const PAGE_SIZE = 20;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'PENDING', label: 'Чакащи' },
  { value: 'ALL', label: 'Всички' },
  { value: 'APPROVED', label: 'Одобрени' },
  { value: 'REJECTED', label: 'Отхвърлени' },
];

export default function AdminAdminsCriticalActionsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.rawRole === 'SUPER_ADMIN';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalMode>(null);
  const [rejectNote, setRejectNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-critical-actions', statusFilter, page],
    queryFn: () => adminAdminsService.listCriticalActions({ status: statusFilter, page, limit: PAGE_SIZE }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminAdminsService.approveCriticalAction(id),
    onSuccess: () => {
      toast.success('Действието е одобрено');
      setModal(null);
      queryClient.invalidateQueries({ queryKey: ['admin-critical-actions'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Грешка при одобрение';
      toast.error(msg);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => adminAdminsService.rejectCriticalAction(id, note),
    onSuccess: () => {
      toast.success('Действието е отхвърлено');
      setModal(null);
      setRejectNote('');
      queryClient.invalidateQueries({ queryKey: ['admin-critical-actions'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Грешка при отхвърляне';
      toast.error(msg);
    },
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const columns: ColumnDef<CriticalActionRequest>[] = [
    {
      key: 'actionType',
      header: 'Тип действие',
      render: (row) => (
        <ActorCell>
          {row.actionType}
          {row.note && <MetaLine>{row.note}</MetaLine>}
        </ActorCell>
      ),
    },
    {
      key: 'payload',
      header: 'Данни',
      render: (row) => (
        <PayloadCell>{JSON.stringify(row.payload, null, 2)}</PayloadCell>
      ),
    },
    {
      key: 'requestedBy',
      header: 'Заявено от',
      render: (row) => (
        <ActorCell>
          {row.requestedBy.firstName || row.requestedBy.lastName
            ? `${row.requestedBy.firstName ?? ''} ${row.requestedBy.lastName ?? ''}`.trim()
            : '—'}
          <MetaLine>{row.requestedBy.email}</MetaLine>
        </ActorCell>
      ),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => (
        <div>
          <StatusBadge $status={row.status as CriticalActionStatus}>
            {row.status === 'PENDING' ? 'Чакащо' : row.status === 'APPROVED' ? 'Одобрено' : 'Отхвърлено'}
          </StatusBadge>
          {row.resolvedBy && (
            <MetaLine>
              {row.status === 'APPROVED' ? 'Одобрено от' : 'Отхвърлено от'}: {row.resolvedBy.email}
            </MetaLine>
          )}
          {row.resolvedNote && <MetaLine>{row.resolvedNote}</MetaLine>}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Дата',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  const rowActions = isSuperAdmin
    ? [
        {
          label: 'Одобри',
          onClick: (row: CriticalActionRequest) => {
            if (row.status !== 'PENDING') return;
            setModal({ type: 'approve', item: row });
          },
        },
        {
          label: 'Отхвърли',
          danger: true as const,
          onClick: (row: CriticalActionRequest) => {
            if (row.status !== 'PENDING') return;
            setRejectNote('');
            setModal({ type: 'reject', item: row });
          },
        },
      ]
    : [];

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Администратори</Eyebrow>
        <PageTitle>Критични действия</PageTitle>
        <PageSubtitle>
          Заявки за критични операции, изискващи одобрение от Супер администратор
        </PageSubtitle>
      </PageHeader>

      {!isSuperAdmin && (
        <InfoBanner>
          Виждате заявките в режим на четене. Само Супер администратор може да одобрява или отхвърля.
        </InfoBanner>
      )}

      <FilterRow>
        {STATUS_FILTERS.map(({ value, label }) => (
          <FilterBtn
            key={value}
            $active={statusFilter === value}
            onClick={() => { setStatusFilter(value); setPage(1); }}
          >
            {label}
          </FilterBtn>
        ))}
      </FilterRow>

      <Card>
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="Няма критични действия в това представяне"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
          rowActions={rowActions}
        />
      </Card>

      {modal?.type === 'approve' && (
        <OverlayBackdrop onClick={() => !approveMutation.isPending && setModal(null)}>
          <OverlayCard onClick={(e) => e.stopPropagation()}>
            <OverlayTitle>Одобри критично действие</OverlayTitle>
            <OverlaySubtitle>
              Тип: <strong>{modal.item.actionType}</strong>
              <br />
              Данни: <code style={{ fontSize: '0.8125rem' }}>{JSON.stringify(modal.item.payload)}</code>
            </OverlaySubtitle>
            <OverlayActions>
              <PrimaryBtn
                $loading={approveMutation.isPending}
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate(modal.item.id)}
              >
                {approveMutation.isPending ? 'Одобряване…' : 'Одобри'}
              </PrimaryBtn>
              <SecondaryBtn onClick={() => setModal(null)} disabled={approveMutation.isPending}>
                Отказ
              </SecondaryBtn>
            </OverlayActions>
          </OverlayCard>
        </OverlayBackdrop>
      )}

      {modal?.type === 'reject' && (
        <OverlayBackdrop onClick={() => !rejectMutation.isPending && setModal(null)}>
          <OverlayCard onClick={(e) => e.stopPropagation()}>
            <OverlayTitle>Отхвърли критично действие</OverlayTitle>
            <OverlaySubtitle>
              Тип: <strong>{modal.item.actionType}</strong>
            </OverlaySubtitle>
            <Textarea
              placeholder="Причина за отхвърляне (задължително)…"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
            <OverlayActions>
              <PrimaryBtn
                $danger
                $loading={rejectMutation.isPending}
                disabled={rejectMutation.isPending || !rejectNote.trim()}
                onClick={() => rejectMutation.mutate({ id: modal.item.id, note: rejectNote })}
              >
                {rejectMutation.isPending ? 'Отхвърляне…' : 'Отхвърли'}
              </PrimaryBtn>
              <SecondaryBtn onClick={() => setModal(null)} disabled={rejectMutation.isPending}>
                Отказ
              </SecondaryBtn>
            </OverlayActions>
          </OverlayCard>
        </OverlayBackdrop>
      )}
    </PageShell>
  );
}
