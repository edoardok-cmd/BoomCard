import React, { useState } from 'react';
import styled from 'styled-components';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminAdminsService,
  AdminUser,
  AdminRoleKey,
} from '../../services/adminAdmins.service';

const ASSIGNABLE_ROLES: Array<{ value: AdminRoleKey; label: string }> = [
  { value: 'ADMIN', label: 'Администратор (пълен достъп)' },
  { value: 'SUPPORT', label: 'Поддръжка' },
  { value: 'FINANCE', label: 'Финанси' },
  { value: 'RISK_REVIEW', label: 'Преглед на риск' },
  { value: 'PARTNER_MANAGER', label: 'Мениджър партньори' },
];

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
  purple: '#7c3aed',
  purpleSoft: '#ede9fe',
  teal: '#0f766e',
  tealSoft: '#ccfbf1',
};

const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  gap: 1rem;
  flex-wrap: wrap;
`;

const TitleBlock = styled.div``;

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

const TwoFaBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: ${palette.warningSoft};
  border: 1px solid ${palette.warning};
  border-radius: 0.5rem;
  padding: 0.875rem 1.125rem;
  margin-bottom: 1.5rem;
  font-size: 0.9375rem;
  color: ${palette.warning};
  a {
    color: ${palette.warning};
    font-weight: 600;
    text-decoration: underline;
  }
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

const Select = styled.select`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
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

const RoleBadge = styled.span<{ $key: string }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  margin: 0.1rem 0.15rem 0.1rem 0;

  ${({ $key }) => {
    switch ($key) {
      case 'SUPER_ADMIN': return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'ADMIN':       return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      case 'FINANCE':     return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'SUPPORT':     return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'RISK_REVIEW':     return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'PARTNER_MANAGER': return `background: ${palette.tealSoft}; color: ${palette.teal};`;
      default:                return `background: #f3f4f6; color: #374151;`;
    }
  }}
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

