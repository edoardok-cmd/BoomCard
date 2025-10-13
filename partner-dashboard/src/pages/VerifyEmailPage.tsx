import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Mail, Loader } from 'lucide-react';
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

const VerifyEmailPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [isResending, setIsResending] = useState(false);

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
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        return;
      }

      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 2000));

        // In a real app, you would call the API here:
        // await verifyEmailApi(token);

        // Simulate success (90% success rate for demo)
        const isSuccess = Math.random() > 0.1;

        if (isSuccess) {
          setStatus('success');
          toast.success(
            language === 'bg'
              ? 'Имейлът е потвърден успешно!'
              : 'Email verified successfully!'
          );
        } else {
          setStatus('expired');
        }
      } catch (error) {
        console.error('Email verification error:', error);
        setStatus('error');
        toast.error(
          language === 'bg'
            ? 'Грешка при потвърждение на имейла'
            : 'Error verifying email'
        );
      }
    };

    verifyEmail();
  }, [token, language]);

  const handleResendEmail = async () => {
    if (!email) {
      toast.error(
        language === 'bg'
          ? 'Не е намерен имейл адрес'
          : 'No email address found'
      );
      return;
    }

    setIsResending(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      // In a real app, you would call the API here:
      // await resendVerificationEmail(email);

      toast.success(
        language === 'bg'
          ? 'Имейлът за потвърждение е изпратен отново!'
          : 'Verification email sent again!'
      );

      // Reset to loading state
      setStatus('loading');

      // Simulate verification after resend
      setTimeout(() => {
        setStatus('success');
      }, 2000);
    } catch (error) {
      console.error('Resend email error:', error);
      toast.error(
        language === 'bg'
          ? 'Грешка при изпращане на имейл'
          : 'Error sending email'
      );
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
              <StyledButton
                variant="primary"
                size="large"
                onClick={handleResendEmail}
                isLoading={isResending}
                disabled={isResending || !email}
              >
                {isResending ? t.resending : t.resendButton}
              </StyledButton>
              <SecondaryLink to="/">{t.backToHome}</SecondaryLink>
            </ButtonGroup>
            <HelpText>
              {t.needHelp}{' '}
              <a href="mailto:support@boomcard.bg">{t.contactSupport}</a>
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
