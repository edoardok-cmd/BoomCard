/**
 * Integration Tests: pagination hardening (unvalidated pagination -> Prisma 500)
 *
 * Class fix: partner-scope list routes used to parseInt(req.query.limit/page)
 * and feed the raw result straight to Prisma. A non-numeric / negative / zero /
 * over-max value yielded NaN or an invalid take/skip, which made Prisma throw a
 * validation error that surfaced as HTTP 500. All such routes now route through
 * utils/pagination.parsePagination(), which clamps the inputs.
 *
 * GET /api/partners is public (no auth required), so it is the cleanest endpoint
 * to assert that malformed pagination input is clamped (200) rather than 500.
 * The other migrated list routes (partner/help tickets, notifications, wallet
 * transactions, reviews) call the identical helper with their own defaults.
 */

import request from 'supertest';
import { app } from '../../src/server';

describe('Pagination hardening — GET /api/partners (public list route)', () => {
  const MALFORMED = [
    'limit=abc',
    'limit=-5',
    'limit=0',
    'limit=999999',
    'limit=NaN',
    'page=abc',
    'page=-1',
    'page=0',
    'limit=abc&page=-3',
  ];

  it.each(MALFORMED)(
    'returns 200 (clamped, never 500) for ?%s',
    async (query) => {
      const res = await request(app).get(`/api/partners?${query}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('pagination');
      // page is always clamped to >= 1
      expect(res.body.pagination.page).toBeGreaterThanOrEqual(1);
      // limit is always clamped into [1, 100]
      expect(res.body.pagination.limit).toBeGreaterThanOrEqual(1);
      expect(res.body.pagination.limit).toBeLessThanOrEqual(100);
    },
  );

  it('clamps an over-max limit to the route maximum of 100', async () => {
    const res = await request(app).get('/api/partners?limit=999999');
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  it('falls back to the route default of 20 for a non-numeric limit', async () => {
    const res = await request(app).get('/api/partners?limit=abc');
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(20);
  });

  it('honors a valid in-range limit', async () => {
    const res = await request(app).get('/api/partners?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(5);
  });
});
