import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import Button from '../components/common/Button/Button';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Header from '../components/layout/Header/Header';

const PageWrapper = styled.div`
  min-height: 100vh;
  background: var(--color-background);
  transition: background-color var(--transition-normal);
`;

const PageContainer = styled.div`
  min-height: calc(100vh - 4rem);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6rem 1rem 2rem;

  @media (max-width: 768px) {
    padding: 5rem 1rem 2rem;
  }
`;

const RegisterCard = styled(motion.div)`
  width: 100%;
  max-width: 42rem;
  background: var(--color-background-secondary);
  border-radius: 1rem;
  box-shadow: var(--shadow-soft);
  padding: 2.5rem;
  transition: background-color var(--transition-normal), box-shadow var(--transition-normal);

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
  transition: color var(--transition-normal);
`;

const Title = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-text-primary);
  text-align: center;
  margin-bottom: 0.5rem;
  transition: color var(--transition-normal);
`;

const Subtitle = styled.p`
  color: var(--color-text-secondary);
  text-align: center;
  margin-bottom: 2rem;
  font-size: 0.875rem;
  transition: color var(--transition-normal);
`;

const Badge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 9999px;
  color: var(--color-info);
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 auto 1.5rem;
  transition: all var(--transition-normal);

  [data-theme="dark"] & {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.4);
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Section = styled.div`
  padding: 1.5rem;
  background: var(--color-background-tertiary);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  transition: background-color var(--transition-normal), border-color var(--transition-normal);
`;

const SectionTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: color var(--transition-normal);
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
  gap: 0.75rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: color var(--transition-normal);
`;

const Input = styled.input<{ $hasError?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.$hasError ? 'var(--color-error)' : 'var(--color-border)'};
  border-radius: 0.5rem;
  font-size: 1rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: all var(--transition-normal);

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? 'var(--color-error)' : 'var(--color-primary)'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'};
  }

  &::placeholder {
    color: var(--color-text-tertiary);
  }

  &:disabled {
    background: var(--color-background-tertiary);
    color: var(--color-text-tertiary);
    cursor: not-allowed;
  }

  [data-theme="dark"] & {
    background: var(--color-background-tertiary);
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.$hasError ? 'var(--color-error)' : 'var(--color-border)'};
  border-radius: 0.5rem;
  font-size: 1rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: all var(--transition-normal);
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? 'var(--color-error)' : 'var(--color-primary)'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'};
  }

  &:disabled {
    background: var(--color-background-tertiary);
    color: var(--color-text-tertiary);
    cursor: not-allowed;
  }

  option {
    background: var(--color-background);
    color: var(--color-text-primary);
  }

  [data-theme="dark"] & {
    background: var(--color-background-tertiary);
  }
`;

const ErrorMessage = styled(motion.span)`
  font-size: 0.875rem;
  color: var(--color-error);
  margin-top: 0.25rem;
  transition: color var(--transition-normal);
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
  background: var(--color-background);
  transition: all var(--transition-normal);

  &:checked {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
  }
`;

const CheckboxLabel = styled.label<{ $hasError?: boolean }>`
  font-size: 0.875rem;
  color: ${props => props.$hasError ? 'var(--color-error)' : 'var(--color-text-secondary)'};
  cursor: pointer;
  user-select: none;
  line-height: 1.4;
  transition: color var(--transition-normal);

  a {
    color: var(--color-primary);
    font-weight: 600;
    text-decoration: none;
    transition: color var(--transition-normal);

    &:hover {
      color: var(--color-primary-hover);
    }
  }
`;

const InfoBox = styled.div`
  padding: 1rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-info);
  line-height: 1.5;
  transition: all var(--transition-normal);

  [data-theme="dark"] & {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.4);
  }
`;

const SubmitButton = styled(Button)`
  margin-top: 0.5rem;
