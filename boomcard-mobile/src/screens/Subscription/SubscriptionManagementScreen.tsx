/**
 * Subscription Management Screen — §5.6
 *
 * Shows current plan, status, next billing date, auto-renewal toggle,
 * saved payment card, payment history, cancel/upgrade actions.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../../contexts/ThemeContext';
import { crossPlatformAlert } from '../../utils/alert';
import apiClient from '../../api/client';

interface Subscription {
  id: string;
  plan: string;
  status: string;
  currentPeriodEnd: string;
  autoRenewal: boolean;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string;
  trialRefundEligibleUntil?: string;
  trialRefundUsed: boolean;
  paymentMethod?: {
    brand: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
  };
  benefits?: { cashbackRate: number };
}

interface PaymentHistory {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
}

const PLAN_LABELS: Record<string, { bg: string; en: string }> = {
  LIGHT:   { bg: 'Premium Weekly', en: 'Premium Weekly' },
  BASIC:   { bg: 'Basic',          en: 'Basic' },
  PREMIUM: { bg: 'Premium',        en: 'Premium' },
};

// S4 — maps the backend's Stripe-internal statuses onto the spec's 4 canonical
// states (Active | Expired | Cancelled | Failed Payment). PAST_DUE and
// FAILED_PAYMENT both render as the red "Failed Payment" state; EXPIRED is now
// styled explicitly instead of falling through to grey "PAUSED".
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE:         { bg: 'rgba(16,185,129,0.12)', text: '#10B981' },
  TRIALING:       { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6' },
  PAST_DUE:       { bg: 'rgba(239,68,68,0.12)',  text: '#EF4444' },
  FAILED_PAYMENT: { bg: 'rgba(239,68,68,0.12)',  text: '#EF4444' },
  PAUSED:         { bg: 'rgba(107,114,128,0.12)', text: '#6B7280' },
  EXPIRED:        { bg: 'rgba(107,114,128,0.12)', text: '#6B7280' },
  CANCELLED:      { bg: 'rgba(239,68,68,0.12)',  text: '#EF4444' },
};

// Statuses that mean "renewal payment failed" — drive the recovery banner (S2).
const FAILED_PAYMENT_STATUSES = ['PAST_DUE', 'FAILED_PAYMENT'];

const SubscriptionManagementScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();

  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<PaymentHistory[]>([]);
  const [togglingRenewal, setTogglingRenewal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [changingCard, setChangingCard] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setError(null);
    try {
      const [subRes, histRes] = await Promise.allSettled([
        apiClient.get('/api/subscriptions/current'),
        apiClient.get('/api/subscriptions/history'),
      ]);

      if (subRes.status === 'rejected') {
        setError('Failed to load subscription data. Please try again.');
        return;
      }
      if (!subRes.value.success) {
        setError(subRes.value.error || 'Failed to load subscription data.');
        return;
      }

      // GET /api/subscriptions/current returns the subscription flat at the top
      // level of the body ({ ...subscription, paymentMethod, benefits }) when one
      // exists, or { hasSubscription: false, subscription: null } when none does.
      // apiClient.get wraps the raw body in { success, data }, so subRes.value.data
      // IS that body — no extra .data nesting. Coalesce the no-subscription
      // envelope (which has no `id`) to null so the empty state shows correctly.
      const subBody = subRes.value.data as any;
      setSubscription(subBody?.id ? subBody : (subBody?.subscription ?? null));

      if (histRes.status === 'fulfilled' && histRes.value.success) {
        setHistory(histRes.value.data?.history || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleToggleAutoRenewal = async () => {
    if (!subscription) return;
    setTogglingRenewal(true);
    try {
      const res = await apiClient.patch(`/api/subscriptions/${subscription.id}/auto-renewal`, {
        autoRenewal: !subscription.autoRenewal,
      });
      if (res.success) {
        setSubscription(prev => prev ? { ...prev, autoRenewal: !prev.autoRenewal } : prev);
      } else {
        crossPlatformAlert(t('common.error'), res.error || 'Failed to update auto-renewal');
      }
    } catch (e: any) {
      crossPlatformAlert(t('common.error'), e.message || 'Failed to update');
    } finally {
      setTogglingRenewal(false);
    }
  };

  const handleCancelSubscription = () => {
    crossPlatformAlert(
      t('subscription.cancelTitle', 'Спиране на абонамент'),
      t('subscription.cancelConfirm', 'Абонаментът ще остане активен до края на текущия период. Сигурни ли сте?'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('subscription.cancelAction', 'Спри абонамента'),
          style: 'destructive',
          onPress: async () => {
            if (!subscription) return;
            setCancelling(true);
            try {
              const res = await apiClient.post(`/api/subscriptions/${subscription.id}/cancel`, {
                cancelAtPeriodEnd: true,
              });
              if (res.success) {
                await loadData();
                crossPlatformAlert(
                  t('subscription.cancelledTitle', 'Абонаментът е спрян'),
                  t('subscription.cancelledDesc', 'Ще имате достъп до края на текущия период.')
                );
              } else {
                crossPlatformAlert(t('common.error'), res.error || 'Failed to cancel subscription');
              }
            } catch (e: any) {
              crossPlatformAlert(t('common.error'), e.message || 'Failed to cancel');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const handleReactivate = async () => {
    if (!subscription) return;
    try {
      const res = await apiClient.post(`/api/subscriptions/${subscription.id}/reactivate`, {});
      if (res.success) {
        await loadData();
        crossPlatformAlert(t('common.success', 'Успех'), t('subscription.reactivated', 'Абонаментът е възстановен.'));
      } else {
        crossPlatformAlert(t('common.error'), res.error || 'Failed to reactivate');
      }
    } catch (e: any) {
      crossPlatformAlert(t('common.error'), e.message || 'Failed to reactivate');
    }
  };

  // S1 — Change payment card. POSTs change-card and opens the returned Stripe
  // billing-portal / Paysera payment URL in an in-app browser. The card is
  // updated externally; on return we refresh the subscription.
  const handleChangeCard = async () => {
    if (!subscription || changingCard) return;
    setChangingCard(true);
    try {
      const res = await apiClient.post(`/api/subscriptions/${subscription.id}/change-card`, {});
      if (res.success) {
        // Response shape (top-level body): { type:'stripe', url } | { type:'paysera', paymentUrl, orderId }
        const body = res.data as any;
        const url: string | undefined = body?.url || body?.paymentUrl;
        if (!url) {
          crossPlatformAlert(t('common.error'), t('subscription.changeCardNoUrl', 'Връзката за смяна на картата не е налична.'));
          return;
        }
        await WebBrowser.openBrowserAsync(url);
        // User may have completed the flow in the browser — refresh on return.
        await loadData();
      } else {
        crossPlatformAlert(t('common.error'), res.error || t('subscription.changeCardFailed', 'Неуспешна смяна на картата'));
      }
    } catch (e: any) {
      crossPlatformAlert(t('common.error'), e.message || t('subscription.changeCardFailed', 'Неуспешна смяна на картата'));
    } finally {
      setChangingCard(false);
    }
  };

  // S3 — Retry the failed renewal payment (POST /:id/retry-payment).
  const handleRetryPayment = async () => {
    if (!subscription || retrying) return;
    setRetrying(true);
    try {
      const res = await apiClient.post(`/api/subscriptions/${subscription.id}/retry-payment`, {});
      if (res.success) {
        await loadData();
        crossPlatformAlert(
          t('common.success', 'Успех'),
          t('subscription.retrySuccess', 'Плащането е успешно. Абонаментът е активен.')
        );
      } else {
        crossPlatformAlert(t('common.error'), res.error || t('subscription.retryFailed', 'Неуспешно плащане. Опитайте да смените картата.'));
      }
    } catch (e: any) {
      crossPlatformAlert(t('common.error'), e.message || t('subscription.retryFailed', 'Неуспешно плащане. Опитайте да смените картата.'));
    } finally {
      setRetrying(false);
    }
  };

  const handleTrialRefund = () => {
    if (!subscription) return;
    crossPlatformAlert(
      t('subscription.trialRefundTitle', 'Връщане на сумата'),
      t('subscription.trialRefundConfirm', 'Ще получите пълно възстановяване. Всички натрупани кешбек суми ще бъдат анулирани. Продължете?'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('subscription.trialRefundAction', 'Заявете връщане'),
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiClient.post(`/api/subscriptions/${subscription.id}/trial-refund`, {});
              if (res.success) {
                await loadData();
                crossPlatformAlert(t('subscription.refundInitiated', 'Заявката е приета'), t('subscription.refundDesc', 'Сумата ще бъде върната в рамките на 5-7 работни дни.'));
              } else {
                crossPlatformAlert(t('common.error'), res.error || 'Failed to request refund');
              }
            } catch (e: any) {
              crossPlatformAlert(t('common.error'), e.message || 'Failed to request refund');
            }
          },
        },
      ]
    );
  };

  const s = getStyles(theme, isDarkMode);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !subscription) {
    return (
      <View style={s.centered}>
        <Ionicons name="alert-circle-outline" size={40} color={theme.colors.error} />
        <Text style={s.errorText}>{error || t('subscription.noSubscription', 'Нямате активен абонамент')}</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); loadData(); }}>
          <Text style={s.retryBtnText}>{t('common.retry', 'Опитай пак')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const planLabel = PLAN_LABELS[subscription.plan]?.bg || subscription.plan;
  const statusColor = STATUS_COLORS[subscription.status] || STATUS_COLORS.PAUSED;
  const isActive = subscription.status === 'ACTIVE' || subscription.status === 'TRIALING';
  const isFailedPayment = FAILED_PAYMENT_STATUSES.includes(subscription.status);
  const isCancellationPending = subscription.cancelAtPeriodEnd === true;
  const trialRefundWindow = subscription.trialRefundEligibleUntil
    ? new Date(subscription.trialRefundEligibleUntil) > new Date() && !subscription.trialRefundUsed
    : false;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatMoney = (amount: number, currency: string) =>
    currency === 'EUR' ? `€${amount.toFixed(2)}` : `${amount.toFixed(2)} лв`;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>

      {/* Plan Info Card */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.planIconCircle}>
            <Ionicons name="card" size={24} color={isDarkMode ? '#60A5FA' : '#3B82F6'} />
          </View>
          <View style={s.planInfo}>
            <Text style={s.planLabel}>{t('subscription.currentPlan', 'Текущ план')}</Text>
            <Text style={s.planName}>{planLabel}</Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: statusColor.bg }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor.text }]} />
            <Text style={[s.statusText, { color: statusColor.text }]}>
              {t(`subscription.status.${subscription.status}`, subscription.status)}
            </Text>
          </View>
        </View>

        {subscription.currentPeriodEnd && (
          <View style={s.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={theme.colors.onSurfaceVariant} />
            <Text style={s.infoLabel}>
              {isCancellationPending
                ? t('subscription.accessUntil', 'Достъп до')
                : t('subscription.nextPayment', 'Следващо плащане')}
            </Text>
            <Text style={s.infoValue}>{formatDate(subscription.currentPeriodEnd)}</Text>
          </View>
        )}

        {subscription.paymentMethod && (
          <View style={s.infoRow}>
            <Ionicons name="card-outline" size={16} color={theme.colors.onSurfaceVariant} />
            <Text style={s.infoLabel}>{t('subscription.paymentCard', 'Карта')}</Text>
            <Text style={s.infoValue}>
              {subscription.paymentMethod.brand?.toUpperCase()} •••• {subscription.paymentMethod.last4}
            </Text>
          </View>
        )}

        {/* Auto-renewal toggle */}
        <View style={[s.infoRow, s.toggleRow]}>
          <Ionicons name="refresh-outline" size={16} color={theme.colors.onSurfaceVariant} />
          <Text style={[s.infoLabel, { flex: 1 }]}>{t('subscription.autoRenewal', 'Автоматично подновяване')}</Text>
          {togglingRenewal ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Switch
              value={subscription.autoRenewal}
              onValueChange={handleToggleAutoRenewal}
              trackColor={{ false: isDarkMode ? '#374151' : '#D1D5DB', true: isDarkMode ? '#3B82F6' : '#000000' }}
              thumbColor="#FFFFFF"
            />
          )}
        </View>
      </View>

      {/* S2 — Failed-payment recovery banner (spec §3.4/§3.5).
          Shown on PAST_DUE/FAILED_PAYMENT with "Retry" (S3) + "Change card" (S1). */}
      {isFailedPayment && (
        <View style={s.failedBanner}>
          <View style={s.failedHeader}>
            <Ionicons name="alert-circle" size={22} color="#EF4444" />
            <Text style={s.failedTitle}>{t('subscription.paymentFailedTitle', 'Плащането за абонамент не премина')}</Text>
          </View>
          <Text style={s.failedSub}>
            {t('subscription.paymentFailedSub', 'Не успяхме да подновим абонамента Ви. Опитайте отново или сменете платежната карта, за да запазите достъпа си.')}
          </Text>
          <View style={s.failedActions}>
            <TouchableOpacity
              style={[s.failedBtn, s.failedBtnPrimary]}
              onPress={handleRetryPayment}
              disabled={retrying || changingCard}
              activeOpacity={0.85}
            >
              {retrying
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.failedBtnPrimaryText}>{t('subscription.retryPayment', 'Подновете плащането')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.failedBtn, s.failedBtnSecondary]}
              onPress={handleChangeCard}
              disabled={retrying || changingCard}
              activeOpacity={0.85}
            >
              {changingCard
                ? <ActivityIndicator size="small" color="#EF4444" />
                : <Text style={s.failedBtnSecondaryText}>{t('subscription.changeCard', 'Сменете картата')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Trial refund banner — only within 24h */}
      {trialRefundWindow && (
        <TouchableOpacity style={s.trialBanner} onPress={handleTrialRefund} activeOpacity={0.8}>
          <Ionicons name="time-outline" size={20} color="#D97706" />
          <View style={s.trialBannerText}>
            <Text style={s.trialBannerTitle}>{t('subscription.trialRefundAvailable', '24-часов пробен период')}</Text>
            <Text style={s.trialBannerSub}>{t('subscription.trialRefundSub', 'Можете да поискате пълно връщане на сумата')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#D97706" />
        </TouchableOpacity>
      )}

      {/* Actions */}
      <View style={s.actionsCard}>
        {/* Upgrade (for non-Premium). S5 — pass currentCardType so the upgrade
            screen hides the current/downgrade plans and shows the credit notice. */}
        {subscription.plan !== 'PREMIUM' && isActive && (
          <TouchableOpacity style={s.actionRow} onPress={() => navigation.navigate('UpgradePlans', { currentCardType: subscription.plan })}>
            <View style={[s.actionIcon, { backgroundColor: isDarkMode ? 'rgba(212,168,67,0.15)' : 'rgba(212,168,67,0.1)' }]}>
              <Ionicons name="arrow-up-circle-outline" size={20} color="#D4A843" />
            </View>
            <Text style={s.actionLabel}>{t('subscription.upgradeToPremium', 'Преминаване към Premium Monthly')}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}

        {/* S1 — Change payment card (always available while not failed; the
            failed-payment banner already exposes it for the failed state). */}
        {!isFailedPayment && (
          <TouchableOpacity style={s.actionRow} onPress={handleChangeCard} disabled={changingCard}>
            <View style={[s.actionIcon, { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)' }]}>
              {changingCard
                ? <ActivityIndicator size="small" color="#3B82F6" />
                : <Ionicons name="card-outline" size={20} color={isDarkMode ? '#60A5FA' : '#3B82F6'} />}
            </View>
            <Text style={s.actionLabel}>{t('subscription.changeCard', 'Сменете картата')}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}

        {/* Reactivate — shown if cancellation is scheduled */}
        {isCancellationPending && (
          <TouchableOpacity style={s.actionRow} onPress={handleReactivate}>
            <View style={[s.actionIcon, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
              <Ionicons name="reload-outline" size={20} color="#10B981" />
            </View>
            <Text style={s.actionLabel}>{t('subscription.reactivate', 'Отмени спирането')}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        )}

        {/* Cancel — shown when active and not already cancelling */}
        {isActive && !isCancellationPending && (
          <TouchableOpacity style={s.actionRow} onPress={handleCancelSubscription} disabled={cancelling}>
            <View style={[s.actionIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
              {cancelling
                ? <ActivityIndicator size="small" color="#EF4444" />
                : <Ionicons name="close-circle-outline" size={20} color="#EF4444" />}
            </View>
            <Text style={[s.actionLabel, { color: '#EF4444' }]}>{t('subscription.cancelSubscription', 'Спри абонамента')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      {/* Payment History */}
      {history.length > 0 && (
        <View style={s.historyCard}>
          <Text style={s.sectionTitle}>{t('subscription.paymentHistory', 'История на плащанията')}</Text>
          {history.map(item => (
            <View key={item.id} style={s.historyRow}>
              <View style={s.historyLeft}>
                <Text style={s.historyDate}>{formatDate(item.date)}</Text>
                <Text style={s.historyDesc} numberOfLines={1}>{item.description || t('subscription.subscriptionPayment', 'Плащане за абонамент')}</Text>
              </View>
              <View style={s.historyRight}>
                <Text style={s.historyAmount}>{formatMoney(item.amount, item.currency)}</Text>
                <Text style={[s.historyStatus, { color: item.status === 'paid' || item.status === 'completed' ? '#10B981' : '#D97706' }]}>
                  {item.status === 'paid' || item.status === 'completed'
                    ? t('subscription.paid', 'Платено')
                    : item.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingTop: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  errorText: { fontSize: 15, color: theme.colors.error, textAlign: 'center' },
  retryBtn: {
    backgroundColor: isDarkMode ? '#3B82F6' : '#000',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: { color: '#fff', fontWeight: '600' },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.04)',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDarkMode ? 0.2 : 0.08, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  planIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  planInfo: { flex: 1 },
  planLabel: { fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  planName: { fontSize: 18, fontWeight: '700', color: theme.colors.onSurface, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  },
  toggleRow: { justifyContent: 'space-between' },
  infoLabel: { fontSize: 14, color: theme.colors.onSurfaceVariant },
  infoValue: { fontSize: 14, fontWeight: '600', color: theme.colors.onSurface, marginLeft: 'auto' as any },

  failedBanner: {
    backgroundColor: isDarkMode ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
    borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: isDarkMode ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.25)',
  },
  failedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  failedTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#EF4444' },
  failedSub: { fontSize: 13, color: isDarkMode ? '#FCA5A5' : '#991B1B', marginTop: 8, lineHeight: 18 },
  failedActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  failedBtn: { flex: 1, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  failedBtnPrimary: { backgroundColor: '#EF4444' },
  failedBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  failedBtnSecondary: { borderWidth: 1.5, borderColor: '#EF4444', backgroundColor: 'transparent' },
  failedBtnSecondaryText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },

  trialBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: isDarkMode ? 'rgba(217,119,6,0.12)' : '#FFFBEB',
    borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: isDarkMode ? 'rgba(217,119,6,0.3)' : 'rgba(217,119,6,0.2)',
  },
  trialBannerText: { flex: 1 },
  trialBannerTitle: { fontSize: 14, fontWeight: '700', color: '#D97706' },
  trialBannerSub: { fontSize: 12, color: isDarkMode ? '#FCD34D' : '#92400E', marginTop: 2 },

  actionsCard: {
    backgroundColor: theme.colors.surface, borderRadius: 20, marginBottom: 16,
    borderWidth: 1, borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.04)',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDarkMode ? 0.15 : 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
    borderBottomWidth: 1, borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  },
  actionIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: theme.colors.onSurface },

  historyCard: {
    backgroundColor: theme.colors.surface, borderRadius: 20, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.04)',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 12 },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  },
  historyLeft: { flex: 1 },
  historyDate: { fontSize: 13, fontWeight: '600', color: theme.colors.onSurface },
  historyDesc: { fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2 },
  historyRight: { alignItems: 'flex-end' },
  historyAmount: { fontSize: 14, fontWeight: '700', color: theme.colors.onSurface },
  historyStatus: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});

export default SubscriptionManagementScreen;
