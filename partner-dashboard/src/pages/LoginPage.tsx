import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { CredentialResponse } from '@react-oauth/google';
import Button from '../components/common/Button/Button';
import { useAuth, OAuthData, TwoFactorRequiredError, BlockedAccountError } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import GoogleLoginButton from '../components/auth/GoogleLoginButton';
import FacebookLoginButton from '../components/auth/FacebookLoginButton';
import Header from '../components/layout/Header/Header';
import Footer from '../components/layout/Footer/Footer';
import { toast } from 'react-hot-toast';

const PageWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
`;

const PageContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: var(--color-background);
  margin-top: 65px;
`;

const LoginCard = styled(motion.div)`
  width: 100%;
  max-width: 28rem;
  background: var(--color-background-secondary);
  border-radius: 1rem;
  box-shadow: var(--shadow-hover);
  padding: 2.5rem;
  border: 1px solid var(--color-border);

  @media (max-width: 640px) {
    padding: 2rem 1.5rem;
  }
`;

const Logo = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2rem;
  text-decoration: none;
`;

const LogoText = styled.span`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const Title = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-text-primary);
  text-align: center;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  color: var(--color-text-secondary);
  text-align: center;
  margin-bottom: 2rem;
  font-size: 0.875rem;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
`;

const Input = styled.input<{ $hasError?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.$hasError ? '#ef4444' : 'var(--color-border)'};
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: all 200ms;
  background: ${props => props.$hasError ? '#fef2f2' : 'var(--color-background)'};
  color: var(--color-text-primary);

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? '#ef4444' : 'var(--color-primary)'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
  }

  &::placeholder {
    color: var(--color-text-secondary);
    opacity: 0.6;
  }

  &:disabled {
    background: var(--color-background-secondary);
    cursor: not-allowed;
  }

  [data-theme="dark"] & {
    background: ${props => props.$hasError ? 'rgba(239, 68, 68, 0.15)' : 'var(--color-background)'};

    &:focus {
      box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'};
    }
  }

  [data-theme="color"] & {
    background: ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-background)'};

    &:focus {
      box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 148, 214, 0.2)'};
    }
  }
`;

const ErrorMessage = styled(motion.span)`
  font-size: 0.875rem;
  color: #ef4444;
  margin-top: 0.25rem;
`;

const BlockMessage = styled(motion.div)`
  font-size: 0.875rem;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  line-height: 1.5;

  [data-theme="dark"] & {
    color: #fcd34d;
    background: rgba(252, 211, 77, 0.1);
    border-color: rgba(252, 211, 77, 0.3);
  }
`;

const HelperText = styled.span`
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
  line-height: 1.4;
`;

const CheckboxGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Checkbox = styled.input`
  width: 1rem;
  height: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  cursor: pointer;

  &:checked {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
  }
`;

const CheckboxLabel = styled.label`
  font-size: 0.875rem;
  color: var(--color-text-primary);
  cursor: pointer;
  user-select: none;
`;

const ForgotPassword = styled(Link)`
  font-size: 0.875rem;
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
  transition: color 200ms;

  &:hover {
    color: var(--color-primary-hover);
  }
`;

const RememberForgotRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;

const SubmitButton = styled(Button)`
  margin-top: 0.5rem;
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.5rem 0;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }
`;

const DividerText = styled.span`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
`;

const SocialButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

// HIGH fix: OAuth buttons are disabled until the backend /auth/oauth/login endpoint
// is implemented. Wrapping them in a tooltip container makes the "coming soon" state
// visible without removing the UI elements entirely.
const ComingSoonWrapper = styled.div`
  position: relative;
  cursor: not-allowed;

  & > * {
    pointer-events: none;
    opacity: 0.5;
    user-select: none;
  }

  &::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: #f9fafb;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.375rem 0.625rem;
    border-radius: 0.375rem;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 150ms ease;
    z-index: 10;
  }

  &:hover::after {
    opacity: 1;
  }
`;

