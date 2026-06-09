/**
 * AccountStatusBanner — global account-status gate (A2, spec §1.2/§13.1)
 *
 * Renders a non-dismissible banner whenever the authenticated user's account is
 * NOT in a fully-operational state:
 *   - INACTIVE / SUSPENDED → "Account paused" + a resume CTA (Help). Operational
 *     actions (scanning) are blocked elsewhere even with an active subscription.
 *   - ARCHIVED / DELETED   → "Account closed" — all operational access blocked.
 *   - PENDING_VERIFICATION → "Verify your email" + a resend CTA.
 *
 * Mounted once above the authenticated navigator so it shows on every screen.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { navigate } from '../navigation/navigationRef';
import { useAuth } from '../store/AuthContext';
import { UserStatus } from '../types';
import AuthApi from '../api/auth.api';
import { crossPlatformAlert } from '../utils/alert';

// Statuses that block operational access. ACTIVE (and the email-verified
// PENDING_* operational states that still allow normal use) are excluded.
const PAUSED_STATUSES: string[] = [UserStatus.INACTIVE, UserStatus.SUSPENDED];
const BLOCKED_STATUSES: string[] = [UserStatus.ARCHIVED, UserStatus.DELETED];

export function isAccountBlocked(status?: string): boolean {
  return !!status && BLOCKED_STATUSES.includes(status);
}

export function isAccountPaused(status?: string): boolean {
  return !!status && PAUSED_STATUSES.includes(status);
}

export function isAccountOperational(status?: string): boolean {
  // Operational = not paused and not blocked. PENDING_VERIFICATION can still
  // browse but is nudged to verify; it is not treated as "blocked" here.
  return !isAccountPaused(status) && !isAccountBlocked(status);
}

const AccountStatusBanner: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();

  const status = user?.status;
  if (!status) return null;

  const paused = isAccountPaused(status);
  const blocked = isAccountBlocked(status);
  const pendingVerification = status === UserStatus.PENDING_VERIFICATION;

  if (!paused && !blocked && !pendingVerification) return null;

  const resendVerification = async () => {
    try {
      const res = await AuthApi.resendEmailVerification();
      crossPlatformAlert(
        t('common.info', 'Информация'),
        res.success
          ? t('account.verificationSent', 'Изпратихме нов имейл за потвърждение.')
          : (res.error || t('errors.unknownError', 'Възникна грешка.'))
      );
    } catch (e: any) {
      crossPlatformAlert(t('common.error', 'Грешка'), e?.message || t('errors.unknownError', 'Възникна грешка.'));
    }
  };

  const config = blocked
    ? {
        icon: 'lock-closed' as const,
        color: '#EF4444',
        bg: '#FEF2F2',
        title: t('account.archivedTitle', 'Профилът е закрит'),
        sub: t('account.archivedSub', 'Достъпът до този профил е прекратен. Свържете се с поддръжката за съдействие.'),
        ctaLabel: t('account.contactSupport', 'Поддръжка'),
        onCta: () => navigate('HelpScreen'),
      }
    : paused
    ? {
        icon: 'pause-circle' as const,
        color: '#D97706',
        bg: '#FFFBEB',
        title: t('account.pausedTitle', 'Профилът е спрян'),
        sub: t('account.pausedSub', 'Профилът Ви е временно спрян. Сканирането и кешбекът са недостъпни. Свържете се с поддръжката, за да го възстановите.'),
        ctaLabel: t('account.resume', 'Възстанови'),
        onCta: () => navigate('HelpScreen'),
      }
    : {
        icon: 'mail-unread' as const,
        color: '#3B82F6',
        bg: '#EFF6FF',
        title: t('account.verifyTitle', 'Потвърдете имейла си'),
        sub: t('account.verifySub', 'Моля, потвърдете имейл адреса си, за да използвате всички функции.'),
        ctaLabel: t('account.resendVerification', 'Изпрати отново'),
        onCta: resendVerification,
      };

  return (
    <View style={[styles.banner, { backgroundColor: config.bg, borderBottomColor: config.color }]}>
      <Ionicons name={config.icon} size={20} color={config.color} />
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: config.color }]}>{config.title}</Text>
        <Text style={styles.sub}>{config.sub}</Text>
      </View>
      <TouchableOpacity style={[styles.cta, { borderColor: config.color }]} onPress={config.onCta} activeOpacity={0.8}>
        <Text style={[styles.ctaText, { color: config.color }]}>{config.ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    borderBottomWidth: 2,
  },
  textBlock: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 11, color: '#4B5563', marginTop: 2, lineHeight: 15 },
  cta: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ctaText: { fontSize: 12, fontWeight: '700' },
});

export default AccountStatusBanner;
