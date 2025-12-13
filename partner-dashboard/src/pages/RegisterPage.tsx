import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { CredentialResponse } from '@react-oauth/google';
import Button from '../components/common/Button/Button';
import { useAuth, OAuthData } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import GoogleLoginButton from '../components/auth/GoogleLoginButton';
import FacebookLoginButton from '../components/auth/FacebookLoginButton';
import Header from '../components/layout/Header/Header';
import Footer from '../components/layout/Footer/Footer';
import { payseraService } from '../services/paysera.service';

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
  padding: 6rem 1rem 2rem;
  background: var(--color-background);
`;

const RegisterCard = styled(motion.div)`
  width: 100%;
  max-width: 32rem;
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

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
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

const CheckboxGroup = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const Checkbox = styled.input`
  width: 1rem;
  height: 1rem;
  margin-top: 0.125rem;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  cursor: pointer;
  flex-shrink: 0;

  &:checked {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
  }
`;

const CheckboxLabel = styled.label<{ $hasError?: boolean }>`
  font-size: 0.875rem;
  color: ${props => props.$hasError ? '#ef4444' : 'var(--color-text-primary)'};
  cursor: pointer;
  user-select: none;
  line-height: 1.4;

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

const PasswordStrength = styled.div`
  margin-top: 0.5rem;
`;

const StrengthBar = styled.div`
  height: 0.25rem;
  background: var(--color-border);
  border-radius: 9999px;
  overflow: hidden;

  [data-theme="dark"] & {
    background: rgba(255, 255, 255, 0.1);
  }
`;

const StrengthFill = styled(motion.div)<{ $strength: number }>`
  height: 100%;
  background: ${props => {
    if (props.$strength <= 25) return '#ef4444';
    if (props.$strength <= 50) return '#f59e0b';
    if (props.$strength <= 75) return '#3b82f6';
    return '#10b981';
  }};
  border-radius: 9999px;

  [data-theme="dark"] & {
    background: ${props => {
      if (props.$strength <= 25) return '#f87171';
      if (props.$strength <= 50) return '#fbbf24';
      if (props.$strength <= 75) return '#60a5fa';
      return '#34d399';
    }};
  }
`;

const StrengthText = styled.span<{ $strength: number }>`
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: ${props => {
    if (props.$strength <= 25) return '#ef4444';
    if (props.$strength <= 50) return '#f59e0b';
    if (props.$strength <= 75) return '#3b82f6';
    return '#10b981';
  }};
  font-weight: 500;

  [data-theme="dark"] & {
    color: ${props => {
      if (props.$strength <= 25) return '#f87171';
      if (props.$strength <= 50) return '#fbbf24';
      if (props.$strength <= 75) return '#60a5fa';
      return '#34d399';
    }};
  }
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

const SocialButton = styled.button`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-background);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 200ms;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  &:hover {
    background: var(--color-background-secondary);
    border-color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const LoginPrompt = styled.p`
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

const SwitchAccountType = styled.p`
  text-align: center;
  margin-top: 1rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);

  a {
    color: var(--color-accent);
    font-weight: 600;
    text-decoration: none;
    transition: color 200ms;

    &:hover {
      color: var(--color-primary);
    }
  }
`;

const PlanSummary = styled(motion.div)`
  background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;

  [data-theme="dark"] & {
    background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
    border-color: #374151;
  }

  [data-theme="color"] & {
    background: linear-gradient(135deg, #fff5f0 0%, #ffe4f1 100%);
    border-color: rgba(255, 148, 214, 0.3);
  }
`;

const PlanSummaryTitle = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &::before {
    content: '✓';
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #10b981;
    color: white;
    font-size: 0.875rem;
    font-weight: 700;
  }
`;

const PlanDetail = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }
`;

const PlanLabel = styled.span`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-weight: 500;
`;

const PlanValue = styled.span`
  font-size: 1rem;
  color: var(--color-text-primary);
  font-weight: 600;
`;

const PlanPrice = styled.div`
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 2px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const PlanPriceLabel = styled.span`
  font-size: 1rem;
  color: var(--color-text-primary);
  font-weight: 700;