// Read-only "Signing in as <email>" line shown during the 2FA step in place of
// the email/password inputs (which are wiped from formData by the remount).
const SigningInAs = styled.div`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  padding: 0.75rem 1rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;

  strong {
    color: var(--color-text-primary);
    font-weight: 600;
    word-break: break-all;
  }
`;

// "Use a different account" affordance — returns to the email/password form.
const UseAnotherAccount = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 0.875rem;
  color: var(--color-primary);
  font-weight: 500;
  cursor: pointer;
  align-self: flex-start;
  text-decoration: none;
  transition: color 200ms;

  &:hover {
    color: var(--color-primary-hover);
    text-decoration: underline;
  }
`;

const SignupPrompt = styled.p`
  text-align: center;
  margin-top: 2rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);

  a {
    color: var(--color-primary);
    font-weight: 600;
    text-decoration: none;
    transition: color 200ms;

    &:hover {
      color: var(--color-primary-hover);
    }
  }
`;

const LangToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  margin-top: 1.25rem;
  padding: 0.5rem;
  background: none;
  border: none;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color 200ms;

  &:hover {
    color: var(--color-text-primary);
  }

  svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
`;


interface FormErrors {
  email?: string;
  password?: string;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithOAuth, isLoading, twoFactorRequired, twoFactorEmail, submitTwoFactor, clearTwoFactorRequired } = useAuth();

  // Single source of truth for the post-login destination. Callers (e.g. the
  // checkout "Log in" link) pass `from` as a location-like object; preserve its
  // `search` so query params (planId/planCode/billing) survive the round-trip
  // and the user lands back on the exact in-progress page. Every success path
  // (password, 2FA, Google, Facebook) must use this so they can't drift apart.
  const roleLanding = (role?: string): string => {
    if (role === 'partner') return '/partners/offers';
    if (role === 'admin') return '/admin/dashboard';
    if (role === 'user') return '/dashboard';
    return '/dashboard';
  };
  const resolveFrom = (role?: string): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromState = (location.state as any)?.from;
    return fromState?.pathname
      ? `${fromState.pathname}${fromState.search || ''}`
      : roleLanding(role);
  };
  const { t, language, setLanguage } = useLanguage();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [loginError, setLoginError] = useState<string | undefined>(undefined);

  // 2FA second-factor step. Whether the code field is shown (`twoFactorRequired`)
  // lives in AuthContext, NOT here: submitting login flips AuthContext.isLoading
  // to true, and App.tsx unmounts LoginPage while isLoading is true — so any
  // local "show the field" state set during the in-flight login would be wiped
  // on remount. Deriving it from the always-mounted provider makes the field
  // survive that remount. `totpCode` stays LOCAL — it's fine that it resets to
  // empty on remount; isLoading is false by the time the field is shown, so the
  // freshly-mounted field is stable while the user types.
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState<string | undefined>(undefined);
  const totpInputRef = React.useRef<HTMLInputElement>(null);

  // Auto-focus the code field the moment it is revealed (keyed off the context
  // gate, which is what now drives visibility).
  useEffect(() => {
    if (twoFactorRequired) {
      totpInputRef.current?.focus();
    }
  }, [twoFactorRequired]);

  // Keep a ref so the mount effect can call the latest t() without stale closure.
  const tRef = React.useRef(t);
  tRef.current = t;

  useEffect(() => {
    const reason = localStorage.getItem('boomcard_logout_reason');
    if (reason === 'session_expired') {
      localStorage.removeItem('boomcard_logout_reason');
      toast(tRef.current('auth.sessionExpired'), { icon: '⚠️', duration: 5000 });
    }
  }, []);

  const validateEmail = (email: string): string | undefined => {
    if (!email) {
      return t('auth.emailRequired');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return t('auth.invalidEmail');
    }
    return undefined;
  };

  const validatePassword = (password: string): string | undefined => {
    if (!password) {
      return t('auth.passwordRequired');
    }
    if (password.length < 8) {
      return t('auth.passwordMinLength');
    }
    return undefined;
  };

  const handleBlur = (field: 'email' | 'password') => {
    setTouched(prev => ({ ...prev, [field]: true }));

    let error: string | undefined;
    if (field === 'email') {
      error = validateEmail(formData.email);
    } else if (field === 'password') {
      error = validatePassword(formData.password);
    }

    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    setFormData(prev => ({ ...prev, [name]: newValue }));

    // Clear any persisted block-reason message when the user changes credentials.
    if ((name === 'email' || name === 'password') && loginError) {
      setLoginError(undefined);
    }

    // Editing email or password invalidates any in-flight 2FA step: a code is
    // bound to the specific account being authenticated, so a stale code must
    // not be submitted for different credentials. Collapse the field and clear.
    if ((name === 'email' || name === 'password') && (twoFactorRequired || totpCode)) {
      clearTwoFactorRequired();
      setTotpCode('');
      setTotpError(undefined);
    }

    // Clear error when user starts typing
    if (touched[name as keyof typeof touched]) {
      const error = name === 'email'
        ? validateEmail(value)
        : name === 'password'
        ? validatePassword(value)
        : undefined;

      setErrors(prev => ({ ...prev, [name]: error }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ── 2FA second-factor step ───────────────────────────────────────────────
    // When the code field is shown, the credentials live in AuthContext (in a
    // ref that survived the remount), NOT in formData — which was wiped when
    // App.tsx unmounted this page during the password-step isLoading. So we must
    // NOT validate/require formData.email/password here; we only require a
    // non-empty code and submit it through submitTwoFactor(), which re-issues
    // the login against the captured credentials.
    if (twoFactorRequired) {
      const trimmedCode = totpCode.trim().toUpperCase();
      if (!trimmedCode) {
        setTotpError(t('auth.twoFactorRequired'));
        totpInputRef.current?.focus();
        return;
      }
      try {
        setTotpError(undefined);
        // Sent verbatim — may be a 6-digit TOTP or a XXXXX-XXXXX recovery code.
        const role = await submitTwoFactor(trimmedCode);
        // Success: the user is now authenticated. ProtectedRoute (requireAuth=false
        // wrapper on /login) already redirects authenticated users to "/", so this
        // navigate is a best-effort that lands them on the originally-requested page
        // when it survives the remount; the route-level redirect is the guarantee.
        navigate(resolveFrom(role), { replace: true });
      } catch (error) {
        // A wrong code (401) arrives here as a plain Error already toasted by
        // AuthContext, which keeps `twoFactorRequired` TRUE and the captured
        // credentials intact so the user can retry. The inline hint is best-effort
        // (lost if the page remounts) but the toast already conveyed the failure.
        setTotpError(t('auth.twoFactorInvalid'));
        totpInputRef.current?.focus();
        console.error('Two-factor submit error:', error);
      }
      return;
    }

    // ── Password (first) step ────────────────────────────────────────────────
    // Validate all fields
    const emailError = validateEmail(formData.email);
    const passwordError = validatePassword(formData.password);

    setErrors({
      email: emailError,
      password: passwordError,
    });

    setTouched({
      email: true,
      password: true,
    });

    // If there are errors, don't submit
    if (emailError || passwordError) {
      return;
    }

    try {
      setTotpError(undefined);
      setLoginError(undefined);
      const role = await login({
        email: formData.email,
        password: formData.password,
        rememberMe: formData.rememberMe,
      });

      // Redirect to the page they were trying to access, or their role's home
      navigate(resolveFrom(role), { replace: true });
    } catch (error) {
      // 2FA required — reveal the code field, don't navigate or toast.
      if (error instanceof TwoFactorRequiredError) {
        return;
      }
      // Block-reason 403 (email unverified, pending review, not activated,
      // archived, rejected) — show the backend message inline. AuthContext did
      // NOT toast these, so the inline banner is the sole display.
      if (error instanceof BlockedAccountError) {
        setLoginError((error as Error).message);
        return;
      }
      // All other errors (wrong credentials, network, server) are already
      // toasted by AuthContext — no inline message needed.
      console.error('Login error:', error);
    }
  };


  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    try {
      if (!credentialResponse.credential) {
        throw new Error('No credential received from Google');
      }

      // Decode JWT to get user info (in production, verify on backend)
      const credential = credentialResponse.credential;
      const base64Url = credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const userData = JSON.parse(jsonPayload);

      const oauthData: OAuthData = {
        provider: 'google',
        token: credential,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        id: userData.sub,
      };

      const role = await loginWithOAuth(oauthData);

      navigate(resolveFrom(role), { replace: true });
    } catch (error) {
      console.error('Google login error:', error);
      // LOW-1 fix (review r2ab): surface caught errors to the user — Google success
      // path was silently swallowing errors. Must be consistent with Facebook path.
      toast.error(t('auth.googleLoginFailed'));
    }
  };

  const handleGoogleError = () => {
    console.error('Google login failed');
    toast.error(t('auth.googleLoginFailed'));
  };

  const handleFacebookSuccess = async (response: {
    accessToken: string;
    userInfo?: {
      email?: string;
      name?: string;
      id?: string;
      picture?: { data?: { url?: string } };
    };
  }) => {
    try {
      const oauthData: OAuthData = {
        provider: 'facebook',
        token: response.accessToken,
        email: response.userInfo?.email,
        name: response.userInfo?.name,
        picture: response.userInfo?.picture?.data?.url,
        id: response.userInfo?.id,
      };

      const role = await loginWithOAuth(oauthData);

      navigate(resolveFrom(role), { replace: true });
    } catch (error) {
      console.error('Facebook login error:', error);
      // LOW-1 fix: surface caught errors to the user — Facebook success path was
      // silently swallowing errors. Must be consistent with Google success path.
      toast.error(t('auth.facebookLoginFailed'));
    }
  };

  const handleFacebookError = (error: Error) => {
    console.error('Facebook login failed:', error);
    toast.error(t('auth.facebookLoginFailed'));
  };

  return (
    <PageWrapper>
      <Header />
      <PageContainer>
        <LoginCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
        <Logo to="/">
          <LogoText>BOOM Card</LogoText>
        </Logo>

        <Title>{t('auth.welcomeBack')}</Title>
        <Subtitle>
          {t('auth.signInToContinue')}
        </Subtitle>

        <Form onSubmit={handleSubmit}>
          {/* During the 2FA step the email/password inputs are hidden: their
              formData was wiped by the isLoading-driven remount, and the code is
              submitted against the credentials held in AuthContext. Show a
              read-only "Signing in as <email>" line (email sourced from the
              provider-held pending state) plus a way back to the normal form. */}
          {twoFactorRequired ? (
            <SigningInAs>
              {twoFactorEmail ? (
                <>
                  {t('auth.signingInAs')}{' '}
                  <strong>{twoFactorEmail}</strong>
                </>
              ) : (
                t('auth.twoFactorPrompt')
              )}
            </SigningInAs>
          ) : (
            <>
              <FormGroup>
                <Label htmlFor="email">
                  {t('auth.emailAddress')}
                </Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur('email')}
                  placeholder="your@email.com"
                  $hasError={touched.email && !!errors.email}
                  disabled={isLoading}
                  autoComplete="email"
                />
                {touched.email && errors.email && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.email}
                  </ErrorMessage>
                )}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="password">
                  {t('auth.password')}
                </Label>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={() => handleBlur('password')}
                  placeholder="••••••••"
                  $hasError={touched.password && !!errors.password}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                {touched.password && errors.password && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.password}
                  </ErrorMessage>
                )}
              </FormGroup>
            </>
          )}

          {twoFactorRequired && (
            <FormGroup>
              <Label htmlFor="totpCode">
                {t('auth.twoFactorCode')}
              </Label>
              <Input
                ref={totpInputRef}
                id="totpCode"
                type="text"
                name="totpCode"
                value={totpCode}
                onChange={(e) => {
                  setTotpCode(e.target.value);
                  if (totpError) setTotpError(undefined);
                }}
                placeholder={t('auth.twoFactorPlaceholder')}
                $hasError={!!totpError}
                disabled={isLoading}
                autoComplete="one-time-code"
                inputMode="text"
                autoCapitalize="characters"
                spellCheck={false}
                aria-describedby="totpHelp"
                maxLength={20}
              />
              <HelperText id="totpHelp">
                {t('auth.twoFactorHelp')}
              </HelperText>
              {totpError && (
                <ErrorMessage
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {totpError}
                </ErrorMessage>
              )}
            </FormGroup>
          )}

          {twoFactorRequired ? (
            <UseAnotherAccount
              type="button"
              onClick={() => {
                // Return to the email/password form. Clears the provider-level
                // gate + captured credentials and the local code/error state.
                clearTwoFactorRequired();
                setTotpCode('');
                setTotpError(undefined);
                setLoginError(undefined);
              }}
              disabled={isLoading}
            >
              {t('auth.twoFactorUseAnotherAccount')}
            </UseAnotherAccount>
          ) : (
            <RememberForgotRow>
              <CheckboxGroup>
                <Checkbox
                  id="rememberMe"
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                  disabled={isLoading}
                />
                <CheckboxLabel htmlFor="rememberMe">
                  {t('auth.rememberMe')}
                </CheckboxLabel>
              </CheckboxGroup>
              <ForgotPassword to="/forgot-password">
                {t('auth.forgotPassword')}
              </ForgotPassword>
            </RememberForgotRow>
          )}

          {!twoFactorRequired && loginError && (
            <BlockMessage
              role="alert"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {loginError}
            </BlockMessage>
          )}

          <SubmitButton
            type="submit"
            variant="primary"
            size="large"
            isLoading={isLoading}
            disabled={isLoading}
          >
            {t('common.signIn')}
          </SubmitButton>
        </Form>

        <Divider>
          <DividerText>{t('auth.or')}</DividerText>
        </Divider>

        {/* HIGH fix: Google and Facebook OAuth are disabled — the backend
            /auth/oauth/login endpoint is not yet implemented (returns HTTP 404).
            The buttons are wrapped in a non-interactive "coming soon" overlay so
            partners understand the feature is planned but not yet available.
            Remove these wrappers once the backend endpoint is live. */}
        <SocialButtons>
          <ComingSoonWrapper
            data-tooltip={language === 'bg' ? 'Очаквайте скоро' : 'Coming soon'}
            aria-label={language === 'bg' ? 'Вход с Google — очаквайте скоро' : 'Google login — coming soon'}
          >
            <GoogleLoginButton
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              text={t('auth.continueWithGoogle')}
              language={language}
            />
          </ComingSoonWrapper>
          <ComingSoonWrapper
            data-tooltip={language === 'bg' ? 'Очаквайте скоро' : 'Coming soon'}
            aria-label={language === 'bg' ? 'Вход с Facebook — очаквайте скоро' : 'Facebook login — coming soon'}
          >
            <FacebookLoginButton
              onSuccess={handleFacebookSuccess}
              onError={handleFacebookError}
              text={t('auth.continueWithFacebook')}
            />
          </ComingSoonWrapper>
        </SocialButtons>

        <SignupPrompt>
          <Link to="/#subscription-plans">
            {t('auth.viewSubscriptionPlans')}
          </Link>
        </SignupPrompt>

        <SignupPrompt style={{ marginTop: '0.75rem' }}>
          {t('auth.notAPartnerYet')}{' '}
          <Link to="/register/partner">
            {t('auth.applyAsPartner')}
          </Link>
        </SignupPrompt>

        <LangToggle
          type="button"
          onClick={() => setLanguage(language === 'bg' ? 'en' : 'bg')}
          aria-label="Toggle language"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          {language === 'bg' ? 'English' : 'Български'}
        </LangToggle>

      </LoginCard>
    </PageContainer>
    <Footer />
  </PageWrapper>
  );
};

export default LoginPage;
