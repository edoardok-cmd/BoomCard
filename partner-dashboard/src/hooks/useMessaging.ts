import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import {
  messagingService,
  Conversation,
  Message,
  MessageTemplate,
  CreateConversationData,
  SendMessageData,
  ConversationType,
  TypingIndicator,
} from '../services/messaging.service';
import toast from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook to connect to messaging WebSocket
 */
export function useMessagingConnection() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      messagingService.connectWebSocket(user.id);

      return () => {
        messagingService.disconnectWebSocket();
      };
    }
  }, [user?.id]);
}

/**
 * Hook to subscribe to new messages in a conversation
 */
export function useNewMessageSubscription(
  conversationId: string | undefined,
  callback: (message: Message) => void
) {
  useEffect(() => {
    if (!conversationId) return;

    const unsubscribe = messagingService.onNewMessage(conversationId, callback);
    return unsubscribe;
  }, [conversationId, callback]);
}

/**
 * Hook to subscribe to typing indicators
 */
export function useTypingSubscription(callback: (typing: TypingIndicator) => void) {
  useEffect(() => {
    const unsubscribe = messagingService.onTyping(callback);
    return unsubscribe;
  }, [callback]);
}

/**
 * Hook to fetch conversations
 */
export function useConversations(filters?: {
  type?: ConversationType;
  isArchived?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['conversations', filters],
    queryFn: () => messagingService.getConversations(filters),
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to fetch conversation by ID
 */
export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    queryFn: () => messagingService.getConversationById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to create conversation
 */
export function useCreateConversation() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateConversationData) => messagingService.createConversation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(
        language === 'bg'
          ? 'Разговорът е създаден успешно'
          : 'Conversation created successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно създаване на разговор'
            : 'Failed to create conversation')
      );
    },
  });
}

/**
 * Hook to update conversation
 */
export function useUpdateConversation() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Conversation> }) =>
      messagingService.updateConversation(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.id] });
      toast.success(
        language === 'bg'
          ? 'Разговорът е актуализиран'
          : 'Conversation updated successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешна актуализация на разговор'
            : 'Failed to update conversation')
      );
    },
  });
}

/**
 * Hook to delete conversation
 */
export function useDeleteConversation() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => messagingService.deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(
        language === 'bg' ? 'Разговорът е изтрит' : 'Conversation deleted successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно изтриване на разговор'
            : 'Failed to delete conversation')
      );
    },
  });
}

/**
 * Hook to archive conversation
 */
export function useArchiveConversation() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => messagingService.archiveConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(
        language === 'bg' ? 'Разговорът е архивиран' : 'Conversation archived'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно архивиране на разговор'
            : 'Failed to archive conversation')
      );
    },
  });
}

/**
 * Hook to unarchive conversation
 */
export function useUnarchiveConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => messagingService.unarchiveConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/**
 * Hook to pin conversation
 */
export function usePinConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => messagingService.pinConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/**
 * Hook to unpin conversation
 */
export function useUnpinConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => messagingService.unpinConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/**
 * Hook to mute conversation
 */
export function useMuteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => messagingService.muteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/**
 * Hook to unmute conversation
 */
export function useUnmuteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => messagingService.unmuteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/**
 * Hook to fetch messages
 */
export function useMessages(conversationId: string | undefined, before?: string, limit?: number) {
  return useQuery({
    queryKey: ['messages', conversationId, before, limit],
    queryFn: () => messagingService.getMessages(conversationId!, { before, limit }),
    enabled: !!conversationId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to send message
 */
export function useSendMessage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageData) => messagingService.sendMessage(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.conversationId] });
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно изпращане на съобщение' : 'Failed to send message')
      );
    },
  });
}

/**
 * Hook to edit message
 */
export function useEditMessage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      messageId,
      content,
      contentBg,
    }: {
      messageId: string;
      content: string;
      contentBg?: string;
    }) => messagingService.editMessage(messageId, content, contentBg),
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ['messages', message.conversationId] });
      toast.success(
        language === 'bg'
          ? 'Съобщението е редактирано'
          : 'Message edited successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно редактиране на съобщение'
            : 'Failed to edit message')
      );
    },
  });
}

/**
 * Hook to delete message
 */
export function useDeleteMessage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => messagingService.deleteMessage(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(
        language === 'bg' ? 'Съобщението е изтрито' : 'Message deleted successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно изтриване на съобщение'
            : 'Failed to delete message')
      );
    },
  });
}

/**
 * Hook to mark message/conversation as read
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: string; messageId?: string }) =>
      messagingService.markAsRead(conversationId, messageId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
}

/**
 * Hook to send typing indicator
 */
export function useSendTyping() {
  return useCallback((conversationId: string) => {
    messagingService.sendTyping(conversationId);
  }, []);
}

/**
 * Hook to stop typing indicator
 */
export function useStopTyping() {
  return useCallback((conversationId: string) => {
    messagingService.stopTyping(conversationId);
  }, []);
}

