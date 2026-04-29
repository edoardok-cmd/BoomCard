import { useState } from 'react';
import styled from 'styled-components';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  adminAdminsService,
  AdminUserDetail,
  AdminRoleKey,
} from '../../services/adminAdmins.service';

const ASSIGNABLE_ROLES: Array<{ value: AdminRoleKey; label: string }> = [
  { value: 'ADMIN', label: 'Admin (full access)' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'RISK_REVIEW', label: 'Risk Review' },
  { value: 'PARTNER_MANAGER', label: 'Partner Manager' },
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

const BackBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  color: ${palette.textMuted};
  padding: 0;
  margin-bottom: 1.5rem;
  &:hover { color: ${palette.text}; }
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
  margin: 0 0 2rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  @media (max-width: 768px) { grid-template-columns: 1fr; }
`;

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;

const CardTitle = styled.h2`
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  margin: 0 0 1.25rem;
`;

const FieldRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0.5rem 0;
  border-bottom: 1px solid ${palette.border};
  gap: 1rem;
  &:last-child { border-bottom: none; }
`;

const FieldLabel = styled.span`
  font-size: 0.8125rem;
  color: ${palette.textSubtle};
  flex-shrink: 0;
`;

const FieldValue = styled.span`
  font-size: 0.8125rem;
  color: ${palette.text};
  font-weight: 500;
  text-align: right;
`;

const BadgeBase = styled.span`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
`;

const RoleBadge = styled(BadgeBase)<{ $key: string }>`
  ${({ $key }) => {
    switch ($key) {
      case 'SUPER_ADMIN':     return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'ADMIN':           return `background: ${palette.purpleSoft}; color: ${palette.purple};`;
      case 'FINANCE':         return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'SUPPORT':         return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'RISK_REVIEW':     return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'PARTNER_MANAGER': return `background: ${palette.tealSoft}; color: ${palette.teal};`;
      default:                return `background: #f3f4f6; color: #374151;`;
    }
  }}
`;

const StatusBadge = styled(BadgeBase)<{ $status: string }>`
  ${({ $status }) =>
    $status === 'ACTIVE'
      ? `background: ${palette.successSoft}; color: ${palette.success};`
      : $status === 'SUSPENDED'
      ? `background: ${palette.dangerSoft}; color: ${palette.danger};`
      : `background: #f3f4f6; color: #374151;`}
`;

const TfaBadge = styled(BadgeBase)<{ $enabled: boolean }>`
  ${({ $enabled }) =>
    $enabled
      ? `background: ${palette.successSoft}; color: ${palette.success};`
      : `background: #f3f4f6; color: #6b7280;`}
`;

const RoleRow = styled.div`
  padding: 0.75rem 0;
  border-bottom: 1px solid ${palette.border};
  &:last-child { border-bottom: none; }
`;

const RoleMeta = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.25rem;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $variant?: 'danger' | 'success' | 'ghost' }>`
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 100ms;
  ${({ $variant = 'ghost' }) => {
    if ($variant === 'danger')
      return `background: ${palette.dangerSoft}; color: ${palette.danger}; border-color: ${palette.danger}; &:hover { background: #ebb8a8; }`;
    if ($variant === 'success')
      return `background: ${palette.successSoft}; color: ${palette.success}; border-color: ${palette.success}; &:hover { background: #c8e0c8; }`;
    return `background: ${palette.surface}; color: ${palette.textMuted}; border-color: ${palette.border}; &:hover { background: ${palette.bg}; }`;
  }}
`;

const ErrorMsg = styled.p`
  color: ${palette.danger};
  font-size: 0.9375rem;
`;

const RoleRowActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const RemoveRoleBtn = styled.button`
  font-size: 0.7rem;
  font-weight: 600;
  color: ${palette.danger};
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  opacity: 0.7;
  &:hover { opacity: 1; background: ${palette.dangerSoft}; }
