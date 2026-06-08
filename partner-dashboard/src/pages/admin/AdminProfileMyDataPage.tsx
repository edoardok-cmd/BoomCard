import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminProfileService } from '../../services/adminProfile.service';


import { palette } from '../../styles/adminTheme';
const ROLE_LABEL: Record<string, string> = {
  ADMIN:           'Администратор',
  SUPPORT:         'Поддръжка',
  FINANCE:         'Финанси',
  RISK_REVIEW:     'Преглед на риск',
  PARTNER_MANAGER: 'Мениджър партньори',
  SUPER_ADMIN:     'Супер администратор',
};

const AdminProfileMyDataPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-profile-me'],
    queryFn: () => adminProfileService.getMe(),
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  // Email change state — 2-step: request code → confirm with code + password
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailStep, setEmailStep] = useState<'request' | 'confirm'>('request');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailPassword, setEmailPassword] = useState('');

  const closeEmailModal = () => {
    setShowEmailModal(false);
    setEmailStep('request');
    setNewEmail('');
    setEmailCode('');
    setEmailPassword('');
  };

  useEffect(() => {
    if (data) {
      setFirstName(data.firstName ?? '');
      setLastName(data.lastName ?? '');
      setPhone(data.phone ?? '');
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: () => adminProfileService.updateMe({ firstName, lastName, phone }),
    onSuccess: () => {
      toast.success('Профилът е обновен');
      queryClient.invalidateQueries({ queryKey: ['admin-profile-me'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Грешка при запазване');
    },
  });

  const requestEmailMutation = useMutation({
    mutationFn: () => adminProfileService.requestEmailChange(newEmail),
    onSuccess: () => {
      toast.success('Код за потвърждение е изпратен на новия имейл');
      setEmailStep('confirm');
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Грешка при изпращане на код');
    },
  });

  const confirmEmailMutation = useMutation({
    mutationFn: () => adminProfileService.confirmEmailChange(emailCode, emailPassword),
    onSuccess: () => {
      toast.success('Имейлът е сменен успешно');
      closeEmailModal();
      queryClient.invalidateQueries({ queryKey: ['admin-profile-me'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Грешка при потвърждение на имейл');
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarUploadMutation = useMutation({
    mutationFn: (file: File) => adminProfileService.uploadAvatar(file),
    onSuccess: () => {
      toast.success('Профилната снимка е обновена');
      queryClient.invalidateQueries({ queryKey: ['admin-profile-me'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Грешка при качване на снимка');
    },
  });

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Снимката трябва да е под 2 MB');
      return;
    }
    avatarUploadMutation.mutate(file);
    e.target.value = '';
  };

  const isSuperAdmin = data?.role === 'SUPER_ADMIN';

  // For SUPER_ADMIN: never show panel roles — they bypass all permission checks,
  // so any extra entries are redundant and confusing.
  // For other roles: show only those that differ from the main role.
  const relevantPanelRoles = data?.role === 'SUPER_ADMIN'
    ? []
    : (data?.adminRoles ?? []).filter((r) => r.role.key !== data?.role);

  if (isLoading) return <Loading>Зареждане…</Loading>;
  if (!data) return <Loading>Профилът не е намерен</Loading>;

  return (
    <Wrapper>
      <Card>
        <SectionTitle>Моите данни</SectionTitle>
        <AvatarRow>
          <AvatarWrapper
            onClick={() => !avatarUploadMutation.isPending && fileInputRef.current?.click()}
            title="Натиснете за смяна на снимка"
            $loading={avatarUploadMutation.isPending}
          >
            {data.avatar
              ? <AvatarImg src={data.avatar} alt="Профилна снимка" />
              : <AvatarInitials>{(data.firstName?.[0] ?? data.email[0]).toUpperCase()}</AvatarInitials>
            }
            <AvatarOverlay>{avatarUploadMutation.isPending ? '…' : '✎'}</AvatarOverlay>
          </AvatarWrapper>
          <AvatarHint>JPEG/PNG/WebP, макс. 2 MB</AvatarHint>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarFileChange}
          />
        </AvatarRow>
        <Row>
          <Field>
            <Label>Име</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field>
            <Label>Фамилия</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </Row>
        <Row>
          <Field>
            <Label>Имейл</Label>
            <EmailRow>
              <Input value={data.email} disabled style={{ flex: 1 }} />
              {isSuperAdmin && (
                <EditEmailBtn type="button" onClick={() => { setNewEmail(''); setShowEmailModal(true); }}>
                  Промени
                </EditEmailBtn>
              )}
            </EmailRow>
            {!isSuperAdmin && (
              <Hint>Имейлът може да се промени само от Супер администратор (изисква двустъпкова верификация).</Hint>
            )}
          </Field>
          <Field>
            <Label>Телефон</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+359…" />
          </Field>
        </Row>

        <Footer>
          <Meta>
            <span>Роля: <strong>{ROLE_LABEL[data.role] ?? data.role}</strong></span>
            {relevantPanelRoles.length > 0 && (
              <span>
                Допълнителни права: {relevantPanelRoles.map((r) => ROLE_LABEL[r.role.key] ?? r.role.label).join(', ')}
              </span>
            )}
            {data.lastLoginAt && (
              <span>Последно влизане: {new Date(data.lastLoginAt).toLocaleString('bg-BG')}</span>
            )}
          </Meta>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Запазване…' : 'Запази промените'}
          </Button>
        </Footer>
      </Card>

      {showEmailModal && (
        <ModalOverlay onClick={closeEmailModal}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            {emailStep === 'request' ? (
              <>
                <ModalTitle>Промяна на имейл адрес</ModalTitle>
                <ModalStepHint>Стъпка 1 от 2 — Въведете новия имейл. Ще изпратим код за потвърждение.</ModalStepHint>
                <ModalField>
                  <Label>Нов имейл адрес</Label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="нов@имейл.com"
                    autoFocus
                  />
                </ModalField>
                <ModalActions>
                  <Button
                    onClick={() => requestEmailMutation.mutate()}
                    disabled={!newEmail || requestEmailMutation.isPending}
                  >
                    {requestEmailMutation.isPending ? 'Изпращане…' : 'Изпрати код'}
                  </Button>
                  <SecondaryButton type="button" onClick={closeEmailModal}>
                    Отказ
                  </SecondaryButton>
                </ModalActions>
              </>
            ) : (
              <>
                <ModalTitle>Потвърди нов имейл</ModalTitle>
                <ModalStepHint>Стъпка 2 от 2 — Проверете {newEmail} за кода и въведете текущата си парола.</ModalStepHint>
                <ModalField>
                  <Label>Код за потвърждение (6 символа)</Label>
                  <Input
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={6}
                    autoFocus
                  />
                </ModalField>
                <ModalField>
                  <Label>Текуща парола</Label>
                  <Input
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </ModalField>
                <ModalActions>
                  <Button
                    onClick={() => confirmEmailMutation.mutate()}
                    disabled={emailCode.length < 6 || !emailPassword || confirmEmailMutation.isPending}
                  >
                    {confirmEmailMutation.isPending ? 'Потвърждаване…' : 'Потвърди'}
                  </Button>
                  <SecondaryButton type="button" onClick={() => setEmailStep('request')}>
                    Назад
                  </SecondaryButton>
                </ModalActions>
              </>
            )}
          </ModalBox>
        </ModalOverlay>
      )}
    </Wrapper>
  );
};

const Wrapper = styled.div`padding: 0;`;
const AvatarRow = styled.div`
  display: flex; align-items: center; gap: 0.875rem;
  margin-bottom: 1.25rem;
`;
const AvatarWrapper = styled.div<{ $loading: boolean }>`
  position: relative;
  width: 4rem; height: 4rem;
  border-radius: 50%;
  cursor: ${({ $loading }) => $loading ? 'wait' : 'pointer'};
  flex-shrink: 0;
  &:hover > span:last-child { opacity: 1; }
`;
const AvatarImg = styled.img`
  width: 4rem; height: 4rem;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid ${palette.border};
  display: block;
`;
const AvatarInitials = styled.div`
  width: 4rem; height: 4rem;
  border-radius: 50%;
  background: ${palette.accentSoft};
  border: 2px solid ${palette.border};
  display: flex; align-items: center; justify-content: center;
  font-size: 1.375rem; font-weight: 700; color: ${palette.accent};
`;
const AvatarOverlay = styled.span`
  position: absolute; inset: 0;
  border-radius: 50%;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  color: ${palette.onAccent}; font-size: 1rem;
  opacity: 0;
  transition: opacity 150ms;
`;
const AvatarHint = styled.p`font-size: 0.75rem; color: ${palette.textSubtle}; margin: 0;`;
const Loading = styled.div`padding: 4rem 2rem; text-align: center; color: ${palette.textMuted};`;
const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.75rem;
  max-width: 60rem;
`;
const SectionTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 1.25rem;
`;
const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;
const Field = styled.div`display: flex; flex-direction: column;`;
const EmailRow = styled.div`display: flex; gap: 0.5rem; align-items: center;`;
const Label = styled.label`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.textMuted};
  margin-bottom: 0.375rem;
`;
const Input = styled.input`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: ${palette.text};
  background: ${palette.bg};
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;
const EditEmailBtn = styled.button`
  white-space: nowrap;
  padding: 0.5rem 0.875rem;
  background: ${palette.bg};
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.accent};
  cursor: pointer;
  &:hover { background: ${palette.accentSoft}; border-color: ${palette.accent}; }
`;
const Hint = styled.p`font-size: 0.75rem; color: ${palette.textSubtle}; margin: 0.375rem 0 0;`;
const Footer = styled.div`
  display: flex; align-items: flex-end; justify-content: space-between;
  margin-top: 1.25rem; gap: 1rem; flex-wrap: wrap;
`;
const Meta = styled.div`
  display: flex; flex-direction: column; gap: 0.25rem;
  font-size: 0.8125rem; color: ${palette.textSubtle};
`;
const Button = styled.button`
  background: ${palette.accent};
  color: ${palette.onAccent};
  border: 0;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  &:hover:not(:disabled) { background: #b65a3a; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;
const SecondaryButton = styled(Button)`
  background: ${palette.surface};
  color: ${palette.text};
  border: 1px solid ${palette.border};
  &:hover:not(:disabled) { background: ${palette.bg}; }
`;

/* ── Email change modal ─────────────────────────────────────── */
const ModalOverlay = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
`;
const ModalBox = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.875rem;
  padding: 2rem;
  width: 100%; max-width: 26rem;
  display: flex; flex-direction: column; gap: 1rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
`;
const ModalTitle = styled.h3`
  font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0;
`;
const ModalStepHint = styled.p`font-size: 0.8125rem; color: ${palette.textSubtle}; margin: -0.25rem 0 0.25rem;`;
const ModalField = styled.div`display: flex; flex-direction: column;`;
const ModalActions = styled.div`display: flex; gap: 0.5rem; margin-top: 0.25rem;`;

export default AdminProfileMyDataPage;
