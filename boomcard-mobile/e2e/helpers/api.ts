/**
 * Direct API helpers — used by tests for setup/teardown work that doesn't need a UI.
 * All calls hit the backend at API_BASE (default http://localhost:3025).
 */

export const API_BASE = process.env.E2E_API_URL || 'http://localhost:3025';

export async function login(email: string, password: string, clientType: 'mobile' | 'web' = 'mobile') {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, clientType }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`login failed: ${JSON.stringify(json)}`);
  return json.data as { user: { id: string; email: string }; accessToken: string; refreshToken: string };
}

export async function auth(headers: Record<string, string>, token: string) {
  return { ...headers, Authorization: `Bearer ${token}` };
}

export async function validateSticker(stickerId: string, token: string) {
  const res = await fetch(`${API_BASE}/api/stickers/validate/${stickerId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

import fixtures from '../fixtures/seeded.json';

/**
 * Create a session. Server now requires payloadVenueId + payloadVersion (Findings #4 + #5).
 * Pass overrides to test the failure paths:
 *   - payloadVenueId: explicit venueId to send (or empty string to omit)
 *   - payloadVersion: explicit version string ("0.9" to test old-version rejection)
 *   - skip: list of fields to omit entirely ('payloadVenueId', 'payloadVersion')
 */
export async function createSession(
  stickerId: string,
  lat: number,
  lng: number,
  token: string,
  opts?: { payloadVenueId?: string; payloadVersion?: string; skip?: Array<'payloadVenueId' | 'payloadVersion'> },
) {
  const venueKey = Object.entries(fixtures.venues).find(([, v]) => v.stickerId === stickerId)?.[0];
  let defaultVenueId = venueKey ? (fixtures.venues as any)[venueKey].venueId : undefined;
  // Bar is a standalone fixture, not part of the discount-step matrix.
  const bar = (fixtures as any).bar as { stickerId: string; venueId: string } | undefined;
  if (!defaultVenueId && bar && bar.stickerId === stickerId) {
    defaultVenueId = bar.venueId;
  }

  const body: any = { stickerId, latitude: lat, longitude: lng };
  if (!opts?.skip?.includes('payloadVenueId')) {
    body.payloadVenueId = opts?.payloadVenueId ?? defaultVenueId;
  }
  if (!opts?.skip?.includes('payloadVersion')) {
    body.payloadVersion = opts?.payloadVersion ?? '1.0';
  }

  const res = await fetch(`${API_BASE}/api/stickers/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function submitScan(sessionId: string, billAmount: number, lat: number, lng: number, token: string) {
  const res = await fetch(`${API_BASE}/api/stickers/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId, billAmount, latitude: lat, longitude: lng }),
  });
  return res.json();
}

export async function getWallet(token: string) {
  const res = await fetch(`${API_BASE}/api/wallet`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function getSubscription(token: string) {
  const res = await fetch(`${API_BASE}/api/subscriptions/current`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
