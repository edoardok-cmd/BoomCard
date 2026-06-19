/**
 * CompleteProfileScreen
 *
 * Handles the account-activation deeplink:
 *   https://mobile.boomcard.bg/complete-profile?token=ABC123
 *
 * The token is injected as a navigation param by AppNavigator (web) or
 * passed directly on native. The user sets a password, optional profile
 * fields, and marketing-consent preferences, then lands in the main app.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../store/AuthContext';
import apiClient from '../../api/client';
import { crossPlatformAlert } from '../../utils/alert';

// Password policy: 8+ chars, upper, lower, digit, special char
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  PlanSelection: undefined;
  Checkout: undefined;
  Register: undefined;
  CompleteProfile: { token: string };
};

interface CompleteProfileScreenProps {
  navigation: StackNavigationProp<AuthStackParamList, 'CompleteProfile'>;
  route: { params?: { token?: string } };
}

const CompleteProfileScreen = ({ navigation, route }: CompleteProfileScreenProps) => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { loginWithSession } = useAuth();

  const token = route?.params?.token ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [consentEmail, setConsentEmail] = useState(false);
  const [consentPhone, setConsentPhone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const styles = getStyles(theme);

  const validate = (): boolean => {
    if (!token) {
      setValidationError(t('auth.invalidActivationLink', 'Invalid activation link. Please use the link from your email.'));
      return false;
    }
    if (!password) {
      setValidationError(t('auth.passwordRequired', 'Password is required.'));
      return false;
    }
    if (!PASSWORD_REGEX.test(password)) {
      setValidationError(
        t(
          'auth.passwordPolicy',
          'Password must be at least 8 characters and include uppercase, lowercase, a digit and a special character.'
        )
      );
      return false;
    }
    if (password !== confirmPassword) {
      setValidationError(t('auth.passwordMismatch', 'Passwords do not match.'));
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      const lang = i18n.language?.startsWith('bg') ? 'bg' : 'en';
      const payload: Record<string, any> = {
        token,
        password,
        marketingConsentEmail: consentEmail,
        marketingConsentPhone: consentPhone,
        lang,
      };
      if (firstName.trim()) payload.firstName = firstName.trim();
      if (lastName.trim()) payload.lastName = lastName.trim();
      if (phone.trim()) payload.phone = phone.trim();

      const response = await apiClient.post<any>('/api/auth/complete-profile', payload);

      if (!response.success) {
        const msg: string = response.error || '';
        const lower = msg.toLowerCase();
        if (lower.includes('already exists')) {
          // 409 USER_ALREADY_EXISTS
          crossPlatformAlert(
            t('common.error', 'Error'),
            t('auth.accountAlreadyExists', 'An account with this email already exists. Please log in.'),
            [
              { text: t('common.cancel', 'Cancel'), style: 'cancel' as const },
              { text: t('auth.goToLogin', 'Go to Login'), onPress: () => navigation.navigate('Login') },
            ]
          );
          return;
        }
        if (lower.includes('expired') || lower.includes('invalid')) {
          crossPlatformAlert(
            t('common.error', 'Error'),
            t('auth.activationLinkExpired', 'Your activation link has expired. Please contact support.')
          );
          return;
        }
        crossPlatformAlert(
          t('common.error', 'Error'),
          msg || t('common.unexpectedError', 'An unexpected error occurred. Please try again.')
        );
        return;
      }

      // Success path — unwrap backend envelope
      const envelope = response.data;
      const authData = (envelope as any)?.data ?? envelope;

      if (!authData?.accessToken || !authData?.user || !authData?.refreshToken) {
        crossPlatformAlert(t('common.error', 'Error'), t('common.unexpectedError', 'An unexpected error occurred. Please try again.'));
        return;
      }

      await loginWithSession({
        user: authData.user,
        accessToken: authData.accessToken,
        refreshToken: authData.refreshToken,
      });
      // AppNavigator switches to MainNavigator once isAuthenticated becomes true.
    } catch (err: any) {
      // Network-level failure (timeout, no internet) — apiClient doesn't throw for HTTP errors
      const msg: string = err?.message || '';
      crossPlatformAlert(
        t('common.error', 'Error'),
        msg || t('common.unexpectedError', 'An unexpected error occurred. Please try again.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Back button — only shown when there's somewhere to go back to */}
        {navigation.canGoBack() && (
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.onSurface} />
          </TouchableOpacity>
        )}

        <View style={styles.header}>
          <Ionicons name="person-add-outline" size={52} color={theme.colors.gold} />
          <Text style={styles.title}>
            {t('auth.completeProfile', 'Activate Your Account')}
          </Text>
          <Text style={styles.subtitle}>
            {t(
              'auth.completeProfileSubtitle',
              'Set a password and fill in your details to complete activation.'
            )}
          </Text>
        </View>

        {/* Password */}
        <Text style={styles.label}>{t('auth.password', 'Password')} *</Text>
        <TextInput
          style={styles.input}
          placeholder={t('auth.passwordPlaceholder', 'At least 8 characters')}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={password}
          onChangeText={(v) => { setPassword(v); setValidationError(null); }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isLoading}
          testID="complete-profile-password"
        />

        {/* Confirm Password */}
        <Text style={styles.label}>{t('auth.confirmPassword', 'Confirm Password')} *</Text>
        <TextInput
          style={styles.input}
          placeholder={t('auth.confirmPasswordPlaceholder', 'Repeat your password')}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={confirmPassword}
          onChangeText={(v) => { setConfirmPassword(v); setValidationError(null); }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isLoading}
          testID="complete-profile-confirm-password"
        />

        {/* Inline validation error */}
        {validationError ? (
          <Text style={styles.errorText}>{validationError}</Text>
        ) : null}

        {/* Optional profile fields */}
        <Text style={styles.sectionTitle}>
          {t('auth.optionalDetails', 'Optional Details')}
        </Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.firstNamePlaceholder', 'First name')}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          editable={!isLoading}
          testID="complete-profile-first-name"
        />

        <TextInput
          style={styles.input}
          placeholder={t('auth.lastNamePlaceholder', 'Last name')}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          editable={!isLoading}
          testID="complete-profile-last-name"
        />

        <TextInput
          style={styles.input}
          placeholder={t('auth.phonePlaceholder', 'Phone number')}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          editable={!isLoading}
          testID="complete-profile-phone"
        />

        {/* Marketing consent */}
        <Text style={styles.sectionTitle}>
          {t('auth.marketingConsent', 'Marketing Preferences')}
        </Text>

        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setConsentEmail((v) => !v)}
          disabled={isLoading}
          testID="complete-profile-consent-email"
        >
          <Ionicons
            name={consentEmail ? 'checkbox' : 'square-outline'}
            size={22}
            color={consentEmail ? theme.colors.gold : theme.colors.onSurfaceVariant}
          />
          <Text style={styles.checkboxLabel}>
            {t('auth.consentEmail', 'I agree to receive promotional emails.')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setConsentPhone((v) => !v)}
          disabled={isLoading}
          testID="complete-profile-consent-phone"
        >
          <Ionicons
            name={consentPhone ? 'checkbox' : 'square-outline'}
            size={22}
            color={consentPhone ? theme.colors.gold : theme.colors.onSurfaceVariant}
          />
          <Text style={styles.checkboxLabel}>
            {t('auth.consentPhone', 'I agree to receive promotional SMS / calls.')}
          </Text>
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
          testID="complete-profile-submit"
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              {t('auth.activateAccount', 'Activate Account')}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => navigation.navigate('Login')}
          disabled={isLoading}
        >
          <Text style={styles.loginLinkText}>
            {t('auth.alreadyHaveAccount', 'Already have an account? Log in')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      flexGrow: 1,
      padding: 24,
      paddingTop: 16,
    },
    backButton: {
      marginBottom: 16,
      padding: 4,
      alignSelf: 'flex-start',
    },
    header: {
      alignItems: 'center',
      marginBottom: 32,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: theme.colors.onSurface,
      marginTop: 16,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 15,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 22,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.onSurfaceVariant,
      marginBottom: 4,
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginTop: 24,
      marginBottom: 12,
    },
    input: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      marginBottom: 16,
      color: theme.colors.onSurface,
    },
    errorText: {
      color: theme.colors.error ?? '#DC2626',
      fontSize: 13,
      marginTop: -8,
      marginBottom: 12,
      lineHeight: 18,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 14,
      gap: 10,
    },
    checkboxLabel: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.onSurface,
      lineHeight: 20,
    },
    button: {
      backgroundColor: theme.colors.gold,
      borderRadius: 28,
      padding: 16,
      alignItems: 'center',
      marginTop: 24,
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
    loginLink: {
      alignItems: 'center',
      marginTop: 20,
      padding: 8,
    },
    loginLinkText: {
      fontSize: 14,
      color: theme.colors.gold,
      fontWeight: '600',
    },
  });

export default CompleteProfileScreen;
