/**
 * Messaging Service
 *
 * Complete messaging system for partner-customer communication with:
 * - Real-time chat via WebSocket
 * - Direct messages
 * - Group conversations
 * - File attachments
 * - Read receipts
 * - Typing indicators
 * - Message search
 * - Conversation management
 * - Automated messages
 * - Templates
 */

import { apiService } from './api.service';

export type MessageType = 'text' | 'image' | 'file' | 'booking' | 'offer' | 'system' | 'automated';

export type ConversationType = 'direct' | 'group' | 'support';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type ParticipantRole = 'customer' | 'partner' | 'admin' | 'support';

export interface Message {
  id: string;
  conversationId: string;

  // Sender
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderRole: ParticipantRole;

  // Content
  type: MessageType;
  content: string;
  contentBg?: string;

  // Attachments
  attachments?: MessageAttachment[];

  // Related entities
  bookingId?: string;
  offerId?: string;
  partnerId?: string;

  // Status
  status: MessageStatus;
  isEdited: boolean;
  editedAt?: string;

  // Read receipts
  readBy: string[]; // User IDs who read the message
  deliveredTo: string[]; // User IDs who received the message

  // Reply/thread
  replyTo?: string; // Message ID
  replyToMessage?: Message;

  // Metadata
  metadata?: Record<string, any>;

  createdAt: string;
  updatedAt: string;
}

export interface MessageAttachment {
  id: string;
  type: 'image' | 'file' | 'video' | 'audio';
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  thumbnailUrl?: string;
}

export interface Conversation {
  id: string;

  // Type
  type: ConversationType;

  // Title
  title: string;
  titleBg?: string;

  // Participants
  participants: Participant[];
  participantIds: string[];

  // Last message
  lastMessage?: Message;
  lastMessageAt?: string;

  // Unread count
  unreadCount: number;

  // Status
  isActive: boolean;
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;

  // Related entities
  bookingId?: string;
  partnerId?: string;

  // Metadata
  metadata?: Record<string, any>;

  createdAt: string;
  updatedAt: string;
}

export interface Participant {
  userId: string;
  name: string;
  avatar?: string;
  role: ParticipantRole;

  // Status
  isOnline: boolean;
  lastSeenAt?: string;

  // Settings
  isMuted: boolean;

  // Permissions
  canSendMessages: boolean;
  canAddParticipants: boolean;
  canRemoveParticipants: boolean;

  joinedAt: string;
}

export interface CreateConversationData {
  type: ConversationType;
  title?: string;
  titleBg?: string;
  participantIds: string[];
  bookingId?: string;
  partnerId?: string;
  initialMessage?: string;
}

export interface SendMessageData {
  conversationId: string;
  type: MessageType;
  content: string;
  contentBg?: string;
  attachments?: File[];
  replyTo?: string;
  bookingId?: string;
  offerId?: string;
  partnerId?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  nameBg: string;
  category: string;
  content: string;
  contentBg: string;
  variables: string[]; // e.g., ['customerName', 'bookingDate']
  partnerId?: string;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export interface MessagingStatistics {
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  averageResponseTime: number; // in seconds
  messagesThisWeek: number;
  messagesThisMonth: number;

  // Response rates
  responseRate: number; // percentage
  firstResponseTime: number; // average in minutes

  // By type
  messagesByType: Record<MessageType, number>;

  // Top conversations
  topConversations: Array<{
    conversationId: string;
    title: string;
    messageCount: number;
    lastMessageAt: string;
  }>;
}

class MessagingService {
  private readonly baseUrl = '/messaging';
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageListeners: Map<string, ((message: Message) => void)[]> = new Map();
  private typingListeners: ((data: { conversationId: string; userId: string; isTyping: boolean }) => void)[] = [];
  private statusListeners: ((status: 'connected' | 'disconnected') => void)[] = [];

