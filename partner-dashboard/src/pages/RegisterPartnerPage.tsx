import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import Button from '../components/common/Button/Button';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const PageContainer = styled.div`
  min-height: calc(100vh - 4rem);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
`;

const RegisterCard = styled(motion.div)`
  width: 100%;
  max-width: 42rem;
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

const Badge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 9999px;
  color: #0369a1;
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 auto 1.5rem;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Section = styled.div`
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
`;

const SectionTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

const Select = styled.select<{ $hasError?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.$hasError ? '#ef4444' : '#e5e7eb'};
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: all 200ms;
  background: ${props => props.$hasError ? '#fef2f2' : 'white'};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? '#ef4444' : '#111827'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(17, 24, 39, 0.1)'};
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
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const Checkbox = styled.input`
  width: 1rem;
  height: 1rem;
  margin-top: 0.125rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  cursor: pointer;
  flex-shrink: 0;

  &:checked {
    background-color: #111827;
    border-color: #111827;
  }
`;

const CheckboxLabel = styled.label<{ $hasError?: boolean }>`
  font-size: 0.875rem;
  color: ${props => props.$hasError ? '#ef4444' : '#374151'};
  cursor: pointer;
  user-select: none;
  line-height: 1.4;

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

const InfoBox = styled.div`
  padding: 1rem;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #0c4a6e;
  line-height: 1.5;
`;

const SubmitButton = styled(Button)`
  margin-top: 0.5rem;
`;

const LoginPrompt = styled.p`
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

const SwitchAccountType = styled.p`
  text-align: center;
  margin-top: 1rem;
  font-size: 0.875rem;
  color: #6b7280;

  a {
    color: #0369a1;
    font-weight: 600;
    text-decoration: none;
    transition: color 200ms;

    &:hover {
      color: #0284c7;
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

const categories = [
  { value: '', label: 'Select a category...' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'SPA', label: 'Spa & Wellness' },
  { value: 'WINERY', label: 'Winery' },
  { value: 'ENTERTAINMENT', label: 'Entertainment' },
  { value: 'SPORTS', label: 'Sports & Fitness' },
  { value: 'BEAUTY', label: 'Beauty & Salon' },
  { value: 'SHOPPING', label: 'Shopping & Retail' },
  { value: 'TRAVEL', label: 'Travel & Tourism' },
];

const RegisterPartnerPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, isLoading } = useAuth();
  const { t } = useLanguage();

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
        if (!value) return 'First name is required';
        if (value.length < 2) return 'First name must be at least 2 characters';
        return undefined;

      case 'lastName':
        if (!value) return 'Last name is required';
        if (value.length < 2) return 'Last name must be at least 2 characters';
        return undefined;

      case 'email': {
        if (!value) return 'Email is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return 'Invalid email address';
        return undefined;
      }

      case 'phone':
        if (!value) return 'Phone number is required for business accounts';
        if (!/^(\+359|0)[0-9\s-]{8,}$/.test(value)) {
          return 'Invalid phone number (Bulgarian format)';
        }
        return undefined;

      case 'password':
        if (!value) return 'Password is required';
        if (value.length < 6) return 'Password must be at least 6 characters';
        return undefined;

      case 'confirmPassword':
        if (!value) return 'Please confirm your password';
        if (value !== formData.password) return 'Passwords do not match';
        return undefined;

      case 'businessName':
        if (!value) return 'Business name is required';
        if (value.length < 3) return 'Business name must be at least 3 characters';
        return undefined;

      case 'businessCategory':
        if (!value) return 'Please select a business category';
        return undefined;

      case 'acceptTerms':
        if (!value) return 'You must accept the terms and conditions';
        return undefined;

      case 'confirmBusiness':
        if (!value) return 'You must confirm this is a legitimate business';
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
        ? 'Passwords do not match'
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
    <PageContainer>
      <RegisterCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Logo to="/">
          <LogoText>BoomCard</LogoText>
        </Logo>

        <Badge>
          🏢 Business Account
        </Badge>

        <Title>Create Your Partner Account</Title>
        <Subtitle>
          Join BoomCard as a partner and start offering exclusive discounts to customers
        </Subtitle>

        <Form onSubmit={handleSubmit}>
          {/* Personal Information */}
          <Section>
            <SectionTitle>
              👤 Personal Information
            </SectionTitle>

            <FormRow>
              <FormGroup>
                <Label htmlFor="firstName">
                  First Name *
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
                  Last Name *
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

            <FormRow>
              <FormGroup>
                <Label htmlFor="email">
                  Email Address *
                </Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={() => handleBlur('email')}
                  placeholder="john@business.com"
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
                  Phone Number *
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
            </FormRow>
          </Section>

          {/* Business Information */}
          <Section>
            <SectionTitle>
              🏢 Business Information
            </SectionTitle>

            <FormRow>
              <FormGroup>
                <Label htmlFor="businessName">
                  Business Name *
                </Label>
                <Input
                  id="businessName"
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                  onBlur={() => handleBlur('businessName')}
                  placeholder="Smith Restaurant"
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
                  Business Name (Bulgarian)
                </Label>
                <Input
                  id="businessNameBg"
                  type="text"
                  name="businessNameBg"
                  value={formData.businessNameBg}
                  onChange={handleChange}
                  placeholder="Ресторант Смит"
                  disabled={isLoading}
                />
              </FormGroup>
            </FormRow>

            <FormRow>
              <FormGroup>
                <Label htmlFor="businessCategory">
                  Business Category *
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
                  Tax ID / VAT Number
                </Label>
                <Input
                  id="taxId"
                  type="text"
                  name="taxId"
                  value={formData.taxId}
                  onChange={handleChange}
                  placeholder="BG123456789"
                  disabled={isLoading}
                />
              </FormGroup>
            </FormRow>

            <FormGroup>
              <Label htmlFor="website">
                Website (Optional)
              </Label>
              <Input
                id="website"
                type="url"
                name="website"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://www.yourbusiness.com"
                disabled={isLoading}
              />
            </FormGroup>
          </Section>

          {/* Security */}
          <Section>
            <SectionTitle>
              🔒 Security
            </SectionTitle>

            <FormRow>
              <FormGroup>
                <Label htmlFor="password">
                  Password *
                </Label>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={() => handleBlur('password')}
                  placeholder="At least 6 characters"
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
                  Confirm Password *
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  onBlur={() => handleBlur('confirmPassword')}
                  placeholder="Confirm your password"
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
                I agree to the <Link to="/terms">Terms and Conditions</Link> and <Link to="/privacy">Privacy Policy</Link>
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
                I confirm that this is a legitimate business and I have the authority to create this account
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
            <strong>📋 Note:</strong> Your partner account will be reviewed by our team before activation.
            This usually takes 24-48 hours. You'll receive an email notification once your account is approved.
          </InfoBox>

          <SubmitButton
            type="submit"
            variant="primary"
            size="large"
            isLoading={isLoading}
            disabled={isLoading}
          >
            Create Partner Account
          </SubmitButton>
        </Form>

        <SwitchAccountType>
          Looking for a personal account? <Link to="/register">Sign up as a customer</Link>
        </SwitchAccountType>

        <LoginPrompt>
          Already have an account? <Link to="/login">Sign In</Link>
        </LoginPrompt>
      </RegisterCard>
    </PageContainer>
  );
};

export default RegisterPartnerPage;
