import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminProfileService } from '../../services/adminProfile.service';

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

const AdminProfileSecurityPage: React.FC = () => {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['admin-profile-me'], queryFn: () => adminProfileService.getMe() });
  const sessions = useQuery({ queryKey: ['admin-profile-sessions'], queryFn: () => adminProfileService.listSessions() });
  const history = useQuery({ queryKey: ['admin-profile-login-history'], queryFn: () => adminProfileService.loginHistory() });

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [twoFaToken, setTwoFaToken] = useState('');
  const [twoFaSetup, setTwoFaSetup] = useState<{ qrCodeDataUrl: string } | null>(null);
  const [disablePwd, setDisablePwd] = useState('');

  const passwordMutation = useMutation({
    mutationFn: () => adminProfileService.changePassword(currentPwd, newPwd),
    onSuccess: () => {
      toast.success('Password changed');
      setCurrentPwd('');
      setNewPwd('');
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Password change failed');
    },
  });

  const twoFaSetupMutation = useMutation({
    mutationFn: () => adminProfileService.setupTwoFactor(),
    onSuccess: (data) => setTwoFaSetup({ qrCodeDataUrl: data.qrCodeDataUrl }),
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Failed to start 2FA setup');
    },
  });

  const twoFaEnableMutation = useMutation({
    mutationFn: () => adminProfileService.enableTwoFactor(twoFaToken),
    onSuccess: () => {
      toast.success('2FA enabled');
      setTwoFaSetup(null);
      setTwoFaToken('');
      queryClient.invalidateQueries({ queryKey: ['admin-profile-me'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Invalid token');
    },
  });

  const twoFaDisableMutation = useMutation({
    mutationFn: () => adminProfileService.disableTwoFactor(disablePwd),
    onSuccess: () => {
      toast.success('2FA disabled');
      setDisablePwd('');
      queryClient.invalidateQueries({ queryKey: ['admin-profile-me'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Failed to disable 2FA');
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (id: string) => adminProfileService.revokeSession(id),
    onSuccess: () => {
      toast.success('Session revoked');
      queryClient.invalidateQueries({ queryKey: ['admin-profile-sessions'] });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => adminProfileService.revokeAllSessions(),
    onSuccess: () => {
      toast.success('All sessions revoked');
      queryClient.invalidateQueries({ queryKey: ['admin-profile-sessions'] });
    },
  });

  const twoFaEnabled = profile.data?.twoFactorEnabled ?? false;

  return (
    <Wrapper>
      {/* Password */}
      <Card>
        <SectionTitle>Password</SectionTitle>
        <Row>
          <Field>
            <Label>Current password</Label>
            <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} />
          </Field>
          <Field>
            <Label>New password (min 8 chars)</Label>
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </Field>
        </Row>
        <Actions>
          <Button
            onClick={() => passwordMutation.mutate()}
            disabled={!currentPwd || newPwd.length < 8 || passwordMutation.isPending}
          >
            {passwordMutation.isPending ? 'Changing…' : 'Change password'}
          </Button>
        </Actions>
      </Card>

      {/* 2FA */}
      <Card>
        <SectionTitle>
          Two-factor authentication
          {twoFaEnabled ? <StatusOk>Enabled</StatusOk> : <StatusOff>Disabled</StatusOff>}
        </SectionTitle>
        {!twoFaEnabled && !twoFaSetup && (
          <>
            <Hint>Add a TOTP authenticator app for an extra sign-in step.</Hint>
            <Actions>
              <Button onClick={() => twoFaSetupMutation.mutate()} disabled={twoFaSetupMutation.isPending}>
                {twoFaSetupMutation.isPending ? 'Generating…' : 'Set up 2FA'}
              </Button>
            </Actions>
          </>
        )}
        {!twoFaEnabled && twoFaSetup && (
          <>
            <Hint>Scan the QR code with your authenticator app, then enter the 6-digit code.</Hint>
            <QrImg src={twoFaSetup.qrCodeDataUrl} alt="TOTP QR" />
            <Row>
              <Field>
                <Label>Code from app</Label>
                <Input value={twoFaToken} onChange={(e) => setTwoFaToken(e.target.value)} placeholder="123456" />
              </Field>
            </Row>
            <Actions>
              <Button
                onClick={() => twoFaEnableMutation.mutate()}
                disabled={twoFaToken.length < 6 || twoFaEnableMutation.isPending}
              >
                {twoFaEnableMutation.isPending ? 'Verifying…' : 'Enable 2FA'}
              </Button>
              <SecondaryButton onClick={() => { setTwoFaSetup(null); setTwoFaToken(''); }}>
                Cancel
              </SecondaryButton>
            </Actions>
          </>
        )}
        {twoFaEnabled && (
          <>
            <Hint>To disable 2FA, confirm your current password.</Hint>
            <Row>
              <Field>
                <Label>Current password</Label>
                <Input type="password" value={disablePwd} onChange={(e) => setDisablePwd(e.target.value)} />
              </Field>
            </Row>
            <Actions>
              <DangerButton
                onClick={() => twoFaDisableMutation.mutate()}
                disabled={!disablePwd || twoFaDisableMutation.isPending}
              >
                {twoFaDisableMutation.isPending ? 'Disabling…' : 'Disable 2FA'}
              </DangerButton>
            </Actions>
          </>
        )}
      </Card>

      {/* Active sessions */}
      <Card>
        <SectionTitle>
          Active sessions
          <SmallSecondary onClick={() => revokeAllMutation.mutate()} disabled={revokeAllMutation.isPending}>
            Sign out everywhere
          </SmallSecondary>
        </SectionTitle>
        {sessions.isLoading ? (
          <Hint>Loading…</Hint>
        ) : sessions.data?.sessions.length === 0 ? (
          <Hint>No other active sessions.</Hint>
        ) : (
          <Table>
            <thead>
              <tr><Th>Client</Th><Th>Started</Th><Th>Expires</Th><Th></Th></tr>
            </thead>
            <tbody>
              {sessions.data?.sessions.map((s) => (
                <tr key={s.id}>
                  <Td>{s.clientType ?? '—'}</Td>
                  <Td>{new Date(s.createdAt).toLocaleString()}</Td>
                  <Td>{new Date(s.expiresAt).toLocaleString()}</Td>
                  <Td>
                    <SmallDanger
                      onClick={() => revokeSessionMutation.mutate(s.id)}
                      disabled={revokeSessionMutation.isPending}
                    >
                      Revoke
                    </SmallDanger>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Login history */}
      <Card>
        <SectionTitle>Login history (last 50)</SectionTitle>
        {history.isLoading ? (
          <Hint>Loading…</Hint>
        ) : history.data?.history.length === 0 ? (
          <Hint>No login history yet.</Hint>
        ) : (
          <Table>
            <thead>
              <tr><Th>When</Th><Th>Result</Th><Th>IP</Th><Th>User-agent</Th></tr>
            </thead>
            <tbody>
              {history.data?.history.map((e) => (
                <tr key={e.id}>
                  <Td>{new Date(e.createdAt).toLocaleString()}</Td>
                  <Td>
                    {e.success
                      ? <StatusOk>Success</StatusOk>
                      : <StatusOff>{e.failReason ?? 'Failed'}</StatusOff>}
                  </Td>
                  <Td>{e.ip ?? '—'}</Td>
                  <Td title={e.userAgent ?? ''} style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.userAgent ?? '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Wrapper>
  );
};

const Wrapper = styled.div`display: flex; flex-direction: column; gap: 1.25rem; max-width: 60rem;`;
const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.75rem;
`;
const SectionTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 1.25rem;
  display: flex; align-items: center; gap: 0.75rem;
  justify-content: space-between;
`;
const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;
const Field = styled.div`display: flex; flex-direction: column;`;
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
`;
const Hint = styled.p`font-size: 0.8125rem; color: ${palette.textSubtle}; margin: 0 0 1rem;`;
const Actions = styled.div`display: flex; gap: 0.5rem;`;
const Button = styled.button`
  background: ${palette.accent};
  color: white;
  border: 0;
  padding: 0.5rem 1.125rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
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
const DangerButton = styled(Button)`
  background: ${palette.danger};
  &:hover:not(:disabled) { background: #903021; }
`;
const SmallSecondary = styled.button`
  background: ${palette.bg};
  color: ${palette.text};
  border: 1px solid ${palette.border};
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;
const SmallDanger = styled.button`
  background: ${palette.dangerSoft};
  color: ${palette.danger};
  border: 0;
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  &:hover:not(:disabled) { background: #ecc4b9; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;
const StatusOk = styled.span`
  background: ${palette.successSoft};
  color: ${palette.success};
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
`;
const StatusOff = styled.span`
  background: ${palette.dangerSoft};
  color: ${palette.danger};
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
`;
const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
`;
const Th = styled.th`
  text-align: left;
  font-size: 0.75rem;
  font-weight: 700;
  color: ${palette.textSubtle};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid ${palette.border};
`;
const Td = styled.td`
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid ${palette.border};
  color: ${palette.text};
`;
const QrImg = styled.img`
  width: 200px; height: 200px; display: block; margin: 0 0 1rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  background: ${palette.surface};
`;

export default AdminProfileSecurityPage;
