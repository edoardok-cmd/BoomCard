/**
 * TEETH TEST: system-health-leak-sweep (INV-SYS-014/015/016/030)
 *
 * Proves the health-endpoint leak detector has teeth: a handler that returned
 * process internals or a raw dependency error string would be flagged, and the
 * live API returns clean bodies.
 *
 * RED scenarios (inline): pass deliberately-bad bodies to the assertion helpers
 *   and confirm they throw.
 * GREEN scenarios (live API): hit the real endpoints via supertest and confirm
 *   the helpers pass on real responses.
 *
 * This file does NOT edit any src/** code.
 */

import request from 'supertest';
import { app } from '../../src/server';
import prisma from '../../src/lib/prisma';

// ---------------------------------------------------------------------------
// Assertion helpers — mirrors the sweep's logic exactly so we are testing the
// same gate, not a re-implementation that could diverge.
// ---------------------------------------------------------------------------

/** INV-SYS-014: if 200, metrics body must not expose process internals. */
function assertMetricsBodyClean(status: number, body: Record<string, unknown>): void {
  if (status === 200) {
    expect(body.database).toBeUndefined();
    expect(body.uptime).toBeUndefined();
    expect(body.memory).toBeUndefined();
    expect((body.process as any)?.nodeVersion).toBeUndefined();
    expect((body.process as any)?.pid).toBeUndefined();
    expect((body.process as any)?.platform).toBeUndefined();
  } else {
    expect([401, 403]).toContain(status);
  }
}

/** INV-SYS-016: /api/health/ must not expose environment or uptime. */
function assertHealthRootClean(body: Record<string, unknown>): void {
  expect(body.environment).toBeUndefined();
  expect(body.uptime).toBeUndefined();
}

/** INV-SYS-016: /api/health/detailed must not expose environment/version/uptime. */
function assertHealthDetailedClean(body: Record<string, unknown>): void {
  expect(body.environment).toBeUndefined();
  expect(body.version).toBeUndefined();
  expect(body.uptime).toBeUndefined();
}

/** INV-SYS-030: /api/health/live must not expose pid or uptime. */
function assertHealthLiveClean(body: Record<string, unknown>): void {
  expect(body.pid).toBeUndefined();
  expect(body.uptime).toBeUndefined();
}

/** INV-SYS-015: body string must not match raw dependency error patterns. */
const LEAK = /(postgres(ql)?:\/\/|redis:\/\/|ECONNREFUSED|getaddrinfo|P10\d{2}|prisma|@.*:\d{4,5}\b)/i;

function assertNoLeakString(bodyStr: string): void {
  expect(bodyStr).not.toMatch(LEAK);
}

// ---------------------------------------------------------------------------
// RED: assertion helpers bite on violating bodies
// ---------------------------------------------------------------------------

describe('TEETH — INV-SYS-014: metrics body clean assertion has teeth', () => {
  test('RED: a 200 response with database field would be flagged', () => {
    const badBody = { database: { users: 1234 } };
    expect(() => assertMetricsBodyClean(200, badBody)).toThrow();
  });

  test('RED: a 200 response with uptime field would be flagged', () => {
    const badBody = { uptime: 98765 };
    expect(() => assertMetricsBodyClean(200, badBody)).toThrow();
  });

  test('RED: a 200 response with memory field would be flagged', () => {
    const badBody = { memory: { heapUsed: 50000000 } };
    expect(() => assertMetricsBodyClean(200, badBody)).toThrow();
  });

  test('RED: a 200 response with process.pid would be flagged', () => {
    const badBody = { process: { pid: 12345 } };
    expect(() => assertMetricsBodyClean(200, badBody)).toThrow();
  });

  test('RED: a 200 response with process.nodeVersion would be flagged', () => {
    const badBody = { process: { nodeVersion: 'v20.11.0' } };
    expect(() => assertMetricsBodyClean(200, badBody)).toThrow();
  });

  test('RED: a 200 response with process.platform would be flagged', () => {
    const badBody = { process: { platform: 'linux' } };
    expect(() => assertMetricsBodyClean(200, badBody)).toThrow();
  });

  test('RED: a 200 OK status (not 401/403) is the only valid status branch', () => {
    // If status is NOT 200 and NOT 401/403, the gate would throw
    expect(() => assertMetricsBodyClean(500, {})).toThrow();
  });
});

