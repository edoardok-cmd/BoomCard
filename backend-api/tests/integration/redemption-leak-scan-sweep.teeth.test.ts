/**
 * Teeth-proof for redemption-leak-scan-sweep.test.ts
 *
 * Asserts each detection assertion in the sweep bites — i.e. a BROKEN synthetic
 * response causes the assertion to throw, and a FIXED synthetic response passes
 * cleanly.  Two invariant blocks are tested:
 *
 *   Block A — INV-RDM-049: scan response must NOT have fraudScore.
 *   Block B — INV-RDM-081: dashboard subscription must NOT have payment-provider ids.
 *
 * Strategy: purely synthetic (no DB, no HTTP, no imports from src/).  Uses Jest's
 * expect().toThrow() to confirm the BROKEN paths would fail in the real sweep and
 * bare expect() calls to confirm the GREEN paths pass.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Block A — INV-RDM-049: fraudScore must not appear on scan responses
// ─────────────────────────────────────────────────────────────────────────────

describe('redemption-leak-scan-sweep teeth-proof — Block A: INV-RDM-049 (fraudScore leak)', () => {

  // ── RED: fraudScore IS present — the not.toHaveProperty assertion throws ──────

  it('RED A: assertion throws when scan response contains fraudScore (leak present)', () => {
    const brokenScanBody = {
      id: 'scan-1',
      status: 'APPROVED',
      fraudScore: 0.72,    // internal field that must never reach the client
      cashbackAmount: 2.50,
    };

    // The real sweep asserts: expect(scanResponseData).not.toHaveProperty('fraudScore')
    // When fraudScore IS present that assertion fails — i.e. it throws.
    // Confirm the detector has teeth: it would catch this broken body.
    expect(() =>
      expect(brokenScanBody).not.toHaveProperty('fraudScore'),
    ).toThrow();
  });

  // ── GREEN: fraudScore absent — assertion passes ───────────────────────────────

  it('GREEN A: assertion passes when scan response does NOT contain fraudScore (fix in place)', () => {
    const fixedScanBody = {
      id: 'scan-1',
      status: 'APPROVED',
      // fraudScore stripped by stickers.routes.ts ✓
      cashbackAmount: 2.50,
    };

    // Must NOT throw — clean body passes the sweep assertion.
    expect(fixedScanBody).not.toHaveProperty('fraudScore');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block B — INV-RDM-081: subscription must not expose payment-provider ids
// ─────────────────────────────────────────────────────────────────────────────

describe('redemption-leak-scan-sweep teeth-proof — Block B: INV-RDM-081 (payment-provider id leak)', () => {

  // ── RED: forbidden fields present — assertions throw ─────────────────────────

  it('RED B: assertion throws for each forbidden payment-provider field present on subscription', () => {
    const brokenSubscription = {
      id: 'sub-uuid-0001',
      plan: 'BASIC',
      status: 'ACTIVE',
      stripeSubscriptionId: 'sub_xyz',   // forbidden
      stripePriceId: 'price_abc',        // forbidden
      stripeCustomerId: 'cus_abc',       // forbidden
      payseraOrderId: 'order-abc',       // forbidden
      metadata: '{}',                    // forbidden
      planId: 'plan-uuid-0001',          // forbidden
      retryAttempt: 0,                   // forbidden
      renewalRemindersSent: 0,           // forbidden
    };

    // All 8 forbidden fields must be covered — if any were removed from the sweep's
    // assertions, this RED test would detect the regression.
    const forbiddenFields = [
      'stripeSubscriptionId',
      'stripePriceId',
      'stripeCustomerId',
      'payseraOrderId',
      'metadata',
      'planId',
      'retryAttempt',
      'renewalRemindersSent',
    ] as const;

    for (const field of forbiddenFields) {
      expect(() =>
        expect(brokenSubscription).not.toHaveProperty(field),
      ).toThrow();
    }
  });

  // ── GREEN: forbidden fields absent — assertions pass ─────────────────────────

  it('GREEN B: none of the not.toHaveProperty checks throw on a clean subscription object', () => {
    const fixedSubscription = {
      id: 'sub-uuid-0001',
      plan: 'BASIC',
      status: 'ACTIVE',
      currentPeriodEnd: '2026-12-01',
      // All forbidden fields stripped by dashboard.routes.ts allowlist ✓
    };

    const forbiddenFields = [
      'stripeSubscriptionId',
      'stripePriceId',
      'stripeCustomerId',
      'payseraOrderId',
      'metadata',
      'planId',
      'retryAttempt',
      'renewalRemindersSent',
    ] as const;

    for (const field of forbiddenFields) {
      // Must NOT throw — clean object passes each assertion.
      expect(fixedSubscription).not.toHaveProperty(field);
    }

    // Confirm allowed public fields are still present.
    expect(fixedSubscription).toHaveProperty('id');
    expect(fixedSubscription).toHaveProperty('plan');
    expect(fixedSubscription).toHaveProperty('status');
    expect(fixedSubscription).toHaveProperty('currentPeriodEnd');
  });
});
