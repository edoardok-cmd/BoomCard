import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import Button from '../components/common/Button/Button';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { normalizePhone } from '../utils/validators';

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
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
`;

const ProfileCard = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1rem;
  box-shadow: var(--shadow-soft);
  padding: 2rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--color-border);
  transition: background-color 0.3s ease, border-color 0.3s ease;
`;

const DangerCard = styled(ProfileCard)`
  border-color: var(--color-error, #ef4444);
`;

const DangerOutlineButton = styled(Button)`
  border-color: var(--color-error, #ef4444) !important;
  color: var(--color-error, #ef4444) !important;
  flex-shrink: 0;
`;

const DeleteConfirmButton = styled(Button)`
  background: var(--color-error, #ef4444) !important;
  border-color: var(--color-error, #ef4444) !important;
  color: #fff !important;
`;

const ProfileHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 2rem;

  @media (max-width: 640px) {
    flex-direction: column;
    text-align: center;
  }
`;

const AvatarWrapper = styled.div`
  position: relative;
  width: 6rem;
  height: 6rem;
  flex-shrink: 0;
  cursor: pointer;

  &:hover > div {
    opacity: 1;
  }
`;

const AvatarInitials = styled.div`
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-text-primary) 0%, var(--color-text-secondary) 100%);
  color: var(--color-background);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
  text-transform: uppercase;
`;

const AvatarPhoto = styled.img`
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  object-fit: cover;
  display: block;
`;

const AvatarOverlay = styled.div`
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 600;
  text-align: center;
  opacity: 0;
  transition: opacity 150ms;
  pointer-events: none;
  line-height: 1.2;
`;

const RemoveAvatarButton = styled.button`
  position: absolute;
  top: -4px;
  right: -4px;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: var(--color-error, #ef4444);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 1;

  &:hover {
    background: #dc2626;
  }
`;

const ProfileInfo = styled.div`
  flex: 1;
`;

const UserName = styled.h2`
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
`;

const UserEmail = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
`;

const UserMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);

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
  color: var(--color-text-primary);
  margin-bottom: 1.5rem;
`;

const DangerTitle = styled(SectionTitle)`
  color: var(--color-error, #ef4444);
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
  color: var(--color-text-secondary);
`;

const Input = styled.input<{ $hasError?: boolean; $disabled?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.$hasError ? 'var(--color-error)' : 'var(--color-border)'};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  transition: all 200ms;
  background: ${props => props.$disabled ? 'var(--color-background-secondary)' : 'var(--color-background)'};
  color: var(--color-text-primary);

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? 'var(--color-error)' : 'var(--color-text-primary)'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
  }

  &:disabled {
    cursor: not-allowed;
    color: var(--color-text-tertiary);
  }

  [data-theme="dark"] &:focus {
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
  }
`;

const ReadOnlyValue = styled.p`
  padding: 0.75rem 1rem;
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: var(--color-text-primary);
`;

const ErrorMessage = styled(motion.span)`
  font-size: 0.875rem;
  color: var(--color-error);
`;

const ActionButtons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border);
  margin-top: 1.5rem;
`;

const InfoBox = styled.div<{ $variant?: 'info' | 'success' | 'warning' }>`
  padding: 1rem;
  background: ${props =>
    props.$variant === 'success' ? '#d1fae5' :
    props.$variant === 'warning' ? '#fef3c7' :
    '#dbeafe'};
  border: 1px solid ${props =>
    props.$variant === 'success' ? '#a7f3d0' :
    props.$variant === 'warning' ? '#fde68a' :
    '#bfdbfe'};
  border-radius: 0.5rem;
  margin-top: 1.5rem;
`;

const InfoText = styled.p<{ $variant?: 'info' | 'success' | 'warning' }>`
  font-size: 0.875rem;
  color: ${props =>
    props.$variant === 'success' ? '#065f46' :
    props.$variant === 'warning' ? '#92400e' :
    '#1e40af'};
  line-height: 1.5;
`;

const PasswordSection = styled.div`
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border);
`;

const PasswordButton = styled.button`
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  transition: color 200ms;

  &:hover {
    color: var(--color-text-secondary);
  }
