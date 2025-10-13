import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

/**
 * Initialize WebSocket server for real-time features
 * - Messaging
 * - Notifications
 * - Typing indicators
 * - Online status
 */
export function initializeWebSocket(io: SocketServer) {
  // Store online users
  const onlineUsers = new Map<string, string>(); // userId -> socketId

  // Authentication middleware
  io.use((socket: any, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      socket.userId = decoded.id;
      socket.userEmail = decoded.email;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    logger.info(`✓ User connected: ${userId} (socket: ${socket.id})`);

    // Track online user
    onlineUsers.set(userId, socket.id);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Broadcast online status
    io.emit('user_online', { userId });

    // ====================
    // MESSAGING EVENTS
    // ====================

    /**
     * Join conversation room
     */
    socket.on('join_conversation', (data: { conversationId: string }) => {
      const { conversationId } = data;
      socket.join(`conversation:${conversationId}`);
      logger.info(`User ${userId} joined conversation ${conversationId}`);
    });

    /**
     * Leave conversation room
     */
    socket.on('leave_conversation', (data: { conversationId: string }) => {
      const { conversationId } = data;
      socket.leave(`conversation:${conversationId}`);
      logger.info(`User ${userId} left conversation ${conversationId}`);
    });

    /**
     * Send message
     */
    socket.on('send_message', async (data: {
      conversationId: string;
      content: string;
      type: string;
    }) => {
      const { conversationId, content, type } = data;

      // TODO: Save message to database
      const message = {
        id: `msg-${Date.now()}`,
        conversationId,
        senderId: userId,
        content,
        type: type || 'text',
        status: 'sent',
        createdAt: new Date().toISOString(),
      };

      // Emit to conversation room
      io.to(`conversation:${conversationId}`).emit('new_message', {
        conversationId,
        message,
      });

      logger.info(`Message sent in conversation ${conversationId}`);
    });

    /**
     * Typing indicator
     */
    socket.on('typing', (data: { conversationId: string }) => {
      const { conversationId } = data;

      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        conversationId,
        userId,
      });
    });

    /**
     * Stop typing
     */
    socket.on('stop_typing', (data: { conversationId: string }) => {
      const { conversationId } = data;

      socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
        conversationId,
        userId,
      });
    });

    /**
     * Mark message as read
     */
    socket.on('mark_read', async (data: {
      conversationId: string;
      messageId: string;
    }) => {
      const { conversationId, messageId } = data;

      // TODO: Update database

      // Notify sender
      socket.to(`conversation:${conversationId}`).emit('message_read', {
        conversationId,
        messageId,
        userId,
      });
    });

    // ====================
    // NOTIFICATION EVENTS
    // ====================

    /**
     * Subscribe to notifications
     */
    socket.on('subscribe_notifications', () => {
      socket.join(`notifications:${userId}`);
      logger.info(`User ${userId} subscribed to notifications`);
    });

    /**
     * Send notification (from server-side)
     */
    const sendNotification = (targetUserId: string, notification: any) => {
      io.to(`notifications:${targetUserId}`).emit('notification', notification);
    };

    // Make it available globally
    (socket as any).sendNotification = sendNotification;

    // ====================
    // LOYALTY EVENTS
    // ====================

    /**
     * Points earned notification
     */
    socket.on('points_earned', (data: { points: number }) => {
      const { points } = data;

      socket.emit('loyalty_update', {
        type: 'points_earned',
        points,
        message: `You earned ${points} points!`,
      });
    });

    // ====================
    // PRESENCE EVENTS
    // ====================

    /**
     * Get online users
     */
    socket.on('get_online_users', (callback) => {
      const onlineUserIds = Array.from(onlineUsers.keys());
      callback(onlineUserIds);
    });

    /**
     * Check if user is online
     */
    socket.on('check_user_online', (data: { userId: string }, callback) => {
      const isOnline = onlineUsers.has(data.userId);
      callback(isOnline);
    });

    // ====================
    // DISCONNECT
    // ====================

    socket.on('disconnect', () => {
      logger.info(`✗ User disconnected: ${userId}`);

      // Remove from online users
      onlineUsers.delete(userId);

      // Broadcast offline status
      io.emit('user_offline', { userId });
    });

    // ====================
    // ERROR HANDLING
    // ====================

    socket.on('error', (error) => {
      logger.error(`Socket error for user ${userId}:`, error);
    });
  });

  // ====================
  // SERVER-SIDE HELPERS
  // ====================

  /**
   * Send notification to user
   */
  (io as any).sendNotification = (userId: string, notification: any) => {
    io.to(`notifications:${userId}`).emit('notification', notification);
  };

  /**
   * Send message to conversation
   */
  (io as any).sendMessageToConversation = (conversationId: string, message: any) => {
    io.to(`conversation:${conversationId}`).emit('new_message', {
      conversationId,
      message,
    });
  };

  /**
   * Broadcast to all users
   */
  (io as any).broadcastToAll = (event: string, data: any) => {
    io.emit(event, data);
  };

  logger.info('✓ WebSocket server initialized');
}
