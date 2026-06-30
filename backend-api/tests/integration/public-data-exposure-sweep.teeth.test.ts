/**
 * Teeth-proof for public-data-exposure-sweep.test.ts
 *
 * Asserts the denylist scanner walkForDenied() correctly flags a KNOWN-BROKEN
 * synthetic response (containing denied field names like `passwordHash`,
 * `createdAt`, `isActive`, `iban`) and passes a KNOWN-FIXED clean public plan
 * response (only allowlisted fields like `id`, `planCode`, `displayName`,
 * `priceYearlyEur`, `cashbackRate`).
 *
 * Strategy: inlines the DENY_KEY regex and walkForDenied() logic exactly from
 * the sweep and runs against synthetic JSON objects — no supertest, no DB,
 * no imports from src/**. Does NOT modify any src/** file.
 */

// ── Replicated scanner constants (must stay in sync with public-data-exposure-sweep) ──

const DENY_KEY =
  /(passwordhash|password|secret|apikey|api_key|accesstoken|refreshtoken|^token$|iban|createdat|updatedat|displayorder|deletedat|internalnote|isactive)/i;

interface Hit {
  route: string;
  jsonPath: string;
  key: string;
}

function walkForDenied(node: any, route: string, path: string, hits: Hit[]): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((el: any, i: number) =>
      walkForDenied(el, route, `${path}[${i}]`, hits),
    );
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    if (DENY_KEY.test(key)) {
      hits.push({ route, jsonPath: childPath, key });
    }
    walkForDenied(value, route, childPath, hits);
  }
}

// ── BROKEN synthetic response: a Prisma row spread without an allowlist ──────
// Simulates a future maintainer switching from a hand-mapped response to
// spreading the full Prisma row onto the output.
const BROKEN_PLAN_RESPONSE = {
  data: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      planCode: 'BASIC',
      displayName: 'Basic Plan',
      priceYearlyEur: 19900,
      cashbackRate: 0.2,
      // These fields should never appear in a public response:
      passwordHash: '$2b$12$hashedvalue',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
      isActive: true,
      displayOrder: 1,
      internalNote: 'Internal ops note',
    },
  ],
};

// ── BROKEN nested response: denied fields buried inside a sub-object ──────────
const BROKEN_NESTED_RESPONSE = {
  plan: {
    id: 'aaaaaaaa-0000-0000-0000-000000000002',
    displayName: 'Pro Plan',
    pricing: {
      priceYearlyEur: 39900,
      currency: 'EUR',
      iban: 'BG80BNBG96611020345678', // nested IBAN — must be caught
    },
  },
};

// ── CLEAN synthetic response: only allowlisted public fields ─────────────────
const CLEAN_PLAN_RESPONSE = {
  data: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      planCode: 'BASIC',
      displayName: 'Basic Plan',
      priceYearlyEur: 19900,
      cashbackRate: 0.2,
    },
  ],
  total: 1,
};

// ── CLEAN single plan response ────────────────────────────────────────────────
const CLEAN_SINGLE_PLAN_RESPONSE = {
  success: true,
  data: {
    id: 'aaaaaaaa-0000-0000-0000-000000000002',
    planCode: 'PRO',
    displayName: 'Pro Plan',
    priceWeeklyEur: 699,
    priceMonthlyEur: 1999,
    priceYearlyEur: 39900,
    cashbackRate: 0.3,
  },
};

