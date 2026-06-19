import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import Button from '../components/common/Button/Button';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { normalizePhone } from '../utils/validators';
import Header from '../components/layout/Header/Header';
import VenueLocationPicker, { type Coordinates } from '../components/common/VenueLocationPicker/VenueLocationPicker';
import { placesCategories, experiencesCategories, findCategory } from '../types/categories.types';

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

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
`;

const SvgIcon = styled.svg`
  width: 100%;
  height: 100%;
  color: var(--color-text-primary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
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
  border: 1px solid ${props => props.$hasError ? 'var(--color-error)' : '#cbd5e1'};
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
    border-color: ${props => props.$hasError ? 'var(--color-error)' : '#64748b'};
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.$hasError ? 'var(--color-error)' : '#cbd5e1'};
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
    border-color: ${props => props.$hasError ? 'var(--color-error)' : '#64748b'};
  }
`;

const ErrorMessage = styled(motion.span)`
  font-size: 0.875rem;
  color: var(--color-error);
  margin-top: 0.25rem;
  transition: color var(--transition-normal);
`;

const SubcategoryGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const SubcategoryChip = styled.button<{ $selected?: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  border: 1px solid ${props => props.$selected ? 'var(--color-primary)' : 'var(--color-border)'};
  background: ${props => props.$selected ? 'var(--color-primary)' : 'transparent'};
  color: ${props => props.$selected ? '#fff' : 'var(--color-text-primary)'};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover:not(:disabled) {
    border-color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SubcategoryHelp = styled.p`
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin: 0.5rem 0 0;
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

const Textarea = styled.textarea<{ $hasError?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.$hasError ? 'var(--color-error)' : '#cbd5e1'};
  border-radius: 0.5rem;
  font-size: 1rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: all var(--transition-normal);
  resize: vertical;
  min-height: 6rem;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? 'var(--color-error)' : 'var(--color-primary)'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'};
  }

  &::placeholder {
    color: var(--color-text-tertiary);
  }

  [data-theme="dark"] & {
    background: var(--color-background-tertiary);
    border-color: ${props => props.$hasError ? 'var(--color-error)' : '#64748b'};
  }
