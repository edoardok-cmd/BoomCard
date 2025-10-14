import React, { useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Bell, Mail, Smartphone, Globe, Lock, CreditCard, Trash2, Save } from 'lucide-react';
import { Button } from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
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

interface NotificationSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  newOffers: boolean;
  promotions: boolean;
  weeklyDigest: boolean;
  accountActivity: boolean;
}

interface PrivacySettings {
  profileVisible: boolean;
  showEmail: boolean;
  showPhone: boolean;
  activityVisible: boolean;
}

const SettingsPage: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    newOffers: true,
    promotions: false,
    weeklyDigest: true,
    accountActivity: true,
  });

  const [privacy, setPrivacy] = useState<PrivacySettings>({
    profileVisible: true,
    showEmail: false,
    showPhone: false,
    activityVisible: true,
  });

  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [isSaving, setIsSaving] = useState(false);

  const content = {
    en: {
      title: 'Settings',
      subtitle: 'Manage your account settings and preferences',

      // Notifications
      notificationsTitle: 'Notifications',
      notificationsDesc: 'Manage how you receive notifications',
      emailNotifications: 'Email Notifications',
      emailNotificationsDesc: 'Receive notifications via email',
      smsNotifications: 'SMS Notifications',
      smsNotificationsDesc: 'Receive text message alerts',
      pushNotifications: 'Push Notifications',
      pushNotificationsDesc: 'Receive push notifications in browser',
      newOffers: 'New Offers',
      newOffersDesc: 'Get notified about new deals and offers',
      promotions: 'Promotions & Marketing',
      promotionsDesc: 'Receive promotional content and special offers',
      weeklyDigest: 'Weekly Digest',
      weeklyDigestDesc: 'Get a weekly summary of new offers',
      accountActivity: 'Account Activity',
      accountActivityDesc: 'Security alerts and account updates',

      // Privacy
      privacyTitle: 'Privacy',
      privacyDesc: 'Control your privacy and data sharing',
      profileVisible: 'Public Profile',
      profileVisibleDesc: 'Make your profile visible to other users',
      showEmail: 'Show Email',
      showEmailDesc: 'Display email on your public profile',
      showPhone: 'Show Phone',
      showPhoneDesc: 'Display phone number on your public profile',
      activityVisible: 'Activity Status',
      activityVisibleDesc: 'Show when you\'re active on the platform',

      // Preferences
      preferencesTitle: 'Preferences',
      preferencesDesc: 'Customize your experience',
      languageLabel: 'Language',
      languageDesc: 'Choose your preferred language',
      languages: {
        en: 'English',
        bg: 'Български',
      },

      // Danger Zone
      dangerTitle: 'Danger Zone',
      dangerDesc: 'Irreversible actions',
      deleteAccount: 'Delete Account',
      deleteAccountDesc: 'Permanently delete your account and all data',
      deleteButton: 'Delete My Account',

      // Buttons
      saveChanges: 'Save Changes',
      saving: 'Saving...',
      cancelChanges: 'Cancel',

      // Messages
      savedSuccess: 'Settings saved successfully!',
      deleteConfirm: 'Are you sure you want to delete your account? This action cannot be undone.',
    },
    bg: {
      title: 'Настройки',
      subtitle: 'Управлявайте настройките на акаунта си',

      // Notifications
      notificationsTitle: 'Известия',
      notificationsDesc: 'Управлявайте как получавате известия',
      emailNotifications: 'Имейл Известия',
      emailNotificationsDesc: 'Получавайте известия по имейл',
      smsNotifications: 'SMS Известия',
      smsNotificationsDesc: 'Получавайте съобщения по SMS',
      pushNotifications: 'Push Известия',
      pushNotificationsDesc: 'Получавайте push известия в браузъра',
      newOffers: 'Нови Оферти',
      newOffersDesc: 'Бъдете уведомявани за нови оферти и предложения',
      promotions: 'Промоции и Маркетинг',
      promotionsDesc: 'Получавайте промоционално съдържание',
      weeklyDigest: 'Седмичен Бюлетин',
      weeklyDigestDesc: 'Получавайте седмично обобщение на новите оферти',
      accountActivity: 'Активност в Акаунта',
      accountActivityDesc: 'Сигурностни предупреждения и актуализации',

      // Privacy
      privacyTitle: 'Поверителност',
      privacyDesc: 'Контролирайте поверителността си',
      profileVisible: 'Публичен Профил',
      profileVisibleDesc: 'Направете профила си видим за други потребители',
      showEmail: 'Покажи Имейл',
      showEmailDesc: 'Показвайте имейла в публичния си профил',
      showPhone: 'Покажи Телефон',
      showPhoneDesc: 'Показвайте телефона в публичния си профил',
      activityVisible: 'Статус на Активност',
      activityVisibleDesc: 'Покажете кога сте активни в платформата',

      // Preferences
      preferencesTitle: 'Предпочитания',
      preferencesDesc: 'Персонализирайте опита си',
      languageLabel: 'Език',
      languageDesc: 'Изберете предпочитан език',
      languages: {
        en: 'English',
        bg: 'Български',
      },

      // Danger Zone
      dangerTitle: 'Опасна Зона',
      dangerDesc: 'Необратими действия',
      deleteAccount: 'Изтриване на Акаунт',
      deleteAccountDesc: 'Перманентно изтриване на акаунта и всички данни',
      deleteButton: 'Изтрий Акаунта Ми',

      // Buttons
      saveChanges: 'Запази Промените',
      saving: 'Запазване...',
      cancelChanges: 'Откажи',

      // Messages
      savedSuccess: 'Настройките са запазени успешно!',
      deleteConfirm: 'Сигурни ли сте, че искате да изтриете акаунта си? Това действие не може да бъде отменено.',
    },
  };

  const t = content[language as keyof typeof content];

  const toggleNotification = (key: keyof NotificationSettings) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const togglePrivacy = (key: keyof PrivacySettings) => {
    setPrivacy(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      // In a real app, you would save settings via API:
      // await updateSettings({ notifications, privacy, language: selectedLanguage });

      toast.success(t.savedSuccess);
    } catch (error) {
      console.error('Save settings error:', error);
      toast.error(language === 'bg' ? 'Грешка при запазване на настройките' : 'Error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(t.deleteConfirm);
    if (confirmed) {
      toast.error(language === 'bg' ? 'Функцията скоро ще бъде налична' : 'Feature coming soon');
    }
  };

  return (
    <PageContainer>
      <Container>
        <PageHeader>
          <Title>{t.title}</Title>
          <Subtitle>{t.subtitle}</Subtitle>
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
                <CardTitle>{t.notificationsTitle}</CardTitle>
                <CardDescription>{t.notificationsDesc}</CardDescription>
              </div>
            </CardHeader>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.emailNotifications}</SettingLabel>
                <SettingDesc>{t.emailNotificationsDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={notifications.emailNotifications}
                onClick={() => toggleNotification('emailNotifications')}
              />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.smsNotifications}</SettingLabel>
                <SettingDesc>{t.smsNotificationsDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={notifications.smsNotifications}
                onClick={() => toggleNotification('smsNotifications')}
              />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.pushNotifications}</SettingLabel>
                <SettingDesc>{t.pushNotificationsDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={notifications.pushNotifications}
                onClick={() => toggleNotification('pushNotifications')}
              />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.newOffers}</SettingLabel>
                <SettingDesc>{t.newOffersDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={notifications.newOffers}
                onClick={() => toggleNotification('newOffers')}
              />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.promotions}</SettingLabel>
                <SettingDesc>{t.promotionsDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={notifications.promotions}
                onClick={() => toggleNotification('promotions')}
              />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.weeklyDigest}</SettingLabel>
                <SettingDesc>{t.weeklyDigestDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={notifications.weeklyDigest}
                onClick={() => toggleNotification('weeklyDigest')}
              />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.accountActivity}</SettingLabel>
                <SettingDesc>{t.accountActivityDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={notifications.accountActivity}
                onClick={() => toggleNotification('accountActivity')}
              />
            </SettingRow>
          </SettingCard>

          {/* Push Notifications */}
          <SettingCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <NotificationPreferences />
          </SettingCard>

          {/* Privacy */}
          <SettingCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <CardHeader>
              <IconWrapper>
                <Lock />
              </IconWrapper>
              <div>
                <CardTitle>{t.privacyTitle}</CardTitle>
                <CardDescription>{t.privacyDesc}</CardDescription>
              </div>
            </CardHeader>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.profileVisible}</SettingLabel>
                <SettingDesc>{t.profileVisibleDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={privacy.profileVisible}
                onClick={() => togglePrivacy('profileVisible')}
              />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.showEmail}</SettingLabel>
                <SettingDesc>{t.showEmailDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={privacy.showEmail}
                onClick={() => togglePrivacy('showEmail')}
              />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.showPhone}</SettingLabel>
                <SettingDesc>{t.showPhoneDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={privacy.showPhone}
                onClick={() => togglePrivacy('showPhone')}
              />
            </SettingRow>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.activityVisible}</SettingLabel>
                <SettingDesc>{t.activityVisibleDesc}</SettingDesc>
              </SettingInfo>
              <Toggle
                $active={privacy.activityVisible}
                onClick={() => togglePrivacy('activityVisible')}
              />
            </SettingRow>
          </SettingCard>

          {/* Preferences */}
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
                <CardTitle>{t.preferencesTitle}</CardTitle>
                <CardDescription>{t.preferencesDesc}</CardDescription>
              </div>
            </CardHeader>

            <SettingRow>
              <SettingInfo>
                <SettingLabel>{t.languageLabel}</SettingLabel>
                <SettingDesc>{t.languageDesc}</SettingDesc>
              </SettingInfo>
              <Select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as 'en' | 'bg')}
              >
                <option value="en">{t.languages.en}</option>
                <option value="bg">{t.languages.bg}</option>
              </Select>
            </SettingRow>
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
                <CardTitle style={{ color: '#dc2626' }}>{t.dangerTitle}</CardTitle>
                <CardDescription>{t.dangerDesc}</CardDescription>
              </div>
            </CardHeader>

            <SettingRow>
              <SettingInfo>
                <SettingLabel style={{ color: '#dc2626' }}>{t.deleteAccount}</SettingLabel>
                <SettingDesc>{t.deleteAccountDesc}</SettingDesc>
              </SettingInfo>
              <DangerButton
                variant="primary"
                size="medium"
                onClick={handleDeleteAccount}
              >
                {t.deleteButton}
              </DangerButton>
            </SettingRow>
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
              {isSaving ? t.saving : t.saveChanges}
            </Button>
            <Button
              variant="secondary"
              size="large"
              onClick={() => window.location.reload()}
            >
              {t.cancelChanges}
            </Button>
          </ButtonGroup>
        </SettingsGrid>
      </Container>
    </PageContainer>
  );
};

export default SettingsPage;
