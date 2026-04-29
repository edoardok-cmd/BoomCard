import { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
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
  { value: 'ADMIN', label: 'Admin (full access)' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'RISK_REVIEW', label: 'Risk Review' },
  { value: 'PARTNER_MANAGER', label: 'Partner Manager' },
];

const PAGE_SIZE = 20;

type ApproveRoleModal = { type: 'role'; admin: PendingAdmin };
type ApproveSuperModal = { type: 'super'; request: PendingSuperAdminRequest };
type ActiveModal = ApproveRoleModal | ApproveSuperModal | null;

export default function AdminAdminsPendingPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  // Role-assignment pending state
  const [rolePage, setRolePage] = useState(1);
  const [roleSearchInput, setRoleSearchInput] = useState('');
  const [roleSearch, setRoleSearch] = useState('');

  // Super admin pending state
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
      toast.success('Role assigned — admin is now active');
      setModal(null);
      queryClient.invalidateQueries({ queryKey: ['admin-admins-pending'] });
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
    },
    onError: () => toast.error('Failed to assign role'),
  });

  const approveSuperMutation = useMutation({
    mutationFn: (id: string) => adminAdminsService.approvePendingSuper(id),
    onSuccess: (data) => {
      toast.success(`SUPER_ADMIN account created for ${data.user.email}`);
      setModal(null);
      queryClient.invalidateQueries({ queryKey: ['admin-admins-pending-super'] });
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to approve request';
      toast.error(msg);
    },
  });

  const rejectSuperMutation = useMutation({
    mutationFn: (id: string) => adminAdminsService.rejectPendingSuper(id),
    onSuccess: () => {
      toast.success('SUPER_ADMIN request rejected');
      setModal(null);
      queryClient.invalidateQueries({ queryKey: ['admin-admins-pending-super'] });
    },
    onError: () => toast.error('Failed to reject request'),
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

  const superColumns: ColumnDef<PendingSuperAdminRequest>[] = [
    {
      key: 'user',
      header: 'Requested account',
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
      header: 'Requested by',
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
      header: 'Requested',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  const roleColumns: ColumnDef<PendingAdmin>[] = [
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
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  const totalPending = (roleData?.total ?? 0) + (superData?.total ?? 0);

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Admins</Eyebrow>
        <PageTitle>
          Pending Approvals
          {totalPending > 0 && <TotalBadge>{totalPending.toLocaleString()}</TotalBadge>}
        </PageTitle>
        <PageSubtitle>SUPER_ADMIN creation requests (dual approval) and admin role assignments</PageSubtitle>
      </PageHeader>

      {/* ── Section 1: Pending SUPER_ADMIN creation requests ── */}
      <Card>
        <SectionTitle>
          SUPER_ADMIN Requests
          {(superData?.total ?? 0) > 0 && (
            <TotalBadge style={{ marginLeft: '0.5rem' }}>{superData!.total}</TotalBadge>
          )}
        </SectionTitle>
        <SectionSubtitle>New SUPER_ADMIN accounts pending a second SUPER_ADMIN's approval</SectionSubtitle>

        {(superData?.total ?? 0) > 0 && (
          <DangerBanner>
            Only a SUPER_ADMIN can approve or reject these requests. Approving creates a full SUPER_ADMIN account.
          </DangerBanner>
        )}

        <DataTable
          columns={superColumns}
          data={superData?.requests ?? []}
          rowKey={(row) => row.id}
          loading={superLoading}
          emptyMessage="No pending SUPER_ADMIN requests"
          page={superPage}
          pageSize={PAGE_SIZE}
          totalItems={superData?.total}
          onPageChange={setSuperPage}
          rowActions={[
            {
              label: 'Approve',
              onClick: (row) => setModal({ type: 'super', request: row }),
            },
            {
              label: 'Reject',
              danger: true as const,
              onClick: (row) => {
                if (!window.confirm(`Reject SUPER_ADMIN request for ${row.email}?`)) return;
                rejectSuperMutation.mutate(row.id);
              },
            },
          ]}
        />
      </Card>

      {/* ── Section 2: Role-assignment pending ── */}
      <Card>
        <SectionTitle>
          Pending Role Assignments
          {(roleData?.total ?? 0) > 0 && (
            <TotalBadge style={{ marginLeft: '0.5rem' }}>{roleData!.total}</TotalBadge>
          )}
        </SectionTitle>
        <SectionSubtitle>Admin accounts with no panel role assigned yet</SectionSubtitle>

        <InfoBanner>
          These users have the <strong>ADMIN</strong> system role but no panel role assigned yet.
          Assign a role to give them dashboard access.
        </InfoBanner>

        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search by name, email or phone…"
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
          emptyMessage="No pending admin role assignments"
          page={rolePage}
          pageSize={PAGE_SIZE}
          totalItems={roleData?.total}
          onPageChange={setRolePage}
          rowActions={[
            {
              label: 'Assign role & approve',
              onClick: (row) => {
                setModal({ type: 'role', admin: row });
                setSelectedRole('ADMIN');
              },
            },
          ]}
        />
      </Card>

      {/* ── Approve SUPER_ADMIN modal ── */}
      {modal?.type === 'super' && (
        <OverlayBackdrop onClick={() => setModal(null)}>
          <OverlayCard onClick={(e) => e.stopPropagation()}>
            <OverlayTitle>Approve SUPER_ADMIN request</OverlayTitle>
            <OverlaySubtitle>
              This will create a full SUPER_ADMIN account for{' '}
              <strong>{modal.request.email}</strong>. This action cannot be undone easily.
            </OverlaySubtitle>
            <OverlayActions>
              <PrimaryBtn
                $loading={approveSuperMutation.isPending}
                disabled={approveSuperMutation.isPending}
                onClick={() => approveSuperMutation.mutate(modal.request.id)}
              >
                {approveSuperMutation.isPending ? 'Approving…' : 'Approve & create account'}
              </PrimaryBtn>
              <SecondaryBtn onClick={() => setModal(null)}>Cancel</SecondaryBtn>
            </OverlayActions>
          </OverlayCard>
        </OverlayBackdrop>
      )}

      {/* ── Assign role modal ── */}
      {modal?.type === 'role' && (
        <OverlayBackdrop onClick={() => setModal(null)}>
          <OverlayCard onClick={(e) => e.stopPropagation()}>
            <OverlayTitle>Assign role</OverlayTitle>
            <OverlaySubtitle>
              Assign a panel role to <strong>{modal.admin.email}</strong>
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
                {approveMutation.isPending ? 'Assigning…' : 'Assign role'}
              </PrimaryBtn>
              <SecondaryBtn onClick={() => setModal(null)}>Cancel</SecondaryBtn>
            </OverlayActions>
          </OverlayCard>
        </OverlayBackdrop>
      )}
    </PageShell>
  );
}
