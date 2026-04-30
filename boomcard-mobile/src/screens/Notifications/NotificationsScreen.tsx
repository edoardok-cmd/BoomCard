import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { notificationsApi, AppNotification } from '../../api/notifications.api';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' });
}

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  receipt_approved:      'document-text',
  receipt_rejected:      'document-text',
  payment_success:       'card',
  cashback_credited:     'cash',
  cashback_expiry:       'time',
  loyalty_points:        'star',
  threshold_reached:     'trophy',
  offer_available:       'pricetag',
  booking_confirmed:     'calendar',
  sticker_scan_approved: 'qr-code',
  sticker_scan_rejected: 'qr-code',
  system:                'information-circle',
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#EF4444',
  high:   '#F97316',
  medium: '#3B82F6',
  low:    '#94A3B8',
};

const NotificationsScreen = ({ navigation }: any) => {
  const { theme, isDarkMode } = useTheme();
  const s = getStyles(theme, isDarkMode);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    const res = await notificationsApi.getNotifications(1, 50);
    if (res.success && res.data) {
      const payload = res.data as any;
      setNotifications(Array.isArray(payload.data) ? payload.data : []);
      setUnreadCount(typeof payload.unreadCount === 'number' ? payload.unreadCount : 0);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleTap = useCallback(async (item: AppNotification) => {
    if (item.status !== 'unread') return;
    await notificationsApi.markAsRead(item.id);
    setNotifications(prev =>
      prev.map(n => n.id === item.id ? { ...n, status: 'read' } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const handleMarkAll = useCallback(async () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    await notificationsApi.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, status: 'read' as const })));
    setUnreadCount(0);
    setMarkingAll(false);
  }, [unreadCount]);

  const renderItem = useCallback(({ item }: { item: AppNotification }) => {
    const isUnread = item.status === 'unread';
    const iconName = TYPE_ICON[item.type] ?? 'notifications';
    const accent = PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR.low;

    return (
      <TouchableOpacity
        style={[s.row, isUnread && s.rowUnread]}
        onPress={() => handleTap(item)}
        activeOpacity={0.7}
      >
        <View style={[s.iconCircle, { backgroundColor: `${accent}18` }]}>
          <Ionicons name={iconName} size={20} color={accent} />
        </View>
        <View style={s.rowBody}>
          <Text style={[s.rowTitle, isUnread && s.rowTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={s.rowMessage} numberOfLines={2}>{item.message}</Text>
          <Text style={s.rowTime}>{timeAgo(item.createdAt)}</Text>
        </View>
        {isUnread && <View style={s.dot} />}
      </TouchableOpacity>
    );
  }, [s, handleTap]);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity style={s.markAllBtn} onPress={handleMarkAll} disabled={markingAll}>
            {markingAll
              ? <ActivityIndicator size="small" color={theme.colors.primary} />
              : <Text style={s.markAllText}>Mark all read</Text>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={theme.colors.primary} colors={[theme.colors.primary]} />
          }
          contentContainerStyle={notifications.length === 0 ? s.emptyContainer : s.listContent}
          ListEmptyComponent={
            <View style={s.emptyInner}>
              <Ionicons name="notifications-off-outline" size={52} color={theme.colors.onSurfaceVariant} />
              <Text style={s.emptyText}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.onSurface },
  markAllBtn: { width: 80, alignItems: 'flex-end' },
  markAllText: { fontSize: 13, color: theme.colors.primary, fontWeight: '500' },
  listContent: { paddingBottom: 24 },
  emptyContainer: { flex: 1 },
  emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: 12 },
  emptyText: { fontSize: 15, color: theme.colors.onSurfaceVariant },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outline,
    backgroundColor: theme.colors.background,
  },
  rowUnread: {
    backgroundColor: isDarkMode ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.04)',
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, marginTop: 2,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, color: theme.colors.onSurface, marginBottom: 3 },
  rowTitleUnread: { fontWeight: '600' },
  rowMessage: { fontSize: 13, color: theme.colors.onSurfaceVariant, lineHeight: 18, marginBottom: 4 },
  rowTime: { fontSize: 12, color: theme.colors.onSurfaceVariant },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#3B82F6',
    marginTop: 6, marginLeft: 8,
  },
});

export default NotificationsScreen;
