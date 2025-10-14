import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
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

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #6b7280;
  font-size: 0.875rem;
  text-decoration: none;
  margin-bottom: 1.5rem;
  transition: color 0.2s;

  &:hover {
    color: #111827;
  }

  svg {
    width: 16px;
    height: 16px;
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

const SuccessCard = styled(motion.div)`
  text-align: center;
  padding: 1rem 0;
`;

const SuccessIcon = styled.div`
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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

const SuccessTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.75rem;
`;

const SuccessMessage = styled.p`
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

const HelpText = styled.p`
  text-align: center;
  color: #6b7280;
  font-size: 0.875rem;
  margin-top: 1.5rem;

  a {
    color: #667eea;
    text-decoration: none;
    font-weight: 600;

    &:hover {
      text-decoration: underline;
    }
  }
`;

interface FormData {
  email: string;
}

interface FormErrors {
  email?: string;
}

const ForgotPasswordPage: React.FC = () => {
  const { language } = useLanguage();
  const [formData, setFormData] = useState<FormData>({
    email: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const content = {
    en: {
      backToLogin: 'Back to login',
      title: 'Forgot Password?',
      subtitle: "No worries! Enter your email address and we'll send you a link to reset your password.",
      emailLabel: 'Email Address',
      emailPlaceholder: 'your.email@example.com',
      emailRequired: 'Email is required',
      emailInvalid: 'Invalid email address',
      sendButton: 'Send Reset Link',
      sending: 'Sending...',
      successTitle: 'Check Your Email',
      successMessage: "We've sent a password reset link to your email address. Please check your inbox and follow the instructions.",
      backToLoginButton: 'Back to Login',
      needHelp: 'Need help?',
      contactSupport: 'Contact Support',
    },
    bg: {
      backToLogin: 'Обратно към вход',
      title: 'Забравена Парола?',
      subtitle: 'Без проблем! Въведете вашия имейл адрес и ще ви изпратим линк за нулиране на паролата.',
      emailLabel: 'Имейл Адрес',
      emailPlaceholder: 'your.email@example.com',
      emailRequired: 'Имейлът е задължителен',
      emailInvalid: 'Невалиден имейл адрес',
      sendButton: 'Изпрати Линк',
      sending: 'Изпращане...',
      successTitle: 'Проверете Имейла Си',
      successMessage: 'Изпратихме линк за нулиране на паролата на вашия имейл адрес. Моля, проверете входящата си поща и следвайте инструкциите.',
      backToLoginButton: 'Обратно към Вход',
      needHelp: 'Нуждаете се от помощ?',
      contactSupport: 'Свържете се с поддръжка',
    },
  };

  const t = content[language as keyof typeof content];

  const validateEmail = (email: string): string | undefined => {
    if (!email) {
      return t.emailRequired;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return t.emailInvalid;
    }
    return undefined;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const emailError = validateEmail(formData.email);
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }

    setIsLoading(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      // In a real app, you would call the API here:
      // await forgotPassword(formData.email);

      setIsSuccess(true);
      toast.success(language === 'bg' ? 'Имейлът е изпратен успешно' : 'Email sent successfully');
    } catch (error) {
      console.error('Forgot password error:', error);
      toast.error(language === 'bg' ? 'Възникна грешка' : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

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
            <SuccessIcon>
              <CheckCircle2 />
            </SuccessIcon>
            <SuccessTitle>{t.successTitle}</SuccessTitle>
            <SuccessMessage>{t.successMessage}</SuccessMessage>
            <BackToLoginButton to="/login">
              <ArrowLeft size={20} />
              {t.backToLoginButton}
            </BackToLoginButton>
          </SuccessCard>
          <HelpText>
            {t.needHelp}{' '}
            <a href="mailto:support@boomcard.bg">{t.contactSupport}</a>
          </HelpText>
        </FormCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <FormCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <BackLink to="/login">
          <ArrowLeft />
          {t.backToLogin}
        </BackLink>

        <Title>{t.title}</Title>
        <Subtitle>{t.subtitle}</Subtitle>

        <Form onSubmit={handleSubmit}>
          <FormGroup>
            <Label htmlFor="email">{t.emailLabel}</Label>
            <InputWrapper>
              <InputIcon>
                <Mail />
              </InputIcon>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={t.emailPlaceholder}
                value={formData.email}
                onChange={handleInputChange}
                $hasError={!!errors.email}
              />
            </InputWrapper>
            {errors.email && (
              <ErrorMessage
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errors.email}
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
            {isLoading ? t.sending : t.sendButton}
          </Button>
        </Form>

        <HelpText>
          {t.needHelp}{' '}
          <a href="mailto:support@boomcard.bg">{t.contactSupport}</a>
        </HelpText>
      </FormCard>
    </PageContainer>
  );
};

export default ForgotPasswordPage;
