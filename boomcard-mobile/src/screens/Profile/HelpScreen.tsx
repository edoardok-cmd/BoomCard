import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { crossPlatformAlert } from '../../utils/alert';
import { helpApi } from '../../api/help.api';

const CATEGORIES = [
  { key: 'CASHBACK', labelKey: 'help.categoryCashback' },
  { key: 'ACCOUNT', labelKey: 'help.categoryAccount' },
  { key: 'PAYMENT', labelKey: 'help.categoryPayment' },
  { key: 'TECHNICAL', labelKey: 'help.categoryTechnical' },
  { key: 'OTHER', labelKey: 'help.categoryOther' },
] as const;

// N4 §12.2 — request types accepted by the backend (USER_REQUEST_TYPES).
const REQUEST_TYPE_OPTIONS = [
  { key: 'SUPPORT', labelKey: 'help.typeSupport', fallback: 'Поддръжка' },
  { key: 'DISPUTE', labelKey: 'help.typeDispute', fallback: 'Спор' },
  { key: 'CHANGE', labelKey: 'help.typeChange', fallback: 'Промяна' },
  { key: 'OTHER', labelKey: 'help.typeOther', fallback: 'Друго' },
] as const;

type Category = typeof CATEGORIES[number]['key'];
type RequestType = typeof REQUEST_TYPE_OPTIONS[number]['key'];

const HelpScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<Category>('OTHER');
  const [requestType, setRequestType] = useState<RequestType>('SUPPORT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const styles = getStyles(theme);

  const handleSubmit = async () => {
    if (!subject.trim() || subject.trim().length < 5) {
      crossPlatformAlert(t('common.error'), t('help.subjectTooShort'));
      return;
    }
    if (!message.trim() || message.trim().length < 10) {
      crossPlatformAlert(t('common.error'), t('help.messageTooShort'));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await helpApi.submitTicket({
        subject: subject.trim(),
        body: message.trim(),
        category,
        requestType, // N4 §12.2
      });
      if (response.success) {
        crossPlatformAlert(t('common.success'), t('help.submitSuccess'), [
          { text: t('common.ok'), onPress: () => navigation.goBack() },
        ]);
      } else {
        crossPlatformAlert(t('common.error'), t('help.submitError'));
      }
    } catch {
      crossPlatformAlert(t('common.error'), t('help.submitError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        {/* N3 — link to the user's existing requests (status + thread). */}
        <TouchableOpacity style={styles.myRequestsBtn} onPress={() => navigation.navigate('MyRequests')}>
          <Ionicons name="list-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.myRequestsText}>{t('help.myRequests', 'Моите заявки')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>

        {/* N4 §12.2 — request type */}
        <Text style={styles.sectionTitle}>{t('help.requestType', 'Тип заявка')}</Text>
        <View style={styles.categoryRow}>
          {REQUEST_TYPE_OPTIONS.map((rt) => (
            <TouchableOpacity
              key={rt.key}
              style={[styles.categoryBtn, requestType === rt.key && styles.categoryBtnActive]}
              onPress={() => setRequestType(rt.key)}
            >
              <Text style={[styles.categoryBtnText, requestType === rt.key && styles.categoryBtnTextActive]}>
                {t(rt.labelKey, rt.fallback)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('help.category')}</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[styles.categoryBtn, category === cat.key && styles.categoryBtnActive]}
              onPress={() => setCategory(cat.key)}
            >
              <Text style={[styles.categoryBtnText, category === cat.key && styles.categoryBtnTextActive]}>
                {t(cat.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('help.subject')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('help.subjectPlaceholder')}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={subject}
          onChangeText={setSubject}
          maxLength={200}
        />

        <Text style={styles.sectionTitle}>{t('help.message')}</Text>
        <TextInput
          style={[styles.input, styles.messageInput]}
          placeholder={t('help.messagePlaceholder')}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={5000}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>{t('help.submit')}</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, gap: 8 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurfaceVariant,
    marginTop: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  myRequestsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    backgroundColor: theme.colors.surfaceVariant,
    marginBottom: 4,
  },
  myRequestsText: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.colors.onSurface },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    backgroundColor: theme.colors.surfaceVariant,
  },
  categoryBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  categoryBtnText: { fontSize: 13, color: theme.colors.onSurface },
  categoryBtnTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceVariant,
  },
  messageInput: { minHeight: 120 },
  submitBtn: {
    marginTop: 20,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default HelpScreen;
