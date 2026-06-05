import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { XCircle, Loader } from 'lucide-react';
// S1 fix: CheckCircle2 removed — the 'success' render case was dead code
// (setStatus('success') is never called; backend returns a 302 redirect).
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

// S2 fix: use the correct Vite pattern instead of `(import.meta as any).env`
// to preserve TypeScript env-variable type checking at build time.
const CONFIGURED_API_URL: string = import.meta.env.VITE_API_URL || FALLBACK_API_URL;

// B5 fix: validate the resolved API base against a known-good hostname
// allowlist before using it in a window.location.replace call. If the build
// pipeline is misconfigured and VITE_API_URL is set to an attacker-controlled
// value, users' one-time activation tokens would be forwarded to that domain.
// S3 fix: add staging/preview hostnames so CI deployments don't silently
// fall through to production and consume staging activation tokens there.
const ALLOWED_API_HOSTS = [
  'https://boomcard-api.fly.dev',
  'https://boomcard-api-staging.fly.dev',
  // LOW-1 fix (review r2ac): added localhost:3025 which is the actual backend port
  // per vite.config.ts proxy and .env.local. Without this entry, setting
  // VITE_API_URL=http://localhost:3025 for local dev failed the allowlist check
  // and silently fell through to the production backend.
  'http://localhost:3025',
  'http://localhost:4000',
  'http://localhost:3001',
  'http://localhost:3000',
];

function getSafeApiBase(): string | null {
  if (ALLOWED_API_HOSTS.includes(CONFIGURED_API_URL.replace(/\/$/, ''))) {
    return CONFIGURED_API_URL.replace(/\/$/, '');
  }
  // If the configured URL doesn't match the allowlist, fall back to the
  // hardcoded production URL. This is safe because the fallback is constant.
  // Log the mismatch so misconfigured deployments are easy to diagnose.
  if (CONFIGURED_API_URL !== FALLBACK_API_URL) {
    console.error(
      `[VerifyEmailPage] VITE_API_URL value "${CONFIGURED_API_URL}" is not in the ` +
      `allowed-hosts list. Falling back to ${FALLBACK_API_URL}.`
    );
  }
  return FALLBACK_API_URL;
}

// Module-level flag: set to true when the synchronous redirect at module load
// LOW-1 fix (review r2ac): earlyRedirectFiredOnLoad module flag removed.
// It was used in a useEffect condition (`redirectedRef.current || earlyRedirectFiredOnLoad`)
// but that caused SPA navigations to /verify-email to skip the redirect because the
// module-level flag stayed `true` for the lifetime of the JS bundle.  The per-instance
// `redirectedRef` is sufficient to prevent double-redirect; the module flag is not needed.

// Audit-pass [10.1]: redirect SYNCHRONOUSLY at module top before any React
// mount so the "Verifying..." card never flashes. Uses
// `window.location.search` directly to avoid waiting for react-router.
if (typeof window !== 'undefined') {
  try {
    const params = new URLSearchParams(window.location.search);
    const earlyToken = params.get('token');
    if (earlyToken) {
      const safeBase = getSafeApiBase();
      if (safeBase) {
        // Use replace so the verify-email URL doesn't pollute history.
        window.location.replace(`${safeBase}/api/auth/verify-email?token=${encodeURIComponent(earlyToken)}`);
      }
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

// S1 fix: 'success' removed from the $status union — the success case was
// dead code (backend redirects instead of returning to React).
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

// S1 fix: 'success' is dead code — setStatus('success') is never called.
// The backend returns a 302 redirect directly; React never gets to set a
// success state. Removed 'success' (and 'expired') from the union to
// eliminate unreachable branches.
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

  // MEDIUM-B1 fix (review r2ac): per-component-instance redirect guard.
  // The module-level synchronous redirect covers only the very first mount
  // (synchronous redirect on page load). When the user navigates away and back
  // to /verify-email in a SPA session (e.g., clicking a second activation link),
  // the module code does not re-execute, so the synchronous redirect does not fire again
  // and the useEffect would bail early — leaving the user stuck on the spinner.
  // redirectedRef.current is false on every fresh component mount, ensuring the
  // redirect fires correctly for each SPA navigation to this page.
  const redirectedRef = useRef(false);

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
    // B5/S2 fix: use getSafeApiBase() (allowlist-validated) instead of the
    // raw env value. Language is irrelevant to the redirect URL — removed from
    // the dependency array (B6 fix) so a language-context update does not
    // cause a double-redirect.
    // LOW-1 fix (review r2ac): use only the per-instance ref to guard against
    // double-redirect.  The module-level `earlyRedirectFiredOnLoad` flag is
    // intentionally excluded here because it stays `true` for the lifetime of
    // the JS module (i.e. across SPA navigations within the same session).
    // Including it in the OR condition caused the useEffect redirect to be
    // skipped on every SPA navigation to /verify-email after the initial load,
    // meaning users who navigated here without a fresh page load were never
    // redirected to the backend verification endpoint.
    // `redirectedRef.current` is reset to false on each new component mount,
    // so it correctly allows one redirect per mount regardless of the module
    // flag's state.
    if (redirectedRef.current) {
      return;
    }
    const safeBase = getSafeApiBase();
    if (safeBase) {
      redirectedRef.current = true;
      window.location.replace(`${safeBase}/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    } else {
      setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // S1 fix: 'success' case removed — it was dead code; the backend always
      // redirects via 302 and React never transitions to a 'success' status.

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
