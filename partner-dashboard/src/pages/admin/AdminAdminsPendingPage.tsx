import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminAdminsService,
  PendingAdmin,
  PendingSuperAdminRequest,
  AdminRoleKey,
} from '../../services/adminAdmins.service';

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
  background: ${palette.warningSoft};
  color: ${palette.warning};
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 9999px;
  padding: 0.125rem 0.6rem;
  margin-left: 0.5rem;
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.375rem;
`;

const SectionSubtitle = styled.p`
  font-size: 0.875rem;
  color: ${palette.textMuted};
  margin: 0 0 1rem;
`;

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
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

const UserCell = styled.div`
  font-weight: 600;
  color: ${palette.text};
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const StatusDot = styled.span<{ $status: string }>`
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  margin-right: 0.35rem;
  background: ${({ $status }) =>
    $status === 'ACTIVE' ? palette.success :
    $status === 'SUSPENDED' ? palette.danger :
    palette.textSubtle};
`;

const DangerBanner = styled.div`
  background: ${palette.dangerSoft};
  border: 1px solid #e8bdb4;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
  color: ${palette.danger};
  margin-bottom: 1.25rem;
`;

const InfoBanner = styled.div`
  background: ${palette.infoSoft};
  border: 1px solid #bfdbfe;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
  color: ${palette.info};
  margin-bottom: 1.25rem;
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
  max-width: 26rem;
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
  margin: 0 0 1.25rem;
`;

const Select = styled.select`
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;
  margin-bottom: 1.25rem;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const OverlayActions = styled.div`
  display: flex;
  gap: 0.75rem;
`;

const PrimaryBtn = styled.button<{ $loading?: boolean }>`
  flex: 1;
  padding: 0.625rem;
  background: ${palette.accent};
  color: #fff;
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

const ROLE_OPTIONS: Array<{ value: AdminRoleKey; label: string }> = [
  { value: 'ADMIN', label: 'Администратор (пълен достъп)' },
  { value: 'SUPPORT', label: 'Поддръжка' },
  { value: 'FINANCE', label: 'Финанси' },
  { value: 'RISK_REVIEW', label: 'Преглед на риск' },
  { value: 'PARTNER_MANAGER', label: 'Мениджър партньори' },
];

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Активен',
  SUSPENDED: 'Спрян',
  INACTIVE: 'Неактивен',
  PENDING_VERIFICATION: 'Чака верификация',
  PENDING_PAYMENT: 'Чака плащане',
};

const PAGE_SIZE = 20;

type ApproveRoleModal = { type: 'role'; admin: PendingAdmin };
type ApproveSuperModal = { type: 'super'; request: PendingSuperAdminRequest };
type ActiveModal = ApproveRoleModal | ApproveSuperModal | null;

