/**
 * JWT Authentication Utilities
 * Token generation, verification, and management
 */

import crypto from 'crypto';

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

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days

/**
 * Base64 URL encode
 */
function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(data: string): string {
  // Add padding
  const padding = '='.repeat((4 - (data.length % 4)) % 4);
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/') + padding;

  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Create HMAC signature
 */
function createSignature(data: string, secret: string): string {
  return base64UrlEncode(
    crypto.createHmac('sha256', secret).update(data).digest('base64')
  );
}

/**
 * Generate JWT token
 */
export function generateToken(
  payload: Omit<JWTPayload, 'iat' | 'exp' | 'jti'>,
  expiresIn: number = ACCESS_TOKEN_EXPIRY,
  secret: string = JWT_SECRET
): string {
  const now = Math.floor(Date.now() / 1000);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    jti: crypto.randomBytes(16).toString('hex'),
  } as JWTPayload;

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = createSignature(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string, secret: string = JWT_SECRET): JWTPayload | null {
  try {
    const parts = token.split('.');

    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const expectedSignature = createSignature(
      `${encodedHeader}.${encodedPayload}`,
      secret
    );

    if (signature !== expectedSignature) {
      throw new Error('Invalid signature');
    }

    // Decode payload
    const payload: JWTPayload = JSON.parse(base64UrlDecode(encodedPayload));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired');
    }

    return payload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Generate access and refresh token pair
 */
export function generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp' | 'jti'>): TokenPair {
  const accessToken = generateToken(payload, ACCESS_TOKEN_EXPIRY, JWT_SECRET);
  const refreshToken = generateToken(
    { ...payload, type: 'refresh' },
    REFRESH_TOKEN_EXPIRY,
    JWT_REFRESH_SECRET
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  };
}

/**
 * Refresh access token using refresh token
 */
export function refreshAccessToken(refreshToken: string): string | null {
  const payload = verifyToken(refreshToken, JWT_REFRESH_SECRET);

  if (!payload || payload.type !== 'refresh') {
    return null;
  }

  // Generate new access token
  const { type, iat, exp, jti, ...userPayload } = payload;
  return generateToken(userPayload, ACCESS_TOKEN_EXPIRY, JWT_SECRET);
}

/**
 * Decode token without verification (useful for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    return JSON.parse(base64UrlDecode(parts[1]));
  } catch (error) {
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
 * Extract user info from token
 */
export function getUserFromToken(token: string): {
  id: string;
  email: string;
  role: string;
} | null {
  const payload = verifyToken(token);
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
 * Validate token and check revocation
 */
export function validateToken(token: string): JWTPayload | null {
  if (isTokenRevoked(token)) {
    return null;
  }

  return verifyToken(token);
}
