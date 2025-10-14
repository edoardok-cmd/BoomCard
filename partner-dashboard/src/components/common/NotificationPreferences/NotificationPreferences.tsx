import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Bell, BellOff, Check, X, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import Button from '../Button/Button';
import pushNotificationService, {
  NotificationPermissionState,
} from '../../../services/pushNotifications';

const content = {
  en: {
    title: 'Push Notifications',
    subtitle: 'Stay updated with real-time notifications',
    permission: {
      granted: 'Notifications Enabled',
      denied: 'Notifications Blocked',
      default: 'Enable Notifications',
    },
    status: {
      granted: 'You will receive notifications about new offers, updates, and messages.',
      denied: 'Notifications are blocked. Please enable them in your browser settings.',
      default: 'Enable notifications to get real-time updates about offers and activities.',
    },
    enable: 'Enable Notifications',
    disable: 'Disable Notifications',
    test: 'Send Test Notification',
    preferences: 'Notification Preferences',
    types: {
      newOffers: 'New Offers',
      newOffersDesc: 'Get notified when new offers are available',
      expiringOffers: 'Expiring Offers',
      expiringOffersDesc: 'Reminders before your offers expire',
      cardActivation: 'Card Activation',
      cardActivationDesc: 'When your BoomCards are activated',
      reviews: 'Reviews',
      reviewsDesc: 'When you receive new reviews',
      messages: 'Messages',
      messagesDesc: 'Messages from partners and support',
      promotions: 'Promotions',
      promotionsDesc: 'Special deals and promotional offers',
    },
    browserNotSupported: 'Push notifications are not supported in your browser',
    permissionDeniedInstructions: 'To enable notifications:',
    instructions: {
      chrome: '1. Click the lock icon in the address bar\n2. Find "Notifications"\n3. Change to "Allow"',
      firefox: '1. Click the lock icon in the address bar\n2. Find "Permissions"\n3. Remove the block for notifications',
      safari: '1. Open Safari Preferences\n2. Go to Websites > Notifications\n3. Allow notifications for this site',
    },
    success: {
      enabled: 'Notifications enabled successfully!',
      disabled: 'Notifications disabled',
      testSent: 'Test notification sent!',
      updated: 'Preferences updated',
    },
    errors: {
      notSupported: 'Push notifications are not supported',
      permissionDenied: 'Notification permission was denied',
      subscribeFailed: 'Failed to enable notifications',
    },
  },
  bg: {
    title: 'Push Известия',
    subtitle: 'Бъдете информирани с известия в реално време',
    permission: {
      granted: 'Известията са Разрешени',
      denied: 'Известията са Блокирани',
      default: 'Разреши Известия',
    },
    status: {
      granted: 'Ще получавате известия за нови оферти, актуализации и съобщения.',
      denied: 'Известията са блокирани. Моля разрешете ги от настройките на браузъра.',
      default: 'Разрешете известия за актуализации в реално време за оферти и активности.',
    },
    enable: 'Разреши Известия',
    disable: 'Спри Известия',
    test: 'Изпрати Тестово Известие',
    preferences: 'Предпочитания за Известия',
    types: {
      newOffers: 'Нови Оферти',
      newOffersDesc: 'Получавайте известия за нови оферти',
      expiringOffers: 'Изтичащи Оферти',
      expiringOffersDesc: 'Напомняния преди да изтекат офертите',
      cardActivation: 'Активация на Карта',
      cardActivationDesc: 'Когато вашите BoomCards са активирани',
      reviews: 'Отзиви',
      reviewsDesc: 'Когато получите нови отзиви',
      messages: 'Съобщения',
      messagesDesc: 'Съобщения от партньори и поддръжка',
      promotions: 'Промоции',
      promotionsDesc: 'Специални оферти и промоционални предложения',
    },
    browserNotSupported: 'Push известията не се поддържат в този браузър',
    permissionDeniedInstructions: 'За да разрешите известия:',
    instructions: {
      chrome: '1. Кликнете иконата за заключване в адресната лента\n2. Намерете "Известия"\n3. Променете на "Разреши"',
      firefox: '1. Кликнете иконата за заключване в адресната лента\n2. Намерете "Разрешения"\n3. Премахнете блокирането за известия',
      safari: '1. Отворете Safari Предпочитания\n2. Отидете на Уебсайтове > Известия\n3. Разрешете известия за този сайт',
    },
    success: {
      enabled: 'Известията са разрешени успешно!',
      disabled: 'Известията са спрени',
      testSent: 'Тестово известие изпратено!',
      updated: 'Предпочитанията са обновени',
    },
    errors: {
      notSupported: 'Push известията не се поддържат',
      permissionDenied: 'Разрешението за известия беше отказано',
      subscribeFailed: 'Неуспешно разрешаване на известия',
    },
  },
};