export default function AdminAdminsPendingPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isSuperAdmin = user?.rawRole === 'SUPER_ADMIN';
  const queryClient = useQueryClient();

  const [rolePage, setRolePage] = useState(1);
  const [roleSearchInput, setRoleSearchInput] = useState('');
  const [roleSearch, setRoleSearch] = useState('');

  const [superPage, setSuperPage] = useState(1);

  const [modal, setModal] = useState<ActiveModal>(null);
  const [selectedRole, setSelectedRole] = useState<AdminRoleKey>('ADMIN');

  const { data: roleData, isLoading: roleLoading } = useQuery({
    queryKey: ['admin-admins-pending', rolePage, roleSearch],
    queryFn: () => adminAdminsService.listPending({ page: rolePage, limit: PAGE_SIZE, search: roleSearch || undefined }),
  });

  const { data: superData, isLoading: superLoading } = useQuery({
    queryKey: ['admin-admins-pending-super', superPage],
    queryFn: () => adminAdminsService.listPendingSuper({ page: superPage, limit: PAGE_SIZE }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, roleKey }: { id: string; roleKey: AdminRoleKey }) =>
      adminAdminsService.approve(id, roleKey),
    onSuccess: () => {
      toast.success('Ролята е назначена — администраторът е активен');
      setModal(null);
      queryClient.invalidateQueries({ queryKey: ['admin-admins-pending'] });
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
    },
    onError: () => toast.error('Грешка при назначаване на роля'),
  });

  const approveSuperMutation = useMutation({
    mutationFn: (id: string) => adminAdminsService.approvePendingSuper(id),
    onSuccess: (data) => {
      toast.success(`Акаунтът на Супер администратор е създаден за ${data.user.email}`);
      setModal(null);
      queryClient.invalidateQueries({ queryKey: ['admin-admins-pending-super'] });
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Грешка при одобрение на заявката';
      toast.error(msg);
    },
  });

  const rejectSuperMutation = useMutation({
    mutationFn: (id: string) => adminAdminsService.rejectPendingSuper(id),
    onSuccess: () => {
      toast.success('Заявката за Супер администратор е отхвърлена');
      setModal(null);
      queryClient.invalidateQueries({ queryKey: ['admin-admins-pending-super'] });
    },
    onError: () => toast.error('Грешка при отхвърляне на заявката'),
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

  const superColumns: ColumnDef<PendingSuperAdminRequest>[] = [
    {
      key: 'user',
      header: 'Заявен акаунт',
      render: (row) => (
        <UserCell>
          {row.firstName || row.lastName
            ? `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim()
            : '—'}
          <MetaLine>{row.email}</MetaLine>
          {row.phone && <MetaLine>{row.phone}</MetaLine>}
        </UserCell>
      ),
    },
    {
      key: 'requestedBy',
      header: 'Заявено от',
      render: (row) =>
        row.requestedBy ? (
          <UserCell>
            {row.requestedBy.firstName || row.requestedBy.lastName
              ? `${row.requestedBy.firstName ?? ''} ${row.requestedBy.lastName ?? ''}`.trim()
              : '—'}
            <MetaLine>{row.requestedBy.email}</MetaLine>
          </UserCell>
        ) : (
          <span style={{ color: palette.textSubtle, fontSize: '0.8125rem' }}>—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Дата на заявката',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  const ROLE_LABEL: Record<string, string> = {
    ADMIN: 'Администратор',
    SUPER_ADMIN: 'Супер администратор',
    SUPPORT: 'Поддръжка',
    FINANCE: 'Финанси',
    RISK_REVIEW: 'Преглед на риск',
    PARTNER_MANAGER: 'Мениджър партньори',
  };

  const ROLE_BADGE_STYLE: Record<string, React.CSSProperties> = {
    SUPER_ADMIN:     { background: palette.dangerSoft, color: palette.danger },
    ADMIN:           { background: palette.infoSoft, color: palette.info },
  };

  const roleColumns: ColumnDef<PendingAdmin>[] = [
    {
      key: 'user',
      header: 'Администратор',
      render: (row) => (
        <UserCell>
          {row.firstName || row.lastName
            ? `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim()
            : '—'}
          <MetaLine>{row.email}</MetaLine>
          {row.phone && <MetaLine>{row.phone}</MetaLine>}
        </UserCell>
      ),
    },
    {
      key: 'systemRole',
      header: 'Системна роля',
      render: (row) => (
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' as const,
          letterSpacing: '0.05em', borderRadius: '0.375rem', padding: '0.125rem 0.5rem',
          ...( ROLE_BADGE_STYLE[row.role] ?? { background: '#f3f4f6', color: '#374151' }),
        }}>
          {ROLE_LABEL[row.role] ?? row.role}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted, display: 'flex', alignItems: 'center' }}>
          <StatusDot $status={row.status} />
          {STATUS_LABEL[row.status] ?? row.status}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Създаден',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  const totalPending = (roleData?.total ?? 0) + (superData?.total ?? 0);

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Администратори</Eyebrow>
        <PageTitle>
          Чакащи одобрения
          {totalPending > 0 && <TotalBadge>{totalPending.toLocaleString()}</TotalBadge>}
        </PageTitle>
        <PageSubtitle>Заявки за Супер администратор (двойно одобрение) и критични действия, изискващи потвърждение</PageSubtitle>
      </PageHeader>

      {/* ── Раздел 1: Заявки за Супер администратор ── */}
      <Card>
        <SectionTitle>
          Заявки за Супер администратор
          {(superData?.total ?? 0) > 0 && (
            <TotalBadge style={{ marginLeft: '0.5rem' }}>{superData!.total}</TotalBadge>
          )}
        </SectionTitle>
        <SectionSubtitle>Нови акаунти на Супер администратор, чакащи одобрение от втори Супер администратор</SectionSubtitle>

        {(superData?.total ?? 0) > 0 && (
          isSuperAdmin ? (
            <DangerBanner>
              Само Супер администратор може да одобри или отхвърли тези заявки. Одобряването създава пълен акаунт на Супер администратор.
            </DangerBanner>
          ) : (
            <InfoBanner>
              🔒 Нямате права да одобрявате или отхвърляте заявки за Супер администратор. Свържете се с друг Супер администратор.
            </InfoBanner>
          )
        )}

        <DataTable
          columns={superColumns}
          data={superData?.requests ?? []}
          rowKey={(row) => row.id}
          loading={superLoading}
          emptyMessage="Няма чакащи заявки за Супер администратор"
          page={superPage}
          pageSize={PAGE_SIZE}
          totalItems={superData?.total}
          onPageChange={setSuperPage}
          rowActions={[
            ...(isSuperAdmin ? [{
              label: 'Одобри',
              onClick: (row: PendingSuperAdminRequest) => setModal({ type: 'super', request: row }),
            }] : []),
            {
              label: isSuperAdmin ? 'Отхвърли' : 'Виж заявката',
              danger: isSuperAdmin ? true as const : false,
              onClick: (row: PendingSuperAdminRequest) => {
                if (!isSuperAdmin) {
                  toast('Само Супер администратор може да одобри или отхвърли тази заявка.', { icon: '🔒' });
                  return;
                }
                if (!window.confirm(`Да се отхвърли заявката за Супер администратор за ${row.email}?`)) return;
                rejectSuperMutation.mutate(row.id);
              },
            },
          ]}
        />
      </Card>

      {/* ── Раздел 2: Администратори без назначена роля ── */}
      <Card>
        <SectionTitle>
          Администратори без назначена роля
          {(roleData?.total ?? 0) > 0 && (
            <TotalBadge style={{ marginLeft: '0.5rem' }}>{roleData!.total}</TotalBadge>
          )}
        </SectionTitle>
        <SectionSubtitle>Акаунти с администраторски достъп, на които предстои назначаване на панелна роля</SectionSubtitle>

        <InfoBanner>
          Тези потребители имат системна роля <strong>Администратор</strong>, но все още нямат назначена панелна роля. Назначи роля, за да получат достъп до таблото.
        </InfoBanner>

        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Търси по име, имейл или телефон…"
            value={roleSearchInput}
            onChange={(e) => setRoleSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setRoleSearch(roleSearchInput); setRolePage(1); }
            }}
          />
        </FilterRow>

        <DataTable
          columns={roleColumns}
          data={roleData?.users ?? []}
          rowKey={(row) => row.id}
          loading={roleLoading}
          emptyMessage="Няма администратори без назначена роля"
          page={rolePage}
          pageSize={PAGE_SIZE}
          totalItems={roleData?.total}
          onPageChange={setRolePage}
          rowActions={[
            {
              label: 'Назначи роля',
              hidden: (row: PendingAdmin) => row.role === 'SUPER_ADMIN',
              onClick: (row) => {
                setModal({ type: 'role', admin: row });
                setSelectedRole('ADMIN');
              },
            },
          ]}
        />
      </Card>

      {/* ── Модал: Одобри заявка за Супер администратор ── */}
      {modal?.type === 'super' && (
        <OverlayBackdrop onClick={() => setModal(null)}>
          <OverlayCard onClick={(e) => e.stopPropagation()}>
            <OverlayTitle>Одобри заявка за Супер администратор</OverlayTitle>
            <OverlaySubtitle>
              Ще бъде създаден пълен акаунт на Супер администратор за{' '}
              <strong>{modal.request.email}</strong>. Това действие трудно се отменя.
            </OverlaySubtitle>
            <OverlayActions>
              <PrimaryBtn
                $loading={approveSuperMutation.isPending}
                disabled={approveSuperMutation.isPending}
                onClick={() => approveSuperMutation.mutate(modal.request.id)}
              >
                {approveSuperMutation.isPending ? 'Одобряване…' : 'Одобри и създай акаунт'}
              </PrimaryBtn>
              <SecondaryBtn onClick={() => setModal(null)}>Отказ</SecondaryBtn>
            </OverlayActions>
          </OverlayCard>
        </OverlayBackdrop>
      )}

      {/* ── Модал: Назначи роля ── */}
      {modal?.type === 'role' && (
        <OverlayBackdrop onClick={() => setModal(null)}>
          <OverlayCard onClick={(e) => e.stopPropagation()}>
            <OverlayTitle>Назначи роля</OverlayTitle>
            <OverlaySubtitle>
              Назначи панелна роля на <strong>{modal.admin.email}</strong>
            </OverlaySubtitle>
            <Select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as AdminRoleKey)}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <OverlayActions>
              <PrimaryBtn
                $loading={approveMutation.isPending}
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate({ id: modal.admin.id, roleKey: selectedRole })}
              >
                {approveMutation.isPending ? 'Назначаване…' : 'Назначи роля'}
              </PrimaryBtn>
              <SecondaryBtn onClick={() => setModal(null)}>Отказ</SecondaryBtn>
            </OverlayActions>
          </OverlayCard>
        </OverlayBackdrop>
      )}
    </PageShell>
  );
}