  /**
   * Connect to WebSocket for real-time messaging
   */
  connectWebSocket(userId: string): void {
    const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:4000'}/messaging?userId=${userId}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Messaging WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('Messaging WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('Messaging WebSocket disconnected');
      this.attemptReconnect(userId);
    };
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Attempt to reconnect WebSocket
   */
  private attemptReconnect(userId: string): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`Reconnecting messaging WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connectWebSocket(userId), delay);
    }
  }

  /**
   * Handle WebSocket message
   */
  private handleWebSocketMessage(data: any): void {
    switch (data.type) {
      case 'new_message':
        this.notifyMessageListeners(data.conversationId, data.message);
        break;
      case 'message_read':
        this.notifyStatusListeners('read', data);
        break;
      case 'message_delivered':
        this.notifyStatusListeners('delivered', data);
        break;
      case 'typing':
        this.notifyTypingListeners(data.typing);
        break;
      case 'user_online':
      case 'user_offline':
        this.notifyStatusListeners(data.type, data);
        break;
    }
  }

  /**
   * Subscribe to new messages in a conversation
   */
  onNewMessage(conversationId: string, callback: (message: Message) => void): () => void {
    if (!this.messageListeners.has(conversationId)) {
      this.messageListeners.set(conversationId, []);
    }
    this.messageListeners.get(conversationId)!.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.messageListeners.get(conversationId);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Subscribe to typing indicators
   */
  onTyping(callback: (typing: TypingIndicator) => void): () => void {
    this.typingListeners.push(callback);
    return () => {
      const index = this.typingListeners.indexOf(callback);
      if (index > -1) {
        this.typingListeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to status updates
   */
  onStatusUpdate(callback: (type: string, data: any) => void): () => void {
    this.statusListeners.push(callback);
    return () => {
      const index = this.statusListeners.indexOf(callback);
      if (index > -1) {
        this.statusListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify message listeners
   */
  private notifyMessageListeners(conversationId: string, message: Message): void {
    const listeners = this.messageListeners.get(conversationId) || [];
    listeners.forEach((callback) => callback(message));
  }

  /**
   * Notify typing listeners
   */
  private notifyTypingListeners(typing: TypingIndicator): void {
    this.typingListeners.forEach((callback) => callback(typing));
  }

  /**
   * Notify status listeners
   */
  private notifyStatusListeners(type: string, data: any): void {
    this.statusListeners.forEach((callback) => callback(type, data));
  }

  /**
   * Get conversations
   */
  async getConversations(filters?: {
    type?: ConversationType;
    isArchived?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{
    data: Conversation[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return apiService.get(`${this.baseUrl}/conversations`, filters);
  }

  /**
   * Get conversation by ID
   */
  async getConversationById(id: string): Promise<Conversation> {
    return apiService.get<Conversation>(`${this.baseUrl}/conversations/${id}`);
  }

  /**
   * Create conversation
   */
  async createConversation(data: CreateConversationData): Promise<Conversation> {
    return apiService.post<Conversation>(`${this.baseUrl}/conversations`, data);
  }

  /**
   * Update conversation
   */
  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation> {
    return apiService.patch<Conversation>(`${this.baseUrl}/conversations/${id}`, updates);
  }

  /**
   * Delete conversation
   */
  async deleteConversation(id: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/conversations/${id}`);
  }

  /**
   * Archive conversation
   */
  async archiveConversation(id: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/conversations/${id}/archive`);
  }

  /**
   * Unarchive conversation
   */
  async unarchiveConversation(id: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/conversations/${id}/unarchive`);
  }

  /**
   * Pin conversation
   */
  async pinConversation(id: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/conversations/${id}/pin`);
  }

  /**
   * Unpin conversation
   */
  async unpinConversation(id: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/conversations/${id}/unpin`);
  }

  /**
   * Mute conversation
   */
  async muteConversation(id: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/conversations/${id}/mute`);
  }

  /**
   * Unmute conversation
   */
  async unmuteConversation(id: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/conversations/${id}/unmute`);
  }

  /**
   * Get messages in a conversation
   */
  async getMessages(
    conversationId: string,
    filters?: {
      before?: string; // Message ID for pagination
      limit?: number;
    }
  ): Promise<{
    data: Message[];
    hasMore: boolean;
  }> {
    return apiService.get(`${this.baseUrl}/conversations/${conversationId}/messages`, filters);
  }

  /**
   * Send message
   */
  async sendMessage(data: SendMessageData): Promise<Message> {
    const formData = new FormData();
    formData.append('type', data.type);
    formData.append('content', data.content);

    if (data.contentBg) formData.append('contentBg', data.contentBg);
    if (data.replyTo) formData.append('replyTo', data.replyTo);
    if (data.bookingId) formData.append('bookingId', data.bookingId);
    if (data.offerId) formData.append('offerId', data.offerId);
    if (data.partnerId) formData.append('partnerId', data.partnerId);

    if (data.attachments) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }

    return apiService.post<Message>(
      `${this.baseUrl}/conversations/${data.conversationId}/messages`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
  }

  /**
   * Edit message
   */
  async editMessage(messageId: string, content: string, contentBg?: string): Promise<Message> {
    return apiService.patch<Message>(`${this.baseUrl}/messages/${messageId}`, {
      content,
      contentBg,
    });
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/messages/${messageId}`);
  }

  /**
   * Mark message as read
   */
  async markAsRead(conversationId: string, messageId?: string): Promise<void> {
    const url = messageId
      ? `${this.baseUrl}/messages/${messageId}/read`
      : `${this.baseUrl}/conversations/${conversationId}/read`;
    return apiService.post<void>(url);
  }

  /**
   * Send typing indicator
   */
  async sendTyping(conversationId: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'typing',
          conversationId,
        })
      );
    }
  }

  /**
   * Stop typing indicator
   */
  async stopTyping(conversationId: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'stop_typing',
          conversationId,
        })
      );
    }
  }

  /**
   * Search messages
   */
  async searchMessages(query: string, conversationId?: string): Promise<Message[]> {
    return apiService.get<Message[]>(`${this.baseUrl}/search`, {
      query,
      conversationId,
    });
  }

  /**
   * Add participant to conversation
   */
  async addParticipant(conversationId: string, userId: string): Promise<Participant> {
    return apiService.post<Participant>(`${this.baseUrl}/conversations/${conversationId}/participants`, {
      userId,
    });
  }

  /**
   * Remove participant from conversation
   */
  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    return apiService.delete<void>(
      `${this.baseUrl}/conversations/${conversationId}/participants/${userId}`
    );
  }

  /**
   * Get message templates
   */
  async getTemplates(category?: string): Promise<MessageTemplate[]> {
    return apiService.get<MessageTemplate[]>(`${this.baseUrl}/templates`, { category });
  }

  /**
   * Create message template
   */
  async createTemplate(data: {
    name: string;
    nameBg: string;
    category: string;
    content: string;
    contentBg: string;
    variables?: string[];
  }): Promise<MessageTemplate> {
    return apiService.post<MessageTemplate>(`${this.baseUrl}/templates`, data);
  }

  /**
   * Update message template
   */
  async updateTemplate(id: string, updates: Partial<MessageTemplate>): Promise<MessageTemplate> {
    return apiService.patch<MessageTemplate>(`${this.baseUrl}/templates/${id}`, updates);
  }

  /**
   * Delete message template
   */
  async deleteTemplate(id: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/templates/${id}`);
  }

  /**
   * Apply template (replace variables)
   */
  async applyTemplate(templateId: string, variables: Record<string, string>): Promise<{ content: string; contentBg: string }> {
    return apiService.post(`${this.baseUrl}/templates/${templateId}/apply`, { variables });
  }

  /**
   * Get messaging statistics
   */
  async getStatistics(startDate?: string, endDate?: string): Promise<MessagingStatistics> {
    return apiService.get<MessagingStatistics>(`${this.baseUrl}/statistics`, {
      startDate,
      endDate,
    });
  }

  /**
   * Get unread count
   */
  async getUnreadCount(): Promise<number> {
    const result = await apiService.get<{ count: number }>(`${this.baseUrl}/unread-count`);
    return result.count;
  }

  /**
   * Mark all as read
   */
  async markAllAsRead(): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/mark-all-read`);
  }

  /**
   * Block user
   */
  async blockUser(userId: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/block/${userId}`);
  }

  /**
   * Unblock user
   */
  async unblockUser(userId: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/unblock/${userId}`);
  }

  /**
   * Get blocked users
   */
  async getBlockedUsers(): Promise<string[]> {
    return apiService.get<string[]>(`${this.baseUrl}/blocked-users`);
  }

  /**
   * Export conversation
   */
  async exportConversation(conversationId: string, format: 'pdf' | 'txt' = 'pdf'): Promise<Blob> {
    return apiService.get<Blob>(
      `${this.baseUrl}/conversations/${conversationId}/export`,
      { format },
      { responseType: 'blob' }
    );
  }

  /**
   * Report conversation/message
   */
  async reportMessage(messageId: string, reason: string, reasonBg: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/messages/${messageId}/report`, {
      reason,
      reasonBg,
    });
  }
}

// Export singleton instance
export const messagingService = new MessagingService();
export default messagingService;