`;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  businessName?: string;
  businessCategory?: string;
  city?: string;
  address?: string;
  // BC-PARTNER-FU1 — venue coordinates are required so the venue is redeemable.
  // Offer redemption fails closed server-side when lat/long are missing.
  coordinates?: string;
  // Spec §5.1 v1.1 — Брой обекти dropdown is required at submit time.
  requestObjectCount?: string;
  // Spec §2.3 — Ниво на участие (required)
  participationLevel?: string;
  // Spec §2.3 — TWO separate required consent checkboxes
  acceptTerms?: string;
  acceptPrivacy?: string;
  // confirmBusiness is not in spec §2.3 (B5 fix, r2x) — no error entry needed
}

// Spec §5.1 v1.1 — declared venue count buckets. Must stay in sync with the
// backend whitelist in auth.service.ts.
const ALLOWED_OBJECT_COUNTS = ['1', '2-5', '6-10', '11+'] as const;

// LOW fix (review r2x S1): whitelist the three valid participation levels so
// a tampered form submission cannot send an arbitrary string to the backend.
// Must stay in sync with the select options rendered in the form below.
const ALLOWED_PARTICIPATION_LEVELS = ['basic', 'active', 'growth'] as const;

const RegisterPartnerPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, isLoading } = useAuth();
  const { t, language } = useLanguage();

  const categories = [
    { value: '', label: t('partnerRegistration.selectCategory') },
    ...[...placesCategories, ...experiencesCategories].map(cat => ({
      value: cat.id,
      label: cat.name[language as 'en' | 'bg'] ?? cat.name.bg,
    })),
  ];

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    businessName: '',
    businessNameBg: '',
    businessCategory: '',
    taxId: '',
    website: '',
    city: '',
    address: '',
    // Spec §5.1 v1.1 — Брой обекти dropdown
    requestObjectCount: '',
    // Spec §2.3 — Ниво на участие (required)
    participationLevel: '',
    // Spec §2.3 — Свободен текст (optional)
    additionalInfo: '',
    // Spec §2.3 — TWO separate required consent checkboxes
    acceptTerms: false,
    acceptPrivacy: false,
    // Spec §2.3 — Маркетингов консент (optional)
    marketingConsent: false,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  // BC-PARTNER-FU1 — resolved venue coordinates (null until the partner geocodes
  // the address or drops a pin). Submitted as latitude/longitude numbers.
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);

  // Validate coordinates: both present and within geographic bounds.
  const validateCoordinates = (coords: Coordinates | null): string | undefined => {
    if (!coords) {
      return language === 'bg'
        ? 'Намерете обекта на картата (натиснете „Намери на картата“)'
        : 'Please locate the venue on the map (press "Find on map")';
    }
    const { latitude, longitude } = coords;
    if (
      typeof latitude !== 'number' || !Number.isFinite(latitude) ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    ) {
      return language === 'bg' ? 'Невалидни координати' : 'Invalid coordinates';
    }
    return undefined;
  };

  const handleCoordinatesChange = (coords: Coordinates) => {
    setCoordinates(coords);
    if (touched.coordinates) {
      setErrors(prev => ({ ...prev, coordinates: validateCoordinates(coords) }));
    }
  };

  const subcategoriesForCategory = formData.businessCategory
    ? findCategory(formData.businessCategory)?.subcategories ?? []
    : [];

  const toggleSubcategory = (id: string) => {
    setSelectedSubcategories(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const validateField = (field: string, value: unknown): string | undefined => {
    const strVal = typeof value === 'string' ? value : '';
    switch (field) {
      case 'firstName':
        if (!value) return t('partnerRegistration.firstNameRequired');
        if (strVal.length < 2) return t('partnerRegistration.firstNameMinLength');
        return undefined;

      case 'lastName':
        if (!value) return t('partnerRegistration.lastNameRequired');
        if (strVal.length < 2) return t('partnerRegistration.lastNameMinLength');
        return undefined;

      case 'email': {
        if (!value) return t('partnerRegistration.emailRequired');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(strVal)) return t('partnerRegistration.emailInvalid');
        return undefined;
      }

      case 'phone': {
        if (!value) return t('partnerRegistration.phoneRequired');
        // HIGH fix (re-audit): the backend (auth.validator.ts PHONE_REGEX) accepts
        // ONLY Bulgarian numbers — /^(\+359|0)\d{9}$/ — after stripping spaces and
        // dashes. The previous loosened E.164 regex let international numbers (e.g.
        // +14155550100) pass every FE check, then fail with a generic backend 400
        // the user could not self-diagnose. Mirror the backend exactly: normalize
        // with the same helper used on the submitted value (strips spaces/dashes),
        // then require the BG format the backend enforces.
        const normalizedPhone = normalizePhone(strVal);
        if (!/^(\+359|0)\d{9}$/.test(normalizedPhone)) {
          return t('partnerRegistration.phoneInvalid');
        }
        return undefined;
      }

      case 'businessName':
        if (!value) return t('partnerRegistration.businessNameRequired');
        if (strVal.length < 3) return t('partnerRegistration.businessNameMinLength');
        return undefined;

      case 'businessCategory':
        if (!value) return t('partnerRegistration.businessCategoryRequired');
        return undefined;

      case 'city':
        if (!value) return t('partnerRegistration.cityRequired');
        return undefined;

      case 'address':
        if (!value) return t('partnerRegistration.addressRequired');
        return undefined;

      case 'requestObjectCount':
        if (!value) {
          return language === 'bg' ? 'Изберете брой обекти' : 'Please select the number of venues';
        }
        if (!(ALLOWED_OBJECT_COUNTS as readonly string[]).includes(strVal)) {
          return language === 'bg' ? 'Невалидна стойност' : 'Invalid value';
        }
        return undefined;

      // Spec §2.3 — Ниво на участие (required)
      case 'participationLevel':
        if (!value) {
          return language === 'bg' ? 'Изберете ниво на участие' : 'Please select a participation level';
        }
        // LOW fix (review r2x S1): whitelist against canonical values to prevent
        // tampered form submissions from sending arbitrary strings to the backend.
        if (!(ALLOWED_PARTICIPATION_LEVELS as readonly string[]).includes(strVal)) {
          return language === 'bg' ? 'Невалидна стойност' : 'Invalid value';
        }
        return undefined;

      case 'acceptTerms':
        if (!value) return t('partnerRegistration.acceptTermsRequired');
        return undefined;

      // Spec §2.3 — Privacy Policy is a SEPARATE required consent from Terms
      case 'acceptPrivacy':
        if (!value) {
          return language === 'bg'
            ? 'Трябва да приемете Политиката за поверителност'
            : 'You must accept the Privacy Policy';
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    const newValue = type === 'checkbox' ? checked : value;

    setFormData(prev => ({ ...prev, [name]: newValue }));

    // Reset selected subcategories when the main category changes — subs are
    // scoped to a single parent category.
    if (name === 'businessCategory') {
      setSelectedSubcategories([]);
    }

    // Real-time validation for touched fields
    if (touched[name]) {
      const error = validateField(name, newValue);
      setErrors(prev => ({ ...prev, [name]: error }));
    }

  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const newErrors: FormErrors = {};
    const requiredFields = [
      'firstName', 'lastName', 'email', 'phone',
      'businessName', 'businessCategory', 'city', 'address',
      'requestObjectCount',
      // Spec §2.3 — Ниво на участие is required
      'participationLevel',
      // Spec §2.3 — both Terms and Privacy Policy consents are individually required.
      // confirmBusiness is NOT in the spec and has been removed from the form (MEDIUM-3 fix, r2x).
      'acceptTerms', 'acceptPrivacy',
    ];

    requiredFields.forEach(field => {
      const error = validateField(field, formData[field as keyof typeof formData]);
      if (error) newErrors[field as keyof FormErrors] = error;
    });

    // Spec §2.3 — Подкатегория is required when the selected category exposes
    // sub-options.
    if (subcategoriesForCategory.length > 0 && selectedSubcategories.length === 0) {
      newErrors.businessCategory = language === 'bg'
        ? 'Изберете поне една подкатегория'
        : 'Please select at least one subcategory';
    }

    // BC-PARTNER-FU1 — venue coordinates are required (offer redemption fails
    // closed without them). Validate bounds before submit.
    const coordError = validateCoordinates(coordinates);
    if (coordError) newErrors.coordinates = coordError;

    setErrors(newErrors);

    const newTouched: Record<string, boolean> = {};
    requiredFields.forEach(field => {
      newTouched[field] = true;
    });
    newTouched.coordinates = true;
    setTouched(newTouched);

    // If there are errors, don't submit
    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      // RegisterData now includes acceptPrivacy, participationLevel,
      // additionalInfo, and marketingConsent — the `as any` cast is no longer
      // needed (H1 fix from r2x).
      await register({
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone ? normalizePhone(formData.phone) : undefined,
        acceptTerms: formData.acceptTerms,
        // Spec §2.3 — separate required privacy policy consent
        acceptPrivacy: formData.acceptPrivacy,
        accountType: 'partner',
        businessInfo: {
          businessName: formData.businessName,
          businessNameBg: formData.businessNameBg || undefined,
          businessCategory: formData.businessCategory,
          businessSubcategories: selectedSubcategories.length > 0 ? selectedSubcategories : undefined,
          taxId: formData.taxId || undefined,
          website: formData.website || undefined,
          city: formData.city.trim() || undefined,
          address: formData.address.trim() || undefined,
          // BC-PARTNER-FU1 — required venue coordinates (numbers). Backend onboard
          // requires these so the created venue is redeemable.
          latitude: coordinates ? coordinates.latitude : undefined,
          longitude: coordinates ? coordinates.longitude : undefined,
          requestObjectCount: formData.requestObjectCount || undefined,
          // Spec §2.3 — Ниво на участие (required)
          participationLevel: formData.participationLevel || undefined,
          additionalInfo: formData.additionalInfo?.trim() || undefined,
          marketingConsent: formData.marketingConsent,
        },
      });

      // Partner accounts are created PENDING and don't get tokens — send the
      // applicant to /login so they can come back after approval. The pending
      // toast is shown by AuthContext.register.
      navigate('/login', { replace: true });
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

          <Title>{t('partnerRegistration.title')}</Title>
          <Subtitle>
            {t('partnerRegistration.subtitle')}
          </Subtitle>

        <Form onSubmit={handleSubmit}>
          {/* Personal Information */}
          <Section>
            <SectionTitle>
              <IconWrapper>
                <SvgIcon viewBox="0 0 24 24" fill="none">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor"/>
                  <circle cx="12" cy="7" r="4" stroke="currentColor"/>
                </SvgIcon>
              </IconWrapper>
              {t('partnerRegistration.personalInfo')}
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
              <IconWrapper>
                <SvgIcon viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor"/>
                  <path d="M3 9h18" stroke="currentColor"/>
                  <path d="M9 3v18" stroke="currentColor"/>
                </SvgIcon>
              </IconWrapper>
              {t('partnerRegistration.businessInfo')}
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

            {subcategoriesForCategory.length > 0 && (
              <FormGroup>
                <Label as="span">
                  {t('partnerRegistration.businessSubcategoriesLabel')}
                </Label>
                <SubcategoryGroup>
                  {subcategoriesForCategory.map(sub => (
                    <SubcategoryChip
                      key={sub.id}
                      type="button"
                      $selected={selectedSubcategories.includes(sub.id)}
                      onClick={() => toggleSubcategory(sub.id)}
                      disabled={isLoading}
                    >
                      {sub.name[language as 'en' | 'bg'] ?? sub.name.bg}
                    </SubcategoryChip>
                  ))}
                </SubcategoryGroup>
                <SubcategoryHelp>
                  {t('partnerRegistration.businessSubcategoriesHelp')}
                </SubcategoryHelp>
              </FormGroup>
            )}

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

            <FormRow>
              <FormGroup>
                <Label htmlFor="city">
                  {t('partnerRegistration.city')} *
                </Label>
                <Input
                  id="city"
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  onBlur={() => handleBlur('city')}
                  placeholder={t('partnerRegistration.cityPlaceholder')}
                  $hasError={touched.city && !!errors.city}
                  disabled={isLoading}
                />
                {touched.city && errors.city && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.city}
                  </ErrorMessage>
                )}
              </FormGroup>

              <FormGroup>
                <Label htmlFor="address">
                  {t('partnerRegistration.address')} *
                </Label>
                <Input
                  id="address"
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  onBlur={() => handleBlur('address')}
                  placeholder={t('partnerRegistration.addressPlaceholder')}
                  $hasError={touched.address && !!errors.address}
                  disabled={isLoading}
                />
                {touched.address && errors.address && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.address}
                  </ErrorMessage>
                )}
              </FormGroup>
            </FormRow>

            {/* BC-PARTNER-FU1 — venue geolocation. Required so the venue is
                redeemable (offer redemption fails closed without lat/long). */}
            <FormGroup>
              <Label as="span">
                {language === 'bg' ? 'Местоположение на обекта' : 'Venue location'} *
              </Label>
              <VenueLocationPicker
                address={formData.address}
                city={formData.city}
                value={coordinates}
                onChange={handleCoordinatesChange}
                disabled={isLoading}
              />
              {touched.coordinates && errors.coordinates && (
                <ErrorMessage
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {errors.coordinates}
                </ErrorMessage>
              )}
            </FormGroup>

            {/* Spec §5.1 v1.1 — Брой обекти / Number of venues */}
            <FormGroup>
              <Label htmlFor="requestObjectCount">
                {language === 'bg' ? 'Брой обекти' : 'Number of venues'} *
              </Label>
              <Select
                id="requestObjectCount"
                name="requestObjectCount"
                value={formData.requestObjectCount}
                onChange={handleChange}
                onBlur={() => handleBlur('requestObjectCount')}
                $hasError={touched.requestObjectCount && !!errors.requestObjectCount}
                disabled={isLoading}
              >
                <option value="">
                  {language === 'bg' ? '— Изберете —' : '— Select —'}
                </option>
                <option value="1">1</option>
                <option value="2-5">2-5</option>
                <option value="6-10">6-10</option>
                <option value="11+">11+</option>
              </Select>
              {touched.requestObjectCount && errors.requestObjectCount && (
                <ErrorMessage
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {errors.requestObjectCount}
                </ErrorMessage>
              )}
            </FormGroup>
          </Section>

          {/* Spec §2.3 — Ниво на участие (required) */}
          <Section>
            <SectionTitle>
              <IconWrapper>
                <SvgIcon viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor"/>
                  <circle cx="12" cy="12" r="5" stroke="currentColor"/>
                  <circle cx="12" cy="12" r="1" fill="currentColor"/>
                </SvgIcon>
              </IconWrapper>
              {language === 'bg' ? 'Квалификация' : 'Qualification'}
            </SectionTitle>
            <FormGroup>
              <Label htmlFor="participationLevel">
                {language === 'bg' ? 'Ниво на участие' : 'Participation level'} *
              </Label>
              <Select
                id="participationLevel"
                name="participationLevel"
                value={formData.participationLevel}
                onChange={handleChange}
                onBlur={() => handleBlur('participationLevel')}
                $hasError={touched.participationLevel && !!errors.participationLevel}
                disabled={isLoading}
              >
                <option value="">{language === 'bg' ? '— Изберете —' : '— Select —'}</option>
                {/* Spec §2.3 canonical Bulgarian labels */}
                <option value="basic">{language === 'bg' ? 'Базово участие' : 'Basic participation'}</option>
                <option value="active">{language === 'bg' ? 'Активно участие' : 'Active participation'}</option>
                <option value="growth">{language === 'bg' ? 'Силен растеж' : 'Strong growth'}</option>
              </Select>
              {touched.participationLevel && errors.participationLevel && (
                <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                  {errors.participationLevel}
                </ErrorMessage>
              )}
            </FormGroup>
          </Section>

          {/* Spec §2.3 — Допълнително: Свободен текст (optional) */}
          <Section>
            <SectionTitle>
              <IconWrapper>
                <SvgIcon viewBox="0 0 24 24" fill="none">
                  <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" stroke="currentColor"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" fill="none"/>
                </SvgIcon>
              </IconWrapper>
              {language === 'bg' ? 'Допълнително' : 'Additional information'}
            </SectionTitle>
            <FormGroup>
              <Label htmlFor="additionalInfo">
                {language === 'bg' ? 'Допълнителна информация (по избор)' : 'Additional information (optional)'}
              </Label>
              <Textarea
                id="additionalInfo"
                name="additionalInfo"
                value={formData.additionalInfo}
                onChange={handleChange}
                placeholder={language === 'bg' ? 'Допълнителни бележки или контекст...' : 'Additional notes or context...'}
                disabled={isLoading}
              />
            </FormGroup>
          </Section>

          {/* Spec §2.3 — "Общи условия": Terms consent (required, separate from Privacy) */}
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
                {language === 'bg'
                  ? <><Link to="/terms">Общи условия</Link> — прочетох и приемам *</>
                  : <>I have read and accept the <Link to="/terms">Terms and Conditions</Link> *</>
                }
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

          {/* Spec §2.3 — "Политика за поверителност": Privacy Policy consent (required, separate from Terms) */}
          <div>
            <CheckboxGroup>
              <Checkbox
                id="acceptPrivacy"
                type="checkbox"
                name="acceptPrivacy"
                checked={formData.acceptPrivacy}
                onChange={handleChange}
                disabled={isLoading}
              />
              <CheckboxLabel
                htmlFor="acceptPrivacy"
                $hasError={touched.acceptPrivacy && !!errors.acceptPrivacy}
              >
                {language === 'bg'
                  ? <><Link to="/privacy">Политика за поверителност</Link> — прочетох и приемам *</>
                  : <>I have read and accept the <Link to="/privacy">Privacy Policy</Link> *</>
                }
              </CheckboxLabel>
            </CheckboxGroup>
            {touched.acceptPrivacy && errors.acceptPrivacy && (
              <ErrorMessage
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errors.acceptPrivacy}
              </ErrorMessage>
            )}
          </div>

          {/* Spec §2.3 — Маркетингов консент (optional) */}
          <div>
            <CheckboxGroup>
              <Checkbox
                id="marketingConsent"
                type="checkbox"
                name="marketingConsent"
                checked={formData.marketingConsent}
                onChange={handleChange}
                disabled={isLoading}
              />
              <CheckboxLabel htmlFor="marketingConsent">
                {language === 'bg'
                  ? 'Съгласявам се да получавам маркетингови съобщения (по избор)'
                  : 'I agree to receive marketing communications (optional)'}
              </CheckboxLabel>
            </CheckboxGroup>
          </div>

          {/* MEDIUM-3 fix (review r2x): confirmBusiness removed entirely.
              Spec §2.3 defines exactly three consent items: Terms (required),
              Privacy Policy (required), Marketing (optional). A fourth unexplained
              checkbox in the legal section creates compliance ambiguity — it is
              unclear what was agreed to at the time of application. The field was
              already dropped at the API call layer; it is now removed from the UI
              as well. A new product spec with exact wording and legal review is
              required before any business-confirmation acknowledgement is re-added. */}

          <InfoBox>
            <strong>
              <IconWrapper style={{ display: 'inline-flex', marginRight: '0.5rem', verticalAlign: 'text-bottom' }}>
                <SvgIcon viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor"/>
                  <path d="M7 9h10" stroke="currentColor"/>
                  <path d="M7 13h10" stroke="currentColor"/>
                  <path d="M7 17h4" stroke="currentColor"/>
                </SvgIcon>
              </IconWrapper>
              {t('partnerRegistration.note')}
            </strong>{' '}
            {language === 'bg'
              ? 'След изпращане на заявката, нашият екип ще се свърже с вас до 2 работни дни. При одобрение и завършен онбординг ще получите имейл с линк за активиране на акаунта и задаване на парола.'
              : 'After submitting your application, our team will contact you within 2 business days. Once approved and onboarding is complete, you will receive an email with an activation link to set your password.'}
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

        <LoginPrompt>
          {t('partnerRegistration.alreadyHaveAccount')} <Link to="/login">{t('partnerRegistration.signIn')}</Link>
        </LoginPrompt>
      </RegisterCard>
    </PageContainer>
    </PageWrapper>
  );
};

export default RegisterPartnerPage;
