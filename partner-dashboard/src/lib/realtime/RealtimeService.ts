/**
 * Real-time Service using WebSocket
 * Provides real-time updates for transactions, notifications, and analytics
 */

export type RealtimeEventType =
  | 'transaction.created'
  | 'transaction.updated'
  | 'notification.new'
  | 'analytics.update'
  | 'offer.created'
  | 'offer.updated'
  | 'subscription.updated'
  | 'connection.status';

export interface RealtimeEvent {
  type: RealtimeEventType;
  data: any;
  timestamp: Date;
}

type EventCallback = (event: RealtimeEvent) => void;

export class RealtimeService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private heartbeatInterval: number = 30000; // 30 seconds
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private listeners: Map<RealtimeEventType, Set<EventCallback>> = new Map();
  private connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';

  constructor(url?: string) {
    this.url = url || this.getWebSocketUrl();
  }

  /**
   * Get WebSocket URL
   */
  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.WEBSOCKET_HOST || window.location.host;
    return `${protocol}//${host}/ws`;
  }

  /**
   * Connect to WebSocket server
   */
  connect(token?: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Realtime] Already connected');
      return;
    }

    this.connectionStatus = 'connecting';
    this.notifyConnectionStatus();

    try {
      const url = token ? `${this.url}?token=${token}` : this.url;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (error) => this.handleError(error);
      this.ws.onclose = () => this.handleClose();
    } catch (error) {
      console.error('[Realtime] Connection error:', error);
      this.handleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connectionStatus = 'disconnected';
    this.notifyConnectionStatus();
  }

  /**
   * Send message to server
   */
  send(type: string, data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[Realtime] Not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify({ type, data }));
    } catch (error) {
      console.error('[Realtime] Send error:', error);
    }
  }

  /**
   * Subscribe to event type
   */
  subscribe(eventType: RealtimeEventType, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType)!.add(callback);

    // Send subscription message to server
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send('subscribe', { eventType });
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(eventType);
          // Send unsubscribe message to server
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.send('unsubscribe', { eventType });
          }
        }
      }
    };
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' {
    return this.connectionStatus;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  /**
   * Handle WebSocket open
   */
  private handleOpen(): void {
    console.log('[Realtime] Connected');
    this.connectionStatus = 'connected';
    this.reconnectAttempts = 0;
    this.notifyConnectionStatus();
    this.startHeartbeat();

    // Re-subscribe to events
    for (const eventType of this.listeners.keys()) {
      this.send('subscribe', { eventType });
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);

      // Handle heartbeat response
      if (message.type === 'pong') {
        return;
      }

      // Create realtime event
      const realtimeEvent: RealtimeEvent = {
        type: message.type,
        data: message.data,
        timestamp: new Date(message.timestamp || Date.now()),
      };

      // Notify listeners
      const callbacks = this.listeners.get(realtimeEvent.type);
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(realtimeEvent);
          } catch (error) {
            console.error('[Realtime] Callback error:', error);
          }
        });
      }
    } catch (error) {
      console.error('[Realtime] Message parse error:', error);
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(error: Event): void {
    console.error('[Realtime] Error:', error);
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(): void {
    console.log('[Realtime] Disconnected');
    this.connectionStatus = 'disconnected';
    this.notifyConnectionStatus();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.handleReconnect();
  }

  /**
   * Handle reconnection
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Realtime] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[Realtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send('ping', { timestamp: Date.now() });
      }
    }, this.heartbeatInterval);
  }

  /**
   * Notify connection status change
   */
  private notifyConnectionStatus(): void {
    const event: RealtimeEvent = {
      type: 'connection.status',
      data: { status: this.connectionStatus },
      timestamp: new Date(),
    };

    const callbacks = this.listeners.get('connection.status');
    if (callbacks) {
      callbacks.forEach(callback => callback(event));
    }
  }
}

// Singleton instance
let globalRealtimeService: RealtimeService | null = null;

export function initRealtimeService(url?: string): RealtimeService {
  if (!globalRealtimeService) {
    globalRealtimeService = new RealtimeService(url);
  }
  return globalRealtimeService;
}

export function getRealtimeService(): RealtimeService | null {
  return globalRealtimeService;
}

export default RealtimeService;
