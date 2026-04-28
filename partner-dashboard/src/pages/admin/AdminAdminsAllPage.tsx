import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminAdminsService,
  AdminUser,
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
  purple: '#7c3aed',
  purpleSoft: '#ede9fe',
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
      case 'RISK_REVIEW': return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      default:            return `background: #f3f4f6; color: #374151;`;
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

const ROLE_OPTIONS: Array<{ value: AdminRoleKey | ''; label: string }> = [
  { value: '', label: 'All roles' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'RISK_REVIEW', label: 'Risk Review' },
  { value: 'PARTNER_MANAGER', label: 'Partner Manager' },
];

const PAGE_SIZE = 20;

export default function AdminAdminsAllPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleKey, setRoleKey] = useState<AdminRoleKey | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-admins', page, search, roleKey],
    queryFn: () => adminAdminsService.list({ page, limit: PAGE_SIZE, search: search || undefined, roleKey: roleKey || undefined }),
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ id, key }: { id: string; key: AdminRoleKey }) =>
      adminAdminsService.removeRole(id, key),
    onSuccess: () => {
      toast.success('Role removed');
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
      queryClient.invalidateQueries({ queryKey: ['admin-admins-pending'] });
    },
    onError: () => toast.error('Failed to remove role'),
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
      header: 'Admin',
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
      key: 'roles',
      header: 'Roles',
      render: (row) =>
        row.adminRoles.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {row.adminRoles.map((ar) => (
              <RoleBadge key={ar.id} $key={ar.role.key}>{ar.role.label}</RoleBadge>
            ))}
          </div>
        ) : (
          <span style={{ color: palette.textSubtle, fontSize: '0.8125rem' }}>No role</span>
        ),
    },
    {
      key: 'userRole',
      header: 'Account role',
      render: (row) => (
        <RoleBadge $key={row.role}>{row.role.replace('_', ' ')}</RoleBadge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted, display: 'flex', alignItems: 'center' }}>
          <StatusDot $status={row.status} />
          {row.status.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{fmt(row.lastLoginAt)}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Admins</Eyebrow>
          <PageTitle>
            All Admins
            {data && data.total > 0 && <TotalBadge>{data.total.toLocaleString()}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>All admin and super-admin accounts with their assigned roles</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search by name, email or phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <Select
            value={roleKey}
            onChange={(e) => { setRoleKey(e.target.value as AdminRoleKey | ''); setPage(1); }}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.admins ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="No admin users found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
          rowActions={([
            { key: 'SUPER_ADMIN', label: 'Super Admin' },
            { key: 'ADMIN', label: 'Admin' },
            { key: 'SUPPORT', label: 'Support' },
            { key: 'FINANCE', label: 'Finance' },
            { key: 'RISK_REVIEW', label: 'Risk Review' },
            { key: 'PARTNER_MANAGER', label: 'Partner Manager' },
          ] as Array<{ key: AdminRoleKey; label: string }>).map(({ key, label }) => ({
            label: `Remove "${label}" role`,
            danger: true,
            hidden: (row: AdminUser) => !row.adminRoles.some((ar) => ar.role.key === key),
            onClick: (row: AdminUser) => {
              if (!window.confirm(`Remove role "${label}" from ${row.email}?`)) return;
              removeRoleMutation.mutate({ id: row.id, key });
            },
          }))}
        />
      </Card>
    </PageShell>
  );
}
