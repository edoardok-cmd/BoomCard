/**
 * Spec §12 — Marketing email unsubscribe (GDPR one-click opt-out).
 *
 * Covers:
 *   Route  GET /api/unsubscribe
 *     - missing token → 400 HTML
 *     - unknown token → 404 HTML
 *     - valid token, user opted in → sets marketingConsentEmail=false, 200 HTML
 *     - valid token, already opted out → idempotent (no DB write), 200 HTML
 *
 *   Utility: addUnsubscribeFooter
 *     - inserts footer before </body>
 *     - appends footer when no </body> tag
 *
 *   Utility: buildUnsubscribeUrl
 *     - produces the expected URL shape
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock state
// ─────────────────────────────────────────────────────────────────────────────

let userRow: { id: string; marketingConsentEmail: boolean } | null = null;
const userUpdateCalls: any[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Prisma mock
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const user = {
    findUnique: jest.fn(async (args: any) => {
      if (!userRow) return null;
      // match by token OR id
      if (args?.where?.emailUnsubscribeToken !== undefined) {
        return args.where.emailUnsubscribeToken === (userRow as any).emailUnsubscribeToken
          ? userRow
          : null;
      }
      if (args?.where?.id) {
        return args.where.id === userRow.id ? userRow : null;
      }
      return null;
    }),
    update: jest.fn(async (args: any) => {
      userUpdateCalls.push(args);
      if (userRow && args?.where?.id === userRow.id) {
        Object.assign(userRow, args.data);
      }
      return userRow;
    }),
  };
  return {
    __esModule: true,
    default: { user },
    prisma: { user },
  };
});

import express from 'express';
import request from 'supertest';
import unsubscribeRouter from '../../src/routes/unsubscribe.routes';
import { addUnsubscribeFooter, buildUnsubscribeUrl } from '../../src/lib/unsubscribeToken';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/unsubscribe', unsubscribeRouter);
  return app;
}

const VALID_TOKEN = 'a'.repeat(64); // 32-byte hex = 64 chars

beforeEach(() => {
  userRow = null;
  userUpdateCalls.length = 0;
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Route tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/unsubscribe', () => {
  it('returns 400 when token query param is missing', async () => {
    const res = await request(buildApp()).get('/api/unsubscribe');
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/невалиден/i);
  });

  it('returns 400 when token is an empty string', async () => {
    const res = await request(buildApp()).get('/api/unsubscribe?token=');
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/невалиден/i);
  });

  it('returns 404 when token is not found in DB', async () => {
    userRow = null;
    const res = await request(buildApp()).get(`/api/unsubscribe?token=${VALID_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.text).toMatch(/не е намерен/i);
  });

  it('opts the user out and returns 200 when marketingConsentEmail is true', async () => {
    userRow = { id: 'user-1', marketingConsentEmail: true, emailUnsubscribeToken: VALID_TOKEN } as any;

    const res = await request(buildApp()).get(`/api/unsubscribe?token=${VALID_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/отписан/i);

    // DB update should have been called once with false
    expect(userUpdateCalls).toHaveLength(1);
    expect(userUpdateCalls[0].data.marketingConsentEmail).toBe(false);
    expect(userUpdateCalls[0].data.marketingConsentEmailAt).toBeInstanceOf(Date);
  });

  it('is idempotent — no DB update when already opted out', async () => {
    userRow = { id: 'user-1', marketingConsentEmail: false, emailUnsubscribeToken: VALID_TOKEN } as any;

    const res = await request(buildApp()).get(`/api/unsubscribe?token=${VALID_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/отписан/i);

    // No update should be issued because consent is already false
    expect(userUpdateCalls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Utility tests
// ─────────────────────────────────────────────────────────────────────────────

describe('addUnsubscribeFooter', () => {
  it('inserts footer before </body>', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const result = addUnsubscribeFooter(html, 'https://api.boomcard.bg/api/unsubscribe?token=abc');
    expect(result.indexOf('Откажете')).toBeGreaterThan(-1);
    expect(result.indexOf('</body>')).toBeGreaterThan(result.indexOf('Откажете'));
    expect(result.indexOf('https://api.boomcard.bg/api/unsubscribe?token=abc')).toBeGreaterThan(-1);
  });

  it('appends footer when there is no </body> tag', () => {
    const html = '<p>Hello</p>';
    const result = addUnsubscribeFooter(html, 'https://example.com/unsub');
    expect(result.startsWith('<p>Hello</p>')).toBe(true);
    expect(result).toContain('Откажете');
  });
});

describe('buildUnsubscribeUrl', () => {
  it('includes the token in the URL', () => {
    const url = buildUnsubscribeUrl('mytoken123');
    expect(url).toMatch(/token=mytoken123$/);
    expect(url).toMatch(/\/api\/unsubscribe/);
  });
});
