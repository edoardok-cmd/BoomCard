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
import { useTheme } from '../../contexts/ThemeContext';
import apiClient from '../../api/client';
import { crossPlatformAlert } from '../../utils/alert';

const ForgotPasswordScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const styles = getStyles(theme);

  const handleSendCode = async () => {
    if (!email.trim()) {
      crossPlatformAlert(t('common.error'), t('auth.invalidEmail'));
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.post('/api/auth/forgot-password', { email: email.toLowerCase().trim() });
      setStep('otp');
    } catch {
      // Always show success to prevent email enumeration
      setStep('otp');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!otp.trim() || otp.length !== 6) {
      crossPlatformAlert(t('common.error'), t('auth.invalidResetCode'));
      return;
    }
    if (newPassword.length < 8) {
      crossPlatformAlert(t('common.error'), t('auth.invalidPassword'));
      return;
    }
    if (newPassword !== confirmPassword) {
      crossPlatformAlert(t('common.error'), t('auth.passwordMismatch'));
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.post('/api/auth/reset-password', {
        email: email.toLowerCase().trim(),
        otp: otp.trim(),
        newPassword,
      });
      crossPlatformAlert(
        t('common.success'),
        t('auth.passwordResetSuccess'),
        [{ text: t('common.ok'), onPress: () => navigation.navigate('Login') }]
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message || t('auth.passwordResetError');
      crossPlatformAlert(t('common.error'), msg);
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
        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Ionicons name="lock-open-outline" size={52} color={theme.colors.gold} />
          <Text style={styles.title}>{t('auth.forgotPassword')}</Text>
          <Text style={styles.subtitle}>
            {step === 'email' ? t('auth.forgotPasswordSubtitle') : t('auth.enterResetCode', { email })}
          </Text>
        </View>

        {step === 'email' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>{t('auth.sendResetCode')}</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.emailHint}>{email}</Text>

            <TextInput
              style={styles.input}
              placeholder={t('auth.resetCodePlaceholder')}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              editable={!isLoading}
            />

            <TextInput
              style={styles.input}
              placeholder={t('auth.newPassword')}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />

            <TextInput
              style={styles.input}
              placeholder={t('auth.confirmPassword')}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>{t('auth.resetPassword')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendButton} onPress={() => { setStep('email'); setOtp(''); }}>
              <Text style={styles.resendText}>{t('auth.resendCode')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
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
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
  emailHint: {
    fontSize: 14,
    color: theme.colors.gold,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
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
  resendButton: {
    alignItems: 'center',
    marginTop: 20,
    padding: 8,
  },
  resendText: {
    fontSize: 14,
    color: theme.colors.gold,
    fontWeight: '600',
  },
});

export default ForgotPasswordScreen;
