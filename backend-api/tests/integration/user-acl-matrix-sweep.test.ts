/**
 * user-acl-matrix-sweep — INV-USER-ACL-001 / INV-USER-ACL-002
 *
 * Executable coverage for the two permission matrices that the r1 re-audit could
 * only probe partially (static read). These assert the gates at the live route
 * boundary against the real backend + real test DB (no mocks).
 *
 * ACL-001 — Permissions-by-ACCOUNT-status matrix (08-user-spec §1.2):
 *   Active   : login Yes, scan Yes, history Yes
 *   Inactive : login Yes, scan NO, history Yes (read-only), IBAN update Yes, support Yes
 *   Archived : login NO, all operational access NO (defense-in-depth 403 on any
 *              token that slips through the race window)
 *   Account status is checked BEFORE subscription status (§1.3 / §8.1 rule 1):
 *   an Inactive account is blocked from scanning even with an ACTIVE subscription.
 *
 * ACL-002 — Permissions-by-SUBSCRIPTION-status matrix (§3.2 / §7.2 / §8.1):
 *   scan / new-cashback / new-payout are gated by subscription status; transaction
 *   HISTORY is always available regardless of subscription status.
 *     Active                       : scan gate OPEN
 *     Expired / Failed Payment     : scan gate CLOSED (402); history still 200
 *     Cancelled (within paid period): scan gate OPEN
 */