`;

const EmailChangeSection = styled.div`
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border);
`;

const DangerZoneRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const DangerZoneDesc = styled.p`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
`;

const ModalBackdrop = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

const ModalBox = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2rem;
  width: 100%;
  max-width: 28rem;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
`;

const ModalTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-error, #ef4444);
  margin-bottom: 1rem;
`;

const ModalText = styled.p`
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin-bottom: 1.5rem;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
`;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  city?: string;
  country?: string;
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
  const { user, updateProfile, changePassword, requestEmailChange, confirmEmailChange, deleteAccount, uploadAvatar, removeAvatar, isLoading } = useAuth();
  const { language, t } = useLanguage();

  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Email change flow state
  const [emailChangeStep, setEmailChangeStep] = useState<'idle' | 'request' | 'verify'>('idle');
  const [newEmail, setNewEmail] = useState('');
  const [newEmailError, setNewEmailError] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyCodeError, setVerifyCodeError] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyPasswordError, setVerifyPasswordError] = useState('');
  const [pendingNewEmail, setPendingNewEmail] = useState('');
  const [isEmailChanging, setIsEmailChanging] = useState(false);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    city: user?.city || '',
    country: user?.country || '',
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
        if (value.length < 8) return t('profile.passwordMinLength');
        return undefined;
      case 'confirmPassword':
        if (!value) return t('profile.confirmNewPasswordRequired');
        if (value !== passwordData.newPassword) return t('profile.passwordsDoNotMatch');
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
    const newErrors: FormErrors = {};
    ['firstName', 'lastName', 'phone'].forEach(field => {
      const error = validateField(field, formData[field as keyof typeof formData]);
      if (error) newErrors[field as keyof FormErrors] = error;
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      await updateProfile({
        ...formData,
        phone: formData.phone ? normalizePhone(formData.phone) : '',
        city: formData.city || undefined,
        country: formData.country || undefined,
      });
      setIsEditing(false);
      setSuccessMessage(t('profile.profileUpdatedSuccess'));
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Update profile error:', error);
    }
  };

  const handleChangePassword = async () => {
    const newErrors: PasswordErrors = {};
    Object.keys(passwordData).forEach(field => {
      const error = validatePasswordField(field, passwordData[field as keyof PasswordFormData]);
      if (error) newErrors[field as keyof PasswordErrors] = error;
    });
    setPasswordErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      await changePassword(passwordData.currentPassword, passwordData.newPassword);
      setShowPasswordForm(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
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
      city: user?.city || '',
      country: user?.country || '',
    });
    setErrors({});
  };

  const handleCancelPassword = () => {
    setShowPasswordForm(false);
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordErrors({});
  };

  const handleAvatarClick = () => avatarInputRef.current?.click();

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(file);
      setSuccessMessage(t('profile.avatarUpdated'));
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch {
      // toast shown by context
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUploadingAvatar(true);
    try {
      await removeAvatar();
      setSuccessMessage(t('profile.avatarRemoved'));
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch {
      // toast shown by context
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Email change handlers
  const handleRequestEmailChange = async () => {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setNewEmailError('Въведете валиден имейл адрес');
      return;
    }
    setNewEmailError('');
    setIsEmailChanging(true);
    try {
      await requestEmailChange(newEmail);
      setPendingNewEmail(newEmail);
      setEmailChangeStep('verify');
    } catch {
      // toast shown by context
    } finally {
      setIsEmailChanging(false);
    }
  };

  const handleConfirmEmailChange = async () => {
    let hasError = false;
    if (!verifyCode || verifyCode.length !== 6) {
      setVerifyCodeError('Въведете 6-символния код');
      hasError = true;
    } else {
      setVerifyCodeError('');
    }
    if (!verifyPassword) {
      setVerifyPasswordError(t('profile.enterCurrentPassword'));
      hasError = true;
    } else {
      setVerifyPasswordError('');
    }
    if (hasError) return;

    setIsEmailChanging(true);
    try {
      await confirmEmailChange(verifyCode, verifyPassword);
      setEmailChangeStep('idle');
      setNewEmail('');
      setVerifyCode('');
      setVerifyPassword('');
      setPendingNewEmail('');
      setSuccessMessage(t('profile.emailChangedSuccess'));
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch {
      // toast shown by context
    } finally {
      setIsEmailChanging(false);
    }
  };

  const handleCancelEmailChange = () => {
    setEmailChangeStep('idle');
    setNewEmail('');
    setNewEmailError('');
    setVerifyCode('');
    setVerifyCodeError('');
    setVerifyPassword('');
    setVerifyPasswordError('');
    setPendingNewEmail('');
  };

  // Delete account handlers
  const handleOpenDeleteModal = () => {
    setDeletePassword('');
    setDeletePasswordError('');
    setShowDeleteModal(true);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeletePasswordError(t('profile.enterCurrentPassword'));
      return;
    }
    setDeletePasswordError('');
    setIsDeleting(true);
    try {
      await deleteAccount(deletePassword);
      // context clears auth state; router will redirect via ProtectedRoute
    } catch {
      // toast shown by context
      setIsDeleting(false);
    }
  };

  const getUserInitials = () => {
    if (!user) return '';
    const first = user.firstName?.[0] || '';
    const last = user.lastName?.[0] || '';
    if (first || last) return `${first}${last}`.toUpperCase();
    return user.email?.[0]?.toUpperCase() || '?';
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (!user) return null;

  return (
    <PageContainer>
      <PageHeader>
        <Title>{t('profile.title')}</Title>
        <Subtitle>{t('profile.subtitle')}</Subtitle>
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
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarFileChange}
          />
          <AvatarWrapper onClick={handleAvatarClick} title={t('profile.changePhoto')}>
            {user.avatar ? (
              <AvatarPhoto src={user.avatar} alt={`${user.firstName} ${user.lastName}`} />
            ) : (
              <AvatarInitials>{getUserInitials()}</AvatarInitials>
            )}
            <AvatarOverlay>
              {isUploadingAvatar ? t('profile.uploading') : t('profile.changePhoto')}
            </AvatarOverlay>
            {user.avatar && !isUploadingAvatar && (
              <RemoveAvatarButton onClick={handleRemoveAvatar} title={t('profile.removePhoto')}>
                ×
              </RemoveAvatarButton>
            )}
          </AvatarWrapper>
          <ProfileInfo>
            <UserName>{`${user.firstName} ${user.lastName}`.trim() || user.email}</UserName>
            <UserEmail>{user.email}</UserEmail>
            <UserMeta>
              <Badge $variant={user.emailVerified ? 'success' : 'warning'}>
                {user.emailVerified ? t('profile.emailVerified') : t('profile.emailNotVerified')}
              </Badge>
              <span>
                {t('profile.memberSince')} {formatDate(user.createdAt)}
              </span>
            </UserMeta>
          </ProfileInfo>
        </ProfileHeader>

        {/* Personal Information */}
        <SectionTitle>{t('profile.personalInfo')}</SectionTitle>

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
                  <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
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
                  <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                    {errors.lastName}
                  </ErrorMessage>
                )}
              </>
            ) : (
              <ReadOnlyValue>{user.lastName}</ReadOnlyValue>
            )}
          </FormGroup>

          <FormGroup>
            <Label>{t('profile.emailAddress')}</Label>
            <ReadOnlyValue>{user.email}</ReadOnlyValue>
          </FormGroup>

          <FormGroup>
            <Label>{t('profile.phoneLabel')}</Label>
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
                  <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                    {errors.phone}
                  </ErrorMessage>
                )}
              </>
            ) : (
              <ReadOnlyValue>{user.phone || t('profile.notProvided')}</ReadOnlyValue>
            )}
          </FormGroup>

          <FormGroup>
            <Label>{t('profile.city')}</Label>
            {isEditing ? (
              <Input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                $hasError={!!errors.city}
                disabled={isLoading}
              />
            ) : (
              <ReadOnlyValue>{user.city || t('profile.notProvided')}</ReadOnlyValue>
            )}
          </FormGroup>

          <FormGroup>
            <Label>{t('profile.country')}</Label>
            {isEditing ? (
              <Input
                type="text"
                name="country"
                value={formData.country}
                onChange={handleChange}
                $hasError={!!errors.country}
                disabled={isLoading}
              />
            ) : (
              <ReadOnlyValue>{user.country || t('profile.notProvided')}</ReadOnlyValue>
            )}
          </FormGroup>
        </FormGrid>

        {/* Action Buttons */}
        {isEditing ? (
          <ActionButtons>
            <Button variant="ghost" onClick={handleCancel} disabled={isLoading}>
              {t('profile.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isLoading}>
              {t('profile.saveChanges')}
            </Button>
          </ActionButtons>
        ) : (
          <ActionButtons>
            <Button variant="primary" onClick={() => setIsEditing(true)}>
              {t('profile.editProfile')}
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
        <SectionTitle>{t('profile.security')}</SectionTitle>

        <InfoBox $variant="info">
          <InfoText $variant="info">{t('profile.securityInfo')}</InfoText>
        </InfoBox>

        {/* Change Password */}
        <PasswordSection>
          {!showPasswordForm ? (
            <PasswordButton onClick={() => setShowPasswordForm(true)}>
              {t('profile.changePassword')}
            </PasswordButton>
          ) : (
            <>
              <FormGrid>
                <FormGroup>
                  <Label>{t('profile.currentPassword')}</Label>
                  <Input
                    type="password"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    $hasError={!!passwordErrors.currentPassword}
                    disabled={isLoading}
                  />
                  {passwordErrors.currentPassword && (
                    <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                      {passwordErrors.currentPassword}
                    </ErrorMessage>
                  )}
                </FormGroup>

                <div />

                <FormGroup>
                  <Label>{t('profile.newPassword')}</Label>
                  <Input
                    type="password"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    $hasError={!!passwordErrors.newPassword}
                    disabled={isLoading}
                  />
                  {passwordErrors.newPassword && (
                    <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                      {passwordErrors.newPassword}
                    </ErrorMessage>
                  )}
                </FormGroup>

                <FormGroup>
                  <Label>{t('profile.confirmNewPassword')}</Label>
                  <Input
                    type="password"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    $hasError={!!passwordErrors.confirmPassword}
                    disabled={isLoading}
                  />
                  {passwordErrors.confirmPassword && (
                    <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                      {passwordErrors.confirmPassword}
                    </ErrorMessage>
                  )}
                </FormGroup>
              </FormGrid>

              <ActionButtons>
                <Button variant="ghost" onClick={handleCancelPassword} disabled={isLoading}>
                  {t('profile.cancel')}
                </Button>
                <Button variant="primary" onClick={handleChangePassword} isLoading={isLoading}>
                  {t('profile.changePassword')}
                </Button>
              </ActionButtons>
            </>
          )}
        </PasswordSection>

        {/* Change Email */}
        <EmailChangeSection>
          {emailChangeStep === 'idle' && (
            <PasswordButton onClick={() => setEmailChangeStep('request')}>
              {t('profile.changeEmail')}
            </PasswordButton>
          )}

          {emailChangeStep === 'request' && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <SectionTitle style={{ marginBottom: '0.75rem' }}>{t('profile.changeEmail')}</SectionTitle>
                <InfoText $variant="info" style={{ marginBottom: '1rem' }}>
                  {t('profile.changeEmailDesc')}
                </InfoText>
                <FormGroup style={{ maxWidth: '26rem' }}>
                  <Label>{t('profile.newEmailLabel')}</Label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={e => { setNewEmail(e.target.value); setNewEmailError(''); }}
                    placeholder={t('profile.newEmailPlaceholder')}
                    $hasError={!!newEmailError}
                    disabled={isEmailChanging}
                  />
                  {newEmailError && (
                    <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                      {newEmailError}
                    </ErrorMessage>
                  )}
                </FormGroup>
                <ActionButtons style={{ borderTop: 'none', paddingTop: '1rem', marginTop: '0.5rem' }}>
                  <Button variant="ghost" onClick={handleCancelEmailChange} disabled={isEmailChanging}>
                    {t('profile.cancelEmailChange')}
                  </Button>
                  <Button variant="primary" onClick={handleRequestEmailChange} isLoading={isEmailChanging}>
                    {t('profile.sendVerificationCode')}
                  </Button>
                </ActionButtons>
              </motion.div>
            </AnimatePresence>
          )}

          {emailChangeStep === 'verify' && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <InfoBox $variant="warning" style={{ marginTop: 0, marginBottom: '1.25rem' }}>
                  <InfoText $variant="warning">
                    {t('profile.verificationCodeSent')}
                  </InfoText>
                </InfoBox>
                <FormGrid>
                  <FormGroup>
                    <Label>{t('profile.enterVerificationCode')} {pendingNewEmail}</Label>
                    <Input
                      type="text"
                      value={verifyCode}
                      onChange={e => { setVerifyCode(e.target.value.toUpperCase()); setVerifyCodeError(''); }}
                      placeholder={t('profile.verificationCodePlaceholder')}
                      maxLength={6}
                      $hasError={!!verifyCodeError}
                      disabled={isEmailChanging}
                    />
                    {verifyCodeError && (
                      <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                        {verifyCodeError}
                      </ErrorMessage>
                    )}
                  </FormGroup>

                  <FormGroup>
                    <Label>{t('profile.enterPasswordToConfirm')}</Label>
                    <Input
                      type="password"
                      value={verifyPassword}
                      onChange={e => { setVerifyPassword(e.target.value); setVerifyPasswordError(''); }}
                      $hasError={!!verifyPasswordError}
                      disabled={isEmailChanging}
                    />
                    {verifyPasswordError && (
                      <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                        {verifyPasswordError}
                      </ErrorMessage>
                    )}
                  </FormGroup>
                </FormGrid>
                <ActionButtons>
                  <Button variant="ghost" onClick={handleCancelEmailChange} disabled={isEmailChanging}>
                    {t('profile.cancelEmailChange')}
                  </Button>
                  <Button variant="primary" onClick={handleConfirmEmailChange} isLoading={isEmailChanging}>
                    {t('profile.confirmEmailChange')}
                  </Button>
                </ActionButtons>
              </motion.div>
            </AnimatePresence>
          )}
        </EmailChangeSection>
      </ProfileCard>

      {/* Danger Zone Card */}
      <DangerCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <DangerTitle>{t('profile.dangerZone')}</DangerTitle>
        <DangerZoneRow>
          <DangerZoneDesc>{t('profile.deleteAccountDesc')}</DangerZoneDesc>
          <DangerOutlineButton variant="ghost" onClick={handleOpenDeleteModal}>
            {t('profile.deleteAccount')}
          </DangerOutlineButton>
        </DangerZoneRow>
      </DangerCard>

      {/* Delete Account Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <ModalBackdrop
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => { if (e.target === e.currentTarget && !isDeleting) setShowDeleteModal(false); }}
          >
            <ModalBox
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            >
              <ModalTitle>{t('profile.deleteAccountConfirmTitle')}</ModalTitle>
              <ModalText>{t('profile.deleteAccountConfirmText')}</ModalText>
              <FormGroup>
                <Label>{t('profile.deleteAccountPasswordLabel')}</Label>
                <Input
                  type="password"
                  value={deletePassword}
                  onChange={e => { setDeletePassword(e.target.value); setDeletePasswordError(''); }}
                  $hasError={!!deletePasswordError}
                  disabled={isDeleting}
                  autoFocus
                />
                {deletePasswordError && (
                  <ErrorMessage initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                    {deletePasswordError}
                  </ErrorMessage>
                )}
              </FormGroup>
              <ModalActions>
                <Button
                  variant="ghost"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                >
                  {t('profile.cancelDelete')}
                </Button>
                <DeleteConfirmButton
                  variant="primary"
                  onClick={handleDeleteAccount}
                  isLoading={isDeleting}
                >
                  {isDeleting ? t('profile.deletingAccount') : t('profile.confirmDelete')}
                </DeleteConfirmButton>
              </ModalActions>
            </ModalBox>
          </ModalBackdrop>
        )}
      </AnimatePresence>
    </PageContainer>
  );
};

export default ProfilePage;
