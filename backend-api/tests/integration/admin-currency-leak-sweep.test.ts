/**
 * EXHAUSTIVE currency-leak sweep — admin GET endpoints.
 *
 * Invariant (spec §8.1 rule 4 / Clash 12.1): when the currency-transition
 * window is CLOSED, NO raw BGN monetary scalar may leave ANY admin GET
 * endpoint. The canonical correct pattern (see adminTransactions.routes.ts /
 * adminPayouts.routes.ts) nulls the raw BGN value and emits a
 * `display:{ bgn:null, eur:<number> }` object when the window is closed.
 *
 * Why this file exists: prior audits hard-coded a handful of endpoints per
 * round and missed the rest (whack-a-mole). This sweep ENUMERATES every
 * registered route under /api/admin from Express's live router stack, so ANY
 * newly-added admin endpoint automatically enters coverage. A new money field
 * that is neither correctly gated nor explicitly classified FAILS the test —
 * the maintainer is forced to either fix the gating or classify the field.
 *
 * This file does NOT edit any src/** code. It is a test-only behavioural probe.
 *
 * EXPECTED STATE: RED. It is designed to surface the currently-open run-6
 * leaks (payouts wallet.* / filteredSummary.*Total, subscriber wallet.*,
 * subscription paymentTotalAmount/amount, cashback dashboard/summary,
 * dashboard finance.* scalars). Do NOT weaken the test to make it green —
 * it goes green only once the gating bugs are fixed in src/**.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutEvent: (_opts: any) => Promise.resolve(),
    notifyPartnerStatusChange: (_opts: any) => Promise.resolve(),
  },
}));

const RUN_TAG = `curleak-${Date.now()}`;

function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET env var is not set — tests cannot generate valid tokens');
  }
  return jwt.sign({ id: userId, email: `${RUN_TAG}-${userId}@test.local`, role }, jwtSecret, {
    expiresIn: '15m',
  });
}

// SystemSetting PK is `key` (NOT `name`). Toggling alone is insufficient —
// isCurrencyTransitionWindowOpen() caches the value, so we MUST invalidate the
// cache for the change to take effect on the next request.
async function setCurrencyWindowOpen(isOpen: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'currency_transition_window_open' },
    create: { key: 'currency_transition_window_open', value: isOpen ? 'true' : 'false' },
    update: { value: isOpen ? 'true' : 'false' },
  });
  invalidateCurrencyDisplayCache();
}

// ─── Route introspection ─────────────────────────────────────────────────────
// Walk Express's live router stack and reconstruct every registered route path
// + method. This is the completeness mechanism: routes are DERIVED, never
// hard-coded, so new admin endpoints auto-enroll.
interface EnumeratedRoute {
  method: string; // upper-case HTTP verb
  path: string; // full path with mount prefixes, e.g. /api/admin/payouts/:id/approve
}

function layerRegexToPrefix(layer: any): string {
  // Express stores the mount path as a regexp on router/use layers. Prefer the
  // human-readable forms it also stashes, falling back to regex source parsing.
  if (typeof layer.path === 'string') return layer.path;
  const keys: any[] = layer.keys || [];
  const src: string = layer.regexp?.source ?? '';
  if (layer.regexp?.fast_slash) return '';
  // Convert the compiled mount regexp back to a path segment. Express compiles
  // `/api/admin/foo` to `^\/api\/admin\/foo\/?(?=\/|$)` and `:param` to a
  // capture group. We rebuild by replacing each capture group with its key name.
  let working = src
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/');
  let keyIdx = 0;
  // Replace the parameter capture groups (in order) with :keyName.
  working = working.replace(/\(\[\^\\?\/]\+\?\)/g, () => {
    const k = keys[keyIdx++];
    return k ? `:${k.name}` : ':param';
  });
  // Strip any trailing optional-slash artifacts.
  working = working.replace(/\/\?$/, '').replace(/\(\?:\(\?=\/\|\$\)\)$/, '');
  return working;
}

function collectRoutes(stack: any[], prefix: string, out: EnumeratedRoute[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const routePath: string = layer.route.path;
      const methods = layer.route.methods || {};
      for (const m of Object.keys(methods)) {
        if (m === '_all') continue;
        out.push({ method: m.toUpperCase(), path: prefix + routePath });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const sub = layerRegexToPrefix(layer);
      collectRoutes(layer.handle.stack, prefix + sub, out);
    }
  }
}

function enumerateRoutes(app: any): EnumeratedRoute[] {
  const stack = app._router?.stack || app.router?.stack || [];
  const out: EnumeratedRoute[] = [];
  collectRoutes(stack, '', out);
  return out;
}

// ─── Classification of numeric leaf keys ─────────────────────────────────────
// MONEY_KEY: a key whose name strongly implies a monetary scalar.
const MONEY_KEY =
  /(amount|balance|total|fee|margin|cashback|discount|netamount|payout|price|threshold|revenue|payment|refund|sum|cost|gross|net|owed|turnover|earnings|spend|withdraw|deposit|credit|debit|wallet)/i;

// ALLOW_NONMONEY: keys that MATCH MONEY_KEY by name but are NOT money. Each
// entry is justified — these are counts, rates, percentages, ids, or flags.
// Matching is case-insensitive on the leaf key name.
const ALLOW_NONMONEY = new Set<string>(
  [
    // ── counts (row counts / cardinalities, not currency) ──
    'count',
    'totalcount',
    'totalCount',
    'pendingcount',
    'pendingCount',
    'processingcount',
    'completedcount',
    'failedcount',
    'cancelledcount',
    'paymentcount', // # of payments, not a sum
    'totalpayments', // count of payments
    'totalrefunds', // count of refunds (status breakdown count)
    'totalpayouts', // count of payouts
    'totalrevenue_count',
    'totaltransactions',
    'transactioncount',
    'usercount',
    'partnercount',
    'subscribercount',
    'cashbackcount', // # of cashback entries
    'totalcashbackcount',
    // invoice status-breakdown COUNTS (PartnerCashbackPayment dashboards report
    // how many invoices are pending/paid/overdue — integers, not sums):
    'pending',
    'paid',
    'overdue',
    'processing',
    'failed',
    'completed',
    'cancelled',
    'total', // ambiguous: a bare `total` is most often a row count in list/paginated
    // responses. NOTE: if a `total` is genuinely a money SUM in some response it
    // must be renamed to *Total/*Amount or gated; leaving bare `total` as a count
    // is the documented convention. Flagged here as count by convention.
    // ── rates / percentages / tiers (dimensionless, not currency) ──
    'rate',
    'discountrate',
    'maxdiscountrate', // partner-type cap expressed as a % rate, not a BGN amount
    'mindiscountrate',
    'defaultdiscountrate',
    'cashbackrate',
    'cashbackPercent',  // cashback percentage RATE (5 = 5%) — not a BGN amount; stored in VenueStickerConfig/VenueFraudConfig/Offer/StickerScan/Receipt
    'percentage',
    'percent',
    'marginpercent',
    'marginpercentage',
    'commissionrate',
    'taxrate',
    'interestrate',
    'feerate', // a rate, not a fee amount
    // discountStep: the discount-percentage TIER ladder (5/10/15/20/25 %), the
    // x-axis of the cashback-rate table — a percentage tier, NOT a BGN amount.
    'discountstep',
    'discountmin', // tier boundary (% discount), not money
    'discountmax',
    // failedPayment as a dashboard subscriber-state COUNT (how many subscribers
    // are in FAILED_PAYMENT), not a payment sum. (The money sum would be named
    // *Amount/*Total.)
    'failedpayment',
    'activepayment',
  ].map((s) => s.toLowerCase()),
);

// Suffix-based count detection: any key ending in "Count" is a cardinality, not
// a monetary amount, regardless of what stem precedes it (payoutsDueCount,
// pendingPayoutCount, refundCount, …). This keeps the allow-list from needing
// an entry per stem and prevents count fields from masquerading as leaks.
function isCountKey(keyLc: string): boolean {
  return keyLc.endsWith('count');
}

// Keys that are unambiguously NOT money regardless of MONEY_KEY (structural).
const ALWAYS_IGNORE_KEYS = new Set<string>(
  ['page', 'limit', 'pages', 'totalpages', 'offset', 'size', 'perpage', 'pagesize'].map((s) =>
    s.toLowerCase(),
  ),
);

interface Leak {
  route: string;
  jsonPath: string;
  key: string;
  value: any;
  kind: 'LEAK' | 'UNCLASSIFIED';
}

function isNumericLeaf(v: any): boolean {
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  // numeric-string leaf (e.g. "123.45" or Prisma Decimal serialized as string)
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return true;
  return false;
}

function walkForLeaks(node: any, route: string, path: string, leaks: Leak[]): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    node.forEach((el, i) => walkForLeaks(el, route, `${path}[${i}]`, leaks));
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    const keyLc = key.toLowerCase();

    if (value && typeof value === 'object') {
      // A `display:{bgn,eur}` object is the CORRECT gated shape. When window is
      // closed bgn must be null. If a display.bgn is non-null while closed, that
      // is itself a leak — let the recursion catch it via the bgn leaf below.
      walkForLeaks(value, route, childPath, leaks);
      continue;
    }

    if (!isNumericLeaf(value)) continue;
    if (ALWAYS_IGNORE_KEYS.has(keyLc)) continue;

    // Special-case: a `bgn` leaf inside a display object. Correct gating =>
    // null when window closed; a non-null numeric bgn here is a LEAK.
    if (keyLc === 'bgn') {
      // value is numeric & non-null here (null returns early above) => leak.
      leaks.push({ route, jsonPath: childPath, key, value, kind: 'LEAK' });
      continue;
    }
    // `eur` leaves inside display objects are intentionally present even when
    // the window is closed (EUR-only display). Not a leak.
    if (keyLc === 'eur') continue;

    if (!MONEY_KEY.test(key)) continue; // non-monetary numeric — fine

    if (isCountKey(keyLc)) continue; // *Count suffix => cardinality, not money
    if (ALLOW_NONMONEY.has(keyLc)) continue; // explicitly classified non-money

    // At this point: numeric, non-null, key looks monetary, not allow-listed.
    // If it were correctly gated it would be null (caught by the early return)
    // OR moved into a display object. A live non-null value => either a LEAK
    // (recognised money key) or an UNCLASSIFIED money field forcing a decision.
    leaks.push({ route, jsonPath: childPath, key, value, kind: 'LEAK' });
  }
}

// ─── Fixture ids substituted into :param routes ──────────────────────────────
const fixtures: Record<string, string> = {};

describe('admin-currency-leak-sweep: no raw BGN scalar leaves any admin GET when window CLOSED', () => {
  let app: any;
  let adminToken: string;
  let getRoutes: EnumeratedRoute[] = [];
  const SKIPPED: { route: string; reason: string }[] = [];

  beforeAll(async () => {
    app = await createTestApp();

    // ── Seed a minimal but representative dataset ──
    const adminUser = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-admin@test.local`,
        firstName: 'Sweep',
        lastName: 'Admin',
        phone: '+10000000001',
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        emailVerified: true,
        passwordHash: 'unused',
      },
    });
    adminToken = generateTestToken(adminUser.id, 'SUPER_ADMIN');
    fixtures.userId = adminUser.id;

    const partnerUser = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-partner@test.local`,
        firstName: 'Sweep',
        lastName: 'Partner',
        phone: '+10000000002',
        status: 'ACTIVE',
        role: 'PARTNER',
        emailVerified: true,
        passwordHash: 'unused',
      },
    });
    const partner = await prisma.partner.create({
      data: {
        userId: partnerUser.id,
        businessName: `${RUN_TAG} Partner`,
        category: 'RESTAURANT',
        status: 'ACTIVE',
      },
    });
    fixtures.partnerId = partner.id;
    fixtures.id = partner.id; // generic :id default — overridden below per-known-route

    const user = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-user@test.local`,
        firstName: 'Sweep',
        lastName: 'User',
        phone: '+10000000003',
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash: 'unused',
      },
    });
    fixtures.subscriberId = user.id;

    const wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        balance: 1234.56,
        availableBalance: 1234.56,
        pendingBalance: 78.9,
        currency: 'BGN',
        payoutIban: 'BG80BNBG96611020345678',
        payoutBeneficiaryName: 'Sweep User',
      },
    });
    fixtures.walletId = wallet.id;

    // A payout / wallet transaction (PENDING withdrawal) + a cashback credit.
    const payout = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'WITHDRAWAL',
        amount: -500,
        balanceBefore: 1234.56,
        balanceAfter: 734.56,
        status: 'PENDING',
        currency: 'BGN',
        description: 'Sweep withdrawal',
      },
    });
    fixtures.payoutId = payout.id;
    fixtures.transactionId = payout.id;

    const cashback = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'CASHBACK_CREDIT',
        amount: 42.5,
        balanceBefore: 734.56,
        balanceAfter: 777.06,
        status: 'COMPLETED',
        currency: 'BGN',
        description: 'Sweep cashback',
        cashbackStatus: 'CLEARED',
        clearedAt: new Date(),
      },
    });
    fixtures.cashbackId = cashback.id;

    // A subscription with a payment.
    const sub = await prisma.subscription.create({
      data: {
        userId: user.id,
        // NOTE: the local test DB's SubscriptionPlan enum predates the
        // PREMIUM→PREMIUM_MONTHLY rename (migration drift), so use BASIC which
        // exists in every version. The plan value is irrelevant to leak scanning.
        plan: 'BASIC',
        status: 'ACTIVE',
        currentPeriodStart: new Date(Date.now() - 5 * 86400000),
        currentPeriodEnd: new Date(Date.now() + 25 * 86400000),
      },
    });
    fixtures.subscriptionId = sub.id;

    // An invoice (PartnerCashbackPayment).
    const invoice = await prisma.partnerCashbackPayment.create({
      data: {
        partnerId: partner.id,
        month: '2026-01',
        status: 'PENDING',
        totalCashbackOwed: 500,
        marginAmount: 100,
        turnoverAmount: 1000,
      },
    });
    fixtures.invoiceId = invoice.id;
    fixtures.paymentId = invoice.id;
    // Non-id path params that some routes carry (e.g. cashback receipts grouping
    // by partner + month). Seed a plausible value so the route is exercised
    // rather than skipped.
    fixtures.month = '2026-01';

    // Enumerate routes from the live stack and keep admin GETs only.
    const all = enumerateRoutes(app);
    getRoutes = all.filter(
      (r) => r.method === 'GET' && r.path.startsWith('/api/admin'),
    );

    // eslint-disable-next-line no-console
    console.log(
      `[currency-leak-sweep] enumerated ${all.length} total routes; ` +
        `${getRoutes.length} admin GET routes under /api/admin.`,
    );
  });

  afterAll(async () => {
    await setCurrencyWindowOpen(true);
    // Self-clean: remove rows seeded by this run (FK-safe order).
    try {
      await prisma.walletTransaction.deleteMany({ where: { walletId: fixtures.walletId } });
      await prisma.subscription.deleteMany({ where: { userId: fixtures.subscriberId } });
      await prisma.wallet.deleteMany({ where: { userId: fixtures.subscriberId } });
      await prisma.partnerCashbackPayment.deleteMany({ where: { partnerId: fixtures.partnerId } });
      await prisma.partner.deleteMany({ where: { id: fixtures.partnerId } });
      await prisma.user.deleteMany({
        where: { email: { startsWith: RUN_TAG } },
      });
    } catch {
      /* best-effort cleanup; fresh test DB makes this non-fatal */
    }
    await app?.close?.();
  });

  // Substitute :param segments with seeded fixtures. Returns null if any param
  // cannot be satisfied (route is then SKIPPED and logged).
  function materializePath(routePath: string): string | null {
    if (!routePath.includes(':')) return routePath;
    const segments = routePath.split('/');
    const out: string[] = [];
    for (const seg of segments) {
      if (!seg.startsWith(':')) {
        out.push(seg);
        continue;
      }
      const name = seg.slice(1).replace(/\?$/, '');
      // Map common param names to seeded fixtures.
      const candidates = [
        name,
        `${name}Id`,
        name.replace(/Id$/, ''),
      ];
      let resolved: string | undefined;
      for (const c of candidates) {
        if (fixtures[c]) {
          resolved = fixtures[c];
          break;
        }
      }
      // Heuristic fallbacks by semantic of the param name.
      if (!resolved) {
        if (/partner/i.test(name)) resolved = fixtures.partnerId;
        else if (/sub|subscriber|user|member/i.test(name)) resolved = fixtures.subscriberId;
        else if (/payout|withdraw|transaction|tx/i.test(name)) resolved = fixtures.payoutId;
        else if (/cashback/i.test(name)) resolved = fixtures.cashbackId;
        else if (/invoice|payment/i.test(name)) resolved = fixtures.invoiceId;
        else if (/subscription/i.test(name)) resolved = fixtures.subscriptionId;
      }
      if (!resolved) return null;
      out.push(resolved);
    }
    return out.join('/');
  }

  it('enumerates a non-trivial number of admin GET routes from the live router stack', () => {
    expect(getRoutes.length).toBeGreaterThan(10);
  });

  it('leaks NO raw BGN monetary scalar from any admin GET when the window is CLOSED', async () => {
    await setCurrencyWindowOpen(false);

    const leaks: Leak[] = [];

    for (const route of getRoutes) {
      const url = materializePath(route.path);
      if (url === null) {
        SKIPPED.push({
          route: `GET ${route.path}`,
          reason: 'unseeded :param — no fixture id available',
        });
        // eslint-disable-next-line no-console
        console.warn(`[currency-leak-sweep] SKIPPED (no fixture): GET ${route.path}`);
        continue;
      }

      let res: request.Response;
      try {
        res = await request(app).get(url).set('Authorization', `Bearer ${adminToken}`);
      } catch (err) {
        SKIPPED.push({ route: `GET ${route.path}`, reason: `request threw: ${String(err)}` });
        // eslint-disable-next-line no-console
        console.warn(`[currency-leak-sweep] SKIPPED (threw): GET ${route.path} — ${String(err)}`);
        continue;
      }

      // Only 2xx JSON bodies carry monetary payloads worth scanning. Non-2xx
      // (404/403/422/400) are not currency leaks; CSV/binary aren't JSON.
      if (res.status < 200 || res.status >= 300) continue;
      if (!res.body || typeof res.body !== 'object') continue;

      walkForLeaks(res.body, `GET ${route.path}`, '', leaks);
    }

    // Coverage report.
    // eslint-disable-next-line no-console
    console.log(
      `\n[currency-leak-sweep] scanned ${getRoutes.length - SKIPPED.length} routes; ` +
        `${SKIPPED.length} SKIPPED; ${leaks.length} leak(s)/unclassified field(s).`,
    );
    if (SKIPPED.length) {
      // eslint-disable-next-line no-console
      console.log('[currency-leak-sweep] SKIPPED routes (coverage gaps):');
      for (const s of SKIPPED) {
        // eslint-disable-next-line no-console
        console.log(`  - ${s.route}  (${s.reason})`);
      }
    }
    if (leaks.length) {
      // eslint-disable-next-line no-console
      console.log('[currency-leak-sweep] LEAKS:');
      for (const l of leaks) {
        // eslint-disable-next-line no-console
        console.log(`  - [${l.kind}] ${l.route}  ${l.jsonPath} = ${JSON.stringify(l.value)}`);
      }
    }

    const message =
      leaks.length === 0
        ? ''
        : 'Raw BGN monetary scalar(s) leaked while currency window CLOSED:\n' +
          leaks
            .map(
              (l) =>
                `  [${l.kind}] ${l.route}  path=${l.jsonPath}  value=${JSON.stringify(l.value)}` +
                (l.kind === 'UNCLASSIFIED'
                  ? ` — classify "${l.key}" in ALLOW_NONMONEY or fix gating`
                  : ''),
            )
            .join('\n');

    expect({ count: leaks.length, message }).toEqual({ count: 0, message: '' });
  });
});
