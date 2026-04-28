import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminAdminsService, AdminRoleKey } from '../../services/adminAdmins.service';

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
  danger: '#b54327',
  dangerSoft: '#f4dcd2',
};

const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
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
  margin: 0 0 2rem;
`;

const FormCard = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 2rem;
  max-width: 36rem;
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-bottom: 1.5rem;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${palette.text};
`;

const Input = styled.input`
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

const FieldHint = styled.p`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin: 0;
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${palette.border};
  margin: 0.25rem 0 1.25rem;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: center;
`;

const SubmitButton = styled.button<{ $loading?: boolean }>`
  padding: 0.625rem 1.5rem;
  background: ${palette.accent};
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 700;
  border: none;
  border-radius: 0.5rem;
  cursor: ${({ $loading }) => ($loading ? 'not-allowed' : 'pointer')};
  opacity: ${({ $loading }) => ($loading ? 0.7 : 1)};
  transition: opacity 0.15s;
  &:hover:not(:disabled) { opacity: 0.88; }
`;

const ResetButton = styled.button`
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

const SuccessBanner = styled.div`
  background: ${palette.successSoft};
  border: 1px solid #b7d9c4;
  border-radius: 0.5rem;
  padding: 0.875rem 1.125rem;
  font-size: 0.875rem;
  color: ${palette.success};
  font-weight: 600;
  margin-bottom: 1.25rem;
`;

const ErrorBanner = styled.div`
  background: ${palette.dangerSoft};
  border: 1px solid #e8bdb4;
  border-radius: 0.5rem;
  padding: 0.875rem 1.125rem;
  font-size: 0.875rem;
  color: ${palette.danger};
  font-weight: 600;
  margin-bottom: 1.25rem;
`;

const ROLE_OPTIONS: Array<{ value: AdminRoleKey; label: string }> = [
  { value: 'ADMIN', label: 'Admin (full access)' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'RISK_REVIEW', label: 'Risk Review' },
  { value: 'PARTNER_MANAGER', label: 'Partner Manager' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
];

const EMPTY = { email: '', firstName: '', lastName: '', phone: '', password: '', roleKey: 'ADMIN' as AdminRoleKey };

export default function AdminAdminsCreatePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: rolesData } = useQuery({
    queryKey: ['admin-admins-roles'],
    queryFn: () => adminAdminsService.listRoles(),
  });

  const availableRoles = rolesData?.roles ?? [];

  const createMutation = useMutation({
    mutationFn: () =>
      adminAdminsService.create({
        email: form.email.trim(),
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password,
        roleKey: form.roleKey,
      }),
    onSuccess: (data) => {
      setLastCreated(data.user.email);
      setServerError(null);
      setForm(EMPTY);
      toast.success(`Admin account created for ${data.user.email}`);
      queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create admin';
      setServerError(msg);
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password || !form.roleKey) {
      toast.error('Email, password, and role are required');
      return;
    }
    setServerError(null);
    createMutation.mutate();
  };

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <PageShell>
      <Eyebrow>Admins</Eyebrow>
      <PageTitle>Create Admin</PageTitle>
      <PageSubtitle>Create a new admin account and assign it an initial role.</PageSubtitle>

      <FormCard>
        {lastCreated && (
          <SuccessBanner>Admin account created for {lastCreated}</SuccessBanner>
        )}
        {serverError && (
          <ErrorBanner>{serverError}</ErrorBanner>
        )}

        <form onSubmit={handleSubmit} autoComplete="off">
          <FieldGroup>
            <Field>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={form.email}
                onChange={set('email')}
                required
                autoComplete="off"
              />
            </Field>

            <Field>
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                type="text"
                placeholder="First name"
                value={form.firstName}
                onChange={set('firstName')}
              />
            </Field>

            <Field>
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                type="text"
                placeholder="Last name"
                value={form.lastName}
                onChange={set('lastName')}
              />
            </Field>

            <Field>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="text"
                placeholder="+359..."
                value={form.phone}
                onChange={set('phone')}
              />
            </Field>
          </FieldGroup>

          <Divider />

          <FieldGroup>
            <Field>
              <Label htmlFor="password">Temporary password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min 8 characters"
                value={form.password}
                onChange={set('password')}
                minLength={8}
                required
                autoComplete="new-password"
              />
              <FieldHint>The admin must change this after first login.</FieldHint>
            </Field>

            <Field>
              <Label htmlFor="roleKey">Initial role *</Label>
              <Select id="roleKey" value={form.roleKey} onChange={set('roleKey')}>
                {(availableRoles.length > 0
                  ? availableRoles.map((r) => ({ value: r.key, label: r.label }))
                  : ROLE_OPTIONS
                ).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
              <FieldHint>Additional roles can be assigned from the All Admins list.</FieldHint>
            </Field>
          </FieldGroup>

          <ButtonRow>
            <SubmitButton type="submit" $loading={createMutation.isPending} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create admin'}
            </SubmitButton>
            <ResetButton type="button" onClick={() => { setForm(EMPTY); setServerError(null); setLastCreated(null); }}>
              Clear
            </ResetButton>
          </ButtonRow>
        </form>
      </FormCard>
    </PageShell>
  );
}
