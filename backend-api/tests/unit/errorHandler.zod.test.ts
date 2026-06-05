/**
 * errorHandler — ZodError branch (HIGH fix)
 *
 * Several routes (e.g. subscriptions.routes.ts) call a bare `schema.parse()`.
 * Before the fix, error.middleware.ts had no ZodError branch, so a validation
 * failure fell through to the default 500 (+ stack in dev) instead of a clean
 * 400. These tests exercise the real errorHandler through a minimal Express app
 * that reproduces the exact production pattern (asyncHandler → schema.parse()).
 */
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { errorHandler, asyncHandler, AppError } from '../../src/middleware/error.middleware';

function buildApp() {
  const app = express();
  app.use(express.json());

  const createSchema = z.object({
    plan: z.string(),
    paymentMethodId: z.string(),
  });

  // Mirrors subscriptions.routes.ts: bare schema.parse(req.body) inside asyncHandler.
  app.post(
    '/parse',
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const data = createSchema.parse(req.body);
      res.json({ ok: true, data });
    })
  );

  // Control: an AppError still maps correctly (no regression).
  app.post(
    '/apperror',
    asyncHandler(async () => {
      throw new AppError('boom', 422, { field: 'x' });
    })
  );

  app.use(errorHandler);
  return app;
}

describe('errorHandler — ZodError branch', () => {
  const OLD_ENV = process.env.NODE_ENV;
  afterAll(() => {
    process.env.NODE_ENV = OLD_ENV;
  });

  it('maps a Zod validation failure to 400 (not 500)', async () => {
    const res = await request(buildApp()).post('/parse').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('returns per-field issues in details', async () => {
    const res = await request(buildApp()).post('/parse').send({ plan: 'BASIC' });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
    // paymentMethodId is missing → one issue keyed to that field.
    const fields = res.body.details.map((d: any) => d.field);
    expect(fields).toContain('paymentMethodId');
    res.body.details.forEach((d: any) => expect(typeof d.message).toBe('string'));
  });

  it('never leaks a stack trace for the 400, even in development', async () => {
    process.env.NODE_ENV = 'development';
    const res = await request(buildApp()).post('/parse').send({});
    expect(res.status).toBe(400);
    expect(res.body.stack).toBeUndefined();
  });

  it('does not regress AppError handling', async () => {
    const res = await request(buildApp()).post('/apperror').send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('boom');
    expect(res.body.details).toEqual({ field: 'x' });
  });
});
