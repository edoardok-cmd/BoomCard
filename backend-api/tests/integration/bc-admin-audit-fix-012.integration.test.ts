/**
 * BC-ADMIN-AUDIT-FIX-012 Integration Tests
 *
 * DEFECT: No admin/config API surface exposing the currency display mode/window
 * to the partner-dashboard, preventing dual-currency rendering during transition.
 *
 * Spec §3.7 + §8.1 rule 4 — During the BGN→EUR transition window, amounts must
 * display in BOTH currencies (dual mode). After the window closes, BGN is hidden
 * and EUR is shown alone (EUR-only mode).
 *
 * REQUIRED FIX:
 * 1. Add `currency_transition_window_open` to ALLOWED_KEYS in adminSettings.routes.ts
 * 2. Expose the resolved mode via GET /api/admin/settings/currency-display-mode
 * 3. Ensure the value matches currencyDisplay.ts:isCurrencyTransitionWindowOpen
 * 4. Add validation for the setting in PUT /api/admin/settings/system
 *
 * CONTRACT FOR FIX-013:
 * The admin FE fetches GET /api/admin/settings/currency-display-mode and receives:
 *   { success: true, data: { currencyDisplayMode: 'dual' | 'eur_only', windowOpen: boolean } }
 * Then renders all admin money amounts in dual or EUR-only mode based on currencyDisplayMode.
 *
 * Test cases:
 * 1. GET /currency-display-mode returns "dual" when window is open (default)
 * 2. GET /currency-display-mode returns "eur_only" when window is closed
 * 3. PUT /system accepts currency_transition_window_open="true"
 * 4. PUT /system accepts currency_transition_window_open="false"
 * 5. PUT /system rejects invalid values for currency_transition_window_open
 * 6. Switching the setting flips the value GET /currency-display-mode returns
 * 7. Both FE and BE read the same source (isCurrencyTransitionWindowOpen uses the setting)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/server';
import { prisma } from '../../src/lib/prisma';

const TEST_ADMIN_EMAIL = `admin-fix012-${Date.now()}@boomcard.bg`;
const TEST_ADMIN_PASSWORD = 'AdminPass123!';

interface TestContext {
  adminUser: any;
  adminToken: string;
}

const ctx: TestContext = {
  adminUser: null,
  adminToken: '',
};

beforeAll(async () => {
  // Create test admin user
  const passwordHash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 12);
  ctx.adminUser = await prisma.user.create({
    data: {
      email: TEST_ADMIN_EMAIL,
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      firstName: 'Test',
      lastName: 'Admin',
    },
  });

  // Login to get admin token
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD, clientType: 'web' });

  ctx.adminToken = loginRes.body.data.accessToken;

  // Clean up any existing currency_transition_window_open setting
  await prisma.systemSetting.deleteMany({
    where: { key: 'currency_transition_window_open' },
  });
});

afterAll(async () => {
  // Clean up test data
  await prisma.user.deleteMany({
    where: { email: TEST_ADMIN_EMAIL },
  });
  await prisma.systemSetting.deleteMany({
    where: { key: 'currency_transition_window_open' },
  });
});

describe('BC-ADMIN-AUDIT-FIX-012 — Currency Display Mode Endpoint', () => {
  /**
   * Test 1: Default dual mode when setting is missing (fail-open).
   * Bulgaria is currently inside the BGN→EUR transition window,
   * so both currencies must show by default.
   */
  it('returns currencyDisplayMode="dual" when setting is missing (fail-open default)', async () => {
    // Ensure the setting doesn't exist
    await prisma.systemSetting.deleteMany({
      where: { key: 'currency_transition_window_open' },
    });

    const res = await request(app)
      .get('/api/admin/settings/currency-display-mode')
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      currencyDisplayMode: 'dual',
      windowOpen: true,
    });
  });

  /**
   * Test 2: Return "dual" when window is explicitly set to open.
   */
  it('returns currencyDisplayMode="dual" when currency_transition_window_open="true"', async () => {
    // Set the window to open
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      create: { key: 'currency_transition_window_open', value: 'true' },
      update: { value: 'true' },
    });

    const res = await request(app)
      .get('/api/admin/settings/currency-display-mode')
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      currencyDisplayMode: 'dual',
      windowOpen: true,
    });
  });

  /**
   * Test 3: Return "eur_only" when window is explicitly set to closed.
   */
  it('returns currencyDisplayMode="eur_only" when currency_transition_window_open="false"', async () => {
    // Set the window to closed
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      create: { key: 'currency_transition_window_open', value: 'false' },
      update: { value: 'false' },
    });

    const res = await request(app)
      .get('/api/admin/settings/currency-display-mode')
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      currencyDisplayMode: 'eur_only',
      windowOpen: false,
    });
  });

  /**
   * Test 4: PUT /system accepts currency_transition_window_open="true".
   */
  it('PUT /system accepts currency_transition_window_open="true"', async () => {
    const res = await request(app)
      .put('/api/admin/settings/system')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        settings: { currency_transition_window_open: 'true' },
        notes: 'Test: opening transition window',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify the setting was saved
    const saved = await prisma.systemSetting.findUnique({
      where: { key: 'currency_transition_window_open' },
    });
    expect(saved?.value).toBe('true');
  });

  /**
   * Test 5: PUT /system accepts currency_transition_window_open="false".
   */
  it('PUT /system accepts currency_transition_window_open="false"', async () => {
    const res = await request(app)
      .put('/api/admin/settings/system')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        settings: { currency_transition_window_open: 'false' },
        notes: 'Test: closing transition window',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify the setting was saved
    const saved = await prisma.systemSetting.findUnique({
      where: { key: 'currency_transition_window_open' },
    });
    expect(saved?.value).toBe('false');
  });

  /**
   * Test 6: PUT /system rejects invalid values.
   */
  it('PUT /system rejects invalid values for currency_transition_window_open', async () => {
    const res = await request(app)
      .put('/api/admin/settings/system')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        settings: { currency_transition_window_open: 'invalid' },
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/currency_transition_window_open.*must be/i);
  });

  /**
   * Test 7: PUT /system rejects non-string values.
   */
  it('PUT /system rejects non-string values for currency_transition_window_open', async () => {
    const res = await request(app)
      .put('/api/admin/settings/system')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        settings: { currency_transition_window_open: true },
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/value must be a string/i);
  });

  /**
   * Test 8: Switching the setting flips the value GET /currency-display-mode returns.
   * This verifies that FE and BE read the same source.
   *
   * CRITICAL FIX (r2): Cache invalidation ensures zero staleness — each PUT immediately
   * clears the cached window flag, so the subsequent GET returns the new value.
   */
  it('switching the setting flips the API response for GET /currency-display-mode', async () => {
    // Set to true
    await request(app)
      .put('/api/admin/settings/system')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        settings: { currency_transition_window_open: 'true' },
      });

    // Verify cache invalidation: GET reflects PUT immediately (zero staleness)
    let getRes = await request(app)
      .get('/api/admin/settings/currency-display-mode')
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(getRes.body.data.currencyDisplayMode).toBe('dual');

    // Set to false
    await request(app)
      .put('/api/admin/settings/system')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        settings: { currency_transition_window_open: 'false' },
      });

    getRes = await request(app)
      .get('/api/admin/settings/currency-display-mode')
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(getRes.body.data.currencyDisplayMode).toBe('eur_only');

    // Set back to true to verify the toggle works both ways
    await request(app)
      .put('/api/admin/settings/system')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        settings: { currency_transition_window_open: 'true' },
      });

    getRes = await request(app)
      .get('/api/admin/settings/currency-display-mode')
      .set('Authorization', `Bearer ${ctx.adminToken}`);

    expect(getRes.body.data.currencyDisplayMode).toBe('dual');
  });

  /**
   * Test 9: Endpoint requires settings.read permission (auth check).
   */
  it('requires authentication to access GET /currency-display-mode', async () => {
    const res = await request(app).get('/api/admin/settings/currency-display-mode');

    // Should fail due to missing auth
    expect(res.status).toBe(401);
  });

  /**
   * Test 10: The setting is recorded in the audit trail (via systemSettingHistory).
   */
  it('records setting changes in the audit trail', async () => {
    // Clear history for this key
    await prisma.systemSettingHistory.deleteMany({
      where: { key: 'currency_transition_window_open' },
    });

    // Make a change
    await request(app)
      .put('/api/admin/settings/system')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        settings: { currency_transition_window_open: 'true' },
        notes: 'Audit trail test',
      });

    // Verify the history record was created
    const history = await prisma.systemSettingHistory.findFirst({
      where: { key: 'currency_transition_window_open' },
      orderBy: { createdAt: 'desc' },
    });

    expect(history).toBeDefined();
    expect(history?.newValue).toBe('true');
    expect(history?.notes).toContain('Audit trail test');
  });
});
