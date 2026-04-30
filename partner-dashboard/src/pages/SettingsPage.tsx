import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Bell, Globe, Lock, Trash2, Megaphone, Eye } from 'lucide-react';
import { Button } from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api.service';
import toast from 'react-hot-toast';
import NotificationPreferences from '../components/common/NotificationPreferences/NotificationPreferences';

const PageContainer = styled.div`
  [data-theme="dark"] & {
    background: #0a0a0a;
  }
  min-height: calc(100vh - 4rem);
  background: #f9fafb;
  padding: 2rem 1rem;
`;

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const Subtitle = styled.p`
  color: #6b7280;
  font-size: 1rem;
  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const SettingsGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const SettingCard = styled(motion.div)`
  background: white;
  [data-theme="dark"] & {
    background: #1f2937;
  }
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e5e7eb;
  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }
`;

const IconWrapper = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  svg {
    width: 24px;
    height: 24px;
    color: white;
  }
`;

const CardTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const CardDescription = styled.p`
  color: #6b7280;
  font-size: 0.875rem;
  margin: 0;
  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const SettingRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid #f3f4f6;
  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }
  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  &:first-child {
    padding-top: 0;
  }
  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
`;

const SettingInfo = styled.div`
  flex: 1;
`;

const SettingLabel = styled.div`
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const SettingDesc = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const Toggle = styled.button<{ $active: boolean }>`
  width: 52px;
  height: 28px;
  border-radius: 14px;
  background: ${props => props.$active ? '#10b981' : '#d1d5db'};
  border: none;
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
  &:hover {
    background: ${props => props.$active ? '#059669' : '#9ca3af'};
  }
  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: ${props => props.$active ? '26px' : '2px'};
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: white;
    [data-theme="dark"] & {
      background: #1f2937;
    }
    transition: left 0.2s;
  }
`;

const Select = styled.select`
  padding: 0.5rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #111827;
  background: white;
  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    color: #f9fafb;
  }
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    border-color: #d1d5db;
    [data-theme="dark"] & {
      border-color: #4b5563;
    }
  }
  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const ConsentNote = styled.p`
  font-size: 0.8rem;
  color: #9ca3af;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #f3f4f6;
  [data-theme="dark"] & {
    color: #6b7280;
    border-top-color: #374151;
  }
`;

const DangerZone = styled(SettingCard)`
  border: 2px solid #fee2e2;
  background: #fef2f2;
  [data-theme="dark"] & {
    border-color: #7f1d1d;
    background: #3f1f1f;
  }
`;

const DangerButton = styled(Button)`
  background: #ef4444;
  &:hover {
    background: #dc2626;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
  @media (max-width: 640px) {
    flex-direction: column;
  }
`;

const PasswordForm = styled.div`
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const PasswordField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const PasswordLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const PasswordInput = styled.input`
  padding: 0.625rem 0.875rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #111827;
  background: white;
  transition: border-color 0.2s, box-shadow 0.2s;
  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
    color: #f9fafb;
  }
  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
  &.error {
    border-color: #ef4444;
  }
`;

const FieldError = styled.span`
  font-size: 0.75rem;
  color: #ef4444;
`;

const PasswordActions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
  @media (max-width: 640px) {
    flex-direction: column;
  }
`;

const ShowPasswordBtn = styled.button`
  background: none;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: #667eea;
  cursor: pointer;
  transition: all 0.2s;
  [data-theme="dark"] & {
    border-color: #374151;
    color: #818cf8;
  }
  &:hover {
    background: #f3f4f6;
    [data-theme="dark"] & {
      background: #374151;
    }
  }
`;

interface NotificationSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  newOffers: boolean;
  weeklyDigest: boolean;
  accountActivity: boolean;
}

interface MarketingConsents {
  emailMarketing: boolean;
  phoneMarketing: boolean;
}