`;

const AddRoleBtn = styled.button`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.accent};
  background: none;
  border: 1px solid ${palette.accent};
  cursor: pointer;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  margin-top: 1rem;
  &:hover { background: ${palette.accentSoft}; }
`;

const AuditLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.info};
  text-decoration: none;
  margin-top: 1rem;
  &:hover { text-decoration: underline; }
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

const PrimaryBtn2 = styled.button<{ $loading?: boolean }>`
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

const SecondaryBtn2 = styled.button`
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

export default function AdminAdminDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [showAddRole, setShowAddRole] = useState(false);
  const [addRoleKey, setAddRoleKey] = useState<AdminRoleKey>('ADMIN');

  const { data, isLoading, error } = useQuery<AdminUserDetail>({
    queryKey: ['admin-admin-detail', id],
    queryFn: () => adminAdminsService.getById(id!),
    enabled: !!id,
  });

  const addRoleMutation = useMutation({
    mutationFn: (key: AdminRoleKey) => adminAdminsService.approve(id!, key),
    onSuccess: () => {
      toast.success('Role added');
      setShowAddRole(false);
      queryClient.invalidateQueries({ queryKey: ['admin-admin-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to add role';
      toast.error(msg);
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: (key: AdminRoleKey) => adminAdminsService.removeRole(id!, key),
    onSuccess: () => {
      toast.success('Role removed');
      queryClient.invalidateQueries({ queryKey: ['admin-admin-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to remove role';
      toast.error(msg);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'ACTIVE' | 'SUSPENDED') =>
      adminAdminsService.setStatus(id!, status),
    onSuccess: (_, status) => {
      toast.success(status === 'SUSPENDED' ? 'Admin suspended' : 'Admin activated');
      queryClient.invalidateQueries({ queryKey: ['admin-admin-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      toast.error(msg);
    },
  });

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : '—';

  if (isLoading) {
    return (
      <PageShell>
        <p style={{ color: palette.textMuted }}>Loading…</p>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
        <BackBtn onClick={() => navigate(-1)}>← Back</BackBtn>
        <ErrorMsg>Admin not found.</ErrorMsg>
      </PageShell>
    );
  }

  const displayName =
    data.firstName || data.lastName
      ? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim()
      : data.email;

  return (
    <PageShell>
      <BackBtn onClick={() => navigate(-1)}>← All Admins</BackBtn>
      <Eyebrow>Admin Detail</Eyebrow>
      <PageTitle>{displayName}</PageTitle>

      <Grid>
        {/* Profile card */}
        <Card>
          <CardTitle>Profile</CardTitle>
          <FieldRow>
            <FieldLabel>Name</FieldLabel>
            <FieldValue>{displayName}</FieldValue>
          </FieldRow>
          <FieldRow>
            <FieldLabel>Email</FieldLabel>
            <FieldValue>{data.email}</FieldValue>
          </FieldRow>
          <FieldRow>
            <FieldLabel>Phone</FieldLabel>
            <FieldValue>{data.phone ?? '—'}</FieldValue>
          </FieldRow>
          <FieldRow>
            <FieldLabel>Account role</FieldLabel>
            <FieldValue>
              <RoleBadge $key={data.role}>{data.role.replace('_', ' ')}</RoleBadge>
            </FieldValue>
          </FieldRow>
          <FieldRow>
            <FieldLabel>Status</FieldLabel>
            <FieldValue>
              <StatusBadge $status={data.status}>{data.status}</StatusBadge>
            </FieldValue>
          </FieldRow>
          <FieldRow>
            <FieldLabel>2FA</FieldLabel>
            <FieldValue>
              <TfaBadge $enabled={data.twoFactorEnabled}>
                {data.twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </TfaBadge>
            </FieldValue>
          </FieldRow>
          <FieldRow>
            <FieldLabel>Last login</FieldLabel>
            <FieldValue>{fmt(data.lastLoginAt)}</FieldValue>
          </FieldRow>
          <FieldRow>
            <FieldLabel>Created</FieldLabel>
            <FieldValue>{fmt(data.createdAt)}</FieldValue>
          </FieldRow>

          <ActionRow>
            {data.status === 'ACTIVE' && (
              <Btn
                $variant="danger"
                disabled={statusMutation.isPending}
                onClick={() => {
                  if (!window.confirm(`Suspend admin ${data.email}?`)) return;
                  statusMutation.mutate('SUSPENDED');
                }}
              >
                Suspend
              </Btn>
            )}
            {data.status === 'SUSPENDED' && (
              <Btn
                $variant="success"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate('ACTIVE')}
              >
                Activate
              </Btn>
            )}
          </ActionRow>
        </Card>

        {/* Roles card */}
        <Card>
          <CardTitle>Assigned Roles</CardTitle>
          {data.adminRoles.length === 0 ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>No roles assigned.</p>
          ) : (
            data.adminRoles.map((ar) => (
              <RoleRow key={ar.id}>
                <RoleRowActions>
                  <div>
                    <RoleBadge $key={ar.role.key as AdminRoleKey}>{ar.role.label}</RoleBadge>
                    <RoleMeta>
                      Granted {fmt(ar.grantedAt)}
                      {ar.grantedBy && (
                        <> by {ar.grantedBy.firstName || ar.grantedBy.lastName
                          ? `${ar.grantedBy.firstName ?? ''} ${ar.grantedBy.lastName ?? ''}`.trim()
                          : ar.grantedBy.email}
                        </>
                      )}
                    </RoleMeta>
                  </div>
                  <RemoveRoleBtn
                    disabled={removeRoleMutation.isPending}
                    onClick={() => {
                      if (!window.confirm(`Remove role "${ar.role.label}" from ${data.email}?`)) return;
                      removeRoleMutation.mutate(ar.role.key as AdminRoleKey);
                    }}
                  >
                    Remove
                  </RemoveRoleBtn>
                </RoleRowActions>
              </RoleRow>
            ))
          )}

          {ASSIGNABLE_ROLES.some((r) => !data.adminRoles.some((ar) => ar.role.key === r.value)) && (
            <AddRoleBtn onClick={() => {
              const firstUnassigned = ASSIGNABLE_ROLES.find(
                (r) => !data.adminRoles.some((ar) => ar.role.key === r.value)
              );
              setAddRoleKey(firstUnassigned?.value ?? 'ADMIN');
              setShowAddRole(true);
            }}>
              + Add role
            </AddRoleBtn>
          )}

          <AuditLink to="/admin/admins/audit">
            View audit log →
          </AuditLink>
        </Card>
      </Grid>
      {showAddRole && (
        <OverlayBackdrop onClick={() => setShowAddRole(false)}>
          <OverlayCard onClick={(e) => e.stopPropagation()}>
            <OverlayTitle>Add role</OverlayTitle>
            <OverlaySubtitle>
              Add a panel role to <strong>{data.email}</strong>
            </OverlaySubtitle>
            <OverlaySelect
              value={addRoleKey}
              onChange={(e) => setAddRoleKey(e.target.value as AdminRoleKey)}
            >
              {ASSIGNABLE_ROLES
                .filter((r) => !data.adminRoles.some((ar) => ar.role.key === r.value))
                .map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </OverlaySelect>
            <OverlayActions>
              <PrimaryBtn2
                $loading={addRoleMutation.isPending}
                disabled={addRoleMutation.isPending}
                onClick={() => addRoleMutation.mutate(addRoleKey)}
              >
                {addRoleMutation.isPending ? 'Adding…' : 'Add role'}
              </PrimaryBtn2>
              <SecondaryBtn2 onClick={() => setShowAddRole(false)}>Cancel</SecondaryBtn2>
            </OverlayActions>
          </OverlayCard>
        </OverlayBackdrop>
      )}
    </PageShell>
  );
}
