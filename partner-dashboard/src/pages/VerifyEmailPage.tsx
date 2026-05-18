import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Loader } from 'lucide-react';
import { Button } from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { apiService } from '../services/api.service';
import toast from 'react-hot-toast';

// Audit-pass [10.3]: production fallback when VITE_API_URL is unset. The
// previous empty-string fallback caused `window.location.replace` to hit
// /api/auth/verify-email on the partner-dashboard origin (Vercel) and 404
// because Vercel doesn't serve that path. Hardcode the prod backend URL so
// a misconfigured build still works rather than silently breaking.
const FALLBACK_API_URL = 'https://boomcard-api.fly.dev';

// Audit-pass [10.1]: redirect SYNCHRONOUSLY at module top before any React
// mount so the "Verifying..." card never flashes. Uses
// `window.location.search` directly to avoid waiting for react-router.
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    const earlyToken = params.get('token');
    if (earlyToken) {
      const earlyApiBase = (import.meta as any).env?.VITE_API_URL || FALLBACK_API_URL;
      // Use replace so the verify-email URL doesn't pollute history.
      window.location.replace(`${earlyApiBase}/api/auth/verify-email?token=${encodeURIComponent(earlyToken)}`);
    }
  } catch {
    /* noop — fall through to React-side handling */
  }
}

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

const IconWrapper = styled(motion.div)<{ $status: 'loading' | 'success' | 'error' }>`
  width: 100px;
  height: 100px;
  margin: 0 auto 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => {
    if (props.$status === 'success') return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    if (props.$status === 'error') return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  }};

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

const StyledLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.75rem 1.5rem;
  background: #111827;
  color: white;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  text-decoration: none;
  transition: all 0.2s;

  &:hover {
    background: #000000;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: translateY(0);
  }
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

type VerificationStatus = 'loading' | 'success' | 'error' | 'expired';

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
  // Audit-fix [10]: replaces window.prompt() — inline controlled input so the
  // user can type their email without a blocking native dialog.
  const [emailInput, setEmailInput] = useState(email ?? '');

  const content = {
    en: {
      // Loading state
      loadingTitle: 'Verifying Your Email',
      loadingMessage: 'Please wait while we verify your email address...',

      // Success state
      successTitle: 'Email Verified!',
      successMessage: 'Your email has been successfully verified. You can now access all features of BoomCard.',
      goToDashboard: 'Go to Dashboard',
      goToLogin: 'Go to Login',

      // Error state
      errorTitle: 'Verification Failed',
      errorMessage: 'We couldn\'t verify your email. The verification link may be invalid or expired.',
      resendButton: 'Resend Verification Email',
      resending: 'Sending...',
      backToHome: 'Back to Home',

      // Expired state
      expiredTitle: 'Link Expired',
      expiredMessage: 'This verification link has expired. Please request a new verification email.',

      // Help text
      needHelp: 'Need help?',
      contactSupport: 'Contact Support',
      wrongEmail: 'Wrong email?',
      changeEmail: 'Change Email',
    },
    bg: {
      // Loading state
      loadingTitle: 'Проверка на Имейла',
      loadingMessage: 'Моля, изчакайте докато проверим вашия имейл адрес...',

      // Success state
      successTitle: 'Имейлът е Потвърден!',
      successMessage: 'Вашият имейл беше успешно потвърден. Сега можете да използвате всички функции на BoomCard.',
      goToDashboard: 'Към Табло',
      goToLogin: 'Към Вход',

      // Error state
      errorTitle: 'Грешка при Проверка',
      errorMessage: 'Не успяхме да потвърдим вашия имейл. Линкът за потвърждение може да е невалиден или изтекъл.',
      resendButton: 'Изпрати Отново',
      resending: 'Изпращане...',
      backToHome: 'Обратно към Начало',

      // Expired state
      expiredTitle: 'Линкът е Изтекъл',
      expiredMessage: 'Този линк за потвърждение е изтекъл. Моля, заявете нов имейл за потвърждение.',

      // Help text
      needHelp: 'Нуждаете се от помощ?',
      contactSupport: 'Свържете се с поддръжка',
      wrongEmail: 'Грешен имейл?',
      changeEmail: 'Променете Имейла',
    },
  };

  const t = content[language as keyof typeof content];

  useEffect(() => {
    if (!token) {
      // No token — the URL was hit without a verification link. Show the
      // error/resend state so the user can request a new email.
      setStatus('error');
      return;
    }

    // The real verification lives on the backend: GET /api/auth/verify-email
    // returns a 302 to /login?emailVerified=true|already (or error=...).
    // Letting the browser follow that redirect natively is both simpler and
    // ensures status flags (?emailVerified=already vs true) propagate.
    //
    // Audit-pass [10.1]: the module-top synchronous redirect above already
    // fired for clients that have window. This effect remains as a fallback
    // for SSR/hydration cases where the early redirect was skipped.
    // Audit-pass [10.3]: use FALLBACK_API_URL so a missing VITE_API_URL
    // doesn't 404 against the partner-dashboard origin.
    const apiBase = (import.meta as any).env?.VITE_API_URL || FALLBACK_API_URL;
    window.location.replace(`${apiBase}/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  }, [token, language]);

  const handleResendEmail = async () => {
    // Audit-fix [10]: was window.prompt() — replaced with inline emailInput state.
    // When ?email= is absent from the URL (token failure redirect), the user
    // types their address into the EmailInput rendered below the button.
    const targetEmail = email || emailInput.trim();
    if (!targetEmail) {
      toast.error(language === 'bg' ? 'Въведете имейл адрес' : 'Please enter your email address');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      toast.error(language === 'bg' ? 'Невалиден имейл адрес' : 'Invalid email address');
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
    } catch (error) {
      console.error('Resend email error:', error);
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

      case 'success':
        return (
          <>
            <IconWrapper
              $status="success"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.2, 1] }}
              transition={{ duration: 0.5 }}
            >
              <CheckCircle2 />
            </IconWrapper>
            <Title>{t.successTitle}</Title>
            <Message>{t.successMessage}</Message>
            <ButtonGroup>
              <StyledLink to="/dashboard">{t.goToDashboard}</StyledLink>
              <SecondaryLink to="/login">{t.goToLogin}</SecondaryLink>
            </ButtonGroup>
          </>
        );

      case 'error':
      case 'expired':
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
            <Title>{status === 'expired' ? t.expiredTitle : t.errorTitle}</Title>
            <Message>
              {status === 'expired' ? t.expiredMessage : t.errorMessage}
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
                disabled={isResending}
              >
                {isResending ? t.resending : t.resendButton}
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
