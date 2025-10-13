import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import Button from '../components/common/Button/Button';
import { useAuth } from '../contexts/AuthContext';

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

interface LoginPageProps {
  language?: 'en' | 'bg';
}

const LoginPage: React.FC<LoginPageProps> = ({ language = 'en' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAuth();

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
      return language === 'bg' ? 'Имейлът е задължителен' : 'Email is required';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return language === 'bg' ? 'Невалиден имейл адрес' : 'Invalid email address';
    }
    return undefined;
  };

  const validatePassword = (password: string): string | undefined => {
    if (!password) {
      return language === 'bg' ? 'Паролата е задължителна' : 'Password is required';
    }
    if (password.length < 6) {
      return language === 'bg'
        ? 'Паролата трябва да е поне 6 символа'
        : 'Password must be at least 6 characters';
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

        <Title>{language === 'bg' ? 'Добре дошли обратно' : 'Welcome back'}</Title>
        <Subtitle>
          {language === 'bg'
            ? 'Влезте в профила си, за да продължите'
            : 'Sign in to your account to continue'}
        </Subtitle>

        <Form onSubmit={handleSubmit}>
          <FormGroup>
            <Label htmlFor="email">
              {language === 'bg' ? 'Имейл адрес' : 'Email address'}
            </Label>
            <Input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={() => handleBlur('email')}
              placeholder={language === 'bg' ? 'your@email.com' : 'your@email.com'}
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
              {language === 'bg' ? 'Парола' : 'Password'}
            </Label>
            <Input
              id="password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              onBlur={() => handleBlur('password')}
              placeholder={language === 'bg' ? '••••••••' : '••••••••'}
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
                {language === 'bg' ? 'Запомни ме' : 'Remember me'}
              </CheckboxLabel>
            </CheckboxGroup>
            <ForgotPassword to="/forgot-password">
              {language === 'bg' ? 'Забравена парола?' : 'Forgot password?'}
            </ForgotPassword>
          </RememberForgotRow>

          <SubmitButton
            type="submit"
            variant="primary"
            size="large"
            isLoading={isLoading}
            disabled={isLoading}
          >
            {language === 'bg' ? 'Вход' : 'Sign in'}
          </SubmitButton>
        </Form>

        <Divider>
          <DividerText>{language === 'bg' ? 'или' : 'or'}</DividerText>
        </Divider>

        <SocialButtons>
          <SocialButton type="button" disabled={isLoading}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
              <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
              <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
            </svg>
            {language === 'bg' ? 'Вход с Google' : 'Continue with Google'}
          </SocialButton>

          <SocialButton type="button" disabled={isLoading}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            {language === 'bg' ? 'Вход с Facebook' : 'Continue with Facebook'}
          </SocialButton>
        </SocialButtons>

        <SignupPrompt>
          {language === 'bg' ? 'Нямате профил? ' : "Don't have an account? "}
          <Link to="/register">
            {language === 'bg' ? 'Регистрирайте се' : 'Sign up'}
          </Link>
        </SignupPrompt>

        <DemoCredentials
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <DemoTitle>
            {language === 'bg' ? '🎭 Демо достъп' : '🎭 Demo Access'}
          </DemoTitle>
          <DemoInfo>
            {language === 'bg' ? 'Имейл: ' : 'Email: '}
            <code>demo@boomcard.bg</code>
            <br />
            {language === 'bg' ? 'Парола: ' : 'Password: '}
            <code>demo123</code>
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
              {language === 'bg' ? 'Попълни автоматично' : 'Fill automatically'}
            </button>
          </DemoInfo>
        </DemoCredentials>
      </LoginCard>
    </PageContainer>
  );
};

export default LoginPage;
