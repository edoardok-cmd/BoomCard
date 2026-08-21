/**
 * BC-QA-031-FOLLOWUP-8 impl-r1 F1 — closes the one remaining gap acceptance
 * criterion 6 called out: no test previously combined a REAL (unmocked)
 * PayseraService instance with a REAL HTTP POST through the actual Express
 * router under PAYSERA_SS2_MODE=require, proving an unsigned (ss1-only)
 * callback is genuinely rejected end-to-end. Two other files each prove
 * half of this:
 *   - tests/unit/paysera.service.test.ts's "modeOverride parameter" /
 *     "rejects an ss1-only callback under PAYSERA_SS2_MODE=require" tests
 *     prove the real require-mode-rejects logic, but only by calling
 *     `service.verifyCallback(...)` directly — never through HTTP/Express.
 *   - tests/integration/paysera.signatureRejection.test.ts proves the ROUTE
 *     wiring (ss3 forwarding, error-shape handling, observability) end to
 *     end via HTTP, but it deliberately mocks `payseraService` entirely, so
 *     it never exercises `PayseraService.verifyCallback`'s real
 *     require-mode rejection logic.
 *
 * `payseraService` is intentionally left UNMOCKED here — this file's whole
 * point is to prove the real config-resolution (`PAYSERA_SS2_MODE`,
 * `PAYSERA_PUBLIC_KEY`) + route-dispatch wiring actually reaches
 * `PayseraService.verifyCallback`'s require-mode logic the way the isolated
 * tests assume, and not e.g. a stray fallback, a config-loading-order issue,
 * or the route reading a stale `payseraService` singleton.
 *
 * `PAYSERA_PUBLIC_KEY`/`PAYSERA_SS2_MODE` are set BEFORE importing
 * `payments.paysera.routes` below: that import pulls in the `payseraService`
 * singleton, which is constructed exactly once, at module-load time (see
 * `paysera.service.ts`'s `export const payseraService = new PayseraService()`
 * and its constructor, which reads `PAYSERA_PUBLIC_KEY`/`PAYSERA_SS2_MODE`
 * once and never again). TypeScript compiles these `import` statements to
 * `require()` calls in the same textual position under `module: commonjs`
 * (this project's tsconfig), so the env assignments below genuinely run
 * before the singleton is constructed — the same ordering trick
 * `paysera.signatureRejection.test.ts` uses for its `jest.mock()` call.
 */

import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma';
import { drainDetached } from '../../src/utils/detach';

/** Throwaway RSA keypair standing in for Paysera's — same approach as
 *  tests/unit/paysera.service.test.ts's `rsa`/`testPublicKeyPem`. */
const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const testPublicKeyPem = rsa.publicKey.export({ type: 'spki', format: 'pem' }) as string;

/** URL-safe base64, as Paysera encodes the ss2/ss3 field itself. */
const toSafeB64 = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

/** Sign the raw `data` string the way Paysera does: RSA PKCS#1 v1.5. */
const signRsa = (data: string, digest: 'sha1' | 'sha256'): string =>
  toSafeB64(crypto.sign(digest, Buffer.from(data, 'utf-8'), rsa.privateKey));

// Set BEFORE `payments.paysera.routes` (and therefore `paysera.service`'s
// `payseraService` singleton) is required below, so the singleton's
// constructor actually observes require mode + the throwaway test key.
// `PAYSERA_PROJECT_ID`/`PAYSERA_SIGN_PASSWORD` come from
// backend-api/.env.test ('123456' / 'test-password', loaded by
// tests/setup.ts before any test file runs) — mirrored in `SIGN_PASSWORD`
// below to build a genuine ss1.
process.env.PAYSERA_PUBLIC_KEY = testPublicKeyPem;
process.env.PAYSERA_SS2_MODE = 'require';

// eslint-disable-next-line import/first
import paymentsRouter from '../../src/routes/payments.paysera.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/payments', paymentsRouter);
  return app;
}

const app = buildApp();

const AUDIT_ACTION = 'PAYSERA_SIGNATURE_REJECTED';
const SIGN_PASSWORD = 'test-password'; // backend-api/.env.test PAYSERA_SIGN_PASSWORD

/** Real ss1, the way PayseraService's private generateSign computes it:
 *  md5(data + signPassword). */
const signSs1 = (data: string): string =>
  crypto.createHash('md5').update(data + SIGN_PASSWORD).digest('hex');

async function countRejectionAuditRows(): Promise<number> {
  return prisma.auditLog.count({ where: { action: AUDIT_ACTION, objectType: 'PayseraCallback' } });
}

describe('POST /api/payments/callback — PAYSERA_SS2_MODE=require, real (unmocked) PayseraService', () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany({ where: { action: AUDIT_ACTION, objectType: 'PayseraCallback' } });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { action: AUDIT_ACTION, objectType: 'PayseraCallback' } });
  });

  it('rejects an unsigned (ss1-only) callback end-to-end: acks 200 but writes a real AuditLog rejection row', async () => {
    const data = Buffer.from(
      new URLSearchParams({ projectid: '123456', orderid: 'REQ-MODE-1', status: '1' }).toString()
    ).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');

    const res = await request(app)
      .post('/api/payments/callback')
      // Valid ss1, no ss2/ss3 — exactly the shape PAYSERA_SS2_MODE=require
      // must reject.
      .send({ data, ss1: signSs1(data) });

    // Paysera still gets acked "OK" (prevents pointless retries)...
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');

    // ...but the rejection genuinely happened: a real, queryable AuditLog
    // row was written by the real (unmocked) route + service — not merely a
    // mocked call-shape assertion.
    await drainDetached();
    expect(await countRejectionAuditRows()).toBe(1);
  });

  it('control: a genuinely RSA-ss2-signed callback under the same require mode is NOT rejected (proves the rejection above is real, not the route/service failing unconditionally)', async () => {
    const data = Buffer.from(
      new URLSearchParams({ projectid: '123456', orderid: 'REQ-MODE-2', status: '1' }).toString()
    ).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');

    const res = await request(app)
      .post('/api/payments/callback')
      .send({ data, ss1: signSs1(data), ss2: signRsa(data, 'sha1') });

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');

    await drainDetached();
    expect(await countRejectionAuditRows()).toBe(0);
  });
});
