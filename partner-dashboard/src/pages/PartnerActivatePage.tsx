/**
 * Partner activation landing page — spec §5.2 v1.1
 *
 * Two-phase flow:
 *   1. Verify the token (GET /api/partners/activation/:token/verify). Shows
 *      the partner name and a password-set form. The form is OPTIONAL for
 *      self-registered partners (who chose a password at /register); it is
 *      effectively REQUIRED for admin-onboarded partners (whose only
 *      credential is the temp password they were never shown). The UI keeps
 *      the field optional but encourages setting one.
 *   2. Submit the form (POST /api/auth/partner/activate). The backend
 *      consumes the token, stamps verifiedAt, advances PENDING → ACTIVE,
 *      and sets the password if supplied — all atomically.
 *
 * On failure (expired / already used / invalid) we point the partner to
 * office@boomcard.bg — partners have no self-service resend, only admins do.
 */
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { apiService } from '../services/api.service';
import { useLanguage } from '../contexts/LanguageContext';

const Page = styled.div`
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-background);
  padding: 2rem 1rem;
`;
const Card = styled.div`
  max-width: 28rem; width: 100%;
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  padding: 2rem;
  text-align: center;
  box-shadow: var(--shadow-soft);
`;
const Spinner = styled.div`
  width: 2.5rem; height: 2.5rem; margin: 0 auto 1rem;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;
const Title = styled.h1`
  font-size: 1.5rem; margin: 0 0 0.75rem; color: var(--color-text-primary);
`;
const Body = styled.p`
  font-size: 0.9375rem; color: var(--color-text-secondary); line-height: 1.5;
  margin: 0 0 1.5rem;
`;
const Form = styled.form`
  display: flex; flex-direction: column; gap: 0.75rem; text-align: left;
  margin: 0 0 1rem;
`;
const Label = styled.label`
  font-size: 0.8125rem; font-weight: 600; color: var(--color-text-primary);
`;
const Input = styled.input`
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  background: var(--color-background);
  color: var(--color-text-primary);
`;
const Hint = styled.p`
  font-size: 0.75rem; color: var(--color-text-secondary); margin: -0.25rem 0 0;
`;
const Error = styled.p`
  color: var(--color-error, #b91c1c); font-size: 0.8125rem; margin: 0;
`;
const PrimaryButton = styled.button`
  background: var(--color-primary);
  color: #fff;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  border: none;
  font-weight: 600;
  font-size: 0.9375rem;
  cursor: pointer;
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.9; }
`;
const PrimaryLink = styled(Link)`
  display: inline-block;
  background: var(--color-primary);
  color: #fff;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  text-decoration: none;
  font-weight: 600;
  &:hover { opacity: 0.9; }