`;

const PlanPriceValue = styled.span`
  font-size: 1.5rem;
  color: var(--color-primary);
  font-weight: 700;
`;

const PaymentInfo = styled.div`
  background: #eff6ff;
  border: 1px solid #3b82f6;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
  color: #1e40af;

  [data-theme="dark"] & {
    background: #1e3a8a;
    border-color: #3b82f6;
    color: #93c5fd;
  }

  [data-theme="color"] & {
    background: rgba(255, 148, 214, 0.1);
    border-color: #ff94d6;
    color: #6a0572;
  }

  strong {
    font-weight: 700;
  }
`;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  acceptTerms?: string;
}

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, loginWithOAuth, isLoading, token } = useAuth();
  const { t, language } = useLanguage();

  // Extract plan details from URL params
  const searchParams = new URLSearchParams(location.search);
  const selectedPlan = searchParams.get('plan');
  const planPrice = searchParams.get('price');
  const planCurrency = searchParams.get('currency');
  const billingPeriod = searchParams.get('billing');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const calculatePasswordStrength = (password: string): number => {
    let strength = 0;
    if (password.length >= 6) strength += 25;
    if (password.length >= 10) strength += 25;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
    if (/\d/.test(password)) strength += 12.5;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 12.5;
    return Math.min(strength, 100);
  };

  const getPasswordStrengthLabel = (strength: number): string => {
    if (strength <= 25) return t('auth.passwordWeak');
    if (strength <= 50) return t('auth.passwordFair');
    if (strength <= 75) return t('auth.passwordGood');
    return t('auth.passwordStrong');
  };

  const validateField = (field: string, value: any): string | undefined => {
    switch (field) {
      case 'firstName':
        if (!value) return t('auth.firstNameRequired');
        if (value.length < 2) return t('auth.firstNameTooShort');
        return undefined;

      case 'lastName':
        if (!value) return t('auth.lastNameRequired');
        if (value.length < 2) return t('auth.lastNameTooShort');
        return undefined;

      case 'email': {
        if (!value) return t('auth.emailRequired');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return t('auth.invalidEmail');
        return undefined;
      }

      case 'phone':
        if (value && !/^(\+359|0)[0-9\s-]{8,}$/.test(value)) {
          return t('auth.invalidPhone');
        }
        return undefined;

      case 'password':
        if (!value) return t('auth.passwordRequired');
        if (value.length < 6) {
          return t('auth.passwordMinLength');
        }
        return undefined;

      case 'confirmPassword':
        if (!value) return t('auth.confirmPasswordRequired');
        if (value !== formData.password) {
          return t('auth.passwordsMustMatch');
        }
        return undefined;

      case 'acceptTerms':
        if (!value) {
          return t('auth.mustAgreeToTerms');
        }
        return undefined;

      default:
        return undefined;
    }
  };

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const value = formData[field as keyof typeof formData];
    const error = validateField(field, value);
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    setFormData(prev => ({ ...prev, [name]: newValue }));

    // Calculate password strength
    if (name === 'password') {
      setPasswordStrength(calculatePasswordStrength(value));
    }

    // Real-time validation for touched fields
    if (touched[name]) {
      const error = validateField(name, newValue);
      setErrors(prev => ({ ...prev, [name]: error }));
    }

    // Also validate confirmPassword when password changes
    if (name === 'password' && touched.confirmPassword) {
      const confirmError = formData.confirmPassword !== value
        ? t('auth.passwordsMustMatch')
        : undefined;
      setErrors(prev => ({ ...prev, confirmPassword: confirmError }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const newErrors: FormErrors = {};
    Object.keys(formData).forEach(field => {
      const error = validateField(field, formData[field as keyof typeof formData]);
      if (error) newErrors[field as keyof FormErrors] = error;
    });

    setErrors(newErrors);
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
      acceptTerms: true,
    });

    // If there are errors, don't submit
    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      await register({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone || undefined,
        acceptTerms: formData.acceptTerms,
      });

      // If a plan is selected, process payment
      if (selectedPlan && planPrice && token) {
        setIsProcessingPayment(true);
        try {
          const paymentDescription = language === 'bg'
            ? `Абонамент: ${selectedPlan} (${billingPeriod === 'yearly' ? 'Годишен' : 'Месечен'})`
            : `Subscription: ${selectedPlan} (${billingPeriod === 'yearly' ? 'Yearly' : 'Monthly'})`;

          const paymentResult = await payseraService.createPayment(token, {
            amount: parseFloat(planPrice),
            currency: planCurrency || 'EUR',
            description: paymentDescription,
            metadata: {
              plan: selectedPlan,
              billing: billingPeriod || 'monthly',
              subscriptionType: 'new',
            },
          });

          // Redirect to Paysera payment page
          window.location.href = paymentResult.data.paymentUrl;
        } catch (paymentError) {
          console.error('Payment creation error:', paymentError);
          setIsProcessingPayment(false);
          // Navigate to home even if payment fails, user can retry later
          navigate('/', { replace: true });
        }
      } else {
        // No plan selected, redirect to home page
        navigate('/', { replace: true });
      }
    } catch (error) {
      // Error is handled by the AuthContext with toast
      console.error('Registration error:', error);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    try {
      if (!credentialResponse.credential) {
        throw new Error('No credential received from Google');
      }

      // Decode JWT to get user info
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
      console.error('Google signup error:', error);
    }
  };

  const handleGoogleError = () => {
    console.error('Google signup failed');
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
      console.error('Facebook signup error:', error);
    }
  };

  const handleFacebookError = (error: any) => {
    console.error('Facebook signup failed:', error);
  };

  return (
    <PageWrapper>
      <Header />
      <PageContainer>
        <RegisterCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Logo to="/">
          <LogoText>BOOM Card</LogoText>
        </Logo>

        <Title>{t('auth.createAccount')}</Title>
        <Subtitle>
          {t('auth.getStartedToday')}
        </Subtitle>

        {/* Show selected plan summary */}
        {selectedPlan && planPrice && (
          <>
            <PlanSummary
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <PlanSummaryTitle>
                {language === 'bg' ? 'Избран План' : 'Selected Plan'}
              </PlanSummaryTitle>
              <PlanDetail>
                <PlanLabel>{language === 'bg' ? 'План' : 'Plan'}</PlanLabel>
                <PlanValue>{selectedPlan}</PlanValue>
              </PlanDetail>
              <PlanDetail>
                <PlanLabel>{language === 'bg' ? 'Период' : 'Billing Period'}</PlanLabel>
                <PlanValue>
                  {billingPeriod === 'yearly'
                    ? (language === 'bg' ? 'Годишен' : 'Yearly')
                    : (language === 'bg' ? 'Месечен' : 'Monthly')}
                </PlanValue>
              </PlanDetail>
              <PlanPrice>
                <PlanPriceLabel>
                  {language === 'bg' ? 'Сума' : 'Total'}
                </PlanPriceLabel>
                <PlanPriceValue>
                  {planPrice} {planCurrency || 'EUR'}
                </PlanPriceValue>
              </PlanPrice>
            </PlanSummary>

            <PaymentInfo>
              <strong>{language === 'bg' ? 'Плащане:' : 'Payment:'}</strong>{' '}
              {language === 'bg'
                ? 'След регистрация ще бъдете пренасочени към защитена страница на Paysera за завършване на плащането.'
                : 'After registration, you will be redirected to Paysera secure payment page to complete your payment.'}
            </PaymentInfo>
          </>
        )}

        <Form onSubmit={handleSubmit}>
          <FormRow>
            <FormGroup>
              <Label htmlFor="firstName">
                {t('auth.firstName')} *
              </Label>
              <Input
                id="firstName"
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                onBlur={() => handleBlur('firstName')}
                placeholder="John"
                $hasError={touched.firstName && !!errors.firstName}
                disabled={isLoading}
                autoComplete="given-name"
              />
              {touched.firstName && errors.firstName && (
                <ErrorMessage
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {errors.firstName}
                </ErrorMessage>
              )}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="lastName">
                {t('auth.lastName')} *
              </Label>
              <Input
                id="lastName"
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                onBlur={() => handleBlur('lastName')}
                placeholder="Smith"
                $hasError={touched.lastName && !!errors.lastName}
                disabled={isLoading}
                autoComplete="family-name"
              />
              {touched.lastName && errors.lastName && (
                <ErrorMessage
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {errors.lastName}
                </ErrorMessage>
              )}
            </FormGroup>
          </FormRow>

          <FormGroup>
            <Label htmlFor="email">
              {t('auth.emailAddress')} *
            </Label>
            <Input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={() => handleBlur('email')}
              placeholder="john@example.com"
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
            <Label htmlFor="phone">
              {t('auth.phoneOptional')}
            </Label>
            <Input
              id="phone"
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              onBlur={() => handleBlur('phone')}
              placeholder="+359 88 123 4567"
              $hasError={touched.phone && !!errors.phone}
              disabled={isLoading}
              autoComplete="tel"
            />
            {touched.phone && errors.phone && (
              <ErrorMessage
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errors.phone}
              </ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="password">
              {t('auth.password')} *
            </Label>
            <Input
              id="password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              onBlur={() => handleBlur('password')}
              placeholder={t('auth.passwordMinLength')}
              $hasError={touched.password && !!errors.password}
              disabled={isLoading}
              autoComplete="new-password"
            />
            {touched.password && errors.password && (
              <ErrorMessage
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errors.password}
              </ErrorMessage>
            )}
            {formData.password && (
              <PasswordStrength>
                <StrengthBar>
                  <StrengthFill
                    $strength={passwordStrength}
                    initial={{ width: 0 }}
                    animate={{ width: `${passwordStrength}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </StrengthBar>
                <StrengthText $strength={passwordStrength}>
                  {t('auth.passwordStrength')}: 
                  {getPasswordStrengthLabel(passwordStrength)}
                </StrengthText>
              </PasswordStrength>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="confirmPassword">
              {t('auth.confirmPassword')} *
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              onBlur={() => handleBlur('confirmPassword')}
              placeholder={t('auth.confirmPassword')}
              $hasError={touched.confirmPassword && !!errors.confirmPassword}
              disabled={isLoading}
              autoComplete="new-password"
            />
            {touched.confirmPassword && errors.confirmPassword && (
              <ErrorMessage
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errors.confirmPassword}
              </ErrorMessage>
            )}
          </FormGroup>

          <CheckboxGroup>
            <Checkbox
              id="acceptTerms"
              type="checkbox"
              name="acceptTerms"
              checked={formData.acceptTerms}
              onChange={handleChange}
              disabled={isLoading}
            />
            <CheckboxLabel
              htmlFor="acceptTerms"
              $hasError={touched.acceptTerms && !!errors.acceptTerms}
            >
              {t('auth.agreeToTerms')}
            </CheckboxLabel>
          </CheckboxGroup>
          {touched.acceptTerms && errors.acceptTerms && (
            <ErrorMessage
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {errors.acceptTerms}
            </ErrorMessage>
          )}

          <SubmitButton
            type="submit"
            variant="primary"
            size="large"
            isLoading={isLoading || isProcessingPayment}
            disabled={isLoading || isProcessingPayment}
          >
            {isProcessingPayment
              ? (language === 'bg' ? 'Обработка на плащането...' : 'Processing Payment...')
              : selectedPlan
              ? (language === 'bg' ? 'Регистрирай и Плати' : 'Register & Pay')
              : t('auth.createAccountButton')}
          </SubmitButton>
        </Form>

        <Divider>
          <DividerText>{t('auth.or')}</DividerText>
        </Divider>

        <SocialButtons>
          <GoogleLoginButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            text={t('auth.signUpWithGoogle')}
            language={language}
          />
          <FacebookLoginButton
            onSuccess={handleFacebookSuccess}
            onError={handleFacebookError}
            text={t('auth.signUpWithFacebook')}
          />
        </SocialButtons>

        <SwitchAccountType>
          {t('auth.switchToPartner')} <Link to="/register/partner">{t('auth.signUpAsPartner')}</Link>
        </SwitchAccountType>

        <LoginPrompt>
          {t('auth.alreadyHaveAccount')}
          <Link to="/login">
            {t('common.signIn')}
          </Link>
        </LoginPrompt>
      </RegisterCard>
      </PageContainer>
      <Footer />
    </PageWrapper>
  );
};

export default RegisterPage;
