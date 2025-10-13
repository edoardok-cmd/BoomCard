import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import Button from '../components/common/Button/Button';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const PageContainer = styled.div`
  max-width: 56rem;
  margin: 0 auto;
  padding: 2rem 1rem;
  min-height: calc(100vh - 4rem);
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2.25rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #6b7280;
`;

const ProfileCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 2rem;
  margin-bottom: 1.5rem;
`;

const ProfileHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 2rem;

  @media (max-width: 640px) {
    flex-direction: column;
    text-align: center;
  }
`;

const Avatar = styled.div`
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #111827 0%, #374151 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
  text-transform: uppercase;
  flex-shrink: 0;
`;

const ProfileInfo = styled.div`
  flex: 1;
`;

const UserName = styled.h2`
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.25rem;
`;

const UserEmail = styled.p`
  font-size: 1rem;
  color: #6b7280;
`;

const UserMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: #6b7280;

  @media (max-width: 640px) {
    justify-content: center;
  }
`;

const Badge = styled.span<{ $variant?: 'success' | 'warning' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${props => props.$variant === 'success' ? '#d1fae5' : '#fef3c7'};
  color: ${props => props.$variant === 'success' ? '#065f46' : '#92400e'};
`;

const SectionTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1.5rem;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;

  @media (max-width: 768px) {
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

const Input = styled.input<{ $hasError?: boolean; $disabled?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.$hasError ? '#ef4444' : '#d1d5db'};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  transition: all 200ms;
  background: ${props => props.$disabled ? '#f9fafb' : 'white'};

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? '#ef4444' : '#111827'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(17, 24, 39, 0.1)'};
  }

  &:disabled {
    cursor: not-allowed;
    color: #9ca3af;
  }
`;

const ReadOnlyValue = styled.p`
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #374151;
`;

const ErrorMessage = styled(motion.span)`
  font-size: 0.875rem;
  color: #ef4444;
`;

const ActionButtons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
  margin-top: 1.5rem;
`;

const InfoBox = styled.div<{ $variant?: 'info' | 'success' }>`
  padding: 1rem;
  background: ${props => props.$variant === 'success' ? '#d1fae5' : '#dbeafe'};
  border: 1px solid ${props => props.$variant === 'success' ? '#a7f3d0' : '#bfdbfe'};
  border-radius: 0.5rem;
  margin-top: 1.5rem;
`;

const InfoText = styled.p<{ $variant?: 'info' | 'success' }>`
  font-size: 0.875rem;
  color: ${props => props.$variant === 'success' ? '#065f46' : '#1e40af'};
  line-height: 1.5;
`;

const PasswordSection = styled.div`
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
`;

const PasswordButton = styled.button`
  font-size: 0.875rem;
  font-weight: 500;
  color: #111827;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  transition: color 200ms;

  &:hover {
    color: #6b7280;
  }
`;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface PasswordErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

