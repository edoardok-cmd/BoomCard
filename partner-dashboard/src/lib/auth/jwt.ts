/**
 * JWT Authentication Utilities
 * Token generation, verification, and management
 */

// jwt.ts — shared JWT types and browser-safe token utilities.
// Crypto-dependent functions (generateToken, verifyToken) must only be called
// server-side. The browser uses decodeToken (no crypto/process required).

export interface JWTPayload {
  sub: string; // Subject (user ID)
  email: string;
  role: 'user' | 'partner' | 'admin';
  iat: number; // Issued at
  exp: number; // Expiration
  jti?: string; // JWT ID (for revocation)
  [key: string]: any;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Base64 URL decode — browser-safe (uses atob).
 */
function base64UrlDecode(data: string): string {
  const padding = '='.repeat((4 - (data.length % 4)) % 4);
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/') + padding;
  try {
    // Browser
    return atob(base64);
  } catch {
    // Node fallback (tests)
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
}

/**
 * Decode token without verification (useful for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload) return true;

  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}

/**
 * Get token expiry time
 */
export function getTokenExpiry(token: string): Date | null {
  const payload = decodeToken(token);
  if (!payload) return null;

  return new Date(payload.exp * 1000);
}

/**
 * Extract user info from token (browser-safe, no signature verification)
 */
export function getUserFromToken(token: string): {
  id: string;
  email: string;
  role: string;
} | null {
  const payload = decodeToken(token);
  if (!payload) return null;

  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
  };
}

/**
 * Token revocation list (in-memory, should be Redis in production)
 */
const revokedTokens = new Set<string>();

/**
 * Revoke a token
 */
export function revokeToken(token: string): void {
  const payload = decodeToken(token);
  if (payload?.jti) {
    revokedTokens.add(payload.jti);
  }
}

/**
 * Check if token is revoked
 */
export function isTokenRevoked(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload?.jti) return false;

  return revokedTokens.has(payload.jti);
}

/**
 * Clear revoked tokens older than expiry
 */
export function clearExpiredRevocations(): void {
  // In production, this would be handled by Redis TTL
  // For now, we just clear all (not production-ready)
  revokedTokens.clear();
}

/**
 * Validate token: decode + expiry check (browser-safe, no HMAC verification).
 * Signature integrity is enforced by the backend on every API call.
 */
export function validateToken(token: string): JWTPayload | null {
  if (isTokenRevoked(token)) {
    return null;
  }

  const payload = decodeToken(token);
  if (!payload) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;

  return payload;
}