const OverlaySelect = styled.select`
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

// Panel roles only — SUPER_ADMIN is an accountRole, not a panel role, so it
// is excluded to prevent a filter that always returns zero results.
const ROLE_FILTER_OPTIONS: Array<{ value: AdminRoleKey | ''; label: string }> = [
  { value: '', label: 'Всички роли' },
  { value: 'ADMIN', label: 'Администратор' },
  { value: 'SUPPORT', label: 'Поддръжка' },
  { value: 'FINANCE', label: 'Финанси' },
  { value: 'RISK_REVIEW', label: 'Преглед на риск' },
  { value: 'PARTNER_MANAGER', label: 'Мениджър партньори' },
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Администратор',
  SUPPORT: 'Поддръжка',
  FINANCE: 'Финанси',
  RISK_REVIEW: 'Преглед на риск',
  PARTNER_MANAGER: 'Мениджър партньори',
  SUPER_ADMIN: 'Супер администратор',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Активен',
  SUSPENDED: 'Спрян',
  INACTIVE: 'Неактивен',
  PENDING_VERIFICATION: 'Чака верификация',
  PENDING_PAYMENT: 'Чака плащане',
};

const PAGE_SIZE = 20;

export default function AdminAdminsAllPage() {
  const { language } = useLanguage();
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleKey, setRoleKey] = useState<AdminRoleKey | ''>('');
  const [addRoleTarget, setAddRoleTarget] = useState<AdminUser | null>(null);
  const [addRoleKey, setAddRoleKey] = useState<AdminRoleKey>('ADMIN');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-admins', page, search, roleKey],
    queryFn: () => adminAdminsService.list({ page, limit: PAGE_SIZE, search: search || undefined, roleKey: roleKey || undefined }),
  });

  // Fetch the logged-in admin's own record directly so the 2FA banner is
  // independent of pagination — data.admins only contains the current page
  // and could miss the current user when filtered/paginated away.
  const { data: selfRecord } = useQuery({
    queryKey: ['admin-self', authUser?.id],
    queryFn: () => adminAdminsService.getById(authUser!.id),
    enabled: !!authUser?.id,
    staleTime: 60_000,
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ id, key }: { id: string; key: AdminRoleKey }) =>
      adminAdminsService.removeRole(id, key),
    onSuccess: () => {
      toast.success('Ролята е премахната');
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
      queryClient.invalidateQueries({ queryKey: ['admin-admins-pending'] });
    },
    onError: () => toast.error('Грешка при премахване на роля'),
  });

  const addRoleMutation = useMutation({
    mutationFn: ({ id, key }: { id: string; key: AdminRoleKey }) =>
      adminAdminsService.approve(id, key),
    onSuccess: () => {
      toast.success('Ролята е добавена');
      setAddRoleTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
      queryClient.invalidateQueries({ queryKey: ['admin-admins-pending'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Грешка при добавяне на роля';
      toast.error(msg);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      adminAdminsService.setStatus(id, status),
    onSuccess: (_, { status }) => {
      toast.success(status === 'ACTIVE' ? 'Администраторът е активиран' : 'Администраторът е спрян');
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Грешка при промяна на статус';
      toast.error(msg);
    },
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
  };

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : '—';

  const columns: ColumnDef<AdminUser>[] = [
    {
      key: 'user',
      header: 'Администратор',
      render: (row) => (
        <UserCell>
          <Link
            to={`/admin/admins/${row.id}`}
            style={{ color: 'inherit', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            {row.firstName || row.lastName
              ? `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim()
              : '—'}
          </Link>
          <MetaLine>{row.email}</MetaLine>
          {row.phone && <MetaLine>{row.phone}</MetaLine>}
        </UserCell>
      ),
    },
    {
      key: 'roles',
      header: 'Роля',
      render: (row) => {
        const hasPanelRoles = row.adminRoles.length > 0;
        const isSuperAdmin = row.role === 'SUPER_ADMIN';
        if (!hasPanelRoles && !isSuperAdmin) {
          return <span style={{ color: palette.textSubtle, fontSize: '0.8125rem' }}>Без роля</span>;
        }
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {isSuperAdmin && (
              <RoleBadge $key="SUPER_ADMIN">Супер администратор</RoleBadge>
            )}
            {row.adminRoles.map((ar) => (
              <RoleBadge key={ar.id} $key={ar.role.key}>
                {ROLE_LABEL[ar.role.key] ?? ar.role.label}
              </RoleBadge>
            ))}
          </div>
        );
      },
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
      key: 'twoFactor',
      header: '2FA',
      render: (row) => (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            borderRadius: '0.375rem',
            padding: '0.125rem 0.5rem',
            background: row.twoFactorEnabled ? palette.successSoft : '#f3f4f6',
            color: row.twoFactorEnabled ? palette.success : '#6b7280',
          }}
        >
          {row.twoFactorEnabled ? 'Активна' : 'Изкл.'}
        </span>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Последно влизане',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{fmt(row.lastLoginAt)}</span>
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

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Администратори</Eyebrow>
          <PageTitle>
            Всички администратори
            {data && data.total > 0 && <TotalBadge>{data.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Всички администраторски акаунти с назначените им роли</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      {/* Warn when the currently logged-in admin has not enabled 2FA.
          Uses a dedicated query for the current user so the banner shows
          regardless of which page or filter is active in the table below. */}
      {selfRecord && !selfRecord.twoFactorEnabled && (
        <TwoFaBanner>
          ⚠&nbsp;Нямате активирана двуфакторна автентикация.{' '}
          <Link to="/admin/profile/security">Активирайте я от Профил → Сигурност.</Link>
        </TwoFaBanner>
      )}

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Търси по име, имейл или телефон…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <Select
            value={roleKey}
            onChange={(e) => { setRoleKey(e.target.value as AdminRoleKey | ''); setPage(1); }}
          >
            {ROLE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.admins ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="Няма намерени администратори"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'Виж детайли',
              onClick: (row: AdminUser) => navigate(`/admin/admins/${row.id}`),
            },
            {
              label: 'Добави роля',
              hidden: (row: AdminUser) =>
                ASSIGNABLE_ROLES.every((r) => row.adminRoles.some((ar) => ar.role.key === r.value)),
              onClick: (row: AdminUser) => {
                setAddRoleTarget(row);
                const firstUnassigned = ASSIGNABLE_ROLES.find(
                  (r) => !row.adminRoles.some((ar) => ar.role.key === r.value)
                );
                setAddRoleKey(firstUnassigned?.value ?? 'ADMIN');
              },
            },
            ...(([
              { key: 'ADMIN', label: 'Администратор' },
              { key: 'SUPPORT', label: 'Поддръжка' },
              { key: 'FINANCE', label: 'Финанси' },
              { key: 'RISK_REVIEW', label: 'Преглед на риск' },
              { key: 'PARTNER_MANAGER', label: 'Мениджър партньори' },
            ] as Array<{ key: AdminRoleKey; label: string }>).map(({ key, label }) => ({
              label: `Премахни роля "${label}"`,
              danger: true as const,
              hidden: (row: AdminUser) => !row.adminRoles.some((ar) => ar.role.key === key),
              onClick: (row: AdminUser) => {
                if (!window.confirm(`Да се премахне роля "${label}" от ${row.email}?`)) return;
                removeRoleMutation.mutate({ id: row.id, key });
              },
            }))),
            {
              label: 'Спри',
              danger: true as const,
              hidden: (row: AdminUser) => row.status !== 'ACTIVE',
              disabled: () => statusMutation.isPending,
              onClick: (row: AdminUser) => {
                if (!window.confirm(`Да се спре администратор ${row.email}?`)) return;
                statusMutation.mutate({ id: row.id, status: 'SUSPENDED' });
              },
            },
            {
              label: 'Активирай',
              hidden: (row: AdminUser) => row.status !== 'SUSPENDED',
              disabled: () => statusMutation.isPending,
              onClick: (row: AdminUser) => {
                if (!window.confirm(`Да се активира администратор ${row.email}?`)) return;
                statusMutation.mutate({ id: row.id, status: 'ACTIVE' });
              },
            },
          ]}
        />
      </Card>
      {addRoleTarget && (
        <OverlayBackdrop onClick={() => setAddRoleTarget(null)}>
          <OverlayCard onClick={(e) => e.stopPropagation()}>
            <OverlayTitle>Добави роля</OverlayTitle>
            <OverlaySubtitle>
              Добави панелна роля към <strong>{addRoleTarget.email}</strong>
            </OverlaySubtitle>
            <OverlaySelect
              value={addRoleKey}
              onChange={(e) => setAddRoleKey(e.target.value as AdminRoleKey)}
            >
              {ASSIGNABLE_ROLES
                .filter((r) => !addRoleTarget.adminRoles.some((ar) => ar.role.key === r.value))
                .map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </OverlaySelect>
            <OverlayActions>
              <PrimaryBtn
                $loading={addRoleMutation.isPending}
                disabled={addRoleMutation.isPending}
                onClick={() => addRoleMutation.mutate({ id: addRoleTarget.id, key: addRoleKey })}
              >
                {addRoleMutation.isPending ? 'Добавяне…' : 'Добави роля'}
              </PrimaryBtn>
              <SecondaryBtn onClick={() => setAddRoleTarget(null)}>Отказ</SecondaryBtn>
            </OverlayActions>
          </OverlayCard>
        </OverlayBackdrop>
      )}
    </PageShell>
  );
}
