/**
 * TEETH TEST: system-webhook-signature-sweep (INV-SYS-001/002/005/006)
 *
 * Proves the signature-rejection detector has teeth: a webhook handler that
 * ACCEPTED a forged/absent signature (200) would be flagged, and the live API
 * correctly rejects with 4xx.
 *
 * RED scenario (inline): a simulated 200 on a tampered-signature request is a
 *   violation of the "reject before side effect" invariant.
 * GREEN scenario (live API): the real endpoints reject forged/absent signatures
 *   with 400/401 — never 200, never 500.
 *
 * This file does NOT edit any src/** code.
 */

import request from 'supertest';
import { app } from '../../src/server';

const prevStripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
const prevHmac = process.env.INBOUND_EMAIL_HMAC_SECRET;
const prevAllowUnsigned = process.env.ALLOW_UNSIGNED_WEBHOOK;

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy_for_sweep';
  process.env.INBOUND_EMAIL_HMAC_SECRET = 'sweep-inbound-hmac-secret';
  delete process.env.ALLOW_UNSIGNED_WEBHOOK;
});

afterAll(() => {
  if (prevStripeSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = prevStripeSecret;
  if (prevHmac === undefined) delete process.env.INBOUND_EMAIL_HMAC_SECRET;
  else process.env.INBOUND_EMAIL_HMAC_SECRET = prevHmac;
  if (prevAllowUnsigned === undefined) delete process.env.ALLOW_UNSIGNED_WEBHOOK;
  else process.env.ALLOW_UNSIGNED_WEBHOOK = prevAllowUnsigned;
});

// The assertion the sweep makes on each forged/absent-signature request.
function assertRejected(status: number): void {
  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
}

describe('TEETH — signature-rejection detector', () => {
  test('RED: a handler that accepted a forged signature (200) would be flagged', () => {
    const simulatedAcceptForgery = 200;
    expect(() => assertRejected(simulatedAcceptForgery)).toThrow();
  });

  test('RED: a 500 on a forged signature would also be flagged', () => {
    const simulated500 = 500;
    expect(() => assertRejected(simulated500)).toThrow();
  });

  test('GREEN: live stripe webhook rejects tampered signature (4xx)', async () => {
    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=1,v1=deadbeef')
      .send(Buffer.from(JSON.stringify({ id: 'evt_x', type: 'ping' })));
    assertRejected(res.status);
  });

  test('GREEN: live email inbound rejects wrong signature (4xx)', async () => {
    const res = await request(app)
      .post('/api/email/inbound')
      .set('Content-Type', 'application/json')
      .set('X-Inbound-Signature', 'wrong')
      .send(Buffer.from(JSON.stringify({ from: 'a@b.c', to: 'x@y.z', subject: 's', text: 't', messageId: 'm' })));
    assertRejected(res.status);
  });
});
