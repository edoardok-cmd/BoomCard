/**
 * Teeth-proof for public-input-500-sweep.test.ts
 *
 * Creates a minimal Express app with BROKEN handlers (return raw HTTP 500 on
 * any input — simulating an unguarded Prisma P2023 / encoding error escape) and
 * FIXED handlers (return 400 on malformed path params or wrong-typed bodies,
 * 404 / 201 on valid input). Asserts the sweep's probe logic goes RED on the
 * broken app and GREEN after the guards are in place.
 *
 * Strategy: inlines the exact probe helper from the sweep (checks res.status
 * >= 500) and drives it via mini Express apps built with supertest. No real DB,
 * no `createTestApp` import, no src/** modifications.
 */

import express from 'express';
import request from 'supertest';

// ── Probe logic: replicated from public-input-500-sweep ──────────────────────

interface Fail {
  route: string;
  case: string;
  status: number;
}

const MALFORMED_PARAM = '%00'; // null-byte — the specific pre-fix trigger
const MALFORMED_BODY = { name: 123, email: true, message: {}, platform: 7, errorType: [] };
const VALID_BODY = { platform: 'ios', message: 'teeth-probe', errorType: 'crash' };

/**
 * Fires a single HTTP request at `app` and returns a Fail if status >= 500.
 * Mirrors the inner probe logic in public-input-500-sweep.test.ts.
 */
async function probeGet(
  app: express.Application,
  routeTemplate: string,
  paramValue: string,
  caseLabel: string,
): Promise<Fail | null> {
  const url = routeTemplate.replace(/:[^/]+/g, paramValue);
  let res: request.Response;
  try {
    res = await request(app).get(url);
  } catch {
    return null; // transport error — not a server 5xx
  }
  return res.status >= 500
    ? { route: `GET ${routeTemplate}`, case: caseLabel, status: res.status }
    : null;
}

async function probePost(
  app: express.Application,
  path: string,
  body: any,
  caseLabel: string,
): Promise<Fail | null> {
  let res: request.Response;
  try {
    res = await request(app)
      .post(path)
      .set('Content-Type', 'application/json')
      .send(body);
  } catch {
    return null;
  }
  return res.status >= 500
    ? { route: `POST ${path}`, case: caseLabel, status: res.status }
    : null;
}

// ── Mini BROKEN app ───────────────────────────────────────────────────────────
// Simulates handlers that let raw Prisma P2023 / encoding errors escape as 500.
function buildBrokenApp(): express.Application {
  const app = express();
  app.use(express.json());

  // GET /api/plans/:id — no UUID validation, any id triggers a raw 500
  app.get('/api/plans/:id', (_req, res) => {
    res.status(500).json({
      error: 'Internal Server Error',
      message:
        'Invalid `prisma.plan.findFirst()` invocation: Inconsistent column data (P2023)',
    });
  });

  // POST /api/mobile/errors — no field-type guard, a non-string `platform`
  // reaches a `.trim()` call and throws, falling through to a 500
  app.post('/api/mobile/errors', (_req, res) => {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'TypeError: Cannot read properties of undefined (reading trim)',
    });
  });

  // Global error handler (mirrors the real app — uncaught throws also become 500)
  app.use((_err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}

// ── Mini FIXED app ────────────────────────────────────────────────────────────
// Simulates handlers with proper guards: malformed input → 400, missing → 404,
// valid POST body → 201.
function buildFixedApp(): express.Application {
  const app = express();
  app.use(express.json());

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // GET /api/plans/:id — UUID-validates :id, 400 on malformed, 404 on valid-but-missing
  app.get('/api/plans/:id', (req, res) => {
    const { id } = req.params;
    // Control bytes / null-bytes / non-UUID strings → 400
    if (/[\x00-\x1f]/.test(id) || !UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Invalid plan identifier format' });
    }
    return res.status(404).json({ error: 'Plan not found' });
  });

  // POST /api/mobile/errors — validates required field types before any string ops
  app.post('/api/mobile/errors', (req, res) => {
    const { platform, message, errorType } = req.body ?? {};
    if (
      typeof platform !== 'string' ||
      typeof message !== 'string'
    ) {
      return res.status(400).json({ error: 'Invalid field types' });
    }
    // Null-byte rejection
    if (platform.includes('\x00') || message.includes('\x00')) {
      return res.status(400).json({ error: 'Null bytes not allowed' });
    }
    return res.status(201).json({ success: true });
  });

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('public-input-500-sweep teeth-proof: probe catches 500 on broken handlers then passes after fix', () => {
  it('RED: probe detects GET 5xx on malformed :id param from the broken handler', async () => {
    const app = buildBrokenApp();
    const hit = await probeGet(app, '/api/plans/:id', MALFORMED_PARAM, 'null-byte');
    // Must be caught — if null, the probe is blind to 500s
    expect(hit).not.toBeNull();
    expect(hit!.status).toBeGreaterThanOrEqual(500);
  });

  it('RED: probe detects POST 5xx on malformed body from the broken handler', async () => {
    const app = buildBrokenApp();
    const hit = await probePost(app, '/api/mobile/errors', MALFORMED_BODY, 'wrong-types');
    expect(hit).not.toBeNull();
    expect(hit!.status).toBeGreaterThanOrEqual(500);
  });

  it('GREEN: probe finds NO 5xx from the fixed GET handler (malformed param → 400)', async () => {
    const app = buildFixedApp();
    const hit = await probeGet(app, '/api/plans/:id', MALFORMED_PARAM, 'null-byte');
    expect(hit).toBeNull(); // fixed: 400 not 500 → no hit
  });

  it('GREEN: probe finds NO 5xx from the fixed GET handler (valid UUID → 404)', async () => {
    const app = buildFixedApp();
    const hit = await probeGet(
      app,
      '/api/plans/:id',
      '00000000-0000-0000-0000-000000000000',
      'nonexistent-uuid',
    );
    expect(hit).toBeNull(); // fixed: 404 not 500 → no hit
  });

  it('GREEN: probe finds NO 5xx from the fixed POST handler (malformed body → 400)', async () => {
    const app = buildFixedApp();
    const hit = await probePost(app, '/api/mobile/errors', MALFORMED_BODY, 'wrong-types');
    expect(hit).toBeNull(); // fixed: 400 not 500 → no hit
  });

  it('GREEN: probe finds NO 5xx from the fixed POST handler (valid body → 201)', async () => {
    const app = buildFixedApp();
    const hit = await probePost(app, '/api/mobile/errors', VALID_BODY, 'valid-body');
    expect(hit).toBeNull(); // fixed: 201 not 500 → no hit
  });

  it('RED: probe detects 5xx on embedded null-byte in param from the broken handler', async () => {
    const app = buildBrokenApp();
    const hit = await probeGet(app, '/api/plans/:id', 'abc%00def', 'embedded-null');
    expect(hit).not.toBeNull();
    expect(hit!.status).toBeGreaterThanOrEqual(500);
  });

  it('GREEN: probe finds NO 5xx for embedded null-byte param on the fixed handler', async () => {
    const app = buildFixedApp();
    const hit = await probeGet(app, '/api/plans/:id', 'abc%00def', 'embedded-null');
    expect(hit).toBeNull(); // fixed: 400 not 500 → no hit
  });
});
