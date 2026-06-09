/**
 * Edit Profile Screen
 *
 * Allows users to update their profile information
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
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { crossPlatformAlert } from '../../utils/alert';
import { useAuth } from '../../store/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { validateName, validatePhoneOptional, normalizePhone, filterPhoneInput } from '../../utils/validation';
import { walletApi } from '../../api/wallet.api';
import AuthApi from '../../api/auth.api';

const EditProfileScreen = ({ navigation }: any) => {
  const { t } = useTranslation();

  useEffect(() => {
    navigation.setOptions({
      title: t('navigation.editProfile'),
    });
  }, [navigation, t]);
  const { user, updateProfile, refetchUser } = useAuth();
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    city: user?.city || '',
    country: user?.country || '',
  });

  // A4 — email-change flow state (request code → verify with code + password)
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailStep, setEmailStep] = useState<'request' | 'verify'>('request');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const openEmailModal = () => {
    setNewEmail('');
    setEmailCode('');
    setEmailPassword('');
    setEmailStep('request');
    setEmailModalVisible(true);
  };

  const handleRequestEmailChange = async () => {
    const email = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      crossPlatformAlert(t('common.error'), t('profile.invalidEmail', 'Невалиден имейл адрес.'));
      return;
    }
    setEmailLoading(true);
    try {
      const res = await AuthApi.requestEmailChange(email);
      if (res.success) {
        setEmailStep('verify');
      } else {
        crossPlatformAlert(t('common.error'), res.error || t('profile.emailChangeFailed', 'Неуспешна заявка за смяна на имейл.'));
      }
    } catch (e: any) {
      crossPlatformAlert(t('common.error'), e.message || t('profile.emailChangeFailed', 'Неуспешна заявка за смяна на имейл.'));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmailChange = async () => {
    if (!emailCode.trim() || !emailPassword.trim()) {
      crossPlatformAlert(t('common.error'), t('profile.emailCodePasswordRequired', 'Въведете кода и паролата си.'));
      return;
    }
    setEmailLoading(true);
    try {
      const res = await AuthApi.confirmEmailChange(emailCode.trim(), emailPassword.trim());
      if (res.success) {
        setEmailModalVisible(false);
        refetchUser().catch(() => {});
        crossPlatformAlert(t('common.success'), t('profile.emailChanged', 'Имейл адресът Ви беше променен.'));
      } else {
        crossPlatformAlert(t('common.error'), res.error || t('profile.emailChangeFailed', 'Неуспешна смяна на имейл.'));
      }
    } catch (e: any) {
      crossPlatformAlert(t('common.error'), e.message || t('profile.emailChangeFailed', 'Неуспешна смяна на имейл.'));
    } finally {
      setEmailLoading(false);
    }
  };

  const [payoutIban, setPayoutIban] = useState('');
  const [payoutBeneficiaryName, setPayoutBeneficiaryName] = useState('');
  const [ibanLoading, setIbanLoading] = useState(false);
  const [ibanSaved, setIbanSaved] = useState(false);

  useEffect(() => {
    walletApi.getBalance().then((balance: any) => {
      if (balance.payoutIban) setPayoutIban(balance.payoutIban);
      if (balance.payoutBeneficiaryName) setPayoutBeneficiaryName(balance.payoutBeneficiaryName);
    }).catch(() => {});
  }, []);

  const handleSavePayoutAccount = async () => {
    const ibanClean = payoutIban.replace(/\s+/g, '').toUpperCase();
    if (!ibanClean) {
      crossPlatformAlert(t('common.error'), t('wallet.payoutIbanRequiredDesc'));
      return;
    }
    if (!payoutBeneficiaryName.trim()) {
      crossPlatformAlert(t('common.error'), t('wallet.payoutBeneficiaryRequiredDesc'));
      return;
    }
    setIbanLoading(true);
    setIbanSaved(false);
    try {
      await walletApi.updatePayoutAccount(ibanClean, payoutBeneficiaryName.trim());
      setPayoutIban(ibanClean);
      setIbanSaved(true);
    } catch (error: any) {
      crossPlatformAlert(t('common.error'), error.message || t('profile.updateError'));
    } finally {
      setIbanLoading(false);
    }
  };

  const handleSave = async () => {
    if (validateName(formData.firstName)) {
      crossPlatformAlert(t('common.error'), t('profile.firstNameRequired'));
      return;
    }
    if (validateName(formData.lastName)) {
      crossPlatformAlert(t('common.error'), t('profile.lastNameRequired'));
      return;
    }
    if (validatePhoneOptional(formData.phone)) {
      crossPlatformAlert(t('common.error'), t('profile.invalidPhone'));
      return;
    }

    setIsLoading(true);
    try {
      await updateProfile({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: normalizePhone(formData.phone),
        // A7 §13.5 — location fields
        city: formData.city.trim(),
        country: formData.country.trim(),
      });
      // Sync AuthContext with confirmed server state after the mutation succeeds
      refetchUser().catch(() => {});
      crossPlatformAlert(t('common.success'), t('profile.updateSuccess'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      crossPlatformAlert(t('common.error'), error.message || t('profile.updateError'));
    } finally {
      setIsLoading(false);
    }
  };

  const styles = getStyles(theme);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.sectionTitle}>{t('profile.personalInfo')}</Text>

        <View style={styles.form}>
          <Text style={styles.label}>{t('auth.firstName')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('profile.enterFirstName')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.firstName}
            onChangeText={(text) =>
              setFormData({ ...formData, firstName: text })
            }
            editable={!isLoading}
          />

          <Text style={styles.label}>{t('auth.lastName')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('profile.enterLastName')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.lastName}
            onChangeText={(text) =>
              setFormData({ ...formData, lastName: text })
            }
            editable={!isLoading}
          />

          <Text style={styles.label}>{t('auth.phone')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('profile.enterPhone')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.phone}
            onChangeText={(text) =>
              setFormData({ ...formData, phone: filterPhoneInput(text) })
            }
            keyboardType="phone-pad"
            editable={!isLoading}
          />
          <Text style={styles.helperText}>{t('profile.phoneFormatHint')}</Text>

          {/* A7 §13.5 — city / country */}
          <Text style={styles.label}>{t('profile.city', 'Град')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('profile.enterCity', 'Въведете град')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.city}
            onChangeText={(text) => setFormData({ ...formData, city: text })}
            editable={!isLoading}
          />

          <Text style={styles.label}>{t('profile.country', 'Държава')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('profile.enterCountry', 'Въведете държава')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={formData.country}
            onChangeText={(text) => setFormData({ ...formData, country: text })}
            editable={!isLoading}
          />

          {/* A4 §13.5 — email with self-service change entry point */}
          <Text style={styles.label}>{t('profile.email')}</Text>
          <View style={styles.emailRow}>
            <TextInput
              style={[styles.input, styles.inputDisabled, styles.emailInput]}
              value={user?.email || ''}
              editable={false}
            />
            <TouchableOpacity style={styles.changeEmailBtn} onPress={openEmailModal}>
              <Text style={styles.changeEmailText}>{t('profile.changeEmail', 'Смяна')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helperText}>{t('profile.emailChangeHint', 'Ще получите код за потвърждение на новия адрес.')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{t('profile.saveChanges')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={() => navigation.goBack()}
          disabled={isLoading}
        >
          <Text style={styles.buttonSecondaryText}>{t('common.cancel')}</Text>
        </TouchableOpacity>

        {/* Payout Bank Account ─────────────────────────────────────────── */}
        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>{t('profile.payoutAccountTitle')}</Text>
        <Text style={styles.sectionSubtitle}>{t('profile.payoutAccountSubtitle')}</Text>

        <View style={styles.form}>
          <Text style={styles.label}>{t('wallet.payoutIbanLabel')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('wallet.payoutIbanPlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={payoutIban}
            onChangeText={(v) => { setPayoutIban(v.replace(/\s+/g, '').toUpperCase()); setIbanSaved(false); }}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!ibanLoading}
          />

          <Text style={styles.label}>{t('wallet.payoutBeneficiaryLabel')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('wallet.payoutBeneficiaryPlaceholder')}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={payoutBeneficiaryName}
            onChangeText={(v) => { setPayoutBeneficiaryName(v); setIbanSaved(false); }}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!ibanLoading}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, ibanLoading && styles.buttonDisabled]}
          onPress={handleSavePayoutAccount}
          disabled={ibanLoading}
        >
          {ibanLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              {ibanSaved ? t('profile.payoutAccountSaved') : t('profile.savePayoutAccount')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* A4 — Email-change modal */}
      <Modal
        visible={emailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !emailLoading && setEmailModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
              {t('profile.changeEmailTitle', 'Смяна на имейл')}
            </Text>

            {emailStep === 'request' ? (
              <>
                <Text style={[styles.modalBody, { color: theme.colors.onSurfaceVariant }]}>
                  {t('profile.changeEmailRequestBody', 'Въведете новия имейл адрес. Ще изпратим код за потвърждение.')}
                </Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.onSurface }]}
                  placeholder={t('profile.newEmailPlaceholder', 'Нов имейл')}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!emailLoading}
                  autoFocus
                />
              </>
            ) : (
              <>
                <Text style={[styles.modalBody, { color: theme.colors.onSurfaceVariant }]}>
                  {t('profile.changeEmailVerifyBody', 'Въведете кода от имейла и текущата си парола.')}
                </Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.onSurface }]}
                  placeholder={t('profile.emailCodePlaceholder', 'Код за потвърждение')}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  value={emailCode}
                  onChangeText={setEmailCode}
                  autoCapitalize="characters"
                  editable={!emailLoading}
                  autoFocus
                />
                <TextInput
                  style={[styles.input, { color: theme.colors.onSurface, marginTop: 12 }]}
                  placeholder={t('settings.deletePasswordPlaceholder', 'Текуща парола')}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  value={emailPassword}
                  onChangeText={setEmailPassword}
                  secureTextEntry
                  editable={!emailLoading}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.colors.outline }]}
                onPress={() => setEmailModalVisible(false)}
                disabled={emailLoading}
              >
                <Text style={{ color: theme.colors.onSurface }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.colors.gold, borderColor: theme.colors.gold }]}
                onPress={emailStep === 'request' ? handleRequestEmailChange : handleVerifyEmailChange}
                disabled={emailLoading}
              >
                {emailLoading
                  ? <ActivityIndicator size="small" color={theme.colors.onGold} />
                  : <Text style={{ color: theme.colors.onGold, fontWeight: '700' }}>
                      {emailStep === 'request' ? t('common.continue', 'Продължи') : t('common.confirm', 'Потвърди')}
                    </Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  inputDisabled: {
    backgroundColor: theme.colors.surfaceVariant,
    color: theme.colors.onSurfaceVariant,
  },
  helperText: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.surfaceVariant,
    marginVertical: 24,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 8,
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
  buttonSecondary: {
    borderRadius: 28,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonSecondaryText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emailInput: {
    flex: 1,
  },
  changeEmailBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.gold,
  },
  changeEmailText: {
    color: theme.colors.gold,
    fontWeight: '700',
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
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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

export default EditProfileScreen;
