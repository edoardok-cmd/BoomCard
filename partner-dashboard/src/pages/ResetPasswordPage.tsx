import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import toast from 'react-hot-toast';

const PageContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1rem;
`;

const FormCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 2.5rem;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);

  @media (max-width: 768px) {
    padding: 2rem 1.5rem;
  }
`;

const Title = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  color: #6b7280;
  font-size: 0.95rem;
  margin-bottom: 2rem;
  line-height: 1.6;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
`;

const InputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const InputIcon = styled.div`
  position: absolute;
  left: 1rem;
  color: #9ca3af;
  display: flex;
  align-items: center;

  svg {
    width: 20px;
    height: 20px;
  }
`;

const Input = styled.input<{ $hasError?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 3rem;
  border: 2px solid ${props => props.$hasError ? '#ef4444' : '#e5e7eb'};
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? '#ef4444' : '#667eea'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(102, 126, 234, 0.1)'};
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const ErrorMessage = styled(motion.span)`
  color: #ef4444;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const PasswordStrengthBar = styled.div`
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
`;

const StrengthFill = styled(motion.div)<{ $strength: number }>`
  height: 100%;
  background: ${props => {
    if (props.$strength <= 25) return '#ef4444';
    if (props.$strength <= 50) return '#f59e0b';
    if (props.$strength <= 75) return '#3b82f6';
    return '#10b981';
  }};
  transition: all 0.3s ease;
`;

const StrengthText = styled.span<{ $strength: number }>`
  font-size: 0.75rem;
  color: ${props => {
    if (props.$strength <= 25) return '#ef4444';
    if (props.$strength <= 50) return '#f59e0b';
    if (props.$strength <= 75) return '#3b82f6';
    return '#10b981';
  }};
  font-weight: 600;
`;

const PasswordRequirements = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0.75rem 0 0 0;
  font-size: 0.875rem;
  color: #6b7280;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Requirement = styled.li<{ $met: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: ${props => props.$met ? '#10b981' : '#6b7280'};

  &::before {
    content: ${props => props.$met ? '"✓"' : '"○"'};
    font-weight: bold;
  }
`;

const SuccessCard = styled(motion.div)`
  text-align: center;
  padding: 1rem 0;
`;

const StatusIcon = styled.div<{ $success?: boolean }>`
  width: 80px;
  height: 80px;
  background: ${props => props.$success
    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
  };
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;

  svg {
    width: 40px;
    height: 40px;
    color: white;
  }
`;

const StatusTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.75rem;
`;

const StatusMessage = styled.p`
  color: #6b7280;
  font-size: 0.95rem;
  line-height: 1.6;
  margin-bottom: 2rem;
