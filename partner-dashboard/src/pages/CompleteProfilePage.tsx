import React, { useState } from 'react';
import { useSearchParams, Link, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import Button from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import * as authStorage from '../lib/auth/authStorage';
// MEDIUM-1 fix (r2ad): replaced raw `axios` import with the shared `apiService`
// wrapper so the call goes through the 401-refresh interceptor and uses the same
// base URL as the rest of the codebase. Raw axios was the only place in the
// partner-facing code with this inconsistent pattern.
import { apiService } from '../services/api.service';

const PageContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);
  padding: 2rem 1rem;
`;

const Card = styled.div`
  width: 100%;
  max-width: 420px;
  background: var(--color-surface);
  border-radius: 1rem;
  border: 1px solid var(--color-border);
  padding: 2.5rem;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
`;

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 0.5rem;
  text-align: center;
`;

const Subtitle = styled.p`
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  text-align: center;
  margin: 0 0 2rem;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 1rem;
`;

const Label = styled.label`
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-secondary);
`;

const Input = styled.input<{ $hasError?: boolean }>`
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid ${p => p.$hasError ? '#ef4444' : 'var(--color-border)'};
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: var(--color-primary);
  }
`;

const ErrorText = styled.span`
  font-size: 0.8rem;
  color: #ef4444;
`;

const ConsentRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  cursor: pointer;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  line-height: 1.4;

  input[type='checkbox'] {
    margin-top: 0.15rem;
    flex-shrink: 0;
    accent-color: var(--color-primary);
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
`;

const ConsentSection = styled.div`
  margin-top: 1rem;
  margin-bottom: 0.5rem;
`;

const AlertBox = styled.div<{ $variant: 'error' | 'info' }>`
  padding: 1rem;
  border-radius: 0.5rem;
  background: ${p => p.$variant === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(102,126,234,0.08)'};
  border: 1px solid ${p => p.$variant === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(102,126,234,0.2)'};
  color: ${p => p.$variant === 'error' ? '#ef4444' : 'var(--color-text-secondary)'};
  font-size: 0.9rem;
  margin-bottom: 1.5rem;
  line-height: 1.5;
`;

const CompleteProfilePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const token = searchParams.get('token');

  // All hooks must be declared before any early returns (Rules of Hooks).
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [marketingConsentEmail, setMarketingConsentEmail] = useState(false);
  const [marketingConsentPhone, setMarketingConsentPhone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailConflict, setEmailConflict] = useState(false);

  // HIGH fix (review r2ad HIGH-1): already-authenticated users must not reach
  // this page. If they do, their existing session tokens would be silently
  // overwritten by the activation token exchange. Guard by checking for a
  // stored access token. Placed after hooks to comply with React's Rules of Hooks.
  // Legitimate account activation always happens for accounts that have never
  // been logged in before, so redirecting is always safe here.
  const existingToken = authStorage.getItem('token');
  if (existingToken) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!token) {
    return (
      <PageContainer>
        <Card>
          <Title>{language === 'bg' ? 'Невалиден линк' : 'Invalid Link'}</Title>
          <AlertBox $variant="error">
            {language === 'bg'
              ? 'Този линк не е валиден. Моля, свържете се с поддръжката.'
              : 'This link is invalid. Please contact support.'}
          </AlertBox>
          <Link to="/login">
            <Button variant="secondary" size="large" fullWidth>
              {language === 'bg' ? 'Към вход' : 'Go to Login'}
            </Button>
          </Link>
        </Card>
      </PageContainer>
    );
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    // Canonical password policy (matches backend registerValidation /
    // changePasswordValidation / complete-profile): min 8 chars + uppercase +
    // lowercase + digit + special character.
    if (password.length < 8) {
      errs.password = language === 'bg' ? 'Паролата трябва да е поне 8 символа' : 'Password must be at least 8 characters';
    } else {
      const hasLower = /[a-z]/.test(password);
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /\d/.test(password);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
      if (!hasLower || !hasUpper || !hasNumber || !hasSpecial) {
        errs.password = language === 'bg'
          ? 'Паролата трябва да съдържа главна, малка буква, цифра и специален символ'
          : 'Password must include an uppercase letter, a lowercase letter, a number, and a special character';
      }
    }
    if (password !== confirmPassword) {
      errs.confirmPassword = language === 'bg' ? 'Паролите не съвпадат' : 'Passwords do not match';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setApiError(null);
    setIsSubmitting(true);

    try {
      // MEDIUM-1 fix (r2ad): use apiService.post instead of raw axios so this
      // call goes through the shared 401-refresh interceptor and base-URL config.
      const response = await apiService.post<{ data: { accessToken: string; refreshToken: string } }>(
        '/auth/complete-profile',
        {
          token,
          password,
          marketingConsentEmail,
          marketingConsentPhone,
          // Spec §7.1: persist the user's selected interface language so future
          // system emails (welcome, payments, renewals) are sent in it.
          lang: language,
        },
      );
      const { accessToken, refreshToken } = response.data;

      // MEDIUM-1 fix: use authStorage (the same abstraction used by AuthContext)
      // instead of raw localStorage.setItem so that:
      // 1. The token keys match exactly what AuthContext reads ('token',
      //    'refreshToken') and the storage layer is consistent.
      // 2. The boomcard_refresh cookie is set so the axios 401-interceptor can
      //    silently refresh the access token before the first expiry.
      // Note: AuthContext.loadUser fires on the next page load and will call
      // GET /auth/me, which fills the boomcard_auth user cache key.
      authStorage.setItem('token', accessToken, true); // persistent = true (activation is one-time)
      authStorage.setItem('refreshToken', refreshToken, true);

      // Mirror the refresh token into the cookie that the 401-interceptor reads
      // (mirrors the logic in AuthContext.persistRefreshToken).
      // LOW-3 fix (review r2ad): corrected lifetime from 30 days (2592000) to
      // 7 days (604800) to match AuthContext.persistRefreshToken's max-age.
      const isSecure = window.location.protocol === 'https:';
      const lifetime = '; max-age=604800'; // 7 days — matches AuthContext.persistRefreshToken
      document.cookie = `boomcard_refresh=${refreshToken}; path=/${lifetime}; SameSite=Strict${isSecure ? '; Secure' : ''}`;

      // Hard navigate so AuthContext reinitializes with the stored tokens
      window.location.href = '/dashboard';
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setEmailConflict(true);
      } else {
        const msg = err?.response?.data?.message || (language === 'bg' ? 'Нещо се обърка' : 'Something went wrong');
        setApiError(msg);
      }
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <Card>
        <Title>{language === 'bg' ? 'Задай парола' : 'Set Your Password'}</Title>
        <Subtitle>
          {language === 'bg'
            ? 'Избери парола за твоя BoomCard акаунт'
            : 'Choose a password for your BoomCard account'}
        </Subtitle>

        {emailConflict && (
          <AlertBox $variant="error">
            {language === 'bg'
              ? 'Акаунт с този имейл вече съществува. '
              : 'An account with this email already exists. '}
            <Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>
              {language === 'bg' ? 'Влезте тук' : 'Sign in here'}
            </Link>
          </AlertBox>
        )}
        {!emailConflict && apiError && (
          <AlertBox $variant="error">{apiError}</AlertBox>
        )}

        <form onSubmit={handleSubmit}>
          <Field>
            <Label>{language === 'bg' ? 'Парола' : 'Password'}</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              $hasError={!!errors.password}
              minLength={8}
              placeholder={language === 'bg' ? 'Поне 8 символа, главна, малка, цифра, символ' : 'Min 8 chars, upper, lower, number, symbol'}
              autoComplete="new-password"
            />
            {errors.password && <ErrorText>{errors.password}</ErrorText>}
          </Field>

          <Field>
            <Label>{language === 'bg' ? 'Потвърди паролата' : 'Confirm Password'}</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              $hasError={!!errors.confirmPassword}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {errors.confirmPassword && <ErrorText>{errors.confirmPassword}</ErrorText>}
          </Field>

          <ConsentSection>
            <ConsentRow>
              <input
                type="checkbox"
                checked={marketingConsentEmail}
                onChange={e => setMarketingConsentEmail(e.target.checked)}
              />
              {language === 'bg'
                ? 'Съгласявам се да получавам маркетингови имейли от BoomCard (по избор)'
                : 'I agree to receive marketing emails from BoomCard (optional)'}
            </ConsentRow>
            <ConsentRow>
              <input
                type="checkbox"
                checked={marketingConsentPhone}
                onChange={e => setMarketingConsentPhone(e.target.checked)}
              />
              {language === 'bg'
                ? 'Съгласявам се да получавам маркетингови съобщения по телефон от BoomCard (по избор)'
                : 'I agree to receive marketing messages by phone from BoomCard (optional)'}
            </ConsentRow>
          </ConsentSection>

          <div style={{ marginTop: '0.5rem' }}>
          <Button
            type="submit"
            variant="primary"
            size="large"
            fullWidth
            disabled={isSubmitting}
          >
            {isSubmitting
              ? (language === 'bg' ? 'Запазване...' : 'Saving...')
              : (language === 'bg' ? 'Активирай акаунта' : 'Activate Account')}
          </Button>
          </div>
        </form>
      </Card>
    </PageContainer>
  );
};

export default CompleteProfilePage;