interface PrivacySettings {
  profileVisible: boolean;
  showEmail: boolean;
  showPhone: boolean;
  activityVisible: boolean;
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

const SettingsPage: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();
  const { changePassword, logout } = useAuth();

  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    newOffers: true,
    weeklyDigest: true,
    accountActivity: true,
  });

  const [marketing, setMarketing] = useState<MarketingConsents>({
    emailMarketing: false,
    phoneMarketing: false,
  });
  const [marketingLoaded, setMarketingLoaded] = useState(false);

  // Spec §2.3 / §5.7: marketing consent must be editable from settings,
  // which requires showing the persisted state — initialising both toggles
  // to false would silently revoke consent for any user who saved without
  // touching them. We only flip `marketingLoaded` on success: if the fetch
  // fails, Save stays a no-op so we can never write the false-default values
  // back over real consent rows.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiService.get<{ marketingConsentEmail?: boolean; marketingConsentPhone?: boolean }>('/auth/me');
        // The /auth/me endpoint returns `{ success, data: { …user fields } }`;
        // apiService unwraps the HTTP body, so the user fields live on
        // `response.data`. Tolerate the alternate shape during rollout.
        const data = (response as any)?.data ?? response ?? {};
        if (cancelled) return;
        setMarketing({
          emailMarketing: !!data.marketingConsentEmail,
          phoneMarketing: !!data.marketingConsentPhone,
        });
        setMarketingLoaded(true);
      } catch (err) {
        console.error('Failed to load marketing consent state:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [privacy, setPrivacy] = useState<PrivacySettings>({
    profileVisible: true,
    showEmail: false,
    showPhone: false,
    activityVisible: true,
  });

  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [isSaving, setIsSaving] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState<PasswordFormData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const toggleNotification = (key: keyof NotificationSettings) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleMarketing = (key: keyof MarketingConsents) => {
    setMarketing(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const togglePrivacy = (key: keyof PrivacySettings) => {
    setPrivacy(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const validatePasswordField = (field: string, value: string): string | undefined => {
    switch (field) {
      case 'currentPassword':
        if (!value) return t('settings.enterCurrentPassword');
        break;
      case 'newPassword':
        if (!value) return t('settings.enterNewPassword');
        if (value.length < 8) return t('settings.passwordMinLength');
        break;
      case 'confirmPassword':
        if (!value) return t('settings.confirmNewPasswordRequired');
        if (value !== passwordData.newPassword) return t('settings.passwordsDoNotMatch');
        break;
    }
    return undefined;
  };

  const handlePasswordFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
    const error = validatePasswordField(name, value);
    setPasswordErrors(prev => ({ ...prev, [name]: error }));
  };

  const handleChangePassword = async () => {
    const newErrors: PasswordErrors = {};
    Object.keys(passwordData).forEach(field => {
      const error = validatePasswordField(field, passwordData[field as keyof PasswordFormData]);
      if (error) newErrors[field as keyof PasswordErrors] = error;
    });
    setPasswordErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsSavingPassword(true);
    try {
      await changePassword(passwordData.currentPassword, passwordData.newPassword);
      setShowPasswordForm(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordErrors({});
      toast.success(t('settings.passwordChangedSuccess'));
    } catch (error) {
      console.error('Change password error:', error);
      toast.error(t('settings.errorSavingSettings'));
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSave = async () => {
    if (!marketingLoaded) {
      // Defensive: don't write the initial all-false defaults back to the
      // server before the persisted state has loaded.
      return;
    }
    setIsSaving(true);
    try {
      const tasks: Array<Promise<unknown>> = [
        apiService.post('/auth/consent', { type: 'email_marketing', granted: marketing.emailMarketing }),
        apiService.post('/auth/consent', { type: 'phone_marketing', granted: marketing.phoneMarketing }),
      ];

      // Spec §7.1: system emails follow the user's selected language. The
      // language is stored on User.preferredLanguage and only honored at email-
      // send time, so persist any change made in this dropdown to the server
      // — otherwise existing users stay on whatever language was set at
      // registration regardless of how often they switch the UI.
      if (selectedLanguage !== language) {
        tasks.push(apiService.put('/auth/profile', { preferredLanguage: selectedLanguage }));
      }

      await Promise.all(tasks);

      if (selectedLanguage !== language) {
        setLanguage(selectedLanguage);
      }

      toast.success(t('settings.savedSuccess'));
    } catch (error) {
      console.error('Save settings error:', error);
      toast.error(t('settings.errorSavingSettings'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeleteAccount = async () => {
    if (!deletePassword) {
      toast.error(t('settings.enterCurrentPassword'));
      return;
    }
    setIsDeletingAccount(true);
    try {
      await apiService.delete('/auth/account', { data: { password: deletePassword } });
      toast.success(t('settings.accountDeleted'));
      logout();
    } catch (error: any) {
      const msg = error?.response?.data?.message || t('settings.errorSavingSettings');
      toast.error(msg);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <PageContainer>
      <Container>
        <PageHeader>
          <Title>{t('settings.title')}</Title>
          <Subtitle>{t('settings.subtitle')}</Subtitle>
        </PageHeader>

        <SettingsGrid>
          {/* Notifications */}
          <SettingCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <CardHeader>
              <IconWrapper>
                <Bell />
              </IconWrapper>
              <div>
                <CardTitle>{t('settings.notifications')}</CardTitle>
                <CardDescription>{t('settings.notificationsDescription')}</CardDescription>
              </div>
            </CardHeader>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.emailNotifications')}</SettingLabel>
                <SettingDesc>{t('settings.emailNotificationsDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={notifications.emailNotifications} onClick={() => toggleNotification('emailNotifications')} />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.smsNotifications')}</SettingLabel>
                <SettingDesc>{t('settings.smsNotificationsDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={notifications.smsNotifications} onClick={() => toggleNotification('smsNotifications')} />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.pushNotifications')}</SettingLabel>
                <SettingDesc>{t('settings.pushNotificationsDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={notifications.pushNotifications} onClick={() => toggleNotification('pushNotifications')} />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.newOffers')}</SettingLabel>
                <SettingDesc>{t('settings.newOffersDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={notifications.newOffers} onClick={() => toggleNotification('newOffers')} />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.weeklyDigest')}</SettingLabel>
                <SettingDesc>{t('settings.weeklyDigestDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={notifications.weeklyDigest} onClick={() => toggleNotification('weeklyDigest')} />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.accountActivity')}</SettingLabel>
                <SettingDesc>{t('settings.accountActivityDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={notifications.accountActivity} onClick={() => toggleNotification('accountActivity')} />
            </SettingRow>
          </SettingCard>

          {/* Browser Push Notifications */}
          <SettingCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <NotificationPreferences />
          </SettingCard>

          {/* Marketing Consents (GDPR) */}
          <SettingCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <CardHeader>
              <IconWrapper style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                <Megaphone />
              </IconWrapper>
              <div>
                <CardTitle>{t('settings.marketingTitle')}</CardTitle>
                <CardDescription>{t('settings.marketingDescription')}</CardDescription>
              </div>
            </CardHeader>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.emailMarketing')}</SettingLabel>
                <SettingDesc>{t('settings.emailMarketingDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={marketing.emailMarketing} onClick={() => toggleMarketing('emailMarketing')} />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.phoneMarketing')}</SettingLabel>
                <SettingDesc>{t('settings.phoneMarketingDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={marketing.phoneMarketing} onClick={() => toggleMarketing('phoneMarketing')} />
            </SettingRow>

            <ConsentNote>{t('settings.marketingConsentNote')}</ConsentNote>
          </SettingCard>

          {/* Privacy */}
          <SettingCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <CardHeader>
              <IconWrapper style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                <Eye />
              </IconWrapper>
              <div>
                <CardTitle>{t('settings.privacyTitle')}</CardTitle>
                <CardDescription>{t('settings.privacyDesc')}</CardDescription>
              </div>
            </CardHeader>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.profileVisible')}</SettingLabel>
                <SettingDesc>{t('settings.profileVisibleDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={privacy.profileVisible} onClick={() => togglePrivacy('profileVisible')} />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.showEmail')}</SettingLabel>
                <SettingDesc>{t('settings.showEmailDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={privacy.showEmail} onClick={() => togglePrivacy('showEmail')} />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.showPhone')}</SettingLabel>
                <SettingDesc>{t('settings.showPhoneDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={privacy.showPhone} onClick={() => togglePrivacy('showPhone')} />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.activityVisible')}</SettingLabel>
                <SettingDesc>{t('settings.activityVisibleDesc')}</SettingDesc>
              </SettingInfo>
              <Toggle $active={privacy.activityVisible} onClick={() => togglePrivacy('activityVisible')} />
            </SettingRow>
          </SettingCard>

          {/* Language */}
          <SettingCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <CardHeader>
              <IconWrapper>
                <Globe />
              </IconWrapper>
              <div>
                <CardTitle>{t('settings.language')}</CardTitle>
                <CardDescription>{t('settings.languageDescription')}</CardDescription>
              </div>
            </CardHeader>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t('settings.language')}</SettingLabel>
                <SettingDesc>{t('settings.languageDescription')}</SettingDesc>
              </SettingInfo>
              <Select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as 'en' | 'bg')}
              >
                <option value="en">English</option>
                <option value="bg">Български</option>
              </Select>
            </SettingRow>
          </SettingCard>

          {/* Security / Password Change */}
          <SettingCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <CardHeader>
              <IconWrapper style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
                <Lock />
              </IconWrapper>
              <div>
                <CardTitle>{t('settings.security')}</CardTitle>
                <CardDescription>{t('settings.securityDescription')}</CardDescription>
              </div>
            </CardHeader>

            {!showPasswordForm ? (
              <SettingRow>
                <SettingInfo>
                  <SettingLabel>{t('settings.changePassword')}</SettingLabel>
                  <SettingDesc>{t('settings.securityDescription')}</SettingDesc>
                </SettingInfo>
                <ShowPasswordBtn onClick={() => setShowPasswordForm(true)}>
                  {t('settings.changePassword')}
                </ShowPasswordBtn>
              </SettingRow>
            ) : (
              <PasswordForm>
                <PasswordField>
                  <PasswordLabel>{t('settings.currentPassword')}</PasswordLabel>
                  <PasswordInput
                    type="password"
                    name="currentPassword"
                    placeholder={t('settings.enterCurrentPassword')}
                    value={passwordData.currentPassword}
                    onChange={handlePasswordFieldChange}
                    className={passwordErrors.currentPassword ? 'error' : ''}
                  />
                  {passwordErrors.currentPassword && (
                    <FieldError>{passwordErrors.currentPassword}</FieldError>
                  )}
                </PasswordField>

                <PasswordField>
                  <PasswordLabel>{t('settings.newPassword')}</PasswordLabel>
                  <PasswordInput
                    type="password"
                    name="newPassword"
                    placeholder={t('settings.enterNewPassword')}
                    value={passwordData.newPassword}
                    onChange={handlePasswordFieldChange}
                    className={passwordErrors.newPassword ? 'error' : ''}
                  />
                  {passwordErrors.newPassword && (
                    <FieldError>{passwordErrors.newPassword}</FieldError>
                  )}
                </PasswordField>

                <PasswordField>
                  <PasswordLabel>{t('settings.confirmNewPassword')}</PasswordLabel>
                  <PasswordInput
                    type="password"
                    name="confirmPassword"
                    placeholder={t('settings.confirmNewPassword')}
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordFieldChange}
                    className={passwordErrors.confirmPassword ? 'error' : ''}
                  />
                  {passwordErrors.confirmPassword && (
                    <FieldError>{passwordErrors.confirmPassword}</FieldError>
                  )}
                </PasswordField>

                <PasswordActions>
                  <Button
                    variant="primary"
                    size="medium"
                    onClick={handleChangePassword}
                    isLoading={isSavingPassword}
                    disabled={isSavingPassword}
                  >
                    {t('settings.savePasswordChanges')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="medium"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                      setPasswordErrors({});
                    }}
                  >
                    {t('settings.cancelChanges')}
                  </Button>
                </PasswordActions>
              </PasswordForm>
            )}
          </SettingCard>

          {/* Danger Zone */}
          <DangerZone
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <CardHeader style={{ borderColor: '#fecaca' }}>
              <IconWrapper style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
                <Trash2 />
              </IconWrapper>
              <div>
                <CardTitle style={{ color: '#dc2626' }}>{t('settings.dangerZone')}</CardTitle>
                <CardDescription>{t('settings.dangerZoneDesc')}</CardDescription>
              </div>
            </CardHeader>

            <SettingRow>
              <SettingInfo>
                <SettingLabel style={{ color: '#dc2626' }}>{t('settings.deleteAccount')}</SettingLabel>
                <SettingDesc>{t('settings.deleteAccountDescription')}</SettingDesc>
              </SettingInfo>
              <DangerButton variant="primary" size="medium" onClick={handleDeleteAccount}>
                {t('settings.deleteButton')}
              </DangerButton>
            </SettingRow>

            {showDeleteConfirm && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '8px' }}>
                <p style={{ color: '#dc2626', fontWeight: 600, marginBottom: '0.5rem' }}>
                  {t('settings.deleteConfirm')}
                </p>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  placeholder={t('settings.enterCurrentPassword')}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fca5a5', marginBottom: '0.75rem', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <DangerButton variant="primary" size="medium" onClick={confirmDeleteAccount} disabled={isDeletingAccount}>
                    {isDeletingAccount ? '...' : t('settings.deleteButton')}
                  </DangerButton>
                  <Button variant="secondary" size="medium" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}>
                    {t('settings.cancelChanges')}
                  </Button>
                </div>
              </div>
            )}
          </DangerZone>

          {/* Save Buttons */}
          <ButtonGroup>
            <Button
              variant="primary"
              size="large"
              onClick={handleSave}
              isLoading={isSaving}
              disabled={isSaving}
            >
              {isSaving ? t('settings.saving') : t('settings.saveChanges')}
            </Button>
            <Button
              variant="secondary"
              size="large"
              onClick={() => window.location.reload()}
            >
              {t('settings.cancelChanges')}
            </Button>
          </ButtonGroup>
        </SettingsGrid>
      </Container>
    </PageContainer>
  );
};

export default SettingsPage;
