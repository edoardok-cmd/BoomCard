/**
 * Change Password Screen
 *
 * Allows users to change their account password
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import AuthApi from '../../api/auth.api';
import { useTheme } from '../../contexts/ThemeContext';

const ChangePasswordScreen = ({ navigation }: any) => {
  const { t } = useTranslation();

  useEffect(() => {
    navigation.setOptions({
      title: t('profile.changePassword'),
    });
  }, [navigation, t]);
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const validateForm = () => {
    if (!formData.currentPassword) {
      Alert.alert(t('common.error'), t('profile.enterCurrentPassword'));
      return false;
    }

    if (!formData.newPassword) {
      Alert.alert(t('common.error'), t('profile.enterNewPassword'));
      return false;
    }

    if (formData.newPassword.length < 8) {
      Alert.alert(t('common.error'), t('profile.passwordMinLength'));
      return false;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      Alert.alert(t('common.error'), t('profile.passwordMismatch'));
      return false;
    }

    if (formData.currentPassword === formData.newPassword) {
      Alert.alert(t('common.error'), t('profile.passwordMustBeDifferent'));
      return false;
    }

    return true;
  };

  const handleChangePassword = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const response = await AuthApi.changePassword(
        formData.currentPassword,
        formData.newPassword
      );

      if (response.success) {
        Alert.alert(t('common.success'), t('profile.passwordChangeSuccess'), [
          { text: t('common.ok'), onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert(t('common.error'), response.error || t('profile.passwordChangeError'));
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('profile.passwordChangeError'));
    } finally {
      setIsLoading(false);
    }
  };

  const styles = getStyles(theme);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.sectionTitle}>{t('profile.changePassword')}</Text>
        <Text style={styles.description}>
          {t('profile.passwordChangeDescription')}
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>{t('profile.currentPassword')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('profile.enterCurrentPassword')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.currentPassword}
            onChangeText={(text) =>
              setFormData({ ...formData, currentPassword: text })
            }
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <Text style={styles.label}>{t('profile.newPassword')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('profile.enterNewPasswordPlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.newPassword}
            onChangeText={(text) =>
              setFormData({ ...formData, newPassword: text })
            }
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          <Text style={styles.label}>{t('profile.confirmNewPassword')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('profile.reenterNewPassword')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.confirmPassword}
            onChangeText={(text) =>
              setFormData({ ...formData, confirmPassword: text })
            }
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
        </View>

        <View style={styles.requirements}>
          <Text style={styles.requirementsTitle}>{t('profile.passwordRequirements')}:</Text>
          <Text style={styles.requirementItem}>• {t('profile.requirement8Chars')}</Text>
          <Text style={styles.requirementItem}>• {t('profile.requirementDifferent')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleChangePassword}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{t('profile.changePassword')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={() => navigation.goBack()}
          disabled={isLoading}
        >
          <Text style={styles.buttonSecondaryText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
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
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 24,
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: theme.colors.onSurface,
  },
  requirements: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
  requirementItem: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.surfaceVariant,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonSecondaryText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ChangePasswordScreen;
