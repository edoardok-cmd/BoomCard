/**
 * System Surface — INV-SYS-031 LEAK sweep (BC-SYSTEM-SPEC-REAUDIT-INTEG-LEAK-SWEEP)
 *
 * Standing guard: integration route catch blocks MUST NOT echo error details in responses.
 * The companion `system-health-leak-sweep.test.ts` covers health endpoints;
 * this file covers /api/integrations/*.
 *
 * INV-SYS-031: All 8 catch blocks in integrations.routes.ts bind `err` for logger calls
 *              but must never echo it in the HTTP response.  The `err` object is passed
 *              to `logger.error()` only; all response messages are static strings.
 *
 * Three-pronged assertion:
 *  A) Static source scan (exhaustive) — count guard confirms exactly 8 bound catch blocks
 *     (BC-DEMOCK-010 pattern); no `.message` reference on err/error anywhere in the
 *     file; and err does not appear on any res.json / res.status / res.send line.
 *  B) Runtime injection (belt-and-suspenders) — force a throw carrying a sentinel
 *     string on routes that perform array operations (filter / find / map on the
 *     `availableIntegrations` array) and assert the sentinel is absent from the
 *     response body.  Discriminating spy fires only when called on the integration
 *     array (first element id === 'stripe') to avoid interfering with Express
 *     middleware chains that also use Array.prototype methods.
 *  C) Response shape contract — exercise the normal (non-injected) paths and assert
 *     that no raw connection string (Postgres DSN, Redis URL, Prisma error code, etc.)
 *     appears in any response body, and that static 404 messages are correct.
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../../src/server';

const INTEG_ROUTES_PATH = path.join(__dirname, '../../src/routes/integrations.routes.ts');

// Sentinel carries realistic-looking sensitive content that a DSN/internal error
// might surface so we prove it cannot slip through.
const SENTINEL = 'SENTINEL_POSTGRES_DSN_postgres_host_5432_boomcard_secret';

// ---------------------------------------------------------------------------
// A) Static source scan — primary comprehensive guard
// ---------------------------------------------------------------------------

describe('[INV-SYS-031] Static: integrations.routes.ts catch blocks', () => {
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(INTEG_ROUTES_PATH, 'utf-8');
  });

  test('all 8 catch blocks bind err for logger calls (BC-DEMOCK-010 pattern)', () => {
    // After BC-DEMOCK-010, bare catch {} was replaced with catch (err) + logger.
    const boundCatches = src.match(/\}\s*catch\s*\(\s*\w+\s*\)\s*\{/g) || [];
    expect(boundCatches.length).toBe(8);
  });

  test('no reference to err.message or error.message anywhere in the file', () => {
    expect(src).not.toMatch(/\berr(or)?\s*\.\s*message\b/);
  });

  test('err variable does not appear on any res.json / res.status / res.send line', () => {
    // err is used only in logger.error() calls; it must never flow into a response call.
    const lines = src.split('\n');
    const offending = lines.filter(
      (l) => /\bres\s*\.\s*(json|status|send)\b/.test(l) && /\b(err|error)\b/.test(l),
    );
    expect(offending).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B) Runtime injection — belt-and-suspenders
// ---------------------------------------------------------------------------

/**
 * Spy helper: replaces Array.prototype[method] with a version that throws
 * the SENTINEL error ONLY when called on the `availableIntegrations` array
 * (identified by its first element having id === 'stripe').  All other calls
 * fall through to the real implementation.
 *
 * Uses a `fired` flag for one-shot behaviour instead of calling mockRestore()
 * from within the implementation — calling mockRestore() inside the executing
 * mock body is undefined behaviour in Jest and can leave the prototype slot
 * partially torn down.  Cleanup is deferred entirely to afterEach.
 */
function spyOnIntegrationsArray(method: 'filter' | 'find' | 'map') {
  const real = Array.prototype[method] as Function;
  let fired = false;
  jest.spyOn(Array.prototype, method as any).mockImplementation(
    function (this: any[], ...args: any[]) {
      if (!fired && Array.isArray(this) && this.length > 0 && (this as any)[0]?.id === 'stripe') {
        fired = true;
        throw new Error(SENTINEL);
      }
      return real.apply(this, args);
    },
  );
}

describe('[INV-SYS-031] Runtime: thrown error content never reaches integration response', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('GET /api/integrations/available — catch does not echo thrown error', async () => {
    spyOnIntegrationsArray('filter');
    // Providing ?category= triggers filter on availableIntegrations
    const res = await request(app).get('/api/integrations/available?category=Payment+Gateways');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    expect(res.body.message).toBe('Failed to fetch available integrations');
    expect(res.body.success).toBe(false);
  });

  test('GET /api/integrations/available/:id — catch does not echo thrown error', async () => {
    spyOnIntegrationsArray('find');
    const res = await request(app).get('/api/integrations/available/stripe');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    expect(res.body.message).toBe('Failed to fetch integration');
    expect(res.body.success).toBe(false);
  });

  test('GET /api/integrations/categories — catch does not echo thrown error', async () => {
    spyOnIntegrationsArray('map');
    const res = await request(app).get('/api/integrations/categories');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    expect(res.body.message).toBe('Failed to fetch categories');
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C) Response shape contract — all 500 paths return static strings only
// ---------------------------------------------------------------------------

describe('[INV-SYS-031] Contract: integration 500 responses carry only static content', () => {
  // This describe exercises the normal (non-injected) response shapes for
  // the reachable paths.  It does not prove catch-block isolation by itself
  // but documents the expected message strings so a change in INV-SYS-031
  // expected messages is immediately visible.

  const LEAK = /(postgres(ql)?:\/\/|redis:\/\/|ECONNREFUSED|getaddrinfo|P[1-4]\d{3}|prisma|@.*:\d{4,5}\b)/i;

  test('GET /api/integrations/available response never carries a raw connection string', async () => {
    const res = await request(app).get('/api/integrations/available');
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });

  test('GET /api/integrations/categories response never carries a raw connection string', async () => {
    const res = await request(app).get('/api/integrations/categories');
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });

  test('GET /api/integrations/available/:id unknown id returns only static 404', async () => {
    const res = await request(app).get('/api/integrations/available/__nonexistent__');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
    expect(res.body.message).toBe('Integration not found');
  });
});
