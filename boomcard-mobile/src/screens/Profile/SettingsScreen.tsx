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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StorageService from '../../services/storage.service';
import { useTheme } from '../../contexts/ThemeContext';

const SettingsScreen = ({ navigation }: any) => {
  // Get theme state and toggle function from ThemeContext
  const { isDarkMode, toggleTheme } = useTheme();

  // Settings state - loaded from storage on mount (dark mode managed by ThemeContext)
  const [settings, setSettings] = useState({
    pushNotifications: true,
    emailNotifications: false,
    locationServices: true,
    biometricAuth: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from storage on mount
  useEffect(() => {
    loadSettings();
  }, []);

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

  const handleToggle = async (setting: keyof typeof settings | 'darkMode') => {
    // Handle dark mode separately using ThemeContext
    if (setting === 'darkMode') {
      await toggleTheme();
      return;
    }

    const newValue = !settings[setting];

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
      'Are you sure you want to clear all cached data? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            // Clear cache logic here
            Alert.alert('Success', 'Cache cleared successfully');
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Notifications */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="notifications" size={24} color="#3B82F6" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.settingDescription}>
                  Receive notifications about offers and receipts
                </Text>
              </View>
            </View>
            <Switch
              value={settings.pushNotifications}
              onValueChange={() => handleToggle('pushNotifications')}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={settings.pushNotifications ? '#3B82F6' : '#F3F4F6'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="mail" size={24} color="#3B82F6" />
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
              thumbColor={settings.emailNotifications ? '#3B82F6' : '#F3F4F6'}
            />
          </View>
        </View>

        {/* Privacy & Security */}
        <Text style={styles.sectionTitle}>Privacy & Security</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="location" size={24} color="#3B82F6" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Location Services</Text>
                <Text style={styles.settingDescription}>
                  Required for receipt verification
                </Text>
              </View>
            </View>
            <Switch
              value={settings.locationServices}
              onValueChange={() => handleToggle('locationServices')}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={settings.locationServices ? '#3B82F6' : '#F3F4F6'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="finger-print" size={24} color="#3B82F6" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Biometric Authentication</Text>
                <Text style={styles.settingDescription}>
                  Use fingerprint or Face ID to login
                </Text>
              </View>
            </View>
            <Switch
              value={settings.biometricAuth}
              onValueChange={() => handleToggle('biometricAuth')}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={settings.biometricAuth ? '#3B82F6' : '#F3F4F6'}
            />
          </View>
        </View>

        {/* Appearance */}
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Ionicons name="moon" size={24} color="#3B82F6" />
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
              thumbColor={isDarkMode ? '#3B82F6' : '#F3F4F6'}
            />
          </View>
        </View>

        {/* Data & Storage */}
        <Text style={styles.sectionTitle}>Data & Storage</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={handleClearCache}>
            <View style={styles.settingInfo}>
              <Ionicons name="trash" size={24} color="#EF4444" />
              <View style={styles.settingText}>
                <Text style={[styles.settingLabel, { color: '#EF4444' }]}>
                  Clear Cache
                </Text>
                <Text style={styles.settingDescription}>
                  Free up storage space
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Support */}
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionRow} onPress={handleReportProblem}>
            <View style={styles.settingInfo}>
              <Ionicons name="help-circle" size={24} color="#3B82F6" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Report a Problem</Text>
                <Text style={styles.settingDescription}>
                  Contact support
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 24,
    marginBottom: 12,
  },
  section: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#FFFFFF',
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
    color: '#1F2937',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
    color: '#6B7280',
  },
  appInfo: {
    marginTop: 32,
    alignItems: 'center',
  },
  appInfoText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
});

export default SettingsScreen;
