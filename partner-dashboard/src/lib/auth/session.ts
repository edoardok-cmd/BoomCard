/**
 * Session Management
 * Handles user sessions with secure cookie storage
 */

import { JWTPayload, generateTokenPair, validateToken, refreshAccessToken } from './jwt';

export interface Session {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'user' | 'partner' | 'admin';
    avatar?: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
}

const SESSION_COOKIE_NAME = 'boomcard_session';
const REFRESH_COOKIE_NAME = 'boomcard_refresh';

/**
 * Create a new session
 */
export function createSession(user: Session['user']): Session {
  const tokens = generateTokenPair({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  const session: Session = {
    user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    createdAt: new Date(),
  };

  return session;
}

/**
 * Store session in cookies (client-side)
 */
export function storeSession(session: Session): void {
  if (typeof document === 'undefined') return;

  // Store access token (short-lived, httpOnly in production)
  document.cookie = `${SESSION_COOKIE_NAME}=${session.accessToken}; path=/; max-age=${15 * 60}; SameSite=Strict`;

  // Store refresh token (long-lived, httpOnly in production)
  document.cookie = `${REFRESH_COOKIE_NAME}=${session.refreshToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Strict`;

  // Store user data in localStorage for quick access
  localStorage.setItem('boomcard_user', JSON.stringify(session.user));
}

/**
 * Get session from cookies
 */
export function getSession(): Session | null {
  if (typeof document === 'undefined') return null;

  const accessToken = getCookie(SESSION_COOKIE_NAME);
  const refreshToken = getCookie(REFRESH_COOKIE_NAME);

  if (!accessToken || !refreshToken) {
    return null;
  }

  // Validate access token
  const payload = validateToken(accessToken);

  if (!payload) {
    // Try to refresh
    return attemptRefresh(refreshToken);
  }

  // Get user data from localStorage
  const userDataStr = localStorage.getItem('boomcard_user');
  if (!userDataStr) return null;

  const user = JSON.parse(userDataStr);

  return {
    user,
    accessToken,
    refreshToken,
    expiresAt: new Date(payload.exp * 1000),
    createdAt: new Date(payload.iat * 1000),
  };
}

/**
 * Attempt to refresh session
 */
function attemptRefresh(refreshToken: string): Session | null {
  const newAccessToken = refreshAccessToken(refreshToken);

  if (!newAccessToken) {
    clearSession();
    return null;
  }

  // Update access token cookie
  document.cookie = `${SESSION_COOKIE_NAME}=${newAccessToken}; path=/; max-age=${15 * 60}; SameSite=Strict`;

  const payload = validateToken(newAccessToken);
  if (!payload) return null;

  const userDataStr = localStorage.getItem('boomcard_user');
  if (!userDataStr) return null;

  const user = JSON.parse(userDataStr);

  return {
    user,
    accessToken: newAccessToken,
    refreshToken,
    expiresAt: new Date(payload.exp * 1000),
    createdAt: new Date(payload.iat * 1000),
  };
}

/**
 * Clear session
 */
export function clearSession(): void {
  if (typeof document === 'undefined') return;

  // Clear cookies
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0`;
  document.cookie = `${REFRESH_COOKIE_NAME}=; path=/; max-age=0`;

  // Clear localStorage
  localStorage.removeItem('boomcard_user');
  localStorage.removeItem('boomcard_auth');
  localStorage.removeItem('boomcard_token');
}

/**
 * Update session user data
 */
export function updateSessionUser(updates: Partial<Session['user']>): void {
  const userDataStr = localStorage.getItem('boomcard_user');
  if (!userDataStr) return;

  const user = JSON.parse(userDataStr);
  const updatedUser = { ...user, ...updates };

  localStorage.setItem('boomcard_user', JSON.stringify(updatedUser));
}

/**
 * Check if session is valid
 */
export function isSessionValid(): boolean {
  const session = getSession();
  return session !== null;
}

/**
 * Get user from session
 */
export function getSessionUser(): Session['user'] | null {
  const session = getSession();
  return session?.user || null;
}

/**
 * Get access token
 */
export function getAccessToken(): string | null {
  return getCookie(SESSION_COOKIE_NAME);
}

/**
 * Get cookie value
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);

  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }

  return null;
}

/**
 * Session middleware for API requests
 */
export function withAuth(headers: Record<string, string> = {}): Record<string, string> {
  const accessToken = getAccessToken();

  if (!accessToken) {
    return headers;
  }

  return {
    ...headers,
    'Authorization': `Bearer ${accessToken}`,
  };
}

/**
 * Check if user has specific role
 */
export function hasRole(role: 'user' | 'partner' | 'admin'): boolean {
  const user = getSessionUser();
  if (!user) return false;

  const roleHierarchy = {
    admin: 3,
    partner: 2,
    user: 1,
  };

  return roleHierarchy[user.role] >= roleHierarchy[role];
}

/**
 * Require specific role (throws if not authorized)
 */
export function requireRole(role: 'user' | 'partner' | 'admin'): void {
  if (!hasRole(role)) {
    throw new Error(`Access denied. Required role: ${role}`);
  }
}

/**
 * Session event emitter
 */
type SessionEventType = 'login' | 'logout' | 'refresh' | 'expired';
type SessionEventHandler = (session: Session | null) => void;

const sessionEventHandlers: Map<SessionEventType, Set<SessionEventHandler>> = new Map();

/**
 * Subscribe to session events
 */
export function onSessionEvent(
  event: SessionEventType,
  handler: SessionEventHandler
): () => void {
  if (!sessionEventHandlers.has(event)) {
    sessionEventHandlers.set(event, new Set());
  }

  sessionEventHandlers.get(event)!.add(handler);

  // Return unsubscribe function
  return () => {
    sessionEventHandlers.get(event)?.delete(handler);
  };
}

/**
 * Emit session event
 */
export function emitSessionEvent(event: SessionEventType, session: Session | null): void {
  const handlers = sessionEventHandlers.get(event);

  if (handlers) {
    handlers.forEach(handler => {
      try {
        handler(session);
      } catch (error) {
        console.error(`Error in session event handler for ${event}:`, error);
      }
    });
  }
}

/**
 * Initialize session monitoring
 */
export function initSessionMonitoring(): () => void {
  let intervalId: NodeJS.Timeout;

  if (typeof window !== 'undefined') {
    // Check session validity every minute
    intervalId = setInterval(() => {
      const session = getSession();

      if (!session) {
        emitSessionEvent('expired', null);
        clearInterval(intervalId);
      }
    }, 60 * 1000);
  }

  // Return cleanup function
  return () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
}
