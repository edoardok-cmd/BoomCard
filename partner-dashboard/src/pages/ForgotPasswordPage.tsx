import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Lock, KeyRound, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { apiService } from '../services/api.service';
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

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  padding: 0;
  color: #6b7280;
  font-size: 0.875rem;
  cursor: pointer;
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

const EmailHint = styled.div`
  background: #f3f4ff;
  color: #4c51bf;
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  display: inline-block;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
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

const OtpInput = styled(Input)`
  letter-spacing: 0.5rem;
  text-align: center;
  font-size: 1.25rem;
  font-weight: 600;
`;

const ErrorMessage = styled(motion.span)`
  color: #ef4444;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const ResendButton = styled.button`
  background: none;
  border: none;
  color: #667eea;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.5rem;
  margin-top: 0.5rem;
  align-self: center;

  &:hover {
    text-decoration: underline;
  }
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

type Step = 'email' | 'otp' | 'done';

interface FormData {
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
}

interface FormErrors {
  email?: string;
  otp?: string;
  newPassword?: string;
  confirmPassword?: string;
}

const ForgotPasswordPage: React.FC = () => {
  const { language } = useLanguage();
  const [step, setStep] = useState<Step>('email');
  const [formData, setFormData] = useState<FormData>({
    email: '',
    otp: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  // Persist OTP cooldown in sessionStorage so it survives page reloads.
  // Initialise from sessionStorage so a reload within the 60-second window
  // correctly blocks re-submission rather than resetting the countdown.
  const [codeSentAt, setCodeSentAt] = useState<number | null>(() => {
    const stored = sessionStorage.getItem('otp_cooldown_sent_at');
    return stored ? parseInt(stored, 10) : null;
  });

  // Keep sessionStorage in sync with state changes.
  const recordCodeSentAt = (ts: number) => {
    sessionStorage.setItem('otp_cooldown_sent_at', String(ts));
    setCodeSentAt(ts);
  };

  const content = {
    en: {
      backToLogin: 'Back to login',
      title: 'Forgot Password?',
      subtitle: "Enter your email and we'll send you a 6-digit code to reset your password.",
      otpTitle: 'Enter Reset Code',
      otpSubtitle: 'We sent a 6-digit code to',
      emailLabel: 'Email Address',
      emailPlaceholder: 'your.email@example.com',
      otpLabel: 'Reset Code',
      otpPlaceholder: '000000',
      newPasswordLabel: 'New Password',
      newPasswordPlaceholder: 'Min 8 chars, upper, lower, number, symbol',
      confirmPasswordLabel: 'Confirm Password',
      confirmPasswordPlaceholder: 'Re-enter your new password',
      emailRequired: 'Email is required',
      emailInvalid: 'Invalid email address',
      otpRequired: 'Please enter the 6-digit code',
      otpInvalid: 'Code must be 6 digits',
      passwordRequired: 'Password is required',
      passwordTooShort: 'Password must be at least 8 characters',
      passwordTooWeak: 'Password must include uppercase, lowercase, a number, and a special character',
      passwordMismatch: 'Passwords do not match',
      sendButton: 'Send Reset Code',
      sending: 'Sending...',
      resetButton: 'Reset Password',
      resetting: 'Resetting...',
      resendCode: 'Use a different email',
      successTitle: 'Password Reset Successfully',
      successMessage: 'Your password has been reset. You can now log in with your new password.',
      backToLoginButton: 'Back to Login',
      needHelp: 'Need help?',
      contactSupport: 'Contact Support',
      genericError: 'Something went wrong. Please try again.',
      invalidCodeError: 'Invalid or expired code. Please try again.',
      emailNotFound: 'No account found with that email address.',
    },
    bg: {
      backToLogin: 'Обратно към вход',
      title: 'Забравена Парола?',
      subtitle: 'Въведете вашия имейл и ще ви изпратим 6-цифрен код за нулиране на паролата.',
      otpTitle: 'Въведете Кода',
      otpSubtitle: 'Изпратихме 6-цифрен код на',
      emailLabel: 'Имейл Адрес',
      emailPlaceholder: 'your.email@example.com',
      otpLabel: 'Код за Нулиране',
      otpPlaceholder: '000000',
      newPasswordLabel: 'Нова Парола',
      newPasswordPlaceholder: 'Поне 8 символа, главна, малка, цифра, символ',
      confirmPasswordLabel: 'Потвърдете Паролата',
      confirmPasswordPlaceholder: 'Въведете новата парола отново',
      emailRequired: 'Имейлът е задължителен',
      emailInvalid: 'Невалиден имейл адрес',
      otpRequired: 'Моля, въведете 6-цифрения код',
      otpInvalid: 'Кодът трябва да е 6 цифри',
      passwordRequired: 'Паролата е задължителна',
      passwordTooShort: 'Паролата трябва да е поне 8 символа',
      passwordTooWeak: 'Паролата трябва да съдържа главни, малки букви, цифра и специален символ',
      passwordMismatch: 'Паролите не съвпадат',
      sendButton: 'Изпрати Код',
      sending: 'Изпращане...',
      resetButton: 'Нулиране на Паролата',
      resetting: 'Нулиране...',
      resendCode: 'Използвай друг имейл',
      successTitle: 'Паролата е Нулирана Успешно',
      successMessage: 'Вашата парола беше нулирана успешно. Сега можете да влезете с новата си парола.',
      backToLoginButton: 'Обратно към Вход',
      needHelp: 'Нуждаете се от помощ?',
      contactSupport: 'Свържете се с поддръжка',
      genericError: 'Нещо се обърка. Моля, опитайте отново.',
      invalidCodeError: 'Невалиден или изтекъл код. Моля, опитайте отново.',
      emailNotFound: 'Няма намерен акаунт с този имейл адрес.',
    },
  };

  const t = content[language as keyof typeof content];

  const validateEmail = (email: string): string | undefined => {
    if (!email) return t.emailRequired;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return t.emailInvalid;
    return undefined;
  };

  const validateOtp = (otp: string): string | undefined => {
    if (!otp) return t.otpRequired;
    if (!/^\d{6}$/.test(otp)) return t.otpInvalid;
    return undefined;
  };

  const validatePassword = (password: string): string | undefined => {
    if (!password) return t.passwordRequired;
    // Canonical password policy (matches backend registerValidation /
    // changePasswordValidation / reset-password): min 8 chars + complexity.
    if (password.length < 8) return t.passwordTooShort;
    // HIGH-2 fix (r2ac): apply the same complexity gate as ResetPasswordPage.
    // Previously this path only checked length, allowing weak passwords like
    // "aaaaaaaaaa" to bypass the OTP-based reset flow.
    const hasUpperLower = /[a-z]/.test(password) && /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    if (!hasUpperLower || !hasNumber || !hasSpecial) return t.passwordTooWeak;
    return undefined;
  };

  const validateConfirmPassword = (confirm: string, password: string): string | undefined => {
    if (!confirm) return t.passwordRequired;
    if (confirm !== password) return t.passwordMismatch;
    return undefined;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const nextValue = name === 'otp' ? value.replace(/\D/g, '').slice(0, 6) : value;
    setFormData(prev => ({ ...prev, [name]: nextValue }));
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailError = validateEmail(formData.email);
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }

    // S5 fix: enforce 60-second cooldown between code requests to prevent
    // unlimited code generation for the same email address.
    if (codeSentAt && Date.now() - codeSentAt < 60_000) {
      const secsLeft = Math.ceil((60_000 - (Date.now() - codeSentAt)) / 1000);
      toast.error(
        language === 'bg'
          ? `Моля, изчакайте ${secsLeft} сек. преди повторно изпращане`
          : `Please wait ${secsLeft}s before requesting another code`
      );
      return;
    }

    setIsLoading(true);
    try {
      await apiService.post('/auth/forgot-password', {
        email: formData.email.toLowerCase().trim(),
      });
      recordCodeSentAt(Date.now());
      setStep('otp');
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setErrors(prev => ({ ...prev, email: t.emailNotFound }));
      } else {
        toast.error(t.genericError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpError = validateOtp(formData.otp);
    const passwordError = validatePassword(formData.newPassword);
    const confirmError = validateConfirmPassword(formData.confirmPassword, formData.newPassword);

    if (otpError || passwordError || confirmError) {
      setErrors({ otp: otpError, newPassword: passwordError, confirmPassword: confirmError });
      return;
    }

    setIsLoading(true);
    try {
      await apiService.post('/auth/reset-password', {
        email: formData.email.toLowerCase().trim(),
        otp: formData.otp.trim(),
        newPassword: formData.newPassword,
      });
      setStep('done');
      toast.success(t.successTitle);
    } catch (err) {
      const rawMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      // Only show an inline OTP field error for known OTP-specific failures.
      // For network/server errors (rawMessage absent), emit a toast so the user
      // is not confused into thinking their OTP code is wrong — MEDIUM-2 fix (r2ac).
      const isKnownOtpError = rawMessage
        ? /invalid|expired|incorrect|not found/i.test(rawMessage)
        : false;
      if (isKnownOtpError) {
        // OTP-specific error — put the message on the field so the user knows
        // to request a new code or re-enter the one they received.
        setErrors({ otp: t.invalidCodeError });
      } else {
        // Generic connectivity or server error — show as toast, NOT as an
        // inline OTP field error (that would mislead the user into re-typing
        // their code and potentially exhausting a one-time-use OTP).
        toast.error(t.genericError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'done') {
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
            <a href="mailto:office@boomcard.bg">{t.contactSupport}</a>
          </HelpText>
        </FormCard>
      </PageContainer>
    );
  }

  if (step === 'otp') {
    return (
      <PageContainer>
        <FormCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <BackButton type="button" onClick={() => { setStep('email'); setFormData(prev => ({ ...prev, email: '', otp: '', newPassword: '', confirmPassword: '' })); setErrors({}); sessionStorage.removeItem('otp_cooldown_sent_at'); setCodeSentAt(null); }}>
            <ArrowLeft />
            {t.backToLogin}
          </BackButton>

          <Title>{t.otpTitle}</Title>
          <Subtitle>{t.otpSubtitle}</Subtitle>
          <EmailHint>{formData.email}</EmailHint>

          <Form onSubmit={handleResetPassword}>
            <FormGroup>
              <Label htmlFor="otp">{t.otpLabel}</Label>
              <InputWrapper>
                <InputIcon>
                  <KeyRound />
                </InputIcon>
                <OtpInput
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder={t.otpPlaceholder}
                  value={formData.otp}
                  onChange={handleInputChange}
                  $hasError={!!errors.otp}
                />
              </InputWrapper>
              {errors.otp && (
                <ErrorMessage initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                  {errors.otp}
                </ErrorMessage>
              )}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="newPassword">{t.newPasswordLabel}</Label>
              <InputWrapper>
                <InputIcon>
                  <Lock />
                </InputIcon>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t.newPasswordPlaceholder}
                  value={formData.newPassword}
                  onChange={handleInputChange}
                  $hasError={!!errors.newPassword}
                />
              </InputWrapper>
              {errors.newPassword && (
                <ErrorMessage initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                  {errors.newPassword}
                </ErrorMessage>
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
                  autoComplete="new-password"
                  placeholder={t.confirmPasswordPlaceholder}
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  $hasError={!!errors.confirmPassword}
                />
              </InputWrapper>
              {errors.confirmPassword && (
                <ErrorMessage initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
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

            <ResendButton
              type="button"
              onClick={() => {
                setStep('email');
                setFormData(prev => ({ ...prev, email: '', otp: '', newPassword: '', confirmPassword: '' }));
                setErrors({});
                sessionStorage.removeItem('otp_cooldown_sent_at');
                setCodeSentAt(null);
              }}
            >
              {t.resendCode}
            </ResendButton>
          </Form>

          <HelpText>
            {t.needHelp}{' '}
            <a href="mailto:office@boomcard.bg">{t.contactSupport}</a>
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

        <Form onSubmit={handleSendCode}>
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
                autoComplete="email"
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
          <a href="mailto:office@boomcard.bg">{t.contactSupport}</a>
        </HelpText>
      </FormCard>
    </PageContainer>
  );
};

export default ForgotPasswordPage;
