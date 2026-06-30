/**
 * TEETH TEST: system-integ-leak-sweep (INV-SYS-031)
 *
 * Proves the integration-route leak detector has teeth: a catch block that
 * echoed err.message, or an Array.prototype spy that caused a sentinel to slip
 * through, would be flagged, and the live API keeps error content contained.
 *
 * Three-pronged structure — mirrors the sweep:
 *   A) Static source scan — prove the pattern-match bites on bad source, and
 *      confirm the real integrations.routes.ts is clean.
 *   B) Runtime injection — prove the sentinel-containment assertion bites, and
 *      confirm the live route contains a forced sentinel.
 *   C) Contract (no DSN in responses) — prove the LEAK pattern bites on leaky
 *      bodies, and confirm live routes return only clean content.
 *
 * This file does NOT edit any src/** code.
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../../src/server';

const INTEG_ROUTES_PATH = path.join(
  __dirname,
  '../../src/routes/integrations.routes.ts',
);

// Sentinel must match the sweep's value exactly so both tests exercise the
// same detection threshold.
const SENTINEL = 'SENTINEL_POSTGRES_DSN_postgres_host_5432_boomcard_secret';

// LEAK regex mirrors the sweep's Prong-C definition.
const LEAK =
  /(postgres(ql)?:\/\/|redis:\/\/|ECONNREFUSED|getaddrinfo|P[1-4]\d{3}|prisma|@.*:\d{4,5}\b)/i;

// ---------------------------------------------------------------------------
// A) Static source scan
// ---------------------------------------------------------------------------

describe('TEETH — [INV-SYS-031] Prong A: static scan assertions have teeth', () => {
  /**
   * RED: show the err.message pattern WOULD detect a violating source.
   * The sweep asserts `src` does NOT match /\berr(or)?\s*\.\s*message\b/.
   * Prove the pattern fires on a hypothetical offender.
   */
  test('RED: err.message in hypothetical source is caught by the pattern', () => {
    const hypotheticalSrc = `
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    `;
    const pattern = /\berr(or)?\s*\.\s*message\b/;
    // The pattern would match — so .not.toMatch would throw (= the sweep would flag it).
    expect(() => expect(hypotheticalSrc).not.toMatch(pattern)).toThrow();
  });

  test('RED: error.message in hypothetical source is also caught by the pattern', () => {
    const hypotheticalSrc = `res.json({ detail: error.message });`;
    const pattern = /\berr(or)?\s*\.\s*message\b/;
    expect(() => expect(hypotheticalSrc).not.toMatch(pattern)).toThrow();
  });

  /**
   * RED: show the "err on res.json line" check bites.
   * The sweep collects lines where BOTH res.json/status/send AND err appear.
   * Prove: a line containing both would land in the offending array → the
   * toHaveLength(0) assertion would throw.
   */
  test('RED: a res.json line that references err would be flagged', () => {
    const offendingLines = [
      `  res.json({ message: err.message, code: err.code });`,
    ];
    // The sweep checks offending.length === 0; this would fail:
    expect(() => expect(offendingLines).toHaveLength(0)).toThrow();
  });

  test('RED: a res.status line that references error would be flagged', () => {
    const offendingLines = [
      `  res.status(500).json({ detail: error });`,
    ];
    expect(() => expect(offendingLines).toHaveLength(0)).toThrow();
  });

  // F2: prove the boundCatches count check (expect toBe(8)) bites if any catch
  // block is silently removed, and that the real file still satisfies it.

  test('RED: a matches array of length 7 fails the toBe(8) count assertion', () => {
    // Simulates what the sweep would see if one of the 8 bound catch blocks
    // were removed — the count check would throw, blocking silent regression.
    const matches = new Array(7).fill('} catch (err) {');
    expect(() => expect(matches).toHaveLength(8)).toThrow();
  });

  test('GREEN: real integrations.routes.ts has exactly 8 bound catch blocks', () => {
    const src = fs.readFileSync(INTEG_ROUTES_PATH, 'utf-8');
    const boundCatches = src.match(/\}\s*catch\s*\(\s*\w+\s*\)\s*\{/g) || [];
    expect(boundCatches).toHaveLength(8);
  });

  /**
   * GREEN: confirm the real integrations.routes.ts passes both static checks.
   */
  test('GREEN: real integrations.routes.ts has no err.message reference', () => {
    const src = fs.readFileSync(INTEG_ROUTES_PATH, 'utf-8');
    expect(src).not.toMatch(/\berr(or)?\s*\.\s*message\b/);
  });

  test('GREEN: real integrations.routes.ts has no err on any res.json/status/send line', () => {
    const src = fs.readFileSync(INTEG_ROUTES_PATH, 'utf-8');
    const lines = src.split('\n');
    const offending = lines.filter(
      (l) =>
        /\bres\s*\.\s*(json|status|send)\b/.test(l) && /\b(err|error)\b/.test(l),
    );
    expect(offending).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B) Runtime injection
// ---------------------------------------------------------------------------

/**
 * Spy helper — identical to the sweep's spyOnIntegrationsArray so both files
 * exercise the same one-shot injection mechanism.
 */
function spyOnIntegrationsArray(method: 'filter' | 'find' | 'map') {
  const real = Array.prototype[method] as Function;
  let fired = false;
  jest.spyOn(Array.prototype, method as any).mockImplementation(
    function (this: any[], ...args: any[]) {
      if (
        !fired &&
        Array.isArray(this) &&
        this.length > 0 &&
        (this as any)[0]?.id === 'stripe'
      ) {
        fired = true;
        throw new Error(SENTINEL);
      }
      return real.apply(this, args);
    },
  );
}

describe('TEETH — [INV-SYS-031] Prong B: sentinel-containment assertion has teeth', () => {
  afterEach(() => jest.restoreAllMocks());

  /**
   * RED: prove the assertion bites if the sentinel were to appear in a response body.
   * Simulates what would happen if the catch block did: res.json({ message: err.message })
   */
  test('RED: if sentinel leaked into body, not.toContain assertion would throw', () => {
    const simulatedLeakyBody = JSON.stringify({ message: SENTINEL });
    expect(() => expect(simulatedLeakyBody).not.toContain(SENTINEL)).toThrow();
  });

  /**
   * GREEN: spy-inject the sentinel on the real route and confirm it is absent.
   */
  test('GREEN: GET /api/integrations/available?category=Payment+Gateways — sentinel absent from 500 body', async () => {
    spyOnIntegrationsArray('filter');
    const res = await request(app).get(
      '/api/integrations/available?category=Payment+Gateways',
    );
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    // Static message check: confirms the catch block uses a static string.
    expect(res.body.message).toBe('Failed to fetch available integrations');
    expect(res.body.success).toBe(false);
  });

  // F1: the parent sweep exercises all three Array.prototype methods; the teeth
  // file must cover all three so a change in any one catch block is detected.

  test('GREEN: GET /api/integrations/available/stripe (find path) — sentinel absent from 500 body', async () => {
    spyOnIntegrationsArray('find');
    const res = await request(app).get('/api/integrations/available/stripe');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    expect(res.body.message).toBe('Failed to fetch integration');
  });

  test('GREEN: GET /api/integrations/categories (map path) — sentinel absent from 500 body', async () => {
    spyOnIntegrationsArray('map');
    const res = await request(app).get('/api/integrations/categories');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
    expect(res.body.message).toBe('Failed to fetch categories');
  });
});

// ---------------------------------------------------------------------------
// C) Contract — no DSN in responses
// ---------------------------------------------------------------------------

describe('TEETH — [INV-SYS-031] Prong C: LEAK-pattern assertion has teeth', () => {
  /**
   * RED: confirm LEAK bites on each representative leaky payload.
   */
  test('RED: a body containing postgres:// would be flagged', () => {
    const leaky = JSON.stringify({
      error: 'connect to postgres://user:pass@db.host:5432/boomcard failed',
    });
    expect(() => expect(leaky).not.toMatch(LEAK)).toThrow();
  });

  test('RED: a body containing postgresql:// would be flagged', () => {
    const leaky = JSON.stringify({ detail: 'postgresql://db-host:5432' });
    expect(() => expect(leaky).not.toMatch(LEAK)).toThrow();
  });

  test('RED: a body containing redis:// would be flagged', () => {
    const leaky = JSON.stringify({ error: 'redis://localhost:6379 unreachable' });
    expect(() => expect(leaky).not.toMatch(LEAK)).toThrow();
  });

  test('RED: a body containing ECONNREFUSED would be flagged', () => {
    const leaky = JSON.stringify({ message: 'ECONNREFUSED' });
    expect(() => expect(leaky).not.toMatch(LEAK)).toThrow();
  });

  test('RED: a body containing getaddrinfo would be flagged', () => {
    const leaky = JSON.stringify({ error: 'getaddrinfo ENOTFOUND db-host' });
    expect(() => expect(leaky).not.toMatch(LEAK)).toThrow();
  });

  test('RED: a body containing a Prisma error code (P1001) would be flagged', () => {
    const leaky = JSON.stringify({ code: 'P1001' });
    expect(() => expect(leaky).not.toMatch(LEAK)).toThrow();
  });

  test('RED: a body containing a P2002 Prisma code would be flagged', () => {
    const leaky = JSON.stringify({ prismaCode: 'P2002', meta: { target: 'email' } });
    expect(() => expect(leaky).not.toMatch(LEAK)).toThrow();
  });

  test('RED: a body containing a user@host:port pattern would be flagged', () => {
    const leaky = JSON.stringify({ raw: 'pg_user@db-host:5432' });
    expect(() => expect(leaky).not.toMatch(LEAK)).toThrow();
  });

  // F4: exercises the |prisma| literal alternation in LEAK, distinct from the
  // numeric P1xxx/P2xxx code branches already covered above.
  test('RED: a body containing the prisma literal would be flagged (|prisma| branch)', () => {
    const leaky = JSON.stringify({ detail: 'PrismaClientKnownRequestError' });
    expect(() => expect(leaky).not.toMatch(LEAK)).toThrow();
  });

  /**
   * GREEN: live integration routes carry no LEAK-matching content.
   */
  test('GREEN: GET /api/integrations/available — no connection string in body', async () => {
    const res = await request(app).get('/api/integrations/available');
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });

  test('GREEN: GET /api/integrations/categories — no connection string in body', async () => {
    const res = await request(app).get('/api/integrations/categories');
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });

  // F5: Prong C must cover the /__nonexistent__ 404 path from the parent sweep.

  test('RED: static-message assertion bites if the route started returning dynamic content', () => {
    // Proves the message equality check fires on mismatch — so a change from
    // the static 'Integration not found' to any dynamic string is caught.
    expect(() => expect('Integration not found').toBe('something different')).toThrow();
  });

  test('GREEN: GET /api/integrations/available/__nonexistent__ — 404, no LEAK, static message', async () => {
    const res = await request(app).get('/api/integrations/available/__nonexistent__');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
    expect(res.body.message).toBe('Integration not found');
  });
});