const ProfilePage: React.FC = () => {
  const { user, updateProfile, changePassword, isLoading } = useAuth();
  const { language, t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
  });

  const [passwordData, setPasswordData] = useState<PasswordFormData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});

  const validateField = (field: string, value: string): string | undefined => {
    switch (field) {
      case 'firstName':
        if (!value) return t('profile.firstNameRequired');
        if (value.length < 2) return t('profile.firstNameTooShort');
        return undefined;

      case 'lastName':
        if (!value) return t('profile.lastNameRequired');
        if (value.length < 2) return t('profile.lastNameTooShort');
        return undefined;

      case 'phone':
        if (value && !/^(\+359|0)[0-9\s-]{8,}$/.test(value)) {
          return t('profile.invalidPhone');
        }
        return undefined;

      default:
        return undefined;
    }
  };

  const validatePasswordField = (field: string, value: string): string | undefined => {
    switch (field) {
      case 'currentPassword':
        if (!value) return t('profile.enterCurrentPassword');
        return undefined;

      case 'newPassword':
        if (!value) return t('profile.enterNewPassword');
        if (value.length < 6) {
          return t('profile.passwordMinLength');
        }
        return undefined;

      case 'confirmPassword':
        if (!value) return t('profile.confirmNewPasswordRequired');
        if (value !== passwordData.newPassword) {
          return t('profile.passwordsDoNotMatch');
        }
        return undefined;

      default:
        return undefined;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    const error = validateField(name, value);
    setErrors(prev => ({ ...prev, [name]: error }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));

    const error = validatePasswordField(name, value);
    setPasswordErrors(prev => ({ ...prev, [name]: error }));
  };

  const handleSave = async () => {
    // Validate all fields
    const newErrors: FormErrors = {};
    Object.keys(formData).forEach(field => {
      const error = validateField(field, formData[field as keyof typeof formData]);
      if (error) newErrors[field as keyof FormErrors] = error;
    });

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      await updateProfile(formData);
      setIsEditing(false);
      setSuccessMessage(t('profile.profileUpdatedSuccess'));
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Update profile error:', error);
    }
  };

  const handleChangePassword = async () => {
    // Validate all password fields
    const newErrors: PasswordErrors = {};
    Object.keys(passwordData).forEach(field => {
      const error = validatePasswordField(field, passwordData[field as keyof PasswordFormData]);
      if (error) newErrors[field as keyof PasswordErrors] = error;
    });

    setPasswordErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      await changePassword(passwordData.currentPassword, passwordData.newPassword);
      setShowPasswordForm(false);
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setPasswordErrors({});
      setSuccessMessage(t('profile.passwordChangedSuccess'));
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Change password error:', error);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      phone: user?.phone || '',
    });
    setErrors({});
  };

  const handleCancelPassword = () => {
    setShowPasswordForm(false);
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setPasswordErrors({});
  };

  const getUserInitials = () => {
    if (!user) return '';
    return `${user.firstName[0]}${user.lastName[0]}`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (!user) {
    return null;
  }

  return (
    <PageContainer>
      <PageHeader>
        <Title>{t('profile.title')}</Title>
        <Subtitle>
          {language === 'bg'
            ? 'Управлявайте информацията за вашия акаунт'
            : 'Manage your account information and preferences'}
        </Subtitle>
      </PageHeader>

      {/* Success Message */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <InfoBox $variant="success">
              <InfoText $variant="success">{successMessage}</InfoText>
            </InfoBox>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Header Card */}
      <ProfileCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <ProfileHeader>
          <Avatar>{getUserInitials()}</Avatar>
          <ProfileInfo>
            <UserName>{`${user.firstName} ${user.lastName}`}</UserName>
            <UserEmail>{user.email}</UserEmail>
            <UserMeta>
              <Badge $variant={user.emailVerified ? 'success' : 'warning'}>
                {user.emailVerified
                  ? (t('profile.emailVerified'))
                  : (t('profile.emailNotVerified'))}
              </Badge>
              <span>
                {t('profile.memberSince')} {formatDate(user.createdAt)}
              </span>
            </UserMeta>
          </ProfileInfo>
        </ProfileHeader>

        {/* Personal Information */}
        <SectionTitle>
          {t('profile.personalInfo')}
        </SectionTitle>

        <FormGrid>
          <FormGroup>
            <Label>{t('profile.firstName')}</Label>
            {isEditing ? (
              <>
                <Input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  $hasError={!!errors.firstName}
                  disabled={isLoading}
                />
                {errors.firstName && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.firstName}
                  </ErrorMessage>
                )}
              </>
            ) : (
              <ReadOnlyValue>{user.firstName}</ReadOnlyValue>
            )}
          </FormGroup>

          <FormGroup>
            <Label>{t('profile.lastName')}</Label>
            {isEditing ? (
              <>
                <Input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  $hasError={!!errors.lastName}
                  disabled={isLoading}
                />
                {errors.lastName && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.lastName}
                  </ErrorMessage>
                )}
              </>
            ) : (
              <ReadOnlyValue>{user.lastName}</ReadOnlyValue>
            )}
          </FormGroup>

          <FormGroup>
            <Label>{language === 'bg' ? 'Имейл адрес' : 'Email Address'}</Label>
            <ReadOnlyValue>{user.email}</ReadOnlyValue>
          </FormGroup>

          <FormGroup>
            <Label>{language === 'bg' ? 'Телефон' : 'Phone'}</Label>
            {isEditing ? (
              <>
                <Input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+359 88 123 4567"
                  $hasError={!!errors.phone}
                  disabled={isLoading}
                />
                {errors.phone && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.phone}
                  </ErrorMessage>
                )}
              </>
            ) : (
              <ReadOnlyValue>{user.phone || (language === 'bg' ? 'Не е посочен' : 'Not provided')}</ReadOnlyValue>
            )}
          </FormGroup>
        </FormGrid>

        {/* Action Buttons */}
        {isEditing ? (
          <ActionButtons>
            <Button variant="ghost" onClick={handleCancel} disabled={isLoading}>
              {language === 'bg' ? 'Отказ' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isLoading}>
              {language === 'bg' ? 'Запази промените' : 'Save Changes'}
            </Button>
          </ActionButtons>
        ) : (
          <ActionButtons>
            <Button variant="primary" onClick={() => setIsEditing(true)}>
              {language === 'bg' ? 'Редактирай профил' : 'Edit Profile'}
            </Button>
          </ActionButtons>
        )}
      </ProfileCard>

      {/* Security Card */}
      <ProfileCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <SectionTitle>{language === 'bg' ? 'Сигурност' : 'Security'}</SectionTitle>

        <InfoBox $variant="info">
          <InfoText $variant="info">
            {language === 'bg'
              ? 'Сменяйте паролата си редовно, за да поддържате акаунта си в безопасност.'
              : 'Change your password regularly to keep your account secure.'}
          </InfoText>
        </InfoBox>

        <PasswordSection>
          {!showPasswordForm ? (
            <div>
              <PasswordButton onClick={() => setShowPasswordForm(true)}>
                {language === 'bg' ? 'Смяна на паролата' : 'Change Password'}
              </PasswordButton>
            </div>
          ) : (
            <>
              <FormGrid>
                <FormGroup>
                  <Label>{language === 'bg' ? 'Текуща парола' : 'Current Password'}</Label>
                  <Input
                    type="password"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    $hasError={!!passwordErrors.currentPassword}
                    disabled={isLoading}
                  />
                  {passwordErrors.currentPassword && (
                    <ErrorMessage
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {passwordErrors.currentPassword}
                    </ErrorMessage>
                  )}
                </FormGroup>

                <div />

                <FormGroup>
                  <Label>{language === 'bg' ? 'Нова парола' : 'New Password'}</Label>
                  <Input
                    type="password"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    $hasError={!!passwordErrors.newPassword}
                    disabled={isLoading}
                  />
                  {passwordErrors.newPassword && (
                    <ErrorMessage
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {passwordErrors.newPassword}
                    </ErrorMessage>
                  )}
                </FormGroup>

                <FormGroup>
                  <Label>{language === 'bg' ? 'Потвърди нова парола' : 'Confirm New Password'}</Label>
                  <Input
                    type="password"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    $hasError={!!passwordErrors.confirmPassword}
                    disabled={isLoading}
                  />
                  {passwordErrors.confirmPassword && (
                    <ErrorMessage
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {passwordErrors.confirmPassword}
                    </ErrorMessage>
                  )}
                </FormGroup>
              </FormGrid>

              <ActionButtons>
                <Button variant="ghost" onClick={handleCancelPassword} disabled={isLoading}>
                  {language === 'bg' ? 'Отказ' : 'Cancel'}
                </Button>
                <Button variant="primary" onClick={handleChangePassword} isLoading={isLoading}>
                  {language === 'bg' ? 'Смени паролата' : 'Change Password'}
                </Button>
              </ActionButtons>
            </>
          )}
        </PasswordSection>
      </ProfileCard>
    </PageContainer>
  );
};

export default ProfilePage;
