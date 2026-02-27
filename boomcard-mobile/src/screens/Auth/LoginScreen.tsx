/**
 * Login Screen
 *
 * User authentication with email and password
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../store/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import BiometricService from '../../services/biometric.service';
import StorageService from '../../services/storage.service';
import type { LoginRequest } from '../../types';
import { getErrorMessage } from '../../utils/error';

const LoginScreen = ({ navigation }: any) => {
  const { login, refetchUser } = useAuth();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [credentials, setCredentials] = useState<LoginRequest>({
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('Biometric');

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    try {
      // Check if biometric is enabled in settings
      const isEnabled = await StorageService.getBiometricEnabled();
      if (!isEnabled) {
        setIsBiometricAvailable(false);
        return;
      }

      // Check device capabilities
      const capabilities = await BiometricService.checkCapabilities();
      const available = capabilities.isAvailable && capabilities.isEnrolled;
      setIsBiometricAvailable(available);

      // Set biometric type name
      if (capabilities.biometricType === 'facial') {
        setBiometricType('Face ID');
      } else if (capabilities.biometricType === 'fingerprint') {
        setBiometricType('Fingerprint');
      } else {
        setBiometricType('Biometric');
      }
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      setIsBiometricAvailable(false);
    }
  };

  const handleLogin = async () => {
    // Validation
    if (!credentials.email || !credentials.password) {
      Alert.alert(t('common.error'), t('auth.enterEmailPassword'));
      return;
    }

    if (!credentials.email.includes('@')) {
      Alert.alert(t('common.error'), t('auth.invalidEmail'));
      return;
    }

    setIsLoading(true);
    try {
      await login(credentials);
      // Navigation will be handled automatically by AppNavigator
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = getErrorMessage(error);

      // Final safety check: never show "[object Object]"
      if (!errorMessage || errorMessage.includes('[object Object]') || errorMessage.includes('[object') || errorMessage === '{}') {
        errorMessage = t('auth.loginFailedMessage');
      }

      Alert.alert(t('auth.loginError'), errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setIsLoading(true);
    try {
      // Authenticate with biometrics
      const result = await BiometricService.authenticate(
        t('auth.biometricPrompt', { type: biometricType }),
        t('common.cancel')
      );

      if (!result.success) {
        if (result.error && !result.error.includes('cancel')) {
          Alert.alert(t('auth.authenticationFailed'), result.error);
        }
        return;
      }

      // Check if we have valid tokens stored
      const hasToken = await StorageService.getAccessToken();
      if (!hasToken) {
        Alert.alert(
          t('auth.sessionExpired'),
          t('auth.sessionExpiredMessage'),
          [
            {
              text: t('common.ok'),
              onPress: () => setIsBiometricAvailable(false),
            },
          ]
        );
        return;
      }

      // Fetch user profile with stored token
      await refetchUser();
      // Navigation will be handled automatically by AppNavigator
    } catch (error: any) {
      console.error('Biometric login error:', error);
      Alert.alert(
        t('auth.biometricLoginFailed'),
        t('auth.biometricLoginFailedMessage')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const styles = getStyles(theme);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image source={require('../../../assets/icon.png')} style={styles.logo} />
          <Text style={styles.title}>BOOM Card</Text>
          <Text style={styles.subtitle}>{t('auth.welcomeBack')}</Text>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={credentials.email}
            onChangeText={(text) =>
              setCredentials({ ...credentials, email: text.toLowerCase() })
            }
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <TextInput
            style={styles.input}
            placeholder={t('auth.passwordPlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={credentials.password}
            onChangeText={(text) =>
              setCredentials({ ...credentials, password: text })
            }
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{t('auth.loginButton')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Biometric Login */}
        {isBiometricAvailable && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('auth.or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.biometricButton, isLoading && styles.buttonDisabled]}
              onPress={handleBiometricLogin}
              disabled={isLoading}
            >
              <Ionicons name="finger-print" size={24} color={theme.colors.gold} />
              <Text style={styles.biometricButtonText}>
                {t('auth.loginWith', { type: biometricType })}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Choose Plan Link */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={() => navigation.navigate('PlanSelection')}>
            <Text style={styles.link}>{t('auth.choosePlan')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.onSurfaceVariant,
  },
  form: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    color: theme.colors.onSurface,
  },
  button: {
    backgroundColor: theme.colors.gold,
    borderRadius: 28,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#C49B38',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.surfaceVariant,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: theme.colors.onGold,
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.surfaceVariant,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    fontWeight: '500',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    padding: 16,
    marginBottom: 24,
    gap: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.gold,
  },
  biometricButtonText: {
    color: theme.colors.gold,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
  },
  link: {
    fontSize: 14,
    color: theme.colors.gold,
    fontWeight: '600',
  },
});

export default LoginScreen;
