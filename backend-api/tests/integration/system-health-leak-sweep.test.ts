/**
 * System Surface — LEAK class sweep (BC-SYSTEM-SPEC-REAUDIT)
 *
 * Mechanical guard for the health/internals non-disclosure invariants. Health
 * endpoints exist for liveness/readiness monitoring and MUST NOT hand an
 * anonymous caller business data, process internals, raw dependency error
 * strings, or environment metadata.
 *
 * Covers:
 *   INV-SYS-014 — GET /api/health/metrics must NOT expose business row-counts
 *                 or process internals (pid/platform/nodeVersion) to anon.
 *   INV-SYS-015 — health endpoints must NOT echo raw dependency error.message
 *                 (DB/Redis) — a connection error can carry host/DSN/topology.
 *   INV-SYS-016 — GET /api/health/ & /detailed must NOT expose environment/version to anon.
 *
 * ⚠️  INTENTIONALLY RED at R1 bootstrap — this is the executable guard the
 * following fixes must turn GREEN:
 *   - BC-SYSTEM-SPEC-REAUDIT-HEALTH-METRICS-AUTH  (INV-SYS-014)
 *   - BC-SYSTEM-SPEC-REAUDIT-HEALTH-ERRLEAK       (INV-SYS-015)
 *   - BC-SYSTEM-SPEC-REAUDIT-HEALTH-ENV-STRIP     (INV-SYS-016)
 *
 * This file does NOT edit any src/** code.
 */

import request from 'supertest';
import { app } from '../../src/server';
import prisma from '../../src/lib/prisma';

describe('System LEAK sweep — health endpoints expose no internals', () => {
  test('[INV-SYS-014] GET /api/health/metrics does not expose business row-counts to anon', async () => {
    const res = await request(app).get('/api/health/metrics');
    // Either the endpoint is auth-gated (401/403) OR, if public, it must omit
    // business row counts and process internals entirely.
    if (res.status === 200) {
      expect(res.body.database).toBeUndefined(); // users/venues/stickers/receipts/transactions
      expect(res.body.process?.nodeVersion).toBeUndefined();
      expect(res.body.process?.pid).toBeUndefined();
      expect(res.body.process?.platform).toBeUndefined();
    } else {
      expect([401, 403]).toContain(res.status);
    }
  });

  test('[INV-SYS-016] GET /api/health/ does not expose environment to anon', async () => {
    const res = await request(app).get('/api/health/');
    expect(res.body.environment).toBeUndefined();
  });

  test('[INV-SYS-016] GET /api/health/detailed does not expose environment/version to anon', async () => {
    const res = await request(app).get('/api/health/detailed');
    expect(res.body.environment).toBeUndefined();
    expect(res.body.version).toBeUndefined();
  });

  test('[INV-SYS-015] health responses never carry a raw dependency error string', async () => {
    // A leaked Prisma/ioredis error message typically contains these tokens.
    const LEAK = /(postgres(ql)?:\/\/|redis:\/\/|ECONNREFUSED|getaddrinfo|P10\d{2}|prisma|@.*:\d{4,5}\b)/i;
    for (const path of ['/api/health/detailed', '/api/health/ready', '/api/health/metrics']) {
      const res = await request(app).get(path);
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(LEAK);
    }
  });

  test('[INV-SYS-015] /ready does not echo raw DB error on dependency failure', async () => {
    const FAKE_DSN_ERROR = new Error('connect ECONNREFUSED postgres://user:pass@db-host:5432/boomcard');
    const spy = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(FAKE_DSN_ERROR);
    try {
      const res = await request(app).get('/api/health/ready');
      expect(res.status).toBe(503);
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/ECONNREFUSED|postgres|db-host|5432/i);
    } finally {
      spy.mockRestore();
    }
  });

  test('[INV-SYS-015] /detailed does not echo raw DB error on dependency failure', async () => {
    const FAKE_DSN_ERROR = new Error('getaddrinfo ENOTFOUND postgres-host:5432');
    const spy = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(FAKE_DSN_ERROR);
    try {
      const res = await request(app).get('/api/health/detailed');
      expect([200, 503]).toContain(res.status);
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/getaddrinfo|ENOTFOUND|postgres-host/i);
    } finally {
      spy.mockRestore();
    }
  });
});