/**
 * Hook to search messages
 */
export function useSearchMessages(query: string, conversationId?: string) {
  return useQuery({
    queryKey: ['messages', 'search', query, conversationId],
    queryFn: () => messagingService.searchMessages(query, conversationId),
    enabled: query.length >= 2,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to add participant
 */
export function useAddParticipant() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: string; userId: string }) =>
      messagingService.addParticipant(conversationId, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.conversationId] });
      toast.success(
        language === 'bg'
          ? 'Участникът е добавен'
          : 'Participant added successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно добавяне на участник'
            : 'Failed to add participant')
      );
    },
  });
}

/**
 * Hook to remove participant
 */
export function useRemoveParticipant() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: string; userId: string }) =>
      messagingService.removeParticipant(conversationId, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.conversationId] });
      toast.success(
        language === 'bg' ? 'Участникът е премахнат' : 'Participant removed'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно премахване на участник'
            : 'Failed to remove participant')
      );
    },
  });
}

/**
 * Hook to fetch message templates
 */
export function useMessageTemplates(category?: string) {
  return useQuery({
    queryKey: ['message-templates', category],
    queryFn: () => messagingService.getTemplates(category),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to create message template
 */
export function useCreateTemplate() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      nameBg: string;
      category: string;
      content: string;
      contentBg: string;
      variables?: string[];
    }) => messagingService.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      toast.success(
        language === 'bg' ? 'Шаблонът е създаден' : 'Template created successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно създаване на шаблон' : 'Failed to create template')
      );
    },
  });
}

/**
 * Hook to update message template
 */
export function useUpdateTemplate() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<MessageTemplate> }) =>
      messagingService.updateTemplate(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      toast.success(
        language === 'bg' ? 'Шаблонът е актуализиран' : 'Template updated successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешна актуализация на шаблон'
            : 'Failed to update template')
      );
    },
  });
}

/**
 * Hook to delete message template
 */
export function useDeleteTemplate() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => messagingService.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      toast.success(
        language === 'bg' ? 'Шаблонът е изтрит' : 'Template deleted successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно изтриване на шаблон' : 'Failed to delete template')
      );
    },
  });
}

/**
 * Hook to apply template
 */
export function useApplyTemplate() {
  return useMutation({
    mutationFn: ({
      templateId,
      variables,
    }: {
      templateId: string;
      variables: Record<string, string>;
    }) => messagingService.applyTemplate(templateId, variables),
  });
}

/**
 * Hook to fetch messaging statistics
 */
export function useMessagingStatistics(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['messaging-statistics', startDate, endDate],
    queryFn: () => messagingService.getStatistics(startDate, endDate),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch unread count
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: ['unread-count'],
    queryFn: () => messagingService.getUnreadCount(),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });
}

/**
 * Hook to mark all as read
 */
export function useMarkAllAsRead() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => messagingService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      toast.success(
        language === 'bg'
          ? 'Всички съобщения са маркирани като прочетени'
          : 'All messages marked as read'
      );
    },
  });
}

/**
 * Hook to block user
 */
export function useBlockUser() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => messagingService.blockUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      toast.success(
        language === 'bg' ? 'Потребителят е блокиран' : 'User blocked'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно блокиране на потребител'
            : 'Failed to block user')
      );
    },
  });
}

/**
 * Hook to unblock user
 */
export function useUnblockUser() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => messagingService.unblockUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      toast.success(
        language === 'bg' ? 'Потребителят е разблокиран' : 'User unblocked'
      );
    },
  });
}

/**
 * Hook to fetch blocked users
 */
export function useBlockedUsers() {
  return useQuery({
    queryKey: ['blocked-users'],
    queryFn: () => messagingService.getBlockedUsers(),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to export conversation
 */
export function useExportConversation() {
  const { language } = useLanguage();

  return useMutation({
    mutationFn: ({
      conversationId,
      format,
    }: {
      conversationId: string;
      format?: 'pdf' | 'txt';
    }) => messagingService.exportConversation(conversationId, format),
    onSuccess: (blob, variables) => {
      const format = variables.format || 'pdf';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation-${variables.conversationId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(
        language === 'bg'
          ? 'Разговорът е експортиран'
          : 'Conversation exported successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешен експорт на разговор'
            : 'Failed to export conversation')
      );
    },
  });
}

/**
 * Hook to report message
 */
export function useReportMessage() {
  const { language } = useLanguage();

  return useMutation({
    mutationFn: ({
      messageId,
      reason,
      reasonBg,
    }: {
      messageId: string;
      reason: string;
      reasonBg: string;
    }) => messagingService.reportMessage(messageId, reason, reasonBg),
    onSuccess: () => {
      toast.success(
        language === 'bg'
          ? 'Съобщението е докладвано'
          : 'Message reported successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно докладване на съобщение'
            : 'Failed to report message')
      );
    },
  });
}