interface NotificationPreferencesState {
  newOffers: boolean;
  expiringOffers: boolean;
  cardActivation: boolean;
  reviews: boolean;
  messages: boolean;
  promotions: boolean;
}

const NotificationPreferences: React.FC = () => {
  const { language } = useLanguage();
  const t = content[language as keyof typeof content];

  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferencesState>({
    newOffers: true,
    expiringOffers: true,
    cardActivation: true,
    reviews: true,
    messages: true,
    promotions: false,
  });

  useEffect(() => {
    checkPermissionAndSubscription();
  }, []);

  const checkPermissionAndSubscription = async () => {
    const currentPermission = pushNotificationService.getPermission();
    setPermission(currentPermission);

    const subscribed = await pushNotificationService.isSubscribed();
    setIsSubscribed(subscribed);

    // Load preferences from localStorage
    const saved = localStorage.getItem('notificationPreferences');
    if (saved) {
      setPreferences(JSON.parse(saved));
    }
  };

  const handleEnableNotifications = async () => {
    if (!pushNotificationService.isSupported()) {
      toast.error(t.errors.notSupported);
      return;
    }

    setIsLoading(true);

    try {
      const newPermission = await pushNotificationService.requestPermission();
      setPermission(newPermission);

      if (newPermission === 'granted') {
        const subscription = await pushNotificationService.subscribe();
        setIsSubscribed(subscription !== null);
        toast.success(t.success.enabled);
      } else {
        toast.error(t.errors.permissionDenied);
      }
    } catch (error) {
      console.error('Failed to enable notifications:', error);
      toast.error(t.errors.subscribeFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    setIsLoading(true);

    try {
      const success = await pushNotificationService.unsubscribe();
      if (success) {
        setIsSubscribed(false);
        toast.success(t.success.disabled);
      }
    } catch (error) {
      console.error('Failed to disable notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      await pushNotificationService.testNotification();
      toast.success(t.success.testSent);
    } catch (error) {
      console.error('Failed to send test notification:', error);
      toast.error('Failed to send test notification');
    }
  };

  const handleTogglePreference = (key: keyof NotificationPreferencesState) => {
    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    localStorage.setItem('notificationPreferences', JSON.stringify(updated));
    toast.success(t.success.updated);
  };

  const getBrowserInstructions = (): string => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('chrome')) return t.instructions.chrome;
    if (userAgent.includes('firefox')) return t.instructions.firefox;
    if (userAgent.includes('safari')) return t.instructions.safari;
    return t.instructions.chrome; // Default
  };

  if (!pushNotificationService.isSupported()) {
    return (
      <Container>
        <UnsupportedMessage>
          <AlertCircle size={48} />
          <h3>{t.browserNotSupported}</h3>
          <p>Please use a modern browser like Chrome, Firefox, or Safari.</p>
        </UnsupportedMessage>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <HeaderIcon permission={permission}>
          {permission === 'granted' ? <Bell size={24} /> : <BellOff size={24} />}
        </HeaderIcon>
        <HeaderContent>
          <Title>{t.title}</Title>
          <Subtitle>{t.subtitle}</Subtitle>
        </HeaderContent>
      </Header>

      <StatusCard permission={permission}>
        <StatusHeader>
          <StatusBadge permission={permission}>
            {permission === 'granted' ? (
              <Check size={16} />
            ) : permission === 'denied' ? (
              <X size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{t.permission[permission]}</span>
          </StatusBadge>
        </StatusHeader>

        <StatusText>{t.status[permission]}</StatusText>

        {permission === 'denied' && (
          <InstructionsBox>
            <InstructionsTitle>{t.permissionDeniedInstructions}</InstructionsTitle>
            <InstructionsText>{getBrowserInstructions()}</InstructionsText>
          </InstructionsBox>
        )}

        <Actions>
          {permission === 'default' && (
            <Button onClick={handleEnableNotifications} disabled={isLoading}>
              <Bell size={18} />
              {t.enable}
            </Button>
          )}

          {permission === 'granted' && (
            <>
              {isSubscribed ? (
                <Button
                  variant="secondary"
                  onClick={handleDisableNotifications}
                  disabled={isLoading}
                >
                  <BellOff size={18} />
                  {t.disable}
                </Button>
              ) : (
                <Button onClick={handleEnableNotifications} disabled={isLoading}>
                  <Bell size={18} />
                  {t.enable}
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={handleTestNotification}
                disabled={!isSubscribed}
              >
                {t.test}
              </Button>
            </>
          )}
        </Actions>
      </StatusCard>

      {permission === 'granted' && isSubscribed && (
        <PreferencesSection
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <PreferencesTitle>{t.preferences}</PreferencesTitle>

          <PreferencesList>
            {(Object.keys(preferences) as Array<keyof NotificationPreferencesState>).map(
              (key) => (
                <PreferenceItem key={key}>
                  <PreferenceInfo>
                    <PreferenceName>{t.types[key]}</PreferenceName>
                    <PreferenceDesc>{t.types[`${key}Desc` as keyof typeof t.types]}</PreferenceDesc>
                  </PreferenceInfo>

                  <Toggle
                    active={preferences[key]}
                    onClick={() => handleTogglePreference(key)}
                  >
                    <ToggleTrack active={preferences[key]}>
                      <ToggleThumb
                        active={preferences[key]}
                        animate={{ x: preferences[key] ? 20 : 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </ToggleTrack>
                  </Toggle>
                </PreferenceItem>
              )
            )}
          </PreferencesList>
        </PreferencesSection>
      )}
    </Container>
  );
};

const Container = styled.div`
  width: 100%;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const HeaderIcon = styled.div<{ permission: NotificationPermissionState }>`
  width: 56px;
  height: 56px;
  border-radius: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props =>
    props.permission === 'granted'
      ? 'var(--success-light)'
      : props.permission === 'denied'
      ? 'var(--error-light)'
      : 'var(--gray-100)'};
  color: ${props =>
    props.permission === 'granted'
      ? 'var(--success)'
      : props.permission === 'denied'
      ? 'var(--error)'
      : 'var(--text-secondary)'};
`;

const HeaderContent = styled.div`
  flex: 1;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.25rem 0;
`;

const Subtitle = styled.p`
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
`;

const StatusCard = styled.div<{ permission: NotificationPermissionState }>`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  border-left: 4px solid
    ${props =>
      props.permission === 'granted'
        ? 'var(--success)'
        : props.permission === 'denied'
        ? 'var(--error)'
        : 'var(--warning)'};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  [data-theme="dark"] & {
    background: #374151;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
`;

const StatusHeader = styled.div`
  margin-bottom: 1rem;
`;

const StatusBadge = styled.div<{ permission: NotificationPermissionState }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 2rem;
  background: ${props =>
    props.permission === 'granted'
      ? 'var(--success-light)'
      : props.permission === 'denied'
      ? 'var(--error-light)'
      : 'var(--warning-light)'};
  color: ${props =>
    props.permission === 'granted'
      ? 'var(--success)'
      : props.permission === 'denied'
      ? 'var(--error)'
      : 'var(--warning)'};
  font-size: 0.875rem;
  font-weight: 600;
`;

const StatusText = styled.p`
  font-size: 0.9375rem;
  color: var(--text-primary);
  line-height: 1.6;
  margin: 0 0 1.5rem 0;
`;

const InstructionsBox = styled.div`
  background: var(--gray-50);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1.5rem;
`;

const InstructionsTitle = styled.h4`
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
`;

const InstructionsText = styled.pre`
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.8;
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
`;

const Actions = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const PreferencesSection = styled(motion.div)`
  margin-top: 2rem;
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  [data-theme="dark"] & {
    background: #374151;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
`;

const PreferencesTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 1.5rem 0;
`;

const PreferencesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const PreferenceItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  background: var(--gray-50);
  border-radius: 0.75rem;
  transition: all 0.2s;

  &:hover {
    background: var(--gray-100);
  }
`;

const PreferenceInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const PreferenceName = styled.div`
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
`;

const PreferenceDesc = styled.div`
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.5;
`;

const Toggle = styled.button<{ active: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
`;

const ToggleTrack = styled.div<{ active: boolean }>`
  width: 48px;
  height: 28px;
  background: ${props => (props.active ? 'var(--success)' : 'var(--gray-300)')};
  border-radius: 14px;
  position: relative;
  transition: background-color 0.3s;
`;

const ToggleThumb = styled(motion.div)<{ active: boolean }>`
  width: 24px;
  height: 24px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
`;

const UnsupportedMessage = styled.div`
  text-align: center;
  padding: 3rem 2rem;
  color: var(--text-secondary);

  svg {
    margin-bottom: 1rem;
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
  }

  p {
    color: var(--text-secondary);
    margin: 0;
  }
`;

export default NotificationPreferences;
