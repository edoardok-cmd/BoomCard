import React, { useState } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminAdminsService, AdminRoleKey, CreateAdminResponse } from '../../services/adminAdmins.service';


import { palette } from '../../styles/adminTheme';
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
  color: ${palette.onAccent};
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
  border: 1px solid ${palette.successBorder};
  border-radius: 0.5rem;
  padding: 0.875rem 1.125rem;
  font-size: 0.875rem;
  color: ${palette.success};
  font-weight: 600;
  margin-bottom: 1.25rem;
`;

const ErrorBanner = styled.div`
  background: ${palette.dangerSoft};
  border: 1px solid ${palette.dangerBorder};
  border-radius: 0.5rem;
  padding: 0.875rem 1.125rem;
  font-size: 0.875rem;
  color: ${palette.danger};
  font-weight: 600;
  margin-bottom: 1.25rem;
`;

const WarningBanner = styled.div`
  background: ${palette.warningSoft};
  border: 1px solid ${palette.warningBorder};
  border-radius: 0.5rem;
  padding: 0.875rem 1.125rem;
  font-size: 0.8125rem;
  color: ${palette.warning};
  font-weight: 500;
  margin-top: 0.5rem;
`;

// Roles are statically defined so SUPER_ADMIN is always available regardless of
// what the /roles API returns. Without this, the double-approval flow can never
// be triggered from the UI.
const ROLE_OPTIONS: Array<{ value: AdminRoleKey; label: string }> = [
  { value: 'ADMIN',           label: 'Администратор (пълен достъп)' },
  { value: 'SUPPORT',         label: 'Поддръжка' },
  { value: 'FINANCE',         label: 'Финанси' },
  { value: 'RISK_REVIEW',     label: 'Преглед на риск' },
  { value: 'PARTNER_MANAGER', label: 'Мениджър партньори' },
  { value: 'SUPER_ADMIN',     label: 'Супер администратор' },
];

const EMPTY = { email: '', firstName: '', lastName: '', phone: '', password: '', roleKey: 'ADMIN' as AdminRoleKey };

export default function AdminAdminsCreatePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [lastCreated, setLastCreated] = useState<{ email: string; pending: boolean } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      adminAdminsService.create({
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        roleKey: form.roleKey,
      }),
    onSuccess: (data: CreateAdminResponse) => {
      setServerError(null);
      setForm(EMPTY);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (data.pending) {
        setLastCreated({ email: data.request.email, pending: true });
        toast.success(`Заявка за Супер администратор подадена за ${data.request.email}`);
        queryClient.invalidateQueries({ queryKey: ['admin-admins-pending-super'] });
      } else {
        setLastCreated({ email: data.user.email, pending: false });
        toast.success(`Администраторски акаунт създаден за ${data.user.email}`);
        queryClient.invalidateQueries({ queryKey: ['admin-admins'] });
        queryClient.invalidateQueries({ queryKey: ['admin-admins-pending'] });
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Неуспешно създаване на администратор';
      setServerError(msg);
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.firstName.trim() || !form.lastName.trim() || !form.password || !form.roleKey) {
      toast.error('Имейл, име, фамилия, парола и роля са задължителни');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Паролата трябва да е поне 8 символа');
      return;
    }
    setServerError(null);
    createMutation.mutate();
  };

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const isSuperAdmin = form.roleKey === 'SUPER_ADMIN';

  return (
    <PageShell>
      <Eyebrow>Администратори</Eyebrow>
      <PageTitle>Създай администратор</PageTitle>
      <PageSubtitle>Създай нов администраторски акаунт и му задай начална роля.</PageSubtitle>

      <FormCard>
        {lastCreated && (
          <SuccessBanner>
            {lastCreated.pending
              ? <>Заявката за Супер администратор за <strong>{lastCreated.email}</strong> е изпратена — втори Супер администратор трябва да я одобри от страницата <Link to="/admin/admins/pending" style={{ color: 'inherit', textDecoration: 'underline' }}>Очакващи одобрение</Link>.</>
              : <>Администраторският акаунт за <strong>{lastCreated.email}</strong> е създаден успешно.</>}
          </SuccessBanner>
        )}
        {serverError && (
          <ErrorBanner>{serverError}</ErrorBanner>
        )}

        <form onSubmit={handleSubmit} autoComplete="off">
          <FieldGroup>
            <Field>
              <Label htmlFor="email">Имейл адрес *</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@boomcard.bg"
                value={form.email}
                onChange={set('email')}
                required
                autoComplete="off"
              />
            </Field>

            <Field>
              <Label htmlFor="firstName">Име *</Label>
              <Input
                id="firstName"
                type="text"
                placeholder="Иван"
                value={form.firstName}
                onChange={(e) => { e.target.setCustomValidity(''); set('firstName')(e); }}
                onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity('Полето трябва да съдържа поне 2 символа')}
                required
                minLength={2}
              />
            </Field>

            <Field>
              <Label htmlFor="lastName">Фамилия *</Label>
              <Input
                id="lastName"
                type="text"
                placeholder="Петров"
                value={form.lastName}
                onChange={(e) => { e.target.setCustomValidity(''); set('lastName')(e); }}
                onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity('Полето трябва да съдържа поне 2 символа')}
                required
                minLength={2}
              />
            </Field>

            <Field>
              <Label htmlFor="phone">Телефон</Label>
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
              <Label htmlFor="password">Временна парола *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Мин. 8 символа"
                value={form.password}
                onChange={(e) => { e.target.setCustomValidity(''); set('password')(e); }}
                onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity('Паролата трябва да е поне 8 символа')}
                minLength={8}
                required
                autoComplete="new-password"
              />
              <FieldHint>Администраторът трябва да смени паролата при първо влизане.</FieldHint>
            </Field>

            <Field>
              <Label htmlFor="roleKey">Начална роля *</Label>
              <Select id="roleKey" value={form.roleKey} onChange={set('roleKey')}>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
              <FieldHint>Допълнителни роли могат да се добавят от списъка Всички администратори.</FieldHint>
              {isSuperAdmin && (
                <WarningBanner>
                  ⚠️ Заявката за Супер администратор не се одобрява автоматично. Тя ще бъде изпратена за одобрение от втори Супер администратор в страницата Очакващи одобрение. Заявителят не може да одобри собствената си заявка.
                </WarningBanner>
              )}
            </Field>

            <Field>
              <FieldHint>
                🔐 Двуфакторното удостоверяване (2FA) трябва да се настрои при първо влизане. Администраторите без активно 2FA са видими в списъка.
              </FieldHint>
            </Field>
          </FieldGroup>

          <ButtonRow>
            <SubmitButton type="submit" $loading={createMutation.isPending} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Създаване…' : 'Създай администратор'}
            </SubmitButton>
            <ResetButton type="button" onClick={() => { setForm(EMPTY); setServerError(null); setLastCreated(null); }}>
              Изчисти
            </ResetButton>
          </ButtonRow>
        </form>
      </FormCard>
    </PageShell>
  );
}