import request from 'supertest';
import app from '../../src/app';
import prisma from '../../src/lib/prisma';
import {
  createTestUser,
  createTestSubscription,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';

const VALID_IBAN = 'BG80BNBG96611020345678';

// A scan attempt that is blocked by the gate returns 402 BEFORE the handler ever
// parses a body, so we can probe the gate with an empty body. A request that
// PASSES the gate falls through to handler validation (≠402), which is all we
// assert for the positive direction.
const scan = (token: string) => authRequest(token).post('/api/stickers/scan').send({});

describe('INV-USER-ACL-001 — permissions-by-account-status matrix', () => {
  describe('INACTIVE account: read-only + support + IBAN, but no scanning', () => {
    let userId: string;
    let token: string;

    beforeAll(async () => {
      const u = await createTestUser();
      userId = u.user.id;
      token = u.accessToken;
      // An ACTIVE subscription proves the account-status gate fires FIRST:
      // scanning must still be blocked because the ACCOUNT is Inactive.
      await createTestSubscription(userId, 'BASIC', 'ACTIVE');
      await prisma.user.update({ where: { id: userId }, data: { status: 'INACTIVE' } });
    });

    afterAll(async () => {
      await cleanupTestUser(userId);
    });

    it('[ACL-001] scan is BLOCKED for INACTIVE even with an ACTIVE subscription → 402 ACCOUNT_INACTIVE', async () => {
      const res = await scan(token);
      expect(res.status).toBe(402);
      const code = res.body?.code || res.body?.error?.code || JSON.stringify(res.body);
      expect(String(code)).toContain('ACCOUNT_INACTIVE');
    });

    it('[ACL-001] history (GET /wallet/transactions) is ALLOWED for INACTIVE → 200', async () => {
      const res = await authRequest(token).get('/api/wallet/transactions');
      expect(res.status).toBe(200);
    });

    it('[ACL-001] balance (GET /wallet/balance) is ALLOWED for INACTIVE → 200', async () => {
      const res = await authRequest(token).get('/api/wallet/balance');
      expect(res.status).toBe(200);
    });

    it('[ACL-001] IBAN update (PUT /wallet/payout-account) is ALLOWED for INACTIVE → 200', async () => {
      const res = await authRequest(token)
        .put('/api/wallet/payout-account')
        .send({ iban: VALID_IBAN, beneficiaryName: 'Test User' });
      expect(res.status).toBe(200);
    });

    it('[ACL-001] support (GET /help/tickets) is ALLOWED for INACTIVE → 200', async () => {
      const res = await authRequest(token).get('/api/help/tickets');
      expect(res.status).toBe(200);
    });
  });

  describe('ARCHIVED account: all operational access blocked (defense-in-depth)', () => {
    let userId: string;
    let token: string;

    beforeAll(async () => {
      const u = await createTestUser();
      userId = u.user.id;
      token = u.accessToken; // token issued while ACTIVE, then archived underneath it
      await createTestSubscription(userId, 'BASIC', 'ACTIVE');
      await prisma.user.update({ where: { id: userId }, data: { status: 'ARCHIVED' } });
    });

    afterAll(async () => {
      await cleanupTestUser(userId);
    });

    it('[ACL-001] scan is BLOCKED for ARCHIVED on a slipped-through token → 401/403', async () => {
      const res = await scan(token);
      expect([401, 403]).toContain(res.status);
    });
  });
});

describe('INV-USER-ACL-002 — permissions-by-subscription-status matrix', () => {
  // history is always available; scan is gated by subscription status.
  const cases: Array<{
    sub: 'EXPIRED' | 'FAILED_PAYMENT';
    label: string;
  }> = [
    { sub: 'EXPIRED', label: 'Expired' },
    { sub: 'FAILED_PAYMENT', label: 'Failed Payment' },
  ];

  for (const c of cases) {
    describe(`${c.label} subscription (ACTIVE account)`, () => {
      let userId: string;
      let token: string;

      beforeAll(async () => {
        const u = await createTestUser();
        userId = u.user.id;
        token = u.accessToken;
        await createTestSubscription(userId, 'BASIC', c.sub);
      });

      afterAll(async () => {
        await cleanupTestUser(userId);
      });

      it(`[ACL-002] scan is BLOCKED for ${c.label} → 402`, async () => {
        const res = await scan(token);
        expect(res.status).toBe(402);
      });

      it(`[ACL-002] history (GET /wallet/transactions) is ALWAYS allowed for ${c.label} → 200`, async () => {
        const res = await authRequest(token).get('/api/wallet/transactions');
        expect(res.status).toBe(200);
      });
    });
  }

  describe('CANCELLED within paid period (ACTIVE account): scan gate OPEN', () => {
    let userId: string;
    let token: string;

    beforeAll(async () => {
      const u = await createTestUser();
      userId = u.user.id;
      token = u.accessToken;
      // createTestSubscription sets currentPeriodEnd 30d in the future → "within period".
      await createTestSubscription(userId, 'BASIC', 'CANCELLED');
    });

    afterAll(async () => {
      await cleanupTestUser(userId);
    });

    it('[ACL-002] scan gate is OPEN for CANCELLED-within-period (not a 402 subscription block)', async () => {
      const res = await scan(token);
      // Gate passes → handler runs and rejects on body/sticker validation, never 402.
      expect(res.status).not.toBe(402);
    });
  });
});

describe('INV-USER-SUB-011 — GET /subscriptions/current must not expose internal billing/dunning fields', () => {
  let userId: string;
  let token: string;

  const INTERNAL_FIELDS = [
    'stripeSubscriptionId',
    'stripePriceId',
    'stripeCustomerId',
    'payseraOrderId',
    'metadata',
    'retryAttempt',
    'failedPaymentAt',
    'failedPaymentClearedAt',
    'renewalRemindersSent',
    'lastRenewalReminderSentAt',
    'trialRefundEligibleUntil',
    'trialRefundUsed',
    'canceledAt',
    'planId',
    'userId',
    'updatedAt',
  ];

  beforeAll(async () => {
    const u = await createTestUser();
    userId = u.user.id;
    token = u.accessToken;
    await createTestSubscription(userId, 'BASIC', 'ACTIVE');
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  it('[SUB-011] GET /subscriptions/current returns 200 with a subscription', async () => {
    const res = await authRequest(token).get('/api/subscriptions/current');
    expect(res.status).toBe(200);
    // Either hasSubscription is not false, or id is present
    const body = res.body;
    const hasSubscription = body.hasSubscription !== false && (body.id !== undefined || body.hasSubscription === true);
    expect(hasSubscription).toBe(true);
  });

  it('[SUB-011] GET /subscriptions/current must not expose internal billing/dunning fields', async () => {
    const res = await authRequest(token).get('/api/subscriptions/current');
    expect(res.status).toBe(200);
    const body = res.body;
    for (const field of INTERNAL_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
  });
});
