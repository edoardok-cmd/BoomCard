/**
 * Teeth-proof for admin-uuid-500-sweep.test.ts
 *
 * Creates a minimal Express app with a BROKEN handler (returns raw HTTP 500
 * on any :id input — no UUID validation, simulating a raw Prisma P2023 escape)
 * and a FIXED handler (returns 400 on a malformed UUID). Asserts the sweep's
 * probe logic goes RED on the broken handler and GREEN after the 4xx guard.
 *
 * Does NOT modify any src/** file.
 */

import express from 'express';
import request from 'supertest';

// ── Probe logic: replicated from admin-uuid-500-sweep ────────────────────────
const MALFORMED = 'not-a-uuid';
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

interface Hit500 {
  method: string;
  route: string;
  paramValue: string;
  status: number;
}

async function probe(
  app: express.Application,
  method: string,
  routePath: string,
  paramValue: string,
): Promise<Hit500 | null> {
  const url = routePath
    .split('/')
    .map((seg) => (seg.startsWith(':') ? paramValue : seg))
    .join('/');

  let res: request.Response;
  try {
    const req = (request(app) as any)[method.toLowerCase()](url);
    res = await req;
  } catch {
    return null; // transport error — skip
  }

  return res.status === 500
    ? { method, route: routePath, paramValue, status: res.status }
    : null;
}

// ── Mini broken app ───────────────────────────────────────────────────────────
// Simulates a handler that lets raw Prisma P2023 / cast errors escape as 500.
function buildBrokenApp(): express.Application {
  const app = express();
  app.use(express.json());
  // No UUID validation — any input causes a 500 (raw error)
  app.get('/api/admin/subscribers/:id', (_req, res) => {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Invalid `prisma.user.findUnique()` invocation: Inconsistent column data (P2023)',
    });
  });
  // Global error handler (in real app this catches thrown errors)
  app.use((_err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: 'Internal Server Error' });
  });
  return app;
}

// ── Mini fixed app ────────────────────────────────────────────────────────────
// Simulates a handler with a malformed-UUID guard that returns 400.
function buildFixedApp(): express.Application {
  const app = express();
  app.use(express.json());
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  app.get('/api/admin/subscribers/:id', (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Invalid UUID format' });
    }
    return res.status(404).json({ error: 'Subscriber not found' });
  });
  return app;
}

describe('admin-uuid-500-sweep teeth-proof: probe catches 500 on broken handler then passes after fix', () => {
  const ROUTE = '/api/admin/subscribers/:id';

  it('RED: probe detects HTTP 500 on MALFORMED id from the broken handler', async () => {
    const app = buildBrokenApp();
    const hit = await probe(app, 'GET', ROUTE, MALFORMED);
    // Must be caught — if this is null the probe is blind to 500s
    expect(hit).not.toBeNull();
    expect(hit!.status).toBe(500);
  });

  it('RED: probe detects HTTP 500 on NONEXISTENT UUID from the broken handler', async () => {
    const app = buildBrokenApp();
    const hit = await probe(app, 'GET', ROUTE, NONEXISTENT_UUID);
    expect(hit).not.toBeNull();
    expect(hit!.status).toBe(500);
  });

  it('GREEN: probe finds NO 500s from the fixed handler (malformed id → 400)', async () => {
    const app = buildFixedApp();
    const hit = await probe(app, 'GET', ROUTE, MALFORMED);
    expect(hit).toBeNull(); // fixed: 400 not 500 → not a hit
  });

  it('GREEN: probe finds NO 500s from the fixed handler (nonexistent UUID → 404)', async () => {
    const app = buildFixedApp();
    const hit = await probe(app, 'GET', ROUTE, NONEXISTENT_UUID);
    expect(hit).toBeNull(); // fixed: 404 not 500 → not a hit
  });
});
