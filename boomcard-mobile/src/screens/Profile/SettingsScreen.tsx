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
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import StorageService from '../../services/storage.service';
import LocationService from '../../services/location.service';
import BiometricService from '../../services/biometric.service';
import NotificationService from '../../services/notification.service';
import notificationsApi from '../../api/notifications.api';
import { useTheme } from '../../contexts/ThemeContext';

const SettingsScreen = ({ navigation }: any) => {
  // Get theme state and toggle function from ThemeContext
  const { isDarkMode, toggleTheme, theme } = useTheme();
  const queryClient = useQueryClient();

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
      ] = await Promise.all([
        StorageService.getPushNotifications(),
        StorageService.getEmailNotifications(),
        StorageService.getLocationServices(),
        StorageService.getBiometricEnabled(),
      ]);

      setSettings({
        pushNotifications,
        emailNotifications,
        locationServices,
        biometricAuth,
      });
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
      const permissions = await NotificationService.checkPermissions();
      setHasNotificationPermission(permissions.granted);
    } catch (error) {
      console.error('Failed to check notification permissions:', error);
    }
  };

  const openDeviceSettings = () => {
    Alert.alert(
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
      // Check current permissions
      const permissions = await NotificationService.checkPermissions();

      if (!permissions.granted) {
        // Request permissions
        const result = await NotificationService.requestPermissions();

        if (!result.granted) {
          Alert.alert(
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
        console.log('Push token registered:', tokenResult.token);

        // Send token to backend
        const platform = Platform.OS;
        const registerResponse = await notificationsApi.registerPushToken(
          tokenResult.token,
          platform
        );

        if (registerResponse.success) {
          Alert.alert(
            'Success',
            'Push notifications enabled! You will receive updates about offers and receipts.'
          );
        } else {
          console.warn('Failed to register token with backend:', registerResponse.error);
          Alert.alert(
            'Partial Success',
            'Notifications enabled locally. Token will be synced with server when connection is available.'
          );
        }
      } else {
        Alert.alert(
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
          Alert.alert(
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
        Alert.alert(
          'Not Available',
          'Biometric authentication is not available on this device.'
        );
        return;
      }

      // Check if biometric credentials are enrolled
      if (!isBiometricEnrolled) {
        Alert.alert(
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
        Alert.alert('Authentication Failed', result.error || 'Please try again.');
        return;
      }

      Alert.alert(
        'Success',
        `${biometricType} authentication enabled. You can now use it to login.`
      );
    }

    // Update local state
    setSettings({
      ...settings,
      [setting]: newValue,
    });

    // Persist to storage
    try {
      switch (setting) {
        case 'pushNotifications':
          await StorageService.setPushNotifications(newValue);
          break;
        case 'emailNotifications':
          await StorageService.setEmailNotifications(newValue);
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
      Alert.alert('Error', 'Failed to save setting');
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
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
              const keys = await AsyncStorage.getAllKeys();
              const keysToRemove = keys.filter(
                key => !key.includes('token') &&
                       !key.includes('user') &&
                       !key.includes('theme') &&
                       !key.includes('language')
              );
              await AsyncStorage.multiRemove(keysToRemove);

              // Restore preferences
              if (theme) await StorageService.setTheme(theme);
              if (language) await StorageService.setLanguage(language);

              Alert.alert(
                'Success',
                'Cache cleared successfully. Some data will be reloaded when you use the app.'
              );
            } catch (error) {
              console.error('Failed to clear cache:', error);
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleReportProblem = () => {
    Alert.alert(
      'Report a Problem',
      'Would you like to send an email to our support team?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Email',
          onPress: () => {
            // Open email client
            Alert.alert('Info', 'Opening email client...');
          },
        },
      ]
    );
  };

  const styles = getStyles(theme);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Notifications */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.settingDescription}>
                  Receive notifications about offers and receipts
                </Text>
                {settings.pushNotifications && !hasNotificationPermission && (
                  <View style={styles.warningContainer}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      Permission not granted
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Switch
              value={settings.pushNotifications}
              onValueChange={() => handleToggle('pushNotifications')}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={settings.pushNotifications ? theme.colors.primary : '#F3F4F6'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="mail" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Email Notifications</Text>
                <Text style={styles.settingDescription}>
                  Receive updates via email
                </Text>
              </View>
            </View>
            <Switch
              value={settings.emailNotifications}
              onValueChange={() => handleToggle('emailNotifications')}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={settings.emailNotifications ? theme.colors.primary : '#F3F4F6'}
            />
          </View>
        </View>

        {/* Privacy & Security */}
        <Text style={styles.sectionTitle}>Privacy & Security</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="location" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Location Services</Text>
                <Text style={styles.settingDescription}>
                  Required for receipt verification
                </Text>
                {settings.locationServices && !isDeviceLocationEnabled && (
                  <View style={styles.warningContainer}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      Device location is disabled
                    </Text>
                  </View>
                )}
                {settings.locationServices && isDeviceLocationEnabled && !hasLocationPermission && (
                  <View style={styles.warningContainer}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      Permission not granted
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Switch
              value={settings.locationServices}
              onValueChange={() => handleToggle('locationServices')}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={settings.locationServices ? theme.colors.primary : '#F3F4F6'}
            />
          </View>
          {settings.locationServices && !isDeviceLocationEnabled && (
            <TouchableOpacity style={styles.openSettingsButton} onPress={openDeviceSettings}>
              <Ionicons name="settings" size={20} color={theme.colors.primary} />
              <Text style={styles.openSettingsText}>Open Device Settings</Text>
            </TouchableOpacity>
          )}

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="finger-print" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>
                  {biometricType} Authentication
                </Text>
                <Text style={styles.settingDescription}>
                  Use {biometricType.toLowerCase()} to login quickly
                </Text>
                {!isBiometricAvailable && (
                  <View style={styles.warningContainer}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      Not available on this device
                    </Text>
                  </View>
                )}
                {isBiometricAvailable && !isBiometricEnrolled && (
                  <View style={styles.warningContainer}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      No {biometricType.toLowerCase()} enrolled
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Switch
              value={settings.biometricAuth}
              onValueChange={() => handleToggle('biometricAuth')}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={settings.biometricAuth ? theme.colors.primary : '#F3F4F6'}
              disabled={!isBiometricAvailable || !isBiometricEnrolled}
            />
          </View>
        </View>

        {/* Appearance */}
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="moon" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Dark Mode</Text>
                <Text style={styles.settingDescription}>
                  Use dark theme
                </Text>
              </View>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={() => handleToggle('darkMode')}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={isDarkMode ? theme.colors.primary : '#F3F4F6'}
            />
          </View>
        </View>

        {/* Data & Storage */}
        <Text style={styles.sectionTitle}>Data & Storage</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={handleClearCache}>
            <View style={styles.settingInfo}>
              <Ionicons name="trash" size={24} color={theme.colors.error} />
              <View style={styles.settingText}>
                <Text style={[styles.settingLabel, { color: theme.colors.error }]}>
                  Clear Cache
                </Text>
                <Text style={styles.settingDescription}>
                  Free up storage space
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color={styles.chevronColor} />
          </TouchableOpacity>
        </View>

        {/* Support */}
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={handleReportProblem}>
            <View style={styles.settingInfo}>
              <Ionicons name="help-circle" size={24} color={theme.colors.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Report a Problem</Text>
                <Text style={styles.settingDescription}>
                  Contact support
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color={styles.chevronColor} />
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>BoomCard Version 1.0.0</Text>
          <Text style={styles.appInfoText}>© 2025 BoomCard. All rights reserved.</Text>
        </View>
      </View>
    </ScrollView>
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
  chevronColor: theme.colors.onSurfaceVariant,
  appInfo: {
    marginTop: 32,
    alignItems: 'center',
  },
  appInfoText: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
});

export default SettingsScreen;
