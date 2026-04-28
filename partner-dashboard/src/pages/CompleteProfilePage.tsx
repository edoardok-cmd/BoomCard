import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import axios from 'axios';
import Button from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '/api';

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

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [marketingConsentEmail, setMarketingConsentEmail] = useState(false);
  const [marketingConsentPhone, setMarketingConsentPhone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (password.length < 8) {
      errs.password = language === 'bg' ? 'Паролата трябва да е поне 8 символа' : 'Password must be at least 8 characters';
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
      const response = await axios.post(`${API_BASE_URL}/auth/complete-profile`, { token, password, marketingConsentEmail, marketingConsentPhone });
      const { accessToken, refreshToken } = response.data.data;

      // Store tokens using same keys as AuthContext so it picks them up on reload
      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // Hard navigate so AuthContext reinitializes with the stored tokens
      window.location.href = '/dashboard';
    } catch (err: any) {
      const msg = err?.response?.data?.message || (language === 'bg' ? 'Нещо се обърка' : 'Something went wrong');
      setApiError(msg);
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

        {apiError && (
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
              placeholder="••••••••"
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
