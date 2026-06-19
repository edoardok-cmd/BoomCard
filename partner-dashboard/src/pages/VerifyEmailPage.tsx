import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { XCircle, Loader } from 'lucide-react';
import { Button } from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { apiService } from '../services/api.service';
import toast from 'react-hot-toast';
import * as authStorage from '../lib/auth/authStorage';
import { persistRefreshToken } from '../lib/auth/persistRefreshToken';

const PageContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1rem;
`;

const Card = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 3rem 2.5rem;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;

  @media (max-width: 768px) {
    padding: 2.5rem 2rem;
  }
`;

// S1 fix: 'success' removed from the $status union — the success case is
// handled by auto-login (POST /api/auth/verify-email returns JWT tokens and
// the page redirects to "/" directly, never reaching a 'success' render state).
const IconWrapper = styled(motion.div)<{ $status: 'loading' | 'error' }>`
  width: 100px;
  height: 100px;
  margin: 0 auto 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props =>
    props.$status === 'error'
      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'};

  svg {
    width: 50px;
    height: 50px;
    color: white;
  }
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 1rem;
  line-height: 1.2;
`;

const Message = styled.p`
  color: #6b7280;
  font-size: 1.05rem;
  line-height: 1.7;
  margin-bottom: 2rem;
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 2rem;
`;

const StyledButton = styled(Button)`
  width: 100%;
`;

const SecondaryLink = styled(Link)`
  color: #667eea;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  transition: color 0.2s;

  &:hover {
    color: #5568d3;
    text-decoration: underline;
  }
`;

const HelpText = styled.p`
  margin-top: 2rem;
  color: #6b7280;
  font-size: 0.875rem;
  line-height: 1.6;

  a {
    color: #667eea;
    text-decoration: none;
    font-weight: 600;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const spin = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const SpinningLoader = styled(Loader)`
  animation: spin 1s linear infinite;
  ${spin}