describe('public-data-exposure-sweep teeth-proof: walkForDenied catches known internal fields then passes clean response', () => {
  it('RED: scanner flags passwordHash in top-level plan response', () => {
    const hits: Hit[] = [];
    walkForDenied(BROKEN_PLAN_RESPONSE, 'GET /api/plans/', '', hits);
    // Must detect the leak — if empty, the scanner is blind
    expect(hits.length).toBeGreaterThan(0);
    const hitKeys = hits.map((h) => h.key);
    expect(hitKeys).toContain('passwordHash');
  });

  it('RED: scanner flags createdAt and updatedAt in top-level plan response', () => {
    const hits: Hit[] = [];
    walkForDenied(BROKEN_PLAN_RESPONSE, 'GET /api/plans/', '', hits);
    const hitKeys = hits.map((h) => h.key);
    expect(hitKeys).toContain('createdAt');
    expect(hitKeys).toContain('updatedAt');
  });

  it('RED: scanner flags isActive in top-level plan response', () => {
    const hits: Hit[] = [];
    walkForDenied(BROKEN_PLAN_RESPONSE, 'GET /api/plans/', '', hits);
    const hitKeys = hits.map((h) => h.key);
    expect(hitKeys).toContain('isActive');
  });

  it('RED: scanner flags displayOrder and internalNote in top-level plan response', () => {
    const hits: Hit[] = [];
    walkForDenied(BROKEN_PLAN_RESPONSE, 'GET /api/plans/', '', hits);
    const hitKeys = hits.map((h) => h.key);
    expect(hitKeys).toContain('displayOrder');
    expect(hitKeys).toContain('internalNote');
  });

  it('RED: scanner detects iban nested inside a pricing sub-object', () => {
    const hits: Hit[] = [];
    walkForDenied(BROKEN_NESTED_RESPONSE, 'GET /api/plans/:id', '', hits);
    expect(hits.length).toBeGreaterThan(0);
    const hitKeys = hits.map((h) => h.key);
    expect(hitKeys).toContain('iban');
    // Also assert the path is reported correctly for the nested field
    const ibanHit = hits.find((h) => h.key === 'iban');
    expect(ibanHit!.jsonPath).toContain('pricing');
  });

  it('RED: scanner is case-insensitive — catches CREATEDAT, Isactive, PasswordHash variants', () => {
    const weirdCaseNode = {
      CREATEDAT: '2024-01-01',
      Isactive: false,
      PasswordHash: 'hash',
    };
    const hits: Hit[] = [];
    walkForDenied(weirdCaseNode, 'GET /api/plans/', '', hits);
    expect(hits.length).toBe(3);
    const hitKeys = hits.map((h) => h.key);
    expect(hitKeys).toContain('CREATEDAT');
    expect(hitKeys).toContain('Isactive');
    expect(hitKeys).toContain('PasswordHash');
  });

  it('GREEN: scanner returns no hits for a clean public plan list response', () => {
    const hits: Hit[] = [];
    walkForDenied(CLEAN_PLAN_RESPONSE, 'GET /api/plans/', '', hits);
    expect(hits).toEqual([]);
  });

  it('GREEN: scanner returns no hits for a clean single public plan response', () => {
    const hits: Hit[] = [];
    walkForDenied(CLEAN_SINGLE_PLAN_RESPONSE, 'GET /api/plans/:id', '', hits);
    expect(hits).toEqual([]);
  });

  it('GREEN: scanner does NOT flag the id, planCode, displayName, priceYearlyEur, cashbackRate fields', () => {
    // These are the canonical allowlisted public fields — confirm the denylist
    // does not accidentally catch them.
    const allowlistedOnly = {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      planCode: 'BASIC',
      displayName: 'Basic Plan',
      priceYearlyEur: 19900,
      priceWeeklyEur: 699,
      priceMonthlyEur: 1999,
      cashbackRate: 0.2,
    };
    const hits: Hit[] = [];
    walkForDenied(allowlistedOnly, 'GET /api/plans/', '', hits);
    expect(hits).toEqual([]);
  });

  it('RED: scanner catches accessToken and refreshToken fields', () => {
    const authLeakNode = {
      id: 'some-id',
      accessToken: 'eyJhbGci...',
      refreshToken: 'rt.abc123',
    };
    const hits: Hit[] = [];
    walkForDenied(authLeakNode, 'GET /api/plans/', '', hits);
    const hitKeys = hits.map((h) => h.key);
    expect(hitKeys).toContain('accessToken');
    expect(hitKeys).toContain('refreshToken');
  });

  it('RED: scanner catches token field at top level (^token$ anchored match)', () => {
    const tokenNode = { id: 'abc', token: 'some-secret' };
    const hits: Hit[] = [];
    walkForDenied(tokenNode, 'GET /api/plans/', '', hits);
    const hitKeys = hits.map((h) => h.key);
    expect(hitKeys).toContain('token');
  });

  it('GREEN: scanner does NOT flag a non-matching field that contains "token" as a substring (e.g. tokenCount)', () => {
    // The denylist uses ^token$ with word anchors only for the bare 'token' key;
    // a key like 'tokenCount' or 'pushToken' should NOT be flagged since the
    // regex for token uses ^ and $ anchors.
    const tokenCountNode = { id: 'abc', tokenCount: 5 };
    const hits: Hit[] = [];
    walkForDenied(tokenCountNode, 'GET /api/plans/', '', hits);
    // 'tokenCount' does NOT match ^token$ — must be clean
    const hitKeys = hits.map((h) => h.key);
    expect(hitKeys).not.toContain('tokenCount');
  });
});