describe('TEETH — INV-SYS-016: health root / detailed clean assertions have teeth', () => {
  test('RED: a /health/ response with environment field would be flagged', () => {
    const badBody = { environment: 'production', status: 'ok' };
    expect(() => assertHealthRootClean(badBody)).toThrow();
  });

  test('RED: a /health/ response with uptime field would be flagged', () => {
    const badBody = { uptime: 42.7 };
    expect(() => assertHealthRootClean(badBody)).toThrow();
  });

  test('RED: a /health/detailed response with environment field would be flagged', () => {
    const badBody = { environment: 'production' };
    expect(() => assertHealthDetailedClean(badBody)).toThrow();
  });

  test('RED: a /health/detailed response with version field would be flagged', () => {
    const badBody = { version: '1.2.3' };
    expect(() => assertHealthDetailedClean(badBody)).toThrow();
  });

  test('RED: a /health/detailed response with uptime field would be flagged', () => {
    const badBody = { uptime: 3600 };
    expect(() => assertHealthDetailedClean(badBody)).toThrow();
  });
});

describe('TEETH — INV-SYS-030: health/live clean assertion has teeth', () => {
  test('RED: a /health/live response with pid would be flagged', () => {
    const badBody = { status: 'ok', pid: 9001 };
    expect(() => assertHealthLiveClean(badBody)).toThrow();
  });

  test('RED: a /health/live response with uptime would be flagged', () => {
    const badBody = { status: 'ok', uptime: 120.5 };
    expect(() => assertHealthLiveClean(badBody)).toThrow();
  });
});

