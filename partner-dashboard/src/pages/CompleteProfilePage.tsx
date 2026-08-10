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
  const { language, t } = useLanguage();
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
  const [accountCreated, setAccountCreated] = useState(false);

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
          <Title>{t('completeProfilePage.invalidLinkTitle')}</Title>
          <AlertBox $variant="error">
            {t('completeProfilePage.invalidLinkMessage')}
          </AlertBox>
          <Link to="/login">
            <Button variant="secondary" size="large" fullWidth>
              {t('completeProfilePage.goToLogin')}
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
      errs.password = t('auth.passwordMinLength');
    } else {
      const hasLower = /[a-z]/.test(password);
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /\d/.test(password);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
      if (!hasLower || !hasUpper || !hasNumber || !hasSpecial) {
        errs.password = t('completeProfilePage.passwordComplexity');
      }
    }
    if (password !== confirmPassword) {
      errs.confirmPassword = t('auth.passwordsMustMatch');
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
      await apiService.post<{ data: { accessToken: string; refreshToken: string } }>(
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
      // USER-role accounts (BoomCard customers) belong on the mobile app, not the
      // partner dashboard. Storing tokens here and redirecting to /dashboard causes
      // an infinite redirect loop (PartnerStatusRoute blocks non-partner roles).
      // Show a success screen with a link to the mobile app instead.
      setAccountCreated(true);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setEmailConflict(true);
      } else {
        const msg = err?.response?.data?.message || t('errors.somethingWentWrong');
        setApiError(msg);
      }
      setIsSubmitting(false);
    }
  };

  if (accountCreated) {
    return (
      <PageContainer>
        <Card>
          <Title>{t('completeProfilePage.accountCreatedTitle')}</Title>
          <Subtitle>
            {t('completeProfilePage.accountCreatedMessage')}
          </Subtitle>
          <Button
            variant="primary"
            size="large"
            fullWidth
            onClick={() => { window.location.href = 'https://mobile.boomcard.bg'; }}
          >
            {t('completeProfilePage.goToBoomCard')}
          </Button>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Card>
        <Title>{t('completeProfilePage.setPasswordTitle')}</Title>
        <Subtitle>
          {t('completeProfilePage.setPasswordSubtitle')}
        </Subtitle>

        {emailConflict && (
          <AlertBox $variant="error">
            {t('completeProfilePage.emailConflictPrefix')}{' '}
            <Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>
              {t('completeProfilePage.emailConflictLinkText')}
            </Link>
          </AlertBox>
        )}
        {!emailConflict && apiError && (
          <AlertBox $variant="error">{apiError}</AlertBox>
        )}

        <form onSubmit={handleSubmit}>
          <Field>
            <Label>{t('auth.password')}</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              $hasError={!!errors.password}
              minLength={8}
              placeholder={t('completeProfilePage.passwordPlaceholder')}
              autoComplete="new-password"
            />
            {errors.password && <ErrorText>{errors.password}</ErrorText>}
          </Field>

          <Field>
            <Label>{t('auth.confirmPassword')}</Label>
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
              {t('completeProfilePage.marketingConsentEmail')}
            </ConsentRow>
            <ConsentRow>
              <input
                type="checkbox"
                checked={marketingConsentPhone}
                onChange={e => setMarketingConsentPhone(e.target.checked)}
              />
              {t('completeProfilePage.marketingConsentPhone')}
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
              ? t('completeProfilePage.saving')
              : t('completeProfilePage.activateAccount')}
          </Button>
          </div>
        </form>
      </Card>
    </PageContainer>
  );
};

export default CompleteProfilePage;
