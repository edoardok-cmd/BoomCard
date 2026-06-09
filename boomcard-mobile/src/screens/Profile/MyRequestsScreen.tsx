/**
 * My Requests Screen (N3 §11.4/§12.3)
 *
 * Lists the subscriber's help requests with their status, and lets them open a
 * request to read the email-threaded replies and post a follow-up.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { crossPlatformAlert } from '../../utils/alert';
import { helpApi, HelpTicket, HelpReply } from '../../api/help.api';

// Map backend statuses → §12 user labels (with Bulgarian fallbacks).
const STATUS_META: Record<string, { labelKey: string; fallback: string; color: string }> = {
  OPEN:        { labelKey: 'help.statusNew',        fallback: 'Отворена',      color: '#3B82F6' },
  NEW:         { labelKey: 'help.statusNew',        fallback: 'Отворена',      color: '#3B82F6' },
  IN_PROGRESS: { labelKey: 'help.statusInProgress', fallback: 'В обработка',   color: '#D97706' },
  WAITING:     { labelKey: 'help.statusWaiting',    fallback: 'Очаква отговор', color: '#8B5CF6' },
  RESOLVED:    { labelKey: 'help.statusResolved',   fallback: 'Разрешена',     color: '#10B981' },
  CLOSED:      { labelKey: 'help.statusClosed',     fallback: 'Затворена',     color: '#6B7280' },
  REJECTED:    { labelKey: 'help.statusClosed',     fallback: 'Затворена',     color: '#6B7280' },
  CANCELLED:   { labelKey: 'help.statusCancelled',  fallback: 'Отказана',      color: '#6B7280' },
};

const TERMINAL = ['CLOSED', 'REJECTED', 'CANCELLED'];

const MyRequestsScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const s = getStyles(theme);

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<HelpTicket[]>([]);
  const [selected, setSelected] = useState<HelpTicket | null>(null);
  const [replies, setReplies] = useState<HelpReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const loadTickets = async () => {
    try {
      const res = await helpApi.getTickets();
      if (res.success) {
        const body: any = res.data;
        const list = body?.data?.tickets ?? body?.tickets ?? body?.data ?? [];
        setTickets(Array.isArray(list) ? list : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadTickets(); }, []));

  const openTicket = async (ticket: HelpTicket) => {
    setSelected(ticket);
    setReplies([]);
    setReplyText('');
    setRepliesLoading(true);
    try {
      const res = await helpApi.getReplies(ticket.id);
      if (res.success) {
        const body: any = res.data;
        const list = body?.data ?? body ?? [];
        setReplies(Array.isArray(list) ? list : []);
      }
    } finally {
      setRepliesLoading(false);
    }
  };

  const sendReply = async () => {
    if (!selected) return;
    if (replyText.trim().length < 10) {
      crossPlatformAlert(t('common.error'), t('help.replyTooShort', 'Съобщението трябва да е поне 10 символа.'));
      return;
    }
    setSending(true);
    try {
      const res = await helpApi.reply(selected.id, replyText.trim());
      if (res.success) {
        setReplyText('');
        await openTicket(selected);
      } else {
        crossPlatformAlert(t('common.error'), res.error || t('help.replyFailed', 'Неуспешно изпращане.'));
      }
    } catch (e: any) {
      crossPlatformAlert(t('common.error'), e.message || t('help.replyFailed', 'Неуспешно изпращане.'));
    } finally {
      setSending(false);
    }
  };

  const statusBadge = (status: string) => {
    const meta = STATUS_META[status] || STATUS_META.OPEN;
    return (
      <View style={[s.badge, { backgroundColor: meta.color + '22' }]}>
        <Text style={[s.badgeText, { color: meta.color }]}>{t(meta.labelKey, meta.fallback)}</Text>
      </View>
    );
  };

  if (loading) {
    return <View style={s.centered}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  // ── Detail view ───────────────────────────────────────────────
  if (selected) {
    const isTerminal = TERMINAL.includes(selected.status);
    return (
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.detailContent}>
          <TouchableOpacity style={s.backRow} onPress={() => setSelected(null)}>
            <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
            <Text style={s.backText}>{t('help.myRequests', 'Моите заявки')}</Text>
          </TouchableOpacity>

          <View style={s.detailHeader}>
            <Text style={s.detailSubject}>{selected.subject}</Text>
            {statusBadge(selected.status)}
          </View>

          {repliesLoading ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} />
          ) : replies.length === 0 ? (
            <Text style={s.emptyText}>{t('help.noReplies', 'Все още няма отговори.')}</Text>
          ) : (
            replies.map((r) => (
              <View key={r.id} style={[s.replyBubble, r.isAdmin ? s.replyStaff : s.replyUser]}>
                <Text style={s.replyAuthor}>
                  {r.isAdmin ? t('help.staff', 'Поддръжка') : t('help.you', 'Вие')}
                </Text>
                <Text style={s.replyBody}>{r.body}</Text>
                <Text style={s.replyDate}>{new Date(r.createdAt).toLocaleString('bg-BG')}</Text>
              </View>
            ))
          )}
        </ScrollView>

        {isTerminal ? (
          <View style={s.terminalNote}>
            <Text style={s.terminalText}>{t('help.ticketClosed', 'Тази заявка е затворена.')}</Text>
          </View>
        ) : (
          <View style={s.replyBar}>
            <TextInput
              style={s.replyInput}
              placeholder={t('help.replyPlaceholder', 'Напишете отговор...')}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={replyText}
              onChangeText={setReplyText}
              multiline
              editable={!sending}
            />
            <TouchableOpacity style={s.sendBtn} onPress={sendReply} disabled={sending}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  }

  // ── List view ─────────────────────────────────────────────────
  return (
    <ScrollView style={s.container} contentContainerStyle={s.listContent}>
      {tickets.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="chatbubbles-outline" size={40} color={theme.colors.onSurfaceVariant} />
          <Text style={s.emptyText}>{t('help.noRequests', 'Нямате подадени заявки.')}</Text>
          <TouchableOpacity style={s.newBtn} onPress={() => navigation.navigate('HelpScreen')}>
            <Text style={s.newBtnText}>{t('help.newRequest', 'Нова заявка')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        tickets.map((ticket) => (
          <TouchableOpacity key={ticket.id} style={s.ticketRow} onPress={() => openTicket(ticket)}>
            <View style={{ flex: 1 }}>
              <Text style={s.ticketSubject} numberOfLines={1}>{ticket.subject}</Text>
              <Text style={s.ticketMeta}>
                {new Date(ticket.createdAt).toLocaleDateString('bg-BG')}
                {ticket.requestType ? ` · ${ticket.requestType}` : ''}
              </Text>
            </View>
            {statusBadge(ticket.status)}
            <Ionicons name="chevron-forward" size={18} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  listContent: { padding: 16, gap: 10 },
  detailContent: { padding: 16, paddingBottom: 24 },
  ticketRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
    borderRadius: 12, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.outline,
  },
  ticketSubject: { fontSize: 15, fontWeight: '600', color: theme.colors.onSurface },
  ticketMeta: { fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  emptyText: { fontSize: 14, color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 12 },
  newBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  newBtnText: { color: '#fff', fontWeight: '600' },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backText: { fontSize: 15, color: theme.colors.primary, fontWeight: '600' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  detailSubject: { flex: 1, fontSize: 18, fontWeight: '700', color: theme.colors.onSurface },
  replyBubble: { borderRadius: 12, padding: 12, marginBottom: 10, maxWidth: '88%' },
  replyUser: { alignSelf: 'flex-end', backgroundColor: theme.colors.primary + '18' },
  replyStaff: { alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceVariant },
  replyAuthor: { fontSize: 11, fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 4 },
  replyBody: { fontSize: 14, color: theme.colors.onSurface, lineHeight: 19 },
  replyDate: { fontSize: 10, color: theme.colors.onSurfaceVariant, marginTop: 6 },
  replyBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12,
    borderTopWidth: 1, borderTopColor: theme.colors.outline, backgroundColor: theme.colors.surface,
  },
  replyInput: {
    flex: 1, maxHeight: 100, borderWidth: 1, borderColor: theme.colors.outline,
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceVariant,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  terminalNote: { padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.outline },
  terminalText: { textAlign: 'center', color: theme.colors.onSurfaceVariant },
});

export default MyRequestsScreen;