`;

const BackToLoginButton = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1.5rem;
  background: #111827;
  color: white;
  border-radius: 0.5rem;
  font-weight: 600;
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

interface FormData {
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  password?: string;
  confirmPassword?: string;
}

const ResetPasswordPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [formData, setFormData] = useState<FormData>({
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isInvalidToken, setIsInvalidToken] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const content = {
    en: {
      title: 'Reset Your Password',
      subtitle: 'Enter your new password below.',
      invalidTokenTitle: 'Invalid or Expired Link',
      invalidTokenMessage: 'This password reset link is invalid or has expired. Please request a new one.',
      passwordLabel: 'New Password',
      confirmPasswordLabel: 'Confirm Password',
      passwordPlaceholder: 'Enter your new password',
      confirmPasswordPlaceholder: 'Confirm your new password',
      passwordRequired: 'Password is required',
      passwordTooShort: 'Password must be at least 8 characters',
      confirmPasswordRequired: 'Please confirm your password',
      passwordMismatch: 'Passwords do not match',
      resetButton: 'Reset Password',
      resetting: 'Resetting...',
      successTitle: 'Password Reset Successfully',
      successMessage: 'Your password has been reset successfully. You can now log in with your new password.',
      backToLogin: 'Go to Login',
      requestNewLink: 'Request New Link',
      strengthWeak: 'Weak',
      strengthFair: 'Fair',
      strengthGood: 'Good',
      strengthStrong: 'Strong',
      reqLength: 'At least 8 characters',
      reqUpperLower: 'Upper and lowercase letters',
      reqNumber: 'At least one number',
      reqSpecial: 'At least one special character',
    },
    bg: {
      title: 'Нулиране на Паролата',
      subtitle: 'Въведете новата си парола по-долу.',
      invalidTokenTitle: 'Невалиден или Изтекъл Линк',
      invalidTokenMessage: 'Този линк за нулиране на паролата е невалиден или е изтекъл. Моля, заявете нов.',
      passwordLabel: 'Нова Парола',
      confirmPasswordLabel: 'Потвърдете Паролата',
      passwordPlaceholder: 'Въведете новата си парола',
      confirmPasswordPlaceholder: 'Потвърдете новата си парола',
      passwordRequired: 'Паролата е задължителна',
      passwordTooShort: 'Паролата трябва да е поне 8 символа',
      confirmPasswordRequired: 'Моля, потвърдете паролата си',
      passwordMismatch: 'Паролите не съвпадат',
      resetButton: 'Нулиране на Паролата',
      resetting: 'Нулиране...',
      successTitle: 'Паролата е Нулирана Успешно',
      successMessage: 'Вашата парола беше нулирана успешно. Сега можете да влезете с новата си парола.',
      backToLogin: 'Към Вход',
      requestNewLink: 'Заявете Нов Линк',
      strengthWeak: 'Слаба',
      strengthFair: 'Средна',
      strengthGood: 'Добра',
      strengthStrong: 'Силна',
      reqLength: 'Поне 8 символа',
      reqUpperLower: 'Главни и малки букви',
      reqNumber: 'Поне една цифра',
      reqSpecial: 'Поне един специален символ',
    },
  };

  const t = content[language as keyof typeof content];

  // Check token validity on mount
  useEffect(() => {
    if (!token) {
      setIsInvalidToken(true);
    }
    // In a real app, you would validate the token with your API
  }, [token]);

  const calculatePasswordStrength = (password: string): number => {
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (password.length >= 12) strength += 25;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
    if (/\d/.test(password)) strength += 12.5;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 12.5;
    return Math.min(strength, 100);
  };

  const getStrengthLabel = (strength: number): string => {
    if (strength <= 25) return t.strengthWeak;
    if (strength <= 50) return t.strengthFair;
    if (strength <= 75) return t.strengthGood;
    return t.strengthStrong;
  };

  const validatePassword = (password: string): string | undefined => {
    if (!password) return t.passwordRequired;
    if (password.length < 8) return t.passwordTooShort;
    return undefined;
  };

  const validateConfirmPassword = (confirmPassword: string): string | undefined => {
    if (!confirmPassword) return t.confirmPasswordRequired;
    if (confirmPassword !== formData.password) return t.passwordMismatch;
    return undefined;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (name === 'password') {
      setPasswordStrength(calculatePasswordStrength(value));
    }

    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const passwordError = validatePassword(formData.password);
    const confirmPasswordError = validateConfirmPassword(formData.confirmPassword);

    if (passwordError || confirmPasswordError) {
      setErrors({
        password: passwordError,
        confirmPassword: confirmPasswordError,
      });
      return;
    }

    setIsLoading(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      // In a real app, you would call the API here:
      // await resetPassword(token, formData.password);

      setIsSuccess(true);
      toast.success(language === 'bg' ? 'Паролата е нулирана успешно' : 'Password reset successfully');
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error(language === 'bg' ? 'Възникна грешка' : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Invalid token screen
  if (isInvalidToken) {
    return (
      <PageContainer>
        <FormCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <SuccessCard>
            <StatusIcon $success={false}>
              <AlertCircle />
            </StatusIcon>
            <StatusTitle>{t.invalidTokenTitle}</StatusTitle>
            <StatusMessage>{t.invalidTokenMessage}</StatusMessage>
            <BackToLoginButton to="/forgot-password">
              {t.requestNewLink}
            </BackToLoginButton>
          </SuccessCard>
        </FormCard>
      </PageContainer>
    );
  }

  // Success screen
  if (isSuccess) {
    return (
      <PageContainer>
        <FormCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <SuccessCard
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <StatusIcon $success={true}>
              <CheckCircle2 />
            </StatusIcon>
            <StatusTitle>{t.successTitle}</StatusTitle>
            <StatusMessage>{t.successMessage}</StatusMessage>
            <BackToLoginButton to="/login">
              {t.backToLogin}
            </BackToLoginButton>
          </SuccessCard>
        </FormCard>
      </PageContainer>
    );
  }

  // Reset password form
  return (
    <PageContainer>
      <FormCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Title>{t.title}</Title>
        <Subtitle>{t.subtitle}</Subtitle>

        <Form onSubmit={handleSubmit}>
          <FormGroup>
            <Label htmlFor="password">{t.passwordLabel}</Label>
            <InputWrapper>
              <InputIcon>
                <Lock />
              </InputIcon>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={t.passwordPlaceholder}
                value={formData.password}
                onChange={handleInputChange}
                $hasError={!!errors.password}
              />
            </InputWrapper>
            {errors.password && (
              <ErrorMessage
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errors.password}
              </ErrorMessage>
            )}
            {formData.password && (
              <>
                <PasswordStrengthBar>
                  <StrengthFill
                    $strength={passwordStrength}
                    initial={{ width: 0 }}
                    animate={{ width: `${passwordStrength}%` }}
                  />
                </PasswordStrengthBar>
                <StrengthText $strength={passwordStrength}>
                  {getStrengthLabel(passwordStrength)}
                </StrengthText>
                <PasswordRequirements>
                  <Requirement $met={formData.password.length >= 8}>
                    {t.reqLength}
                  </Requirement>
                  <Requirement $met={/[a-z]/.test(formData.password) && /[A-Z]/.test(formData.password)}>
                    {t.reqUpperLower}
                  </Requirement>
                  <Requirement $met={/\d/.test(formData.password)}>
                    {t.reqNumber}
                  </Requirement>
                  <Requirement $met={/[!@#$%^&*(),.?":{}|<>]/.test(formData.password)}>
                    {t.reqSpecial}
                  </Requirement>
                </PasswordRequirements>
              </>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="confirmPassword">{t.confirmPasswordLabel}</Label>
            <InputWrapper>
              <InputIcon>
                <Lock />
              </InputIcon>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder={t.confirmPasswordPlaceholder}
                value={formData.confirmPassword}
                onChange={handleInputChange}
                $hasError={!!errors.confirmPassword}
              />
            </InputWrapper>
            {errors.confirmPassword && (
              <ErrorMessage
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errors.confirmPassword}
              </ErrorMessage>
            )}
          </FormGroup>

          <Button
            type="submit"
            variant="primary"
            size="large"
            isLoading={isLoading}
            disabled={isLoading}
          >
            {isLoading ? t.resetting : t.resetButton}
          </Button>
        </Form>
      </FormCard>
    </PageContainer>
  );
};

export default ResetPasswordPage;