describe('TEETH — INV-SYS-015: LEAK pattern assertion has teeth', () => {
  test('RED: a body containing a Postgres DSN would be flagged', () => {
    const leaky = JSON.stringify({ error: 'connect ECONNREFUSED postgres://user:pass@db-host:5432/boomcard' });
    expect(() => assertNoLeakString(leaky)).toThrow();
  });

  test('RED: a body containing a redis:// URL would be flagged', () => {
    const leaky = JSON.stringify({ message: 'redis://localhost:6379 connection refused' });
    expect(() => assertNoLeakString(leaky)).toThrow();
  });

  test('RED: a body containing ECONNREFUSED would be flagged', () => {
    const leaky = JSON.stringify({ error: 'ECONNREFUSED' });
    expect(() => assertNoLeakString(leaky)).toThrow();
  });

  test('RED: a body containing getaddrinfo would be flagged', () => {
    const leaky = JSON.stringify({ error: 'getaddrinfo ENOTFOUND postgres-host' });
    expect(() => assertNoLeakString(leaky)).toThrow();
  });

  test('RED: a body containing a Prisma error code (P1001) would be flagged', () => {
    const leaky = JSON.stringify({ code: 'P1001', message: 'failed to connect' });
    expect(() => assertNoLeakString(leaky)).toThrow();
  });

  test('RED: a body containing the prisma literal would be flagged (|prisma| branch)', () => {
    // F4: exercises the |prisma| alternation in the LEAK regex, distinct from the
    // P10xx code branch.  A body leaking 'PrismaClientKnownRequestError' matches
    // via the literal, not via a numeric code.
    const leaky = JSON.stringify({ detail: 'PrismaClientKnownRequestError' });
    expect(() => assertNoLeakString(leaky)).toThrow();
  });

  test('RED: a body containing a host:port pattern would be flagged', () => {
    const leaky = JSON.stringify({ error: 'connect to pg@db-host:5432 refused' });
    expect(() => assertNoLeakString(leaky)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// GREEN: live endpoints pass all assertions
// ---------------------------------------------------------------------------

describe('TEETH — GREEN: live /api/health/metrics passes INV-SYS-014', () => {
  test('GET /api/health/metrics — no process internals exposed to anon', async () => {
    const res = await request(app).get('/api/health/metrics');
    assertMetricsBodyClean(res.status, res.body);
  });
});

describe('TEETH — GREEN: live /api/health/ passes INV-SYS-016', () => {
  test('GET /api/health/ — no environment or uptime in body', async () => {
    const res = await request(app).get('/api/health/');
    assertHealthRootClean(res.body);
  });

  test('GET /api/health/detailed — no environment/version/uptime in body', async () => {
    const res = await request(app).get('/api/health/detailed');
    assertHealthDetailedClean(res.body);
  });
});

describe('TEETH — GREEN: live /api/health/live passes INV-SYS-030', () => {
  test('GET /api/health/live — no pid or uptime in body', async () => {
    const res = await request(app).get('/api/health/live');
    assertHealthLiveClean(res.body);
  });
});

describe('TEETH — GREEN: live health endpoints pass INV-SYS-015 (no LEAK in normal responses)', () => {
  for (const path of ['/api/health/detailed', '/api/health/ready', '/api/health/metrics']) {
    test(`GET ${path} — no raw dependency error string in body`, async () => {
      const res = await request(app).get(path);
      assertNoLeakString(JSON.stringify(res.body));
    });
  }
});

describe('TEETH — GREEN: spy-forced DB error does not leak through /api/health/ready (INV-SYS-015)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('GET /api/health/ready with forced ECONNREFUSED — no leak pattern in 503 body', async () => {
    const FAKE_DSN_ERROR = new Error(
      'connect ECONNREFUSED postgres://user:pass@db-host:5432/boomcard',
    );
    jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(FAKE_DSN_ERROR);
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(503);
    assertNoLeakString(JSON.stringify(res.body));
    // Tighten: specific tokens from the fake DSN must not appear
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|postgres|db-host|5432/i);
  });

  test('GET /api/health/detailed with forced getaddrinfo error — no leak pattern in body', async () => {
    const FAKE_DSN_ERROR = new Error('getaddrinfo ENOTFOUND postgres-host:5432');
    jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(FAKE_DSN_ERROR);
    const res = await request(app).get('/api/health/detailed');
    expect([200, 503]).toContain(res.status);
    assertNoLeakString(JSON.stringify(res.body));
    expect(JSON.stringify(res.body)).not.toMatch(/getaddrinfo|ENOTFOUND|postgres-host/i);
  });
});

// F3: bare-path variants — mirrors parent sweep lines 104–122.

describe('TEETH — GREEN: bare /health path passes INV-SYS-016 (no process internals)', () => {
  test('GET /health — no uptime, environment, or pid in body', async () => {
    const res = await request(app).get('/health');
    // Parent sweep (line 104–109) checks uptime, environment, pid are all undefined.
    expect(res.body.uptime).toBeUndefined();
    expect(res.body.environment).toBeUndefined();
    expect(res.body.pid).toBeUndefined();
  });
});

describe('TEETH — GREEN: bare /ready path does not echo raw DB error (INV-SYS-015)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('GET /ready with spy-forced ECONNREFUSED — 503, no ECONNREFUSED/postgres/db-host/5432 in body', async () => {
    // Parent sweep lines 111–122: bare /ready must return 503 and scrub the DSN.
    const FAKE_DSN_ERROR = new Error(
      'connect ECONNREFUSED postgres://user:pass@db-host:5432/boomcard',
    );
    jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(FAKE_DSN_ERROR);
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    assertNoLeakString(JSON.stringify(res.body));
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|postgres|db-host|5432/i);
  });
});