`;

const LoginPrompt = styled.p`
  text-align: center;
  margin-top: 2rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  transition: color var(--transition-normal);

  a {
    color: var(--color-primary);
    font-weight: 600;
    text-decoration: none;
    transition: color var(--transition-normal);

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
  transition: color var(--transition-normal);

  a {
    color: var(--color-info);
    font-weight: 600;
    text-decoration: none;
    transition: color var(--transition-normal);

    &:hover {
      color: var(--color-primary);
    }
  }
`;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  businessName?: string;
  businessCategory?: string;
  acceptTerms?: string;
  confirmBusiness?: string;
}

const RegisterPartnerPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, isLoading } = useAuth();
  const { t, language } = useLanguage();

  const categories = [
    { value: '', label: t('partnerRegistration.selectCategory') },
    { value: 'RESTAURANT', label: t('partnerRegistration.restaurant') },
    { value: 'HOTEL', label: t('partnerRegistration.hotel') },
    { value: 'SPA', label: t('partnerRegistration.spa') },
    { value: 'WINERY', label: t('partnerRegistration.winery') },
    { value: 'ENTERTAINMENT', label: t('partnerRegistration.entertainment') },
    { value: 'SPORTS', label: t('partnerRegistration.sports') },
    { value: 'BEAUTY', label: t('partnerRegistration.beauty') },
    { value: 'SHOPPING', label: t('partnerRegistration.shopping') },
    { value: 'TRAVEL', label: t('partnerRegistration.travel') },
  ];

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    businessNameBg: '',
    businessCategory: '',
    taxId: '',
    website: '',
    acceptTerms: false,
    confirmBusiness: false,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateField = (field: string, value: any): string | undefined => {
    switch (field) {
      case 'firstName':
        if (!value) return t('partnerRegistration.firstNameRequired');
        if (value.length < 2) return t('partnerRegistration.firstNameMinLength');
        return undefined;

      case 'lastName':
        if (!value) return t('partnerRegistration.lastNameRequired');
        if (value.length < 2) return t('partnerRegistration.lastNameMinLength');
        return undefined;

      case 'email': {
        if (!value) return t('partnerRegistration.emailRequired');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return t('partnerRegistration.emailInvalid');
        return undefined;
      }

      case 'phone':
        if (!value) return t('partnerRegistration.phoneRequired');
        if (!/^(\+359|0)[0-9\s-]{8,}$/.test(value)) {
          return t('partnerRegistration.phoneInvalid');
        }
        return undefined;

      case 'password':
        if (!value) return t('partnerRegistration.passwordRequired');
        if (value.length < 6) return t('partnerRegistration.passwordMinLength');
        return undefined;

      case 'confirmPassword':
        if (!value) return t('partnerRegistration.confirmPasswordRequired');
        if (value !== formData.password) return t('partnerRegistration.passwordsMismatch');
        return undefined;

      case 'businessName':
        if (!value) return t('partnerRegistration.businessNameRequired');
        if (value.length < 3) return t('partnerRegistration.businessNameMinLength');
        return undefined;

      case 'businessCategory':
        if (!value) return t('partnerRegistration.businessCategoryRequired');
        return undefined;

      case 'acceptTerms':
        if (!value) return t('partnerRegistration.acceptTermsRequired');
        return undefined;

      case 'confirmBusiness':
        if (!value) return t('partnerRegistration.confirmBusinessRequired');
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    const newValue = type === 'checkbox' ? checked : value;

    setFormData(prev => ({ ...prev, [name]: newValue }));

    // Real-time validation for touched fields
    if (touched[name]) {
      const error = validateField(name, newValue);
      setErrors(prev => ({ ...prev, [name]: error }));
    }

    // Also validate confirmPassword when password changes
    if (name === 'password' && touched.confirmPassword) {
      const confirmError = formData.confirmPassword !== value
        ? t('partnerRegistration.passwordsMismatch')
        : undefined;
      setErrors(prev => ({ ...prev, confirmPassword: confirmError }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const newErrors: FormErrors = {};
    const requiredFields = [
      'firstName', 'lastName', 'email', 'phone',
      'password', 'confirmPassword', 'businessName',
      'businessCategory', 'acceptTerms', 'confirmBusiness'
    ];

    requiredFields.forEach(field => {
      const error = validateField(field, formData[field as keyof typeof formData]);
      if (error) newErrors[field as keyof FormErrors] = error;
    });

    setErrors(newErrors);

    const newTouched: Record<string, boolean> = {};
    requiredFields.forEach(field => {
      newTouched[field] = true;
    });
    setTouched(newTouched);

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
        phone: formData.phone,
        acceptTerms: formData.acceptTerms,
        accountType: 'partner',
        businessInfo: {
          businessName: formData.businessName,
          businessNameBg: formData.businessNameBg || undefined,
          businessCategory: formData.businessCategory,
          taxId: formData.taxId || undefined,
          website: formData.website || undefined,
        },
      });

      // Redirect to dashboard after successful registration
      navigate('/dashboard', { replace: true });
    } catch (error) {
      // Error is handled by the AuthContext with toast
      console.error('Registration error:', error);
    }
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
            <img
              src="/iconic.svg"
              alt="BoomCard"
              style={{ height: '3rem', width: 'auto' }}
            />
          </Logo>

          <Badge>
            🏢 {t('partnerRegistration.businessAccount')}
          </Badge>

          <Title>{t('partnerRegistration.title')}</Title>
          <Subtitle>
            {t('partnerRegistration.subtitle')}
          </Subtitle>

        <Form onSubmit={handleSubmit}>
          {/* Personal Information */}
          <Section>
            <SectionTitle>
              👤 {t('partnerRegistration.personalInfo')}
            </SectionTitle>

            <FormRow>
              <FormGroup>
                <Label htmlFor="firstName">
                  {t('partnerRegistration.firstName')} *
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  onBlur={() => handleBlur('firstName')}
                  placeholder={t('partnerRegistration.firstNamePlaceholder')}
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
                  {t('partnerRegistration.lastName')} *
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  onBlur={() => handleBlur('lastName')}
                  placeholder={t('partnerRegistration.lastNamePlaceholder')}
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

            <FormRow>
              <FormGroup>
                <Label htmlFor="email">
                  {t('partnerRegistration.email')} *
                </Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur('email')}
                  placeholder={t('partnerRegistration.emailPlaceholder')}
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
                  {t('partnerRegistration.phone')} *
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  onBlur={() => handleBlur('phone')}
                  placeholder={t('partnerRegistration.phonePlaceholder')}
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
            </FormRow>
          </Section>

          {/* Business Information */}
          <Section>
            <SectionTitle>
              🏢 {t('partnerRegistration.businessInfo')}
            </SectionTitle>

            <FormRow>
              <FormGroup>
                <Label htmlFor="businessName">
                  {t('partnerRegistration.businessName')} *
                </Label>
                <Input
                  id="businessName"
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                  onBlur={() => handleBlur('businessName')}
                  placeholder={t('partnerRegistration.businessNamePlaceholder')}
                  $hasError={touched.businessName && !!errors.businessName}
                  disabled={isLoading}
                />
                {touched.businessName && errors.businessName && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.businessName}
                  </ErrorMessage>
                )}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="businessNameBg">
                  {t('partnerRegistration.businessNameBg')}
                </Label>
                <Input
                  id="businessNameBg"
                  type="text"
                  name="businessNameBg"
                  value={formData.businessNameBg}
                  onChange={handleChange}
                  placeholder={t('partnerRegistration.businessNameBgPlaceholder')}
                  disabled={isLoading}
                />
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label htmlFor="businessCategory">
                  {t('partnerRegistration.businessCategory')} *
                </Label>
                <Select
                  id="businessCategory"
                  name="businessCategory"
                  value={formData.businessCategory}
                  onChange={handleChange}
                  onBlur={() => handleBlur('businessCategory')}
                  $hasError={touched.businessCategory && !!errors.businessCategory}
                  disabled={isLoading}
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </Select>
                {touched.businessCategory && errors.businessCategory && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.businessCategory}
                  </ErrorMessage>
                )}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="taxId">
                  {t('partnerRegistration.taxId')}
                </Label>
                <Input
                  id="taxId"
                  type="text"
                  name="taxId"
                  value={formData.taxId}
                  onChange={handleChange}
                  placeholder={t('partnerRegistration.taxIdPlaceholder')}
                  disabled={isLoading}
                />
              </FormGroup>
            </FormRow>

            <FormGroup>
              <Label htmlFor="website">
                {t('partnerRegistration.website')}
              </Label>
              <Input
                id="website"
                type="url"
                name="website"
                value={formData.website}
                onChange={handleChange}
                placeholder={t('partnerRegistration.websitePlaceholder')}
                disabled={isLoading}
              />
            </FormGroup>
          </Section>

          {/* Security */}
          <Section>
            <SectionTitle>
              🔒 {t('partnerRegistration.security')}
            </SectionTitle>

            <FormRow>
              <FormGroup>
                <Label htmlFor="password">
                  {t('partnerRegistration.password')} *
                </Label>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={() => handleBlur('password')}
                  placeholder={t('partnerRegistration.passwordPlaceholder')}
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
              </FormGroup>

              <FormGroup>
                <Label htmlFor="confirmPassword">
                  {t('partnerRegistration.confirmPassword')} *
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  onBlur={() => handleBlur('confirmPassword')}
                  placeholder={t('partnerRegistration.confirmPasswordPlaceholder')}
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
            </FormRow>
          </Section>

          <div>
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
                {t('partnerRegistration.acceptTerms')} <Link to="/terms">{t('partnerRegistration.termsAndConditions')}</Link> {t('partnerRegistration.and')} <Link to="/privacy">{t('partnerRegistration.privacyPolicy')}</Link>
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
          </div>

          <div>
            <CheckboxGroup>
              <Checkbox
                id="confirmBusiness"
                type="checkbox"
                name="confirmBusiness"
                checked={formData.confirmBusiness}
                onChange={handleChange}
                disabled={isLoading}
              />
              <CheckboxLabel
                htmlFor="confirmBusiness"
                $hasError={touched.confirmBusiness && !!errors.confirmBusiness}
              >
                {t('partnerRegistration.confirmBusiness')}
              </CheckboxLabel>
            </CheckboxGroup>
            {touched.confirmBusiness && errors.confirmBusiness && (
              <ErrorMessage
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errors.confirmBusiness}
              </ErrorMessage>
            )}
          </div>

          <InfoBox>
            <strong>📋 {t('partnerRegistration.note')}</strong> {t('partnerRegistration.noteText')}
          </InfoBox>

          <SubmitButton
            type="submit"
            variant="primary"
            size="large"
            isLoading={isLoading}
            disabled={isLoading}
          >
            {t('partnerRegistration.createPartnerAccount')}
          </SubmitButton>
        </Form>

        <SwitchAccountType>
          {t('partnerRegistration.switchToCustomer')} <Link to="/register">{t('partnerRegistration.signUpAsCustomer')}</Link>
        </SwitchAccountType>

        <LoginPrompt>
          {t('partnerRegistration.alreadyHaveAccount')} <Link to="/login">{t('partnerRegistration.signIn')}</Link>
        </LoginPrompt>
      </RegisterCard>
    </PageContainer>
    </PageWrapper>
  );
};

export default RegisterPartnerPage;
