/**
 * WebSocket Service for Real-Time Updates
 * Handles real-time notifications, transaction updates, and live analytics
 */

export type WebSocketEventType =
  | 'transaction.created'
  | 'transaction.updated'
  | 'card.activated'
  | 'card.used'
  | 'analytics.update'
  | 'notification.new'
  | 'integration.status'
  | 'partner.update';

export interface WebSocketMessage<T = any> {
  event: WebSocketEventType;
  data: T;
  timestamp: number;
  id: string;
}

export interface TransactionEvent {
  transactionId: string;
  amount: number;
  discount: number;
  venueName: string;
  cardNumber: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface NotificationEvent {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}

export interface AnalyticsEvent {
  metric: string;
  value: number;
  change: number;
  period: string;
}

type EventHandler<T = any> = (data: T) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private eventHandlers: Map<WebSocketEventType, Set<EventHandler>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private partnerId: string;

  constructor(url: string, partnerId: string) {
    this.url = url;
    this.partnerId = partnerId;
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(`${this.url}?partnerId=${this.partnerId}`);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit('connection.opened', { partnerId: this.partnerId });
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.isConnecting = false;
        this.stopHeartbeat();
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.isConnecting = false;
      this.attemptReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Subscribe to an event type
   */
  on<T = any>(event: WebSocketEventType, handler: EventHandler<T>): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    this.eventHandlers.get(event)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler as EventHandler);
      }
    };
  }

  /**
   * Unsubscribe from an event type
   */
  off(event: WebSocketEventType, handler?: EventHandler): void {
    if (!handler) {
      // Remove all handlers for this event
      this.eventHandlers.delete(event);
      return;
    }

    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Send a message to the server
   */
  send(event: WebSocketEventType, data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        event,
        data,
        timestamp: Date.now(),
        id: this.generateId(),
      };

      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Message not sent:', event);
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: WebSocketMessage): void {
    const handlers = this.eventHandlers.get(message.event);

    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(message.data);
        } catch (error) {
          console.error(`Error in event handler for ${message.event}:`, error);
        }
      });
    }
  }

  /**
   * Emit a local event (for internal use)
   */
  private emit(event: string, data: any): void {
    // This is for local events, not WebSocket events
    window.dispatchEvent(
      new CustomEvent(event, {
        detail: data,
      })
    );
  }

  /**
   * Attempt to reconnect to the server
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('connection.failed', { attempts: this.reconnectAttempts });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting to reconnect in ${delay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Generate unique message ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Global WebSocket instance
 */
let globalWebSocket: WebSocketService | null = null;

/**
 * Initialize WebSocket service
 */
export function initWebSocket(partnerId: string): WebSocketService {
  if (!globalWebSocket) {
    const wsUrl = process.env.REACT_APP_WS_URL || 'wss://api.boomcard.bg/ws';
    globalWebSocket = new WebSocketService(wsUrl, partnerId);
  }

  return globalWebSocket;
}

/**
 * Get WebSocket instance
 */
export function getWebSocket(): WebSocketService | null {
  return globalWebSocket;
}

/**
 * Disconnect and cleanup WebSocket
 */
export function disconnectWebSocket(): void {
  if (globalWebSocket) {
    globalWebSocket.disconnect();
    globalWebSocket = null;
  }
}

export default WebSocketService;