`;

// S1 fix: 'success' is not a reachable render state. When verification
// succeeds, the page calls POST /api/auth/verify-email via apiService, stores
// the returned JWT tokens, and immediately redirects to "/". When 2FA is
// required, it redirects to /login?emailVerified=true. Removed 'success' (and
// 'expired') from the union to eliminate unreachable branches.
type VerificationStatus = 'loading' | 'error';

const EmailInput = styled.input`
  width: 100%;
  padding: 0.65rem 0.875rem;
  border: 1.5px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #111827;
  background: #f9fafb;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 0.75rem;
  transition: border-color 0.15s;

  &:focus {
    border-color: #667eea;
    background: #fff;
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const VerifyEmailPage: React.FC = () => {
  const { language } = useLanguage();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [isResending, setIsResending] = useState(false);
  // S4 fix: 60-second cooldown after a successful resend to prevent the user
  // (or a script) from flooding the target address with verification emails.
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [resendCooldownSecs, setResendCooldownSecs] = useState(0);
  // Audit-fix [10]: replaces window.prompt() — inline controlled input so the
  // user can type their email without a blocking native dialog.
  const [emailInput, setEmailInput] = useState(email ?? '');

  const content = {
    en: {
      // Loading state
      loadingTitle: 'Verifying Your Email',
      loadingMessage: 'Please wait while we verify your email address...',

      // Error state (also handles expired tokens — backend returns an error redirect)
      errorTitle: 'Verification Failed',
      errorMessage: "We couldn't verify your email. The verification link may be invalid or expired.",
      resendButton: 'Resend Verification Email',
      resending: 'Sending...',
      backToHome: 'Back to Home',

      // Help text
      needHelp: 'Need help?',
      contactSupport: 'Contact Support',
    },
    bg: {
      // Loading state
      loadingTitle: 'Проверка на Имейла',
      loadingMessage: 'Моля, изчакайте докато проверим вашия имейл адрес...',

      // Error state (also handles expired tokens — backend returns an error redirect)
      errorTitle: 'Грешка при Проверка',
      errorMessage: 'Не успяхме да потвърдим вашия имейл. Линкът за потвърждение може да е невалиден или изтекъл.',
      resendButton: 'Изпрати Отново',
      resending: 'Изпращане...',
      backToHome: 'Обратно към Начало',

      // Help text
      needHelp: 'Нуждаете се от помощ?',
      contactSupport: 'Свържете се с поддръжка',
    },
  };

  const t = content[language as keyof typeof content];

  // S4 fix: tick down the resend cooldown every second
  useEffect(() => {
    if (!resendCooldownUntil) return;
    const tick = () => {
      const remaining = Math.ceil((resendCooldownUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setResendCooldownUntil(null);
        setResendCooldownSecs(0);
      } else {
        setResendCooldownSecs(remaining);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [resendCooldownUntil]);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiService.post<any>('/auth/verify-email', { token });
        if (cancelled) return;
        const resData = res?.data ?? res;
        const accessToken: string | undefined = resData?.accessToken;
        const refreshToken: string | undefined = resData?.refreshToken;
        const user: { firstName?: string | null; [key: string]: unknown } | undefined = resData?.user;

        if (accessToken && user) {
          authStorage.setItem('token', accessToken, false);
          if (refreshToken) persistRefreshToken(refreshToken, false);
          authStorage.setItem('boomcard_auth', JSON.stringify(user), false);
          apiService.setAuthToken(accessToken);
          toast.success(
            language === 'bg'
              ? `Добре дошли${user.firstName ? `, ${user.firstName}` : ''}! Имейлът ви е потвърден.`
              : `Welcome${user.firstName ? `, ${user.firstName}` : ''}! Your email has been verified.`,
          );
          setTimeout(() => window.location.replace('/'), 300);
        } else {
          // Email verified but auto-login not possible (2FA required or tokens absent).
          // Fall back to the pre-existing UX: redirect to the login page with the
          // emailVerified flag so the user knows their email is confirmed.
          setTimeout(() => window.location.replace('/login?emailVerified=true'), 300);
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleResendEmail = async () => {
    // Audit-fix [10]: was window.prompt() — replaced with inline emailInput state.
    // When ?email= is absent from the URL (token failure redirect), the user
    // types their address into the EmailInput rendered below the button.
    const targetEmail = (email || emailInput).trim();
    if (!targetEmail) {
      toast.error(language === 'bg' ? 'Въведете имейл адрес' : 'Please enter your email address');
      return;
    }
    // MEDIUM-B3 fix (review r2ac): validate format unconditionally regardless of
    // whether the email value came from the URL param or the inline input. The
    // previous check was inside an `if (!email)` guard so a crafted URL with
    // ?email=<malformed> bypassed the regex and went straight to the API.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      toast.error(language === 'bg' ? 'Невалиден имейл адрес' : 'Invalid email address');
      return;
    }
    // S4 fix: enforce cooldown — don't allow another send during the window
    if (resendCooldownUntil && Date.now() < resendCooldownUntil) {
      toast.error(
        language === 'bg'
          ? `Моля, изчакайте ${resendCooldownSecs} сек. преди повторно изпращане`
          : `Please wait ${resendCooldownSecs}s before resending`
      );
      return;
    }

    setIsResending(true);

    try {
      // Spec §9.5: public unauthenticated endpoint — the user can't be logged
      // in until they verify, so the authenticated variant isn't usable here.
      await apiService.post('/auth/request-email-verification', { email: targetEmail });

      toast.success(
        language === 'bg'
          ? 'Ако имейлът съществува и не е потвърден, ще получите нова връзка за потвърждение.'
          : 'If the email exists and is unverified, a new verification link has been sent.'
      );
      // S4 fix: start 60-second cooldown after a successful send
      setResendCooldownUntil(Date.now() + 60_000);
    } catch {
      // Don't log the error object — it may expose API response details.
      console.error('Resend email error');
      toast.error(language === 'bg' ? 'Грешка при изпращане на имейл' : 'Error sending email');
    } finally {
      setIsResending(false);
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <>
            <IconWrapper
              $status="loading"
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: 360 }}
              transition={{ duration: 0.5 }}
            >
              <SpinningLoader />
            </IconWrapper>
            <Title>{t.loadingTitle}</Title>
            <Message>{t.loadingMessage}</Message>
          </>
        );

      // S1 fix: 'success' case removed — auto-login redirects to "/" immediately
      // after storing tokens; the 2FA path redirects to /login?emailVerified=true.
      // Neither path reaches a 'success' render state.

      case 'error':
        return (
          <>
            <IconWrapper
              $status="error"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.2, 1] }}
              transition={{ duration: 0.5 }}
            >
              <XCircle />
            </IconWrapper>
            <Title>{t.errorTitle}</Title>
            <Message>
              {t.errorMessage}
            </Message>
            <ButtonGroup>
              {/* Inline email input — shown when no ?email= in the URL so the
                  user can enter their address without a blocking window.prompt() */}
              {!email && (
                <EmailInput
                  type="email"
                  autoComplete="email"
                  placeholder={language === 'bg' ? 'Вашият имейл адрес' : 'Your email address'}
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleResendEmail(); }}
                  disabled={isResending}
                />
              )}
              <StyledButton
                variant="primary"
                size="large"
                onClick={handleResendEmail}
                isLoading={isResending}
                disabled={isResending || (!!resendCooldownUntil && resendCooldownSecs > 0)}
              >
                {isResending
                  ? t.resending
                  : resendCooldownSecs > 0
                    ? (language === 'bg' ? `Изпрати отново (${resendCooldownSecs}s)` : `Resend (${resendCooldownSecs}s)`)
                    : t.resendButton}
              </StyledButton>
              <SecondaryLink to="/">{t.backToHome}</SecondaryLink>
            </ButtonGroup>
            <HelpText>
              {t.needHelp}{' '}
              <a href="mailto:office@boomcard.bg">{t.contactSupport}</a>
            </HelpText>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <PageContainer>
      <Card
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {renderContent()}
      </Card>
    </PageContainer>
  );
};

export default VerifyEmailPage;
