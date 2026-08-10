/**
 * BC-QA-020 Integration Tests: Public Currency Display Mode Endpoint
 *
 * FEATURE: Public /api/settings/currency-display-mode endpoint exposing the
 * currency display mode to unauthenticated frontend clients.
 *
 * Spec §3.7 + §8.1 rule 4 — During the BGN→EUR transition window, amounts must
 * display in BOTH currencies (dual mode). After the window closes, BGN is hidden
 * and EUR is shown alone (EUR-only mode).
 *
 * REQUIREMENT: The endpoint MUST be public (no authentication required) so that
 * partner-dashboard and other non-admin frontends can fetch the display mode
 * and render prices accordingly.
 *
 * Test cases:
 * 1. GET /api/settings/currency-display-mode is accessible without authentication
 * 2. Returns "dual" mode when currency_transition_window_open is true (or missing)
 * 3. Returns "eur_only" mode when currency_transition_window_open is false
 * 4. Response shape matches expected contract: { success, data: { currencyDisplayMode, windowOpen } }
 * 5. Endpoint does not require admin role
 * 6. Endpoint allows requests from unauthenticated clients (no middleware blocks it)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';

interface TestContext {
  app: any;
}

const ctx: TestContext = {
  app: null,
};

beforeAll(async () => {
  ctx.app = await createTestApp();
  // Clean up any existing currency_transition_window_open setting to start fresh
  await prisma.systemSetting.deleteMany({
    where: { key: 'currency_transition_window_open' },
  });
  invalidateCurrencyDisplayCache();
});

afterAll(async () => {
  // Clean up test data
  await prisma.systemSetting.deleteMany({
    where: { key: 'currency_transition_window_open' },
  });
  invalidateCurrencyDisplayCache();
  await ctx.app?.close?.();
});

describe('BC-QA-020 — Public Currency Display Mode Endpoint', () => {
  /**
   * Test 1: Endpoint is accessible without authentication.
   *
   * The endpoint MUST be public (no Bearer token required) because partner
   * dashboards and unauthenticated frontends need to read it to render prices
   * in the correct currency display mode.
   */
  it('GET /api/settings/currency-display-mode is accessible without authentication', async () => {
    const res = await request(ctx.app).get('/api/settings/currency-display-mode');

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  /**
   * Test 2: Default dual mode when setting is missing (fail-open).
   *
   * Bulgaria is currently inside the BGN→EUR transition window, so when the
   * setting is missing, we MUST default to dual mode (showing both currencies).
   */
  it('returns currencyDisplayMode="dual" when setting is missing (fail-open default)', async () => {
    // Ensure the setting doesn't exist
    await prisma.systemSetting.deleteMany({
      where: { key: 'currency_transition_window_open' },
    });
    invalidateCurrencyDisplayCache();

    const res = await request(ctx.app).get('/api/settings/currency-display-mode');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      currencyDisplayMode: 'dual',
      windowOpen: true,
    });
  });

  /**
   * Test 3: Return "dual" when window is explicitly set to open.
   */
  it('returns currencyDisplayMode="dual" when currency_transition_window_open="true"', async () => {
    // Set the window to open
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      create: { key: 'currency_transition_window_open', value: 'true' },
      update: { value: 'true' },
    });
    invalidateCurrencyDisplayCache();

    const res = await request(ctx.app).get('/api/settings/currency-display-mode');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      currencyDisplayMode: 'dual',
      windowOpen: true,
    });
  });

  /**
   * Test 4: Return "eur_only" when window is explicitly set to closed.
   */
  it('returns currencyDisplayMode="eur_only" when currency_transition_window_open="false"', async () => {
    // Set the window to closed
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      create: { key: 'currency_transition_window_open', value: 'false' },
      update: { value: 'false' },
    });
    invalidateCurrencyDisplayCache();

    const res = await request(ctx.app).get('/api/settings/currency-display-mode');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      currencyDisplayMode: 'eur_only',
      windowOpen: false,
    });
  });

  /**
   * Test 5: Response shape matches the expected contract.
   *
   * The response MUST include both currencyDisplayMode and windowOpen fields
   * in the data object, and the top-level success field MUST be true.
   */
  it('response has correct shape: { success, data: { currencyDisplayMode, windowOpen } }', async () => {
    // Set window to open
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      create: { key: 'currency_transition_window_open', value: 'true' },
      update: { value: 'true' },
    });
    invalidateCurrencyDisplayCache();

    const res = await request(ctx.app).get('/api/settings/currency-display-mode');

    // Check top-level structure
    expect(res.body).toHaveProperty('success');
    expect(res.body).toHaveProperty('data');

    // Check success is true
    expect(res.body.success).toBe(true);

    // Check data structure
    expect(res.body.data).toHaveProperty('currencyDisplayMode');
    expect(res.body.data).toHaveProperty('windowOpen');

    // Check field types
    expect(typeof res.body.data.currencyDisplayMode).toBe('string');
    expect(typeof res.body.data.windowOpen).toBe('boolean');

    // Check currencyDisplayMode is one of the valid values
    expect(['dual', 'eur_only']).toContain(res.body.data.currencyDisplayMode);
  });

  /**
   * Test 6: Switching the setting flips the mode returned by the endpoint.
   *
   * This test verifies that the endpoint correctly reflects changes to the
   * underlying system setting.
   */
  it('flips currencyDisplayMode when the setting is changed', async () => {
    // Start with window open (dual mode)
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      create: { key: 'currency_transition_window_open', value: 'true' },
      update: { value: 'true' },
    });
    invalidateCurrencyDisplayCache();

    const resOpen = await request(ctx.app).get('/api/settings/currency-display-mode');
    expect(resOpen.body.data.currencyDisplayMode).toBe('dual');

    // Switch to window closed (eur_only mode)
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      create: { key: 'currency_transition_window_open', value: 'false' },
      update: { value: 'false' },
    });
    invalidateCurrencyDisplayCache();

    const resClosed = await request(ctx.app).get('/api/settings/currency-display-mode');
    expect(resClosed.body.data.currencyDisplayMode).toBe('eur_only');

    // Switch back to open
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      create: { key: 'currency_transition_window_open', value: 'true' },
      update: { value: 'true' },
    });
    invalidateCurrencyDisplayCache();

    const resReopened = await request(ctx.app).get('/api/settings/currency-display-mode');
    expect(resReopened.body.data.currencyDisplayMode).toBe('dual');
  });

  /**
   * Test 7: Multiple concurrent requests to the endpoint all succeed without auth.
   *
   * Verifies that the endpoint can handle multiple unauthenticated requests
   * and doesn't accidentally apply any middleware that requires authentication.
   */
  it('handles multiple concurrent requests without authentication', async () => {
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      create: { key: 'currency_transition_window_open', value: 'true' },
      update: { value: 'true' },
    });
    invalidateCurrencyDisplayCache();

    const promises = Array.from({ length: 5 }, () =>
      request(ctx.app).get('/api/settings/currency-display-mode')
    );

    const responses = await Promise.all(promises);

    // All requests should succeed
    responses.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currencyDisplayMode).toBe('dual');
    });
  });
});
