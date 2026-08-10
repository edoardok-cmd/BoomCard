/**
 * Settings Screen
 *
 * App settings and preferences
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Linking,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { crossPlatformAlert } from '../../utils/alert';
import StorageService from '../../services/storage.service';
import LocationService from '../../services/location.service';
import BiometricService from '../../services/biometric.service';
import NotificationService from '../../services/notification.service';
import notificationsApi from '../../api/notifications.api';
import { useTheme } from '../../contexts/ThemeContext';
import { useTabVisibility } from '../../contexts/TabVisibilityContext';
import { useAuth } from '../../store/AuthContext';
import { changeLanguage, getCurrentLanguage } from '../../i18n';
import AuthApi from '../../api/auth.api';
import queryClient from '../../queryClient';

const SettingsScreen = ({ navigation }: any) => {
  const { t, i18n } = useTranslation();
  const { isDarkMode, toggleTheme, theme } = useTheme();
  const {
    showOffers,
    showNearby,
    showFavorites,
    setShowOffers,
    setShowNearby,
    setShowFavorites,
  } = useTabVisibility();
  const { logout } = useAuth();
  const [currentLanguage, setCurrentLanguage] = useState(getCurrentLanguage());
  const [marketingConsentEmail, setMarketingConsentEmail] = useState(false);
  const [marketingConsentPhone, setMarketingConsentPhone] = useState(false);
  // N1/N2 — server-backed notification preferences ({email, push, inApp, sms, quietHours}).
  const [serverPrefs, setServerPrefs] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Set translated navigation title
  useEffect(() => {
    navigation.setOptions({
      title: t('profile.settings'),
    });
  }, [navigation, t]);

  // Settings state - loaded from storage on mount (dark mode managed by ThemeContext)
  const [settings, setSettings] = useState({
    pushNotifications: true,
    emailNotifications: false,
    locationServices: true,
    biometricAuth: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isDeviceLocationEnabled, setIsDeviceLocationEnabled] = useState(true);
  const [hasLocationPermission, setHasLocationPermission] = useState(true);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [isBiometricEnrolled, setIsBiometricEnrolled] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('biometric');
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);

  // Load settings from storage on mount
  useEffect(() => {
    loadSettings();
    checkDeviceLocationStatus();
    checkBiometricCapabilities();
    checkNotificationPermissions();
  }, []);

  // Check device location status periodically when location services is enabled
  useEffect(() => {
    if (settings.locationServices) {
      checkDeviceLocationStatus();
    }
  }, [settings.locationServices]);

  const loadSettings = async () => {
    try {
      const [
        pushNotifications,
        emailNotifications,
        locationServices,
        biometricAuth,
        userData,
      ] = await Promise.all([
        StorageService.getPushNotifications(),
        StorageService.getEmailNotifications(),
        StorageService.getLocationServices(),
        StorageService.getBiometricEnabled(),
        StorageService.getUserData(),
      ]);

      setSettings({
        pushNotifications,
        emailNotifications,
        locationServices,
        biometricAuth,
      });

      if (userData) {
        setMarketingConsentEmail(!!(userData as any).marketingConsentEmail);
        setMarketingConsentPhone(!!(userData as any).marketingConsentPhone);
      }

      // A1 — seed marketing-consent from the authoritative preference store.
      AuthApi.getMarketingConsent().then((res) => {
        if (res.success && res.data) {
          const data = (res.data as any).data ?? res.data;
          setMarketingConsentEmail(!!data.marketingConsentEmail);
          setMarketingConsentPhone(!!data.marketingConsentPhone);
        }
      }).catch(() => { /* keep cached values */ });

      // N1 — seed the server-backed notification preferences so the push/email
      // switches reflect (and write to) the backend, not just device storage.
      notificationsApi.getPreferences().then((res) => {
        if (res.success && res.data) {
          const prefs = (res.data as any).data ?? res.data;
          setServerPrefs(prefs);
          if (prefs?.push?.enabled !== undefined || prefs?.email?.enabled !== undefined) {
            setSettings((prev) => ({
              ...prev,
              pushNotifications: prefs?.push?.enabled ?? prev.pushNotifications,
              emailNotifications: prefs?.email?.enabled ?? prev.emailNotifications,
            }));
          }
        }
      }).catch(() => { /* fall back to device-local */ });
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkDeviceLocationStatus = async () => {
    try {
      const [deviceEnabled, permissions] = await Promise.all([
        LocationService.isLocationEnabled(),
        LocationService.checkPermissions(),
      ]);

      setIsDeviceLocationEnabled(deviceEnabled);
      setHasLocationPermission(permissions.granted);
    } catch (error) {
      console.error('Failed to check location status:', error);
    }
  };

  const checkBiometricCapabilities = async () => {
    try {
      const capabilities = await BiometricService.checkCapabilities();
      setIsBiometricAvailable(capabilities.isAvailable);
      setIsBiometricEnrolled(capabilities.isEnrolled);

      // Set user-friendly biometric type name
      if (capabilities.biometricType === 'facial') {
        setBiometricType('Face ID');
      } else if (capabilities.biometricType === 'fingerprint') {
        setBiometricType('Fingerprint');
      } else if (capabilities.biometricType === 'iris') {
        setBiometricType('Iris');
      } else {
        setBiometricType('Biometric');
      }
    } catch (error) {
      console.error('Failed to check biometric capabilities:', error);
    }
  };

  const checkNotificationPermissions = async () => {
    try {
      // Check if notifications are available (not in Expo Go)
      if (!NotificationService.isAvailable()) {
        setHasNotificationPermission(false);
        return;
      }

      const permissions = await NotificationService.checkPermissions();
      setHasNotificationPermission(permissions.granted);
    } catch (error) {
      console.error('Failed to check notification permissions:', error);
    }
  };

  const openDeviceSettings = () => {
    crossPlatformAlert(
      'Enable Location Services',
      'Please enable location services in your device settings to use this feature.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            Linking.openSettings();
          },
        },
      ]
    );
  };

  const handleToggle = async (setting: keyof typeof settings | 'darkMode') => {
    // Handle dark mode separately using ThemeContext
    if (setting === 'darkMode') {
      await toggleTheme();
      return;
    }

    const newValue = !settings[setting];

    // Special handling for push notifications
    if (setting === 'pushNotifications' && newValue) {
      // Check if notifications are available (not in Expo Go)
      if (!NotificationService.isAvailable()) {
        crossPlatformAlert(
          'Notifications Unavailable',
          'Push notifications are not available in Expo Go. To use push notifications, you need to create a development build or use a production build.',
          [
            { text: 'OK' }
          ]
        );
        return;
      }

      // Check current permissions
      const permissions = await NotificationService.checkPermissions();

      if (!permissions.granted) {
        // Request permissions
        const result = await NotificationService.requestPermissions();

        if (!result.granted) {
          crossPlatformAlert(
            'Permission Denied',
            'Please enable notifications in your device settings to receive updates about offers and receipts.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => Linking.openSettings(),
              },
            ]
          );
          return;
        }

        setHasNotificationPermission(true);
      }

      // Register for push notifications and get token
      const tokenResult = await NotificationService.registerForPushNotifications();

      if (tokenResult) {
        // Send token to backend
        const platform = Platform.OS;
        const registerResponse = await notificationsApi.registerPushToken(
          tokenResult.token,
          platform
        );

        if (registerResponse.success) {
          crossPlatformAlert(
            'Success',
            'Push notifications enabled! You will receive updates about offers and receipts.'
          );
        } else {
          console.warn('Failed to register token with backend:', registerResponse.error);
          crossPlatformAlert(
            'Partial Success',
            'Notifications enabled locally. Token will be synced with server when connection is available.'
          );
        }
      } else {
        crossPlatformAlert(
          'Warning',
          'Notifications enabled, but push token could not be obtained. You may not receive remote notifications.'
        );
      }
    }

    // Special handling for location services
    if (setting === 'locationServices' && newValue) {
      // Check if device location is enabled
      const deviceEnabled = await LocationService.isLocationEnabled();
      if (!deviceEnabled) {
        openDeviceSettings();
        return;
      }

      // Check permissions
      const permissions = await LocationService.checkPermissions();
      if (!permissions.granted) {
        // Request permissions
        const result = await LocationService.requestPermissions();
        if (!result.granted) {
          crossPlatformAlert(
            'Permission Denied',
            'Location permission is required for receipt verification. Please enable it in settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => Linking.openSettings(),
              },
            ]
          );
          return;
        }
        setHasLocationPermission(true);
      }

      // Update device location status
      await checkDeviceLocationStatus();
    }

    // Special handling for biometric authentication
    if (setting === 'biometricAuth' && newValue) {
      // Check if biometric is available
      if (!isBiometricAvailable) {
        crossPlatformAlert(
          'Not Available',
          'Biometric authentication is not available on this device.'
        );
        return;
      }

      // Check if biometric credentials are enrolled
      if (!isBiometricEnrolled) {
        crossPlatformAlert(
          'Not Enrolled',
          `Please add a ${biometricType.toLowerCase()} in your device settings first.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
          ]
        );
        return;
      }

      // Test biometric authentication before enabling
      const result = await BiometricService.authenticate(
        `Authenticate to enable ${biometricType} login`,
        'Cancel'
      );

      if (!result.success) {
        crossPlatformAlert('Authentication Failed', result.error || 'Please try again.');
        return;
      }

      crossPlatformAlert(
        'Success',
        `${biometricType} authentication enabled. You can now use it to login.`
      );
    }

    // Update local state
    setSettings({
      ...settings,
      [setting]: newValue,
    });

    // Persist to storage (and, for notification channels, to the backend — N1).
    try {
      switch (setting) {
        case 'pushNotifications':
          await StorageService.setPushNotifications(newValue);
          // N1 — gate server-sent push notifications, not just the device flag.
          notificationsApi.updatePreferences({ push: { enabled: newValue } })
            .then((res) => { if (res.success) setServerPrefs((p: any) => ({ ...(p || {}), push: { ...(p?.push || {}), enabled: newValue } })); })
            .catch(() => { /* best-effort; device flag already saved */ });
          break;
        case 'emailNotifications':
          await StorageService.setEmailNotifications(newValue);
          // N1 — gate server-sent email notifications.
          notificationsApi.updatePreferences({ email: { enabled: newValue } })
            .then((res) => { if (res.success) setServerPrefs((p: any) => ({ ...(p || {}), email: { ...(p?.email || {}), enabled: newValue } })); })
            .catch(() => { /* best-effort */ });
          break;
        case 'locationServices':
          await StorageService.setLocationServices(newValue);
          break;
        case 'biometricAuth':
          await StorageService.setBiometricEnabled(newValue);
          break;
      }
    } catch (error) {
      console.error(`Failed to save ${setting}:`, error);
      // Revert on error
      setSettings({
        ...settings,
        [setting]: !newValue,
      });
      crossPlatformAlert('Error', 'Failed to save setting');
    }
  };

  const handleClearCache = () => {
    crossPlatformAlert(
      t('settings.clearCache'),
      'Are you sure you want to clear all cached data? This will not remove your login credentials.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              // Get current preferences to preserve them
              const theme = await StorageService.getTheme();
              const language = await StorageService.getLanguage();

              // Clear React Query cache
              queryClient.clear();

              // Clear location cache
              await LocationService.clearCache();

              // Clear AsyncStorage except authentication and preferences
              try {
                const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                const keys = await AsyncStorage.getAllKeys();
                const keysToRemove = keys.filter(
                  (key: string) => !key.includes('token') &&
                         !key.includes('user') &&
                         !key.includes('theme') &&
                         !key.includes('language')
                );
                await AsyncStorage.multiRemove(keysToRemove);
              } catch (e) {
                console.warn('AsyncStorage clear skipped:', e);
              }

              // Restore preferences
              if (theme) await StorageService.setTheme(theme);
              if (language) await StorageService.setLanguage(language);

              crossPlatformAlert(
                'Success',
                'Cache cleared successfully. Some data will be reloaded when you use the app.'
              );
            } catch (error) {
              console.error('Failed to clear cache:', error);
              crossPlatformAlert('Error', 'Failed to clear cache. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleReportProblem = () => {
    Linking.openURL('https://boomcard.bg/contact');
  };

  const handleDeleteAccount = () => {
    setDeletePassword('');
    setShowDeleteModal(true);
  };

  const confirmDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      crossPlatformAlert(t('common.error'), t('settings.deletePasswordRequired'));
      return;
    }
    setIsDeleting(true);
    try {
      const response = await AuthApi.deleteAccount(deletePassword.trim());
      if (response.success) {
        setShowDeleteModal(false);
        await logout();
        crossPlatformAlert(t('common.success'), t('settings.deleteAccountSuccess'));
      } else {
        crossPlatformAlert(t('common.error'), response.error || t('settings.deleteAccountError'));
      }
    } catch {
      crossPlatformAlert(t('common.error'), t('settings.deleteAccountError'));
    } finally {
      setIsDeleting(false);
    }
  };

  // A1 — write to the preference store (PUT /marketing-consent), not the audit
  // endpoint. recordConsent() only appended a GDPR audit row, so the toggle
  // appeared to revert on reload because getProfile() reads the real columns.
  const handleMarketingConsentEmail = async (value: boolean) => {
    setMarketingConsentEmail(value);
    try {
      const res = await AuthApi.updateMarketingConsent({ marketingConsentEmail: value });
      if (!res.success) throw new Error(res.error || 'failed');
    } catch {
      setMarketingConsentEmail(!value);
      crossPlatformAlert(t('common.error'), t('settings.consentSaveFailed', 'Неуспешно запазване на съгласието.'));
    }
  };

  const handleMarketingConsentPhone = async (value: boolean) => {
    setMarketingConsentPhone(value);
    try {
      const res = await AuthApi.updateMarketingConsent({ marketingConsentPhone: value });
      if (!res.success) throw new Error(res.error || 'failed');
    } catch {
      setMarketingConsentPhone(!value);
      crossPlatformAlert(t('common.error'), t('settings.consentSaveFailed', 'Неуспешно запазване на съгласието.'));
    }
  };

  // N2 — per-category notification toggles (spec §11.1/§11.3). Optional categories
  // can be turned off; mandatory categories (systemAnnouncements) are always on.
  // Toggling a category updates BOTH channels (push + email) for that category.
  const OPTIONAL_CATEGORIES: { key: string; labelKey: string; fallback: string }[] = [
    { key: 'newOffers',   labelKey: 'settings.catNewOffers',   fallback: 'Нови отстъпки' },
    { key: 'promotions',  labelKey: 'settings.catPromotions',  fallback: 'Отстъпки' },
    { key: 'reviews',     labelKey: 'settings.catReviews',     fallback: 'Отзиви' },
  ];

  const isCategoryEnabled = (key: string): boolean => {
    // Enabled if enabled on either channel (defaults to true when unknown).
    const push = serverPrefs?.push?.[key];
    const email = serverPrefs?.email?.[key];
    if (push === undefined && email === undefined) return true;
    return !!(push || email);
  };

  const toggleCategory = async (key: string) => {
    const next = !isCategoryEnabled(key);
    const optimistic = {
      ...(serverPrefs || {}),
      push: { ...(serverPrefs?.push || {}), [key]: next },
      email: { ...(serverPrefs?.email || {}), [key]: next },
    };
    setServerPrefs(optimistic);
    try {
      const res = await notificationsApi.updatePreferences({
        push: { [key]: next },
        email: { [key]: next },
      });
      if (!res.success) throw new Error(res.error || 'failed');
    } catch {
      // revert
      setServerPrefs((p: any) => ({
        ...(p || {}),
        push: { ...(p?.push || {}), [key]: !next },
        email: { ...(p?.email || {}), [key]: !next },
      }));
      crossPlatformAlert(t('common.error'), t('settings.prefsSaveFailed', 'Неуспешно запазване на предпочитанията.'));
    }
  };

  const styles = getStyles(theme);
  const chevronColor = theme.colors.onSurfaceVariant;

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={styles.content}>
        {/* Notifications */}
        <Text style={styles.sectionTitle}>{t('settings.notifications')}</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('profile.pushNotifications')}</Text>
                <Text style={styles.settingDescription}>
                  {t('settings.pushNotificationsDesc')}
                </Text>
                {settings.pushNotifications && !hasNotificationPermission && (
                  <View style={styles.warningContainer}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      {t('settings.permissionNotGranted')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Switch
              value={settings.pushNotifications}
              onValueChange={() => handleToggle('pushNotifications')}
              trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
              thumbColor={settings.pushNotifications ? theme.colors.gold : '#F3F4F6'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="mail" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('profile.emailNotifications')}</Text>
                <Text style={styles.settingDescription}>
                  {t('settings.emailNotificationsDesc')}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.emailNotifications}
              onValueChange={() => handleToggle('emailNotifications')}
              trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
              thumbColor={settings.emailNotifications ? theme.colors.gold : '#F3F4F6'}
            />
          </View>

          {/* N2 — per-category notification preferences */}
          {OPTIONAL_CATEGORIES.map((cat) => (
            <View style={styles.settingRow} key={cat.key}>
              <View style={styles.settingInfo}>
                <Ionicons name="pricetags-outline" size={22} color={theme.colors.primary} />
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>{t(cat.labelKey, cat.fallback)}</Text>
                </View>
              </View>
              <Switch
                value={isCategoryEnabled(cat.key)}
                onValueChange={() => toggleCategory(cat.key)}
                trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
                thumbColor={isCategoryEnabled(cat.key) ? theme.colors.gold : '#F3F4F6'}
              />
            </View>
          ))}

          {/* Mandatory category — always on, cannot be disabled (spec §11.3). */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="megaphone-outline" size={22} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('settings.catSystem', 'Системни съобщения')}</Text>
                <Text style={styles.settingDescription}>{t('settings.catSystemDesc', 'Задължителни — винаги включени')}</Text>
              </View>
            </View>
            <Switch value={true} disabled trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }} thumbColor={theme.colors.gold} />
          </View>
        </View>

        {/* Privacy & Security */}
        <Text style={styles.sectionTitle}>{t('settings.privacySecurity')}</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="location" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('settings.locationServices')}</Text>
                <Text style={styles.settingDescription}>
                  {t('settings.locationServicesDesc')}
                </Text>
                {settings.locationServices && !isDeviceLocationEnabled && (
                  <View style={styles.warningContainer}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      {t('settings.deviceLocationDisabled')}
                    </Text>
                  </View>
                )}
                {settings.locationServices && isDeviceLocationEnabled && !hasLocationPermission && (
                  <View style={styles.warningContainer}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      {t('settings.permissionNotGranted')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Switch
              value={settings.locationServices}
              onValueChange={() => handleToggle('locationServices')}
              trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
              thumbColor={settings.locationServices ? theme.colors.gold : '#F3F4F6'}
            />
          </View>
          {settings.locationServices && !isDeviceLocationEnabled && (
            <TouchableOpacity style={styles.openSettingsButton} onPress={openDeviceSettings}>
              <Ionicons name="settings" size={20} color={theme.colors.primary} />
              <Text style={styles.openSettingsText}>{t('settings.openDeviceSettings')}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="finger-print" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>
                  {biometricType} {t('settings.authentication')}
                </Text>
                <Text style={styles.settingDescription}>
                  {t('settings.use')} {biometricType.toLowerCase()} {t('settings.toLoginQuickly')}
                </Text>
                {!isBiometricAvailable && (
                  <View style={styles.warningContainer}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      {t('settings.notAvailable')}
                    </Text>
                  </View>
                )}
                {isBiometricAvailable && !isBiometricEnrolled && (
                  <View style={styles.warningContainer}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      {t('settings.noEnrolled')} {biometricType.toLowerCase()}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Switch
              value={settings.biometricAuth}
              onValueChange={() => handleToggle('biometricAuth')}
              trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
              thumbColor={settings.biometricAuth ? theme.colors.gold : '#F3F4F6'}
              disabled={!isBiometricAvailable || !isBiometricEnrolled}
            />
          </View>
        </View>

        {/* Tab Visibility */}
        <>
          <Text style={styles.sectionTitle}>{t('settings.tabs', 'Навигация')}</Text>
            <View style={styles.section}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Ionicons name="pricetag" size={24} color={theme.colors.primary} />
                  <View style={styles.settingText}>
                    <Text style={styles.settingLabel}>{t('navigation.offers')}</Text>
                    <Text style={styles.settingDescription}>
                      {t('settings.showInBottomNav', 'Покажи в долната навигация')}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={showOffers}
                  onValueChange={setShowOffers}
                  trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
                  thumbColor={showOffers ? theme.colors.gold : '#F3F4F6'}
                />
              </View>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Ionicons name="location" size={24} color={theme.colors.primary} />
                  <View style={styles.settingText}>
                    <Text style={styles.settingLabel}>{t('nearby.title', 'Наблизо')}</Text>
                    <Text style={styles.settingDescription}>
                      {t('settings.showInBottomNav', 'Покажи в долната навигация')}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={showNearby}
                  onValueChange={setShowNearby}
                  trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
                  thumbColor={showNearby ? theme.colors.gold : '#F3F4F6'}
                />
              </View>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Ionicons name="heart" size={24} color={theme.colors.primary} />
                  <View style={styles.settingText}>
                    <Text style={styles.settingLabel}>{t('favorites.title', 'Любими')}</Text>
                    <Text style={styles.settingDescription}>
                      {t('settings.showInBottomNav', 'Покажи в долната навигация')}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={showFavorites}
                  onValueChange={setShowFavorites}
                  trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
                  thumbColor={showFavorites ? theme.colors.gold : '#F3F4F6'}
                />
              </View>
            </View>
        </>

        {/* Appearance */}
        <Text style={styles.sectionTitle}>{t('settings.general')}</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="moon" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('settings.dark')}</Text>
                <Text style={styles.settingDescription}>
                  {t('profile.darkMode')}
                </Text>
              </View>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={() => handleToggle('darkMode')}
              trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
              thumbColor={isDarkMode ? theme.colors.gold : '#F3F4F6'}
            />
          </View>
        </View>

        {/* Language */}
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={async () => {
              await changeLanguage('bg');
              setCurrentLanguage('bg');
              AuthApi.updateProfile({ preferredLanguage: 'bg' } as any).catch(() => {});
            }}
          >
            <View style={styles.settingInfo}>
              <Ionicons name="language" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('settings.bulgarian')}</Text>
              </View>
            </View>
            {currentLanguage === 'bg' && (
              <Ionicons name="checkmark-circle" size={24} color={theme.colors.gold} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={async () => {
              await changeLanguage('en');
              setCurrentLanguage('en');
              AuthApi.updateProfile({ preferredLanguage: 'en' } as any).catch(() => {});
            }}
          >
            <View style={styles.settingInfo}>
              <Ionicons name="language" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('settings.english')}</Text>
              </View>
            </View>
            {currentLanguage === 'en' && (
              <Ionicons name="checkmark-circle" size={24} color={theme.colors.gold} />
            )}
          </TouchableOpacity>
        </View>

        {/* Marketing Consent */}
        <Text style={styles.sectionTitle}>{t('settings.marketingConsent')}</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="mail" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('settings.marketingEmail')}</Text>
                <Text style={styles.settingDescription}>{t('settings.marketingEmailDesc')}</Text>
              </View>
            </View>
            <Switch
              value={marketingConsentEmail}
              onValueChange={handleMarketingConsentEmail}
              trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
              thumbColor={marketingConsentEmail ? theme.colors.gold : '#F3F4F6'}
            />
          </View>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="call" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('settings.marketingPhone')}</Text>
                <Text style={styles.settingDescription}>{t('settings.marketingPhoneDesc')}</Text>
              </View>
            </View>
            <Switch
              value={marketingConsentPhone}
              onValueChange={handleMarketingConsentPhone}
              trackColor={{ false: '#CBD5E1', true: '#E6D5A8' }}
              thumbColor={marketingConsentPhone ? theme.colors.gold : '#F3F4F6'}
            />
          </View>
        </View>

        {/* Data & Storage */}
        <Text style={styles.sectionTitle}>{t('settings.dataStorage')}</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.actionRow, { marginBottom: 4 }]}
            onPress={() => navigation.navigate('SyncAnalysis')}
          >
            <View style={styles.settingInfo}>
              <Ionicons name="sync" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('sync.title')}</Text>
                <Text style={styles.settingDescription}>{t('sync.settingsDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color={chevronColor} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow} onPress={handleClearCache}>
            <View style={styles.settingInfo}>
              <Ionicons name="trash" size={24} color={theme.colors.error} />
              <View style={styles.settingText}>
                <Text style={[styles.settingLabel, { color: theme.colors.error }]}>
                  {t('settings.clearCache')}
                </Text>
                <Text style={styles.settingDescription}>
                  {t('settings.freeUpSpace')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color={chevronColor} />
          </TouchableOpacity>
        </View>

        {/* Support */}
        <Text style={styles.sectionTitle}>{t('settings.support')}</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={handleReportProblem}>
            <View style={styles.settingInfo}>
              <Ionicons name="help-circle" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('settings.reportProblem')}</Text>
                <Text style={styles.settingDescription}>
                  {t('settings.contactSupport')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color={chevronColor} />
          </TouchableOpacity>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={handleDeleteAccount}>
            <View style={styles.settingInfo}>
              <Ionicons name="person-remove" size={24} color={theme.colors.error} />
              <View style={styles.settingText}>
                <Text style={[styles.settingLabel, { color: theme.colors.error }]}>
                  {t('settings.deleteAccount')}
                </Text>
                <Text style={styles.settingDescription}>
                  {t('settings.deleteAccountDesc')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color={chevronColor} />
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>BoomCard Version 1.0.0</Text>
          <Text style={styles.appInfoText}>© 2025 BoomCard. All rights reserved.</Text>
        </View>
      </View>
    </ScrollView>

    {/* Delete Account — password confirmation modal */}
    <Modal
      visible={showDeleteModal}
      transparent
      animationType="fade"
      onRequestClose={() => !isDeleting && setShowDeleteModal(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
            {t('settings.deleteAccountConfirmTitle')}
          </Text>
          <Text style={[styles.modalBody, { color: theme.colors.onSurfaceVariant }]}>
            {t('settings.deletePasswordPrompt')}
          </Text>
          <TextInput
            style={[styles.modalInput, { borderColor: theme.colors.outline, color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceVariant }]}
            placeholder={t('settings.deletePasswordPlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            secureTextEntry
            value={deletePassword}
            onChangeText={setDeletePassword}
            editable={!isDeleting}
            autoFocus
          />
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, { borderColor: theme.colors.outline }]}
              onPress={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              <Text style={{ color: theme.colors.onSurface }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.colors.error, borderColor: theme.colors.error }]}
              onPress={confirmDeleteAccount}
              disabled={isDeleting}
            >
              {isDeleting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff' }}>{t('settings.deleteAccount')}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginTop: 24,
    marginBottom: 12,
  },
  section: {
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 12,
    padding: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.onSurface,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  warningText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '500',
  },
  openSettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    marginTop: 4,
    gap: 8,
  },
  openSettingsText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  appInfo: {
    marginTop: 32,
    alignItems: 'center',
  },
  appInfoText: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SettingsScreen;
