import React, { useState, useRef, useEffect, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminProfileService, AdminSession } from '../../services/adminProfile.service';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { palette } from '../../styles/adminTheme';
import {
  ADMIN_GATE_HIGHLIGHT_EVENT,
  getAdminGateReason,
  type AdminGateHighlightDetail,
  type AdminGateReason,
} from '../../components/auth/adminGate';


/** Condenses a userAgent string to just the browser + OS tokens */
function parseUserAgent(ua: string | null): string {
  if (!ua) return '—';
  // Match common browsers
  const browser =
    /Edg\/[\d.]+/.test(ua) ? 'Edge' :
    /OPR\/[\d.]+/.test(ua) ? 'Opera' :
    /Chrome\/[\d.]+/.test(ua) ? 'Chrome' :
    /Firefox\/[\d.]+/.test(ua) ? 'Firefox' :
    /Safari\/[\d.]+/.test(ua) ? 'Safari' :
    'Браузър';
  // Match OS
  const os =
    /Windows NT/.test(ua) ? 'Windows' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad/.test(ua) ? 'iOS' :
    '';
  return os ? `${browser} / ${os}` : browser;
}

const PAGE_SIZE = 20;

const FAIL_REASON_BG: Record<string, string> = {
  bad_password:        'Грешна парола',
  suspended:           'Акаунтът е спрян',
  email_unverified:    'Имейлът не е потвърден',
  pending_verification:'Чака верификация',
  role_mismatch:       'Нямате достъп до тази секция',
  totp_required:       '2FA кодът е задължителен',
  totp_invalid:        'Невалиден 2FA код',
};

const bannerPulse = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(201, 100, 66, 0.55); }
  70%  { box-shadow: 0 0 0 10px rgba(201, 100, 66, 0); }
  100% { box-shadow: 0 0 0 0 rgba(201, 100, 66, 0); }
`;

const GuidanceBanner = styled.div<{ $variant: 'warning' | 'danger'; $pulse?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  background: ${({ $variant }) => $variant === 'danger' ? palette.dangerSoft : palette.warningSoft};
  border: 1px solid ${({ $variant }) => $variant === 'danger' ? palette.dangerBorder : palette.warningBorder};
  border-radius: 0.5rem;
  padding: 0.875rem 1.125rem;
  font-size: 0.9375rem;
  color: ${({ $variant }) => $variant === 'danger' ? palette.danger : palette.warningText};
  font-weight: 500;
  margin-bottom: 1.5rem;
  ${({ $pulse }) => $pulse && css`animation: ${bannerPulse} 1.2s ease-out 2;`}
`;

const AdminProfileSecurityPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, logout, reloadUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const redirectReason = (location.state as { reason?: string } | null)?.reason;

  // Banner highlight + scroll-into-view plumbing. Both the guard-driven
  // redirect (location.state.reason) and the "already on this page" custom
  // event funnel through highlightBanner() so the user always gets the same
  // unmistakable feedback.
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlightBanner = useCallback((reason: AdminGateReason) => {
    const msg =
      reason === 'mustChangePassword'
        ? t('admin.navLock.toastChangePassword')
        : t('admin.navLock.toastSetup2FA');
    toast(msg, { icon: '🔒', id: `admin-gate-${reason}` });
    // Defer to next frame so the banner is mounted before we scroll to it.
    requestAnimationFrame(() => {
      bannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Re-trigger the pulse animation each time by toggling the prop off→on.
    setPulse(false);
    requestAnimationFrame(() => setPulse(true));
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(false), 2600);
  }, [t]);

  // Fire once on arrival from a guard-driven redirect or a locked-nav click
  // made from another page. Clearing location.state after consuming it guards
  // against re-firing on re-render / back-forward cache restore.
  useEffect(() => {
    if (redirectReason === 'mustChangePassword' || redirectReason === 'setup2FA') {
      highlightBanner(redirectReason);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectReason]);

  // Listen for locked-nav clicks made while already on this page (where a
  // route change would be a silent no-op).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AdminGateHighlightDetail>).detail;
      if (detail?.reason) highlightBanner(detail.reason);
    };
    window.addEventListener(ADMIN_GATE_HIGHLIGHT_EVENT, handler);
    return () => {
      window.removeEventListener(ADMIN_GATE_HIGHLIGHT_EVENT, handler);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, [highlightBanner]);

  // Banner visibility is GATE-DERIVED, not state-derived. getAdminGateReason is
  // always present when the admin is still gated, so the banner shows on a
  // direct load / hard refresh (no router state) exactly as it does after a
  // redirect — and it disappears the moment the gate clears (2FA enabled /
  // password changed) because reloadUser() updates `user`. This is separate
  // from the one-shot toast + scroll/pulse above, which stays event/redirect
  // driven and deduped (it does NOT fire on a plain render/refresh).
  const bannerReason = getAdminGateReason(user);
  const profile = useQuery({ queryKey: ['admin-profile-me'], queryFn: () => adminProfileService.getMe() });
  const sessions = useQuery({ queryKey: ['admin-profile-sessions'], queryFn: () => adminProfileService.listSessions() });
  const [historySkip, setHistorySkip] = useState(0);
  const history = useQuery({
    queryKey: ['admin-profile-login-history', historySkip],
    queryFn: () => adminProfileService.loginHistory({ skip: historySkip, take: PAGE_SIZE }),
  });
  const [allHistory, setAllHistory] = useState<import('../../services/adminProfile.service').AdminLoginEvent[]>([]);

  // Accumulate pages as user loads more
  React.useEffect(() => {
    if (history.data?.history) {
      if (historySkip === 0) {
        setAllHistory(history.data.history);
      } else {
        setAllHistory((prev) => [...prev, ...history.data!.history]);
      }
    }
  }, [history.data, historySkip]);

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [twoFaToken, setTwoFaToken] = useState('');
  const [twoFaSetup, setTwoFaSetup] = useState<{ qrCodeDataUrl: string } | null>(null);
  const [disablePwd, setDisablePwd] = useState('');
  const [revokeAllConfirm, setRevokeAllConfirm] = useState(false);
  const [selfRevokeSession, setSelfRevokeSession] = useState<AdminSession | null>(null);

  const passwordMutation = useMutation({
    mutationFn: () => adminProfileService.changePassword(currentPwd, newPwd),
    onSuccess: async () => {
      toast.success('Паролата е сменена');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      await reloadUser();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Грешка при смяна на парола');
    },
  });

  const twoFaSetupMutation = useMutation({
    mutationFn: () => adminProfileService.setupTwoFactor(),
    onSuccess: (data) => setTwoFaSetup({ qrCodeDataUrl: data.qrCodeDataUrl }),
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Грешка при стартиране на 2FA');
    },
  });

  const twoFaEnableMutation = useMutation({
    mutationFn: () => adminProfileService.enableTwoFactor(twoFaToken),
    onSuccess: async () => {
      toast.success('2FA е активиран');
      setTwoFaSetup(null);
      setTwoFaToken('');
      queryClient.invalidateQueries({ queryKey: ['admin-profile-me'] });
      await reloadUser();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Невалиден код');
    },
  });

  const twoFaDisableMutation = useMutation({
    mutationFn: () => adminProfileService.disableTwoFactor(disablePwd),
    onSuccess: () => {
      toast.success('2FA е деактивиран');
      setDisablePwd('');
      queryClient.invalidateQueries({ queryKey: ['admin-profile-me'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Грешка при деактивиране на 2FA');
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (id: string) => adminProfileService.revokeSession(id),
    onSuccess: (_data, id) => {
      const wasCurrent = sessions.data?.sessions.find((s) => s.id === id)?.isCurrent;
      if (wasCurrent) {
        toast.success('Сесията е анулирана — влезте отново');
        logout();
        navigate('/login', { replace: true });
      } else {
        toast.success('Сесията е анулирана');
        queryClient.invalidateQueries({ queryKey: ['admin-profile-sessions'] });
      }
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Грешка при анулиране на сесия');
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => adminProfileService.revokeAllSessions(),
    onSuccess: () => {
      toast.success('Всички сесии са анулирани — моля влезте отново');
      logout();
      navigate('/login', { replace: true });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Грешка при анулиране на сесии');
    },
  });

  const twoFaEnabled = profile.data?.twoFactorEnabled ?? false;

  const pwdMismatch = confirmPwd.length > 0 && newPwd !== confirmPwd;
  const pwdReady = currentPwd.length > 0 && newPwd.length >= 8 && newPwd === confirmPwd;

  return (
    <Wrapper>
      {bannerReason === 'mustChangePassword' && (
        <GuidanceBanner ref={bannerRef} $variant="danger" $pulse={pulse}>
          🔒 За да продължите, трябва да смените временната си парола. Попълнете формата по-долу.
        </GuidanceBanner>
      )}
      {bannerReason === 'setup2FA' && (
        <GuidanceBanner ref={bannerRef} $variant="warning" $pulse={pulse}>
          🛡 За да продължите, трябва да настроите двуфакторна автентикация (2FA). Следвайте стъпките по-долу.
        </GuidanceBanner>
      )}
      {/* Парола */}
      <Card>
        <SectionTitle>Парола</SectionTitle>
        <Row>
          <Field>
            <Label>Текуща парола</Label>
            <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} />
          </Field>
          <Field>
            <Label>Нова парола (мин. 8 символа)</Label>
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </Field>
        </Row>
        <Row>
          <Field>
            <Label>Потвърди нова парола</Label>
            <Input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              style={pwdMismatch ? { borderColor: palette.danger } : undefined}
            />
            {pwdMismatch && <ErrorHint>Паролите не съвпадат</ErrorHint>}
          </Field>
          <Field />
        </Row>
        <Actions>
          <Button
            onClick={() => passwordMutation.mutate()}
            disabled={!pwdReady || passwordMutation.isPending}
          >
            {passwordMutation.isPending ? 'Смяна…' : 'Смени парола'}
          </Button>
        </Actions>
      </Card>

      {/* 2FA */}
      <Card>
        <SectionTitle>
          Двуфакторно удостоверяване
          {twoFaEnabled ? <StatusOk>Активирано</StatusOk> : <StatusOff>Деактивирано</StatusOff>}
        </SectionTitle>
        {!twoFaEnabled && !twoFaSetup && (
          <>
            <Hint>Добавете TOTP приложение за допълнителна стъпка при влизане.</Hint>
            <Actions>
              <Button onClick={() => twoFaSetupMutation.mutate()} disabled={twoFaSetupMutation.isPending}>
                {twoFaSetupMutation.isPending ? 'Генериране…' : 'Настрой 2FA'}
              </Button>
            </Actions>
          </>
        )}
        {!twoFaEnabled && twoFaSetup && (
          <>
            <Hint>Сканирайте QR кода с вашето приложение, след което въведете 6-цифрения код.</Hint>
            <QrImg src={twoFaSetup.qrCodeDataUrl} alt="TOTP QR" />
            <Row>
              <Field>
                <Label>Код от приложението</Label>
                <Input value={twoFaToken} onChange={(e) => setTwoFaToken(e.target.value)} placeholder="123456" />
              </Field>
            </Row>
            <Actions>
              <Button
                onClick={() => twoFaEnableMutation.mutate()}
                disabled={twoFaToken.length < 6 || twoFaEnableMutation.isPending}
              >
                {twoFaEnableMutation.isPending ? 'Проверка…' : 'Активирай 2FA'}
              </Button>
              <SecondaryButton onClick={() => { setTwoFaSetup(null); setTwoFaToken(''); }}>
                Отказ
              </SecondaryButton>
            </Actions>
          </>
        )}
        {twoFaEnabled && (
          <>
            <Hint>За да деактивирате 2FA, потвърдете текущата си парола.</Hint>
            <Row>
              <Field>
                <Label>Текуща парола</Label>
                <Input type="password" value={disablePwd} onChange={(e) => setDisablePwd(e.target.value)} />
              </Field>
            </Row>
            <Actions>
              <DangerButton
                onClick={() => twoFaDisableMutation.mutate()}
                disabled={!disablePwd || twoFaDisableMutation.isPending}
              >
                {twoFaDisableMutation.isPending ? 'Деактивиране…' : 'Деактивирай 2FA'}
              </DangerButton>
            </Actions>
          </>
        )}
      </Card>

      {/* Активни сесии */}
      <Card>
        <SectionTitle>
          Активни сесии
          <SmallSecondary onClick={() => setRevokeAllConfirm(true)} disabled={revokeAllMutation.isPending}>
            Изход от всички устройства
          </SmallSecondary>
        </SectionTitle>
        {sessions.isLoading ? (
          <Hint>Зареждане…</Hint>
        ) : sessions.data?.sessions.length === 0 ? (
          <Hint>Няма активни сесии.</Hint>
        ) : (
          <Table>
            <thead>
              <tr><Th>Клиент</Th><Th>Устройство</Th><Th>IP адрес</Th><Th>Начало</Th><Th>Изтича</Th><Th></Th></tr>
            </thead>
            <tbody>
              {sessions.data?.sessions.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <ClientCell>
                      {s.clientType ?? '—'}
                      {s.isCurrent && <CurrentBadge>Текуща сесия</CurrentBadge>}
                    </ClientCell>
                  </Td>
                  <Td title={s.userAgent ?? ''}>{parseUserAgent(s.userAgent)}</Td>
                  <Td>{s.ip ?? '—'}</Td>
                  <Td>{new Date(s.createdAt).toLocaleString('bg-BG')}</Td>
                  <Td>{new Date(s.expiresAt).toLocaleString('bg-BG')}</Td>
                  <Td>
                    <SmallDanger
                      onClick={() => s.isCurrent ? setSelfRevokeSession(s) : revokeSessionMutation.mutate(s.id)}
                      disabled={revokeSessionMutation.isPending}
                    >
                      Анулирай
                    </SmallDanger>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Confirm: revoke all sessions */}
      {revokeAllConfirm && (
        <ModalOverlay onClick={() => setRevokeAllConfirm(false)}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Изход от всички устройства</ModalTitle>
            <ModalBody>Всички активни сесии ще бъдат анулирани. Ще бъдете пренасочен към страницата за вход.</ModalBody>
            <ModalActions>
              <DangerButton
                onClick={() => { setRevokeAllConfirm(false); revokeAllMutation.mutate(); }}
                disabled={revokeAllMutation.isPending}
              >
                {revokeAllMutation.isPending ? 'Анулиране…' : 'Анулирай всички'}
              </DangerButton>
              <SecondaryButton onClick={() => setRevokeAllConfirm(false)}>Отказ</SecondaryButton>
            </ModalActions>
          </ModalBox>
        </ModalOverlay>
      )}

      {/* Confirm: revoke own current session */}
      {selfRevokeSession && (
        <ModalOverlay onClick={() => setSelfRevokeSession(null)}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Анулиране на текущата сесия</ModalTitle>
            <ModalBody>Това е текущата ви сесия. Анулирането ще ви изпрати към страницата за вход незабавно.</ModalBody>
            <ModalActions>
              <DangerButton
                onClick={() => { const id = selfRevokeSession.id; setSelfRevokeSession(null); revokeSessionMutation.mutate(id); }}
                disabled={revokeSessionMutation.isPending}
              >
                Анулирай и излез
              </DangerButton>
              <SecondaryButton onClick={() => setSelfRevokeSession(null)}>Отказ</SecondaryButton>
            </ModalActions>
          </ModalBox>
        </ModalOverlay>
      )}

      {/* История на влизанията */}
      <Card>
        <SectionTitle>История на влизанията</SectionTitle>
        {historySkip === 0 && history.isLoading ? (
          <Hint>Зареждане…</Hint>
        ) : allHistory.length === 0 ? (
          <Hint>Няма история на влизания.</Hint>
        ) : (
          <>
            <Table>
              <thead>
                <tr><Th>Кога</Th><Th>Резултат</Th><Th>IP</Th><Th>Устройство</Th></tr>
              </thead>
              <tbody>
                {allHistory.map((e) => (
                  <tr key={e.id}>
                    <Td>{new Date(e.createdAt).toLocaleString('bg-BG')}</Td>
                    <Td>
                      {e.success
                        ? <StatusOk>Успех</StatusOk>
                        : <StatusOff>{(e.failReason && FAIL_REASON_BG[e.failReason]) ?? 'Неуспешен'}</StatusOff>}
                    </Td>
                    <Td>{e.ip ?? '—'}</Td>
                    <Td title={e.userAgent ?? ''}>{parseUserAgent(e.userAgent)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {(history.data?.history.length ?? 0) === PAGE_SIZE && (
              <LoadMoreRow>
                <SecondaryButton
                  onClick={() => setHistorySkip((s) => s + PAGE_SIZE)}
                  disabled={history.isFetching}
                >
                  {history.isFetching ? 'Зареждане…' : 'Покажи повече'}
                </SecondaryButton>
              </LoadMoreRow>
            )}
          </>
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
const ErrorHint = styled.p`font-size: 0.75rem; color: ${palette.danger}; margin: 0.25rem 0 0;`;
const Actions = styled.div`display: flex; gap: 0.5rem;`;
const Button = styled.button`
  background: ${palette.accent};
  color: ${palette.onAccent};
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
  &:hover:not(:disabled) { background: ${palette.dangerBorder}; }
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
const LoadMoreRow = styled.div`
  display: flex;
  justify-content: center;
  padding-top: 1rem;
`;
const ClientCell = styled.div`display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;`;
const CurrentBadge = styled.span`
  background: ${palette.infoSoft};
  color: ${palette.info};
  font-size: 0.6875rem;
  font-weight: 700;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  white-space: nowrap;
`;
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
  width: 100%; max-width: 28rem;
  display: flex; flex-direction: column; gap: 1rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
`;
const ModalTitle = styled.h3`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0;`;
const ModalBody = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0; line-height: 1.5;`;
const ModalActions = styled.div`display: flex; gap: 0.5rem; margin-top: 0.25rem;`;

export default AdminProfileSecurityPage;
