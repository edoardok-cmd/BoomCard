import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { CredentialResponse } from '@react-oauth/google';
import Button from '../components/common/Button/Button';
import { useAuth, OAuthData } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import GoogleLoginButton from '../components/auth/GoogleLoginButton';
import FacebookLoginButton from '../components/auth/FacebookLoginButton';

const PageContainer = styled.div`
  min-height: calc(100vh - 4rem);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
`;

const LoginCard = styled(motion.div)`
  width: 100%;
  max-width: 28rem;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  padding: 2.5rem;

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
  color: #111827;
`;

const Title = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
  text-align: center;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  color: #6b7280;
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
  color: #374151;
`;

const Input = styled.input<{ $hasError?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.$hasError ? '#ef4444' : '#e5e7eb'};
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: all 200ms;
  background: ${props => props.$hasError ? '#fef2f2' : 'white'};

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? '#ef4444' : '#111827'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(17, 24, 39, 0.1)'};
  }

  &::placeholder {
    color: #9ca3af;
  }

  &:disabled {
    background: #f9fafb;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled(motion.span)`
  font-size: 0.875rem;
  color: #ef4444;
  margin-top: 0.25rem;
`;

const CheckboxGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Checkbox = styled.input`
  width: 1rem;
  height: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  cursor: pointer;

  &:checked {
    background-color: #111827;
    border-color: #111827;
  }
`;

const CheckboxLabel = styled.label`
  font-size: 0.875rem;
  color: #374151;
  cursor: pointer;
  user-select: none;
`;

const ForgotPassword = styled(Link)`
  font-size: 0.875rem;
  color: #111827;
  text-decoration: none;
  font-weight: 500;
  transition: color 200ms;

  &:hover {
    color: #6b7280;
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
    background: #e5e7eb;
  }
`;

const DividerText = styled.span`
  font-size: 0.875rem;
  color: #6b7280;
`;

const SocialButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const SocialButton = styled.button`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: white;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 200ms;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SignupPrompt = styled.p`
  text-align: center;
  margin-top: 2rem;
  font-size: 0.875rem;
  color: #6b7280;

  a {
    color: #111827;
    font-weight: 600;
    text-decoration: none;
    transition: color 200ms;

    &:hover {
      color: #6b7280;
    }
  }
`;

const DemoCredentials = styled(motion.div)`
  margin-top: 1.5rem;
  padding: 1rem;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 0.5rem;
`;

const DemoTitle = styled.p`
  font-size: 0.875rem;
  font-weight: 600;
  color: #0369a1;
  margin-bottom: 0.5rem;
`;

const DemoInfo = styled.p`
  font-size: 0.75rem;
  color: #0c4a6e;
  line-height: 1.5;

  code {
    background: #e0f2fe;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-family: 'Monaco', 'Courier New', monospace;
  }
`;

interface FormErrors {
  email?: string;
  password?: string;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithOAuth, isLoading } = useAuth();
  const { t } = useLanguage();

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
    if (password.length < 6) {
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
      await login({
        email: formData.email,
        password: formData.password,
        rememberMe: formData.rememberMe,
      });

      // Redirect to the page they were trying to access, or home
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const from = (location.state as any)?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (error) {
      // Error is handled by the AuthContext with toast
      console.error('Login error:', error);
    }
  };

  const handleDemoLogin = () => {
    setFormData({
      email: 'demo@boomcard.bg',
      password: 'demo123',
      rememberMe: false,
    });
    setErrors({});
    setTouched({ email: true, password: true });
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

      await loginWithOAuth(oauthData);

      const from = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch (error) {
      console.error('Google login error:', error);
    }
  };

  const handleGoogleError = () => {
    console.error('Google login failed');
  };

  const handleFacebookSuccess = async (response: any) => {
    try {
      const oauthData: OAuthData = {
        provider: 'facebook',
        token: response.accessToken,
        email: response.userInfo?.email,
        name: response.userInfo?.name,
        picture: response.userInfo?.picture?.data?.url,
        id: response.userInfo?.id,
      };

      await loginWithOAuth(oauthData);

      const from = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } catch (error) {
      console.error('Facebook login error:', error);
    }
  };

  const handleFacebookError = (error: any) => {
    console.error('Facebook login failed:', error);
  };

  return (
    <PageContainer>
      <LoginCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Logo to="/">
          <LogoText>BoomCard</LogoText>
        </Logo>

        <Title>{t('auth.welcomeBack')}</Title>
        <Subtitle>
          {t('auth.signInToContinue')}
        </Subtitle>

        <Form onSubmit={handleSubmit}>
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

        <SocialButtons>
          <GoogleLoginButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            text={t('auth.continueWithGoogle')}
          />
          <FacebookLoginButton
            onSuccess={handleFacebookSuccess}
            onError={handleFacebookError}
            text={t('auth.continueWithFacebook')}
          />
        </SocialButtons>

        <SignupPrompt>
          {t('auth.dontHaveAccount')} {' '}
          <Link to="/register">
            {t('common.signUp')}
          </Link>
        </SignupPrompt>

        <DemoCredentials
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <DemoTitle>
            {t('auth.demoAccess')} - Test Accounts
          </DemoTitle>
          <DemoInfo>
            <strong>👤 User:</strong> <code>demo@boomcard.bg</code> / <code>demo123</code>
            <br />
            <strong>🏢 Partner:</strong> <code>partner@boomcard.bg</code> / <code>partner123</code>
            <br />
            <strong>⚡ Admin:</strong> <code>admin@boomcard.bg</code> / <code>admin123</code>
            <br />
            <button
              type="button"
              onClick={handleDemoLogin}
              style={{
                marginTop: '0.5rem',
                background: '#0284c7',
                color: 'white',
                border: 'none',
                padding: '0.375rem 0.75rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Fill User Account
            </button>
          </DemoInfo>
        </DemoCredentials>
      </LoginCard>
    </PageContainer>
  );
};

export default LoginPage;
