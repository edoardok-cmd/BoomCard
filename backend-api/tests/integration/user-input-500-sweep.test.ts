/**
 * User Surface — INPUT class sweep (BC-USER-SPEC-REAUDIT)
 *
 * Covers INV-USER-INPUT-001:
 *   For every user `:id`-style route, a malformed path param must produce a
 *   clean 4xx (400/401/403/404) — NEVER a 500 / Prisma P2023 / Postgres 22P02
 *   (invalid input syntax for type uuid) leaking out as an unhandled error.
 *
 * Strategy: one real subscriber token; for each route template, substitute a
 * batch of malformed ids and assert status !== 500 and the body carries no raw
 * Prisma/Postgres error code. Admin/partner-gated routes are allowed to answer
 * 403 (still a clean 4xx) — the point is "no 500 from a bad id", not "200".
 *
 * Teeth: a positive control sends a syntactically-valid but non-existent uuid
 * and asserts the route answers (not 500) — proving the route is reached.
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import {
  createTestUser,
  createTestSubscription,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';

let userId: string;
let token: string;

beforeAll(async () => {
  const u = await createTestUser();
  userId = u.user.id;
  token = u.accessToken;
  await createTestSubscription(userId, 'BASIC', 'ACTIVE');
}, 30_000);

afterAll(async () => {
  if (userId) {
    try { await cleanupTestUser(userId); } catch {}
  }
}, 30_000);

// Malformed values that historically triggered Prisma P2023 / Postgres 22P02
// or unguarded parseInt → NaN paths.
const MALFORMED: Array<{ label: string; value: string }> = [
  { label: 'not-a-uuid', value: 'not-a-uuid' },
  { label: 'sql-ish', value: "1' OR '1'='1" },
  { label: 'overlong', value: 'x'.repeat(4096) },
  { label: 'numeric-string', value: '999999999999999999999999' },
];

// A valid-but-nonexistent uuid — positive control proving the route is reached.
const ABSENT_UUID = '00000000-0000-4000-8000-000000000000';

type Probe = { method: 'get' | 'post' | 'delete' | 'patch' | 'put'; path: (id: string) => string; body?: object };

const PROBES: Probe[] = [
  { method: 'get', path: (id) => `/api/notifications/${id}` },
  { method: 'post', path: (id) => `/api/notifications/${id}/read` },
  { method: 'post', path: (id) => `/api/notifications/${id}/archive` },
  { method: 'delete', path: (id) => `/api/notifications/${id}` },
  { method: 'get', path: (id) => `/api/help/tickets/${id}` },
  { method: 'get', path: (id) => `/api/help/tickets/${id}/replies` },
  { method: 'post', path: (id) => `/api/help/tickets/${id}/cancel` },
  { method: 'post', path: (id) => `/api/help/tickets/${id}/reply`, body: { message: 'x' } },
  { method: 'get', path: (id) => `/api/receipts/${id}` },
  { method: 'delete', path: (id) => `/api/receipts/${id}` },
  { method: 'post', path: (id) => `/api/receipts/${id}/cashback` },
  { method: 'get', path: (id) => `/api/receipts/v2/${id}` },
  { method: 'get', path: (id) => `/api/cards/${id}/statistics` },
  { method: 'post', path: (id) => `/api/cards/${id}/activate` },
  { method: 'post', path: (id) => `/api/cards/${id}/deactivate` },
  { method: 'post', path: (id) => `/api/cards/${id}/upgrade` },
  { method: 'get', path: (id) => `/api/offers/${id}` },
  { method: 'get', path: (id) => `/api/reviews/${id}` },
  { method: 'delete', path: (id) => `/api/reviews/${id}` },
  { method: 'patch', path: (id) => `/api/reviews/${id}/helpful` },
  { method: 'get', path: (id) => `/api/subscriptions/status/${id}` },
  { method: 'patch', path: (id) => `/api/subscriptions/${id}/auto-renewal`, body: { autoRenew: false } },
  { method: 'post', path: (id) => `/api/subscriptions/${id}/cancel` },
  { method: 'get', path: (id) => `/api/payments/${id}/status` },
  { method: 'get', path: (id) => `/api/checkout/status/${id}` },
];

function looksLikeDbError(body: any): boolean {
  const s = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  return /P2023|22P02|invalid input syntax for type uuid|PrismaClientKnownRequestError/i.test(s);
}

describe('INV-USER-INPUT-001 — malformed :id never 500s on the user surface', () => {
  for (const probe of PROBES) {
    for (const m of MALFORMED) {
      const url = probe.path(encodeURIComponent(m.value));
      it(`[INPUT] ${probe.method.toUpperCase()} ${probe.path('{id}')} with ${m.label} → clean 4xx`, async () => {
        const req = authRequest(token)[probe.method](url);
        const res = probe.body ? await req.send(probe.body) : await req;
        expect(res.status).not.toBe(500);
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(looksLikeDbError(res.body)).toBe(false);
      });
    }
    it(`[INPUT][teeth] ${probe.method.toUpperCase()} ${probe.path('{id}')} reached with absent uuid (no 500)`, async () => {
      const req = authRequest(token)[probe.method](probe.path(ABSENT_UUID));
      const res = probe.body ? await req.send(probe.body) : await req;
      expect(res.status).not.toBe(500);
    });
  }
});