`;

type Phase = 'verifying' | 'ready' | 'submitting' | 'success' | 'error';

interface VerifyResult {
  valid: boolean;
  partner?: { id: string; businessName: string };
  expiresAt?: string;
  // Spec §5.2 v1.1 — true for admin-onboarded partners who never chose a
  // password. UI MUST require the password form in that case or they're
  // locked out post-consume (token spent, no usable credential).
  mustSetPassword?: boolean;
  error?: string;
}

export default function PartnerActivatePage() {
  const [params] = useSearchParams();
  const { language } = useLanguage();
  const isBg = language !== 'en';
  const token = params.get('token');

  const [phase, setPhase] = useState<Phase>('verifying');
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [mustSetPassword, setMustSetPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!token) {
      setPhase('error');
      setErrorMsg(isBg ? 'Липсва активационен токен.' : 'Missing activation token.');
      return;
    }
    let cancelled = false;
    apiService
      .get<VerifyResult>(`/partners/activation/${encodeURIComponent(token)}/verify`)
      .then((data) => {
        if (cancelled) return;
        if (data?.valid && data.partner) {
          setBusinessName(data.partner.businessName);
          setMustSetPassword(data.mustSetPassword === true);
          setPhase('ready');
        } else {
          setErrorMsg(data?.error || (isBg ? 'Невалиден или изтекъл линк.' : 'Invalid or expired link.'));
          setPhase('error');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const apiMsg = err?.response?.data?.error || err?.message;
        setErrorMsg(apiMsg || (isBg ? 'Грешка при проверката на линка.' : 'Activation link check failed.'));
        setPhase('error');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    // Spec §5.2 v1.1 — admin-onboarded partners MUST set a password here or
    // they'll be locked out (the temp password is random and never shown).
    // Self-registered partners may skip (they already chose one).
    const wantsPassword = mustSetPassword || password.length > 0 || confirmPassword.length > 0;
    if (mustSetPassword && password.length === 0) {
      setErrorMsg(
        isBg
          ? 'Моля изберете парола за партньорския панел.'
          : 'Please choose a password for the partner dashboard.',
      );
      return;
    }
    if (wantsPassword) {
      if (password.length < 8) {
        setErrorMsg(isBg ? 'Паролата трябва да е поне 8 символа.' : 'Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(isBg ? 'Паролите не съвпадат.' : 'Passwords do not match.');
        return;
      }
    }
    setErrorMsg('');
    setPhase('submitting');

    try {
      const payload: { token: string; password?: string } = { token };
      if (wantsPassword) payload.password = password;
      await apiService.post('/auth/partner/activate', payload);
      setPhase('success');
    } catch (err: any) {
      const apiMsg = err?.response?.data?.error || err?.message;
      setErrorMsg(apiMsg || (isBg ? 'Грешка при активиране.' : 'Activation failed.'));
      setPhase('error');
    }
  };

  if (phase === 'verifying') {
    return (
      <Page><Card>
        <Spinner />
        <Title>{isBg ? 'Проверка на линка…' : 'Checking link…'}</Title>
        <Body>{isBg ? 'Моля изчакайте.' : 'Please wait.'}</Body>
      </Card></Page>
    );
  }

  if (phase === 'success') {
    return (
      <Page><Card>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
        <Title>{isBg ? 'Активирано!' : 'Activated!'}</Title>
        <Body>
          {isBg
            ? `Партньорският Ви акаунт${businessName ? ` за „${businessName}"` : ''} е активиран. Можете да влезете в партньорския панел.`
            : `Your partner account${businessName ? ` for "${businessName}"` : ''} has been activated. You can now log in.`}
        </Body>
        <PrimaryLink to="/login">
          {isBg ? 'Вход' : 'Log in'}
        </PrimaryLink>
      </Card></Page>
    );
  }

  if (phase === 'error') {
    return (
      <Page><Card>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚠️</div>
        <Title>{isBg ? 'Невалиден линк' : 'Invalid link'}</Title>
        <Body>{errorMsg}</Body>
        <Body style={{ fontSize: '0.8125rem' }}>
          {isBg
            ? 'Свържете се с office@boomcard.bg за нов активационен линк.'
            : 'Please contact office@boomcard.bg to request a new activation link.'}
        </Body>
        <PrimaryLink to="/login">{isBg ? 'Към вход' : 'Back to login'}</PrimaryLink>
      </Card></Page>
    );
  }

  // ready or submitting
  const submitting = phase === 'submitting';
  return (
    <Page><Card>
      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
      <Title>{isBg ? 'Активирайте партньорския панел' : 'Activate your partner dashboard'}</Title>
      <Body>
        {mustSetPassword
          ? (isBg
              ? `Партньорството${businessName ? ` за „${businessName}"` : ''} е одобрено. Изберете парола, за да приключите активирането и да можете да влезете в партньорския панел.`
              : `Your partner account${businessName ? ` for "${businessName}"` : ''} has been approved. Choose a password to finish activating and access the partner dashboard.`)
          : (isBg
              ? `Партньорството${businessName ? ` за „${businessName}"` : ''} е одобрено. Можете да активирате с паролата, която сте задали при регистрация, или да зададете нова по-долу.`
              : `Your partner account${businessName ? ` for "${businessName}"` : ''} has been approved. You can activate with the password you chose at registration, or set a new one below.`)}
      </Body>
      <Form onSubmit={handleSubmit}>
        <Label htmlFor="password">
          {mustSetPassword
            ? (isBg ? 'Нова парола *' : 'New password *')
            : (isBg ? 'Нова парола (по желание)' : 'New password (optional)')}
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          placeholder={isBg ? 'Поне 8 символа' : 'At least 8 characters'}
          disabled={submitting}
          required={mustSetPassword}
        />
        <Label htmlFor="confirm">
          {isBg ? 'Потвърдете паролата' : 'Confirm password'}
          {mustSetPassword ? ' *' : ''}
        </Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          disabled={submitting}
          required={mustSetPassword}
        />
        <Hint>
          {mustSetPassword
            ? (isBg
                ? 'Паролата е задължителна — този акаунт е създаден от администратор и няма съществуваща парола.'
                : 'A password is required — this account was created by an admin and has no existing password.')
            : (isBg
                ? 'Ако вече сте задали парола при регистрация, можете да оставите полетата празни.'
                : 'If you set a password at registration, you can leave these fields blank.')}
        </Hint>
        {errorMsg && <Error>{errorMsg}</Error>}
        <PrimaryButton type="submit" disabled={submitting}>
          {submitting
            ? (isBg ? 'Активиране…' : 'Activating…')
            : (isBg ? 'Активирай партньорския панел' : 'Activate dashboard')}
        </PrimaryButton>
      </Form>
    </Card></Page>
  );
}
