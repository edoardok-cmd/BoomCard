/**
 * Subscription Cancel Screen
 *
 * Displayed when user cancels payment or payment fails at Paysera.
 * Mirrors the website's /subscription/cancel page.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';

const SubscriptionCancelScreen = ({ navigation }: any) => {
  const { i18n } = useTranslation();
  const { theme, isDarkMode } = useTheme();
  const language = i18n.language === 'bg' ? 'bg' : 'en';

  const styles = getStyles(theme, isDarkMode);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="close-circle" size={40} color="#ef4444" />
        </View>

        {/* Title & Subtitle */}
        <Text style={styles.title}>
          {language === 'bg' ? 'Плащането е отменено' : 'Payment Cancelled'}
        </Text>
        <Text style={styles.subtitle}>
          {language === 'bg'
            ? 'Вашето плащане беше отменено или не беше завършено. Не сте били таксувани.'
            : 'Your payment was cancelled or not completed. You have not been charged.'}
        </Text>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {language === 'bg'
              ? 'Можете да опитате отново по всяко време. Ако имате въпроси или проблеми с плащането, моля свържете се с нашия екип за поддръжка.'
              : 'You can try again at any time. If you have questions or issues with payment, please contact our support team.'}
          </Text>
        </View>

        {/* Buttons */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('PlanSelection')}
        >
          <Ionicons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>
            {language === 'bg' ? 'Опитай отново' : 'Try Again'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Ionicons name="arrow-back" size={18} color={theme.colors.onSurfaceVariant} />
          <Text style={styles.secondaryButtonText}>
            {language === 'bg' ? 'Към началната страница' : 'Back to Home'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
    alignItems: 'center',
  },

  // Icon
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },

  // Title & Subtitle
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },

  // Info Box
  infoBox: {
    width: '100%',
    backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 13,
    color: isDarkMode ? '#93C5FD' : '#1E40AF',
    lineHeight: 20,
  },

  // Buttons
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.onSurfaceVariant,
  },
});

export default SubscriptionCancelScreen;
