/**
 * TEETH TEST: system-input-500-sweep (INV-SYS-026..029)
 *
 * Proves the "never 500" detector has teeth: a handler that 500'd on malformed
 * input would be flagged, and the live API returns clean 4xx.
 *
 * This file does NOT edit any src/** code.
 */

import request from 'supertest';
import { app } from '../../src/server';

function assertNo500(status: number): void {
  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
}

describe('TEETH — input-500 detector', () => {
  test('RED: a 500 on malformed input would be flagged', () => {
    expect(() => assertNo500(500)).toThrow();
  });

  test('RED: a 200 (silently accepted garbage) would be flagged', () => {
    expect(() => assertNo500(200)).toThrow();
  });

  test('GREEN: unknown integration id → clean 4xx (404)', async () => {
    const res = await request(app).get('/api/integrations/available/definitely-not-real');
    assertNo500(res.status);
    expect(res.status).toBe(404);
  });

  test('GREEN: connect with no body → clean 4xx, never 500', async () => {
    const res = await request(app)
      .post('/api/integrations/connect')
      .set('Content-Type', 'application/json')
      .send({});
    assertNo500(res.status);
  });
});
