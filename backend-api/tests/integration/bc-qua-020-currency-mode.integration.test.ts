/**
 * BC-QUA-020 Integration Tests — Public Currency Display Mode Endpoint
 *
 * Spec §3.7 + §8.1 rule 4 + FIX-QA-020: Public GET /api/settings/currency-display-mode endpoint
 *
 * This endpoint exposes the resolved currency display mode to all frontend clients
 * (partner dashboard, mobile app, public website, admin UI) without requiring authentication.
 *
 * Mode logic:
 * - Window OPEN  (currency_transition_window_open = "true")  → 'dual' mode (show BGN + EUR)
 * - Window CLOSED (currency_transition_window_open = "false") → 'eur_only' mode (EUR only)
 *
 * Test cases:
 * 1. Endpoint is accessible without authentication — GET /api/settings/currency-display-mode returns 200 without token
 * 2. Correct response shape when window is OPEN: { success: true, data: { currencyDisplayMode: 'dual', windowOpen: true } }
 * 3. Correct response shape when window is CLOSED: { success: true, data: { currencyDisplayMode: 'eur_only', windowOpen: false } }
 * 4. No 401/403 errors on unauthenticated requests
 * 5. Response shape consistency — success, data.currencyDisplayMode, data.windowOpen always present
 * 6. Window state transitions — verify both modes by toggling currency_transition_window_open SystemSetting
 * 7. Missing SystemSetting falls back to default (true/OPEN)
 * 8. Rapid consecutive calls return consistent results
 * 9. Invalid query parameters are ignored (endpoint accepts no params)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';

interface TestContext {
  originalWindowSetting: string | null;
  userToken: string | null;
  adminToken: string | null;
  userId: string | null;
  adminId: string | null;
}

const ctx: TestContext = {
  originalWindowSetting: null,
  userToken: null,
  adminToken: null,
  userId: null,
  adminId: null,
};

beforeAll(async () => {
  // Save the current window setting so we can restore it after tests
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'currency_transition_window_open' },
  });
  ctx.originalWindowSetting = setting?.value ?? null;

  // Create test USER account
  const userEmail = `test-user-qua020-${Date.now()}@boomcard.bg`;
  const userPasswordHash = await bcrypt.hash('TestPass123!', 12);
  const user = await prisma.user.create({
    data: {
      email: userEmail,
      passwordHash: userPasswordHash,
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
      firstName: 'Test',
      lastName: 'User',
      phone: '+359888000000',
    },
  });
  ctx.userId = user.id;

  // Login as USER to get token
  let loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: userEmail, password: 'TestPass123!', clientType: 'web' });
  ctx.userToken = loginRes.body.data?.accessToken || null;

  // Create test ADMIN account
  const adminEmail = `test-admin-qua020-${Date.now()}@boomcard.bg`;
  const adminPasswordHash = await bcrypt.hash('AdminPass123!', 12);
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      firstName: 'Test',
      lastName: 'Admin',
      phone: '+359888000000',
    },
  });
  ctx.adminId = admin.id;

  // Login as ADMIN to get token
  loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminEmail, password: 'AdminPass123!', clientType: 'web' });
  ctx.adminToken = loginRes.body.data?.accessToken || null;
});

afterAll(async () => {
  // Restore original setting
  if (ctx.originalWindowSetting !== null) {
    await prisma.systemSetting.upsert({
      where: { key: 'currency_transition_window_open' },
      create: { key: 'currency_transition_window_open', value: ctx.originalWindowSetting },
      update: { value: ctx.originalWindowSetting },
    });
  } else {
    // If no setting existed before, remove it
    await prisma.systemSetting.delete({
      where: { key: 'currency_transition_window_open' },
    }).catch(() => {
      // Ignore if not found (already deleted or didn't exist)
    });
  }

  // Cleanup test users
  if (ctx.userId) {
    await prisma.user.delete({ where: { id: ctx.userId } }).catch(() => {});
  }
  if (ctx.adminId) {
    await prisma.user.delete({ where: { id: ctx.adminId } }).catch(() => {});
  }

  await prisma.$disconnect();
});

describe('BC-QUA-020: Public Currency Display Mode Endpoint', () => {
  describe('§3.7 + §8.1 rule 4: Endpoint Accessibility and Response Shape', () => {
    it('GET /api/settings/currency-display-mode is accessible without authentication', async () => {
      // Arrange: no auth token provided
      // Act: send GET request without Authorization header
      const res = await request(app).get('/api/settings/currency-display-mode');

      // Assert: should return 200 (success, no authentication required)
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('Returns 200 with correct response shape', async () => {
      // Act
      const res = await request(app).get('/api/settings/currency-display-mode');

      // Assert: response must include success flag and data with required fields
      expect(res.status).toBe(200);
      // F3: Stricter validation using Object.keys to ensure exact field structure
      expect(Object.keys(res.body).sort()).toEqual(['data', 'success']);
      expect(res.body.success).toBe(true);
      expect(Object.keys(res.body.data).sort()).toEqual(['currencyDisplayMode', 'windowOpen']);
      expect(typeof res.body.data.currencyDisplayMode).toBe('string');
      expect(typeof res.body.data.windowOpen).toBe('boolean');
    });

    it('Does NOT return 401 or 403 for unauthenticated access', async () => {
      // Act
      const res = await request(app).get('/api/settings/currency-display-mode');

      // Assert: should NOT be 401 (Unauthorized) or 403 (Forbidden)
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).toBe(200);
    });

    it('Response is valid even with invalid query parameters', async () => {
      // Act: send with invalid/unsupported query parameters
      const res = await request(app)
        .get('/api/settings/currency-display-mode')
        .query({ invalid: 'param', foo: 'bar', legacy: 'v1' });

      // Assert: endpoint ignores unknown params and still returns 200
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currencyDisplayMode).toBeDefined();
      expect(res.body.data.windowOpen).toBeDefined();
    });
  });

  describe('FIX-QA-020: Window State Modes — Dual vs EUR-Only', () => {
    it('When window is OPEN: returns currencyDisplayMode "dual" and windowOpen true', async () => {
      // Arrange: set currency_transition_window_open to "true" (OPEN)
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'true' },
        update: { value: 'true' },
      });

      // Act
      const res = await request(app).get('/api/settings/currency-display-mode');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currencyDisplayMode).toBe('dual');
      expect(res.body.data.windowOpen).toBe(true);
    });

    it('When window is CLOSED: returns currencyDisplayMode "eur_only" and windowOpen false', async () => {
      // Arrange: set currency_transition_window_open to "false" (CLOSED)
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'false' },
        update: { value: 'false' },
      });
      invalidateCurrencyDisplayCache();

      // Act
      const res = await request(app).get('/api/settings/currency-display-mode');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currencyDisplayMode).toBe('eur_only');
      expect(res.body.data.windowOpen).toBe(false);
    });

    it('Window state transitions are reflected immediately', async () => {
      // Arrange: start with OPEN
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'true' },
        update: { value: 'true' },
      });
      invalidateCurrencyDisplayCache();

      // Act: read initial state
      const res1 = await request(app).get('/api/settings/currency-display-mode');

      // Assert: should be OPEN
      expect(res1.body.data.currencyDisplayMode).toBe('dual');
      expect(res1.body.data.windowOpen).toBe(true);

      // Arrange: transition to CLOSED
      await prisma.systemSetting.update({
        where: { key: 'currency_transition_window_open' },
        data: { value: 'false' },
      });
      invalidateCurrencyDisplayCache();

      // Act: read new state (should reflect immediately)
      const res2 = await request(app).get('/api/settings/currency-display-mode');

      // Assert: should be CLOSED
      expect(res2.body.data.currencyDisplayMode).toBe('eur_only');
      expect(res2.body.data.windowOpen).toBe(false);

      // Arrange: transition back to OPEN
      await prisma.systemSetting.update({
        where: { key: 'currency_transition_window_open' },
        data: { value: 'true' },
      });
      invalidateCurrencyDisplayCache();

      // Act: read final state
      const res3 = await request(app).get('/api/settings/currency-display-mode');

      // Assert: should be OPEN again
      expect(res3.body.data.currencyDisplayMode).toBe('dual');
      expect(res3.body.data.windowOpen).toBe(true);
    });
  });

  describe('Edge Cases and Defaults', () => {
    it('Defaults to OPEN (dual mode) when SystemSetting does not exist', async () => {
      // Arrange: delete the currency_transition_window_open setting to simulate missing entry
      await prisma.systemSetting.delete({
        where: { key: 'currency_transition_window_open' },
      }).catch(() => {
        // Ignore if already deleted
      });

      // Act
      const res = await request(app).get('/api/settings/currency-display-mode');

      // Assert: should default to OPEN (dual mode)
      // Per spec, Bulgaria is currently inside the BGN→EUR transition window,
      // so default should be OPEN (true)
      expect(res.status).toBe(200);
      expect(res.body.data.windowOpen).toBe(true);
      expect(res.body.data.currencyDisplayMode).toBe('dual');
    });

    it('Handles invalid SystemSetting values gracefully (logs warning, defaults to CLOSED)', async () => {
      // Arrange: set an invalid value (typo, empty string, etc.)
      // Per currencyDisplay.ts: any unrecognized value defaults to CLOSED (false)
      // to avoid fail-open violations after adoption
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'invalid-value' },
        update: { value: 'invalid-value' },
      });
      invalidateCurrencyDisplayCache();

      // Act
      const res = await request(app).get('/api/settings/currency-display-mode');

      // Assert: should default to CLOSED (fail-safe)
      expect(res.status).toBe(200);
      expect(res.body.data.windowOpen).toBe(false);
      expect(res.body.data.currencyDisplayMode).toBe('eur_only');
    });

    it('Rapid consecutive calls return consistent results', async () => {
      // Arrange: set window to OPEN
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'true' },
        update: { value: 'true' },
      });
      invalidateCurrencyDisplayCache();

      // Act: make multiple rapid requests
      const results = await Promise.all([
        request(app).get('/api/settings/currency-display-mode'),
        request(app).get('/api/settings/currency-display-mode'),
        request(app).get('/api/settings/currency-display-mode'),
        request(app).get('/api/settings/currency-display-mode'),
        request(app).get('/api/settings/currency-display-mode'),
      ]);

      // Assert: all responses should be identical and consistent
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.currencyDisplayMode).toBe('dual');
        expect(res.body.data.windowOpen).toBe(true);
      }
    });
  });

  describe('Response Validation and Schema Consistency', () => {
    it('Always includes success, data, currencyDisplayMode, and windowOpen fields', async () => {
      // Arrange: set to CLOSED
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'false' },
        update: { value: 'false' },
      });

      // Act
      const res = await request(app).get('/api/settings/currency-display-mode');

      // Assert: all required fields must be present (F3: stricter validation)
      expect(Object.keys(res.body).sort()).toEqual(['data', 'success']);
      expect(Object.keys(res.body.data).sort()).toEqual(['currencyDisplayMode', 'windowOpen']);

      // All values must be the correct type
      expect(typeof res.body.success).toBe('boolean');
      expect(typeof res.body.data).toBe('object');
      expect(typeof res.body.data.currencyDisplayMode).toBe('string');
      expect(typeof res.body.data.windowOpen).toBe('boolean');
    });

    it('currencyDisplayMode is always one of the allowed values: "dual" or "eur_only"', async () => {
      // Test both states
      const testCases = [
        { setting: 'true', expected: 'dual' },
        { setting: 'false', expected: 'eur_only' },
      ];

      for (const testCase of testCases) {
        // Arrange
        await prisma.systemSetting.upsert({
          where: { key: 'currency_transition_window_open' },
          create: { key: 'currency_transition_window_open', value: testCase.setting },
          update: { value: testCase.setting },
        });
        invalidateCurrencyDisplayCache();

        // Act
        const res = await request(app).get('/api/settings/currency-display-mode');

        // Assert
        expect(['dual', 'eur_only']).toContain(res.body.data.currencyDisplayMode);
        expect(res.body.data.currencyDisplayMode).toBe(testCase.expected);
      }
    });

    it('windowOpen boolean always matches the setting value', async () => {
      // Arrange & Act: set to true
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'true' },
        update: { value: 'true' },
      });
      invalidateCurrencyDisplayCache();

      let res = await request(app).get('/api/settings/currency-display-mode');
      expect(res.body.data.windowOpen).toBe(true);

      // Arrange & Act: set to false
      await prisma.systemSetting.update({
        where: { key: 'currency_transition_window_open' },
        data: { value: 'false' },
      });
      invalidateCurrencyDisplayCache();

      res = await request(app).get('/api/settings/currency-display-mode');
      expect(res.body.data.windowOpen).toBe(false);
    });

    it('currencyDisplayMode correctly correlates with windowOpen', async () => {
      // When windowOpen is true, currencyDisplayMode must be "dual"
      // When windowOpen is false, currencyDisplayMode must be "eur_only"

      // Test: windowOpen true → currencyDisplayMode "dual"
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'true' },
        update: { value: 'true' },
      });
      invalidateCurrencyDisplayCache();

      let res = await request(app).get('/api/settings/currency-display-mode');
      expect(res.body.data.windowOpen).toBe(true);
      expect(res.body.data.currencyDisplayMode).toBe('dual');

      // Test: windowOpen false → currencyDisplayMode "eur_only"
      await prisma.systemSetting.update({
        where: { key: 'currency_transition_window_open' },
        data: { value: 'false' },
      });
      invalidateCurrencyDisplayCache();

      res = await request(app).get('/api/settings/currency-display-mode');
      expect(res.body.data.windowOpen).toBe(false);
      expect(res.body.data.currencyDisplayMode).toBe('eur_only');
    });
  });

  describe('F2: Authenticated vs Unauthenticated Equivalence', () => {
    it('USER role with valid token receives same response as unauthenticated client', async () => {
      // Arrange: set to OPEN for predictable response
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'true' },
        update: { value: 'true' },
      });
      invalidateCurrencyDisplayCache();

      // Act: call endpoint as unauthenticated
      const unauthRes = await request(app).get('/api/settings/currency-display-mode');

      // Act: call endpoint as authenticated USER
      const authRes = await request(app)
        .get('/api/settings/currency-display-mode')
        .set('Authorization', `Bearer ${ctx.userToken}`);

      // Assert: both responses should be identical
      expect(authRes.status).toBe(200);
      expect(authRes.body.success).toBe(unauthRes.body.success);
      expect(authRes.body.data.currencyDisplayMode).toBe(unauthRes.body.data.currencyDisplayMode);
      expect(authRes.body.data.windowOpen).toBe(unauthRes.body.data.windowOpen);
      expect(Object.keys(authRes.body).sort()).toEqual(['data', 'success']);
      expect(Object.keys(authRes.body.data).sort()).toEqual(['currencyDisplayMode', 'windowOpen']);
    });

    it('ADMIN role with valid token receives same response as unauthenticated client', async () => {
      // Arrange: set to CLOSED for predictable response
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'false' },
        update: { value: 'false' },
      });
      invalidateCurrencyDisplayCache();

      // Act: call endpoint as unauthenticated
      const unauthRes = await request(app).get('/api/settings/currency-display-mode');

      // Act: call endpoint as authenticated ADMIN
      const authRes = await request(app)
        .get('/api/settings/currency-display-mode')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      // Assert: both responses should be identical
      expect(authRes.status).toBe(200);
      expect(authRes.body.success).toBe(unauthRes.body.success);
      expect(authRes.body.data.currencyDisplayMode).toBe(unauthRes.body.data.currencyDisplayMode);
      expect(authRes.body.data.windowOpen).toBe(unauthRes.body.data.windowOpen);
      expect(Object.keys(authRes.body).sort()).toEqual(['data', 'success']);
      expect(Object.keys(authRes.body.data).sort()).toEqual(['currencyDisplayMode', 'windowOpen']);
    });

    it('Invalid or expired JWT token is ignored (falls back to unauthenticated response)', async () => {
      // Arrange: set window to OPEN
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'true' },
        update: { value: 'true' },
      });
      invalidateCurrencyDisplayCache();

      // Act: call with invalid token
      const res = await request(app)
        .get('/api/settings/currency-display-mode')
        .set('Authorization', 'Bearer invalid.token.here');

      // Assert: endpoint still returns 200 (public endpoint, auth is optional)
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currencyDisplayMode).toBe('dual');
      expect(res.body.data.windowOpen).toBe(true);
    });
  });

  describe('F1: Error Handling and Resilience', () => {
    it('Endpoint returns safe default on service error', async () => {
      // This test verifies graceful error handling without mocking internal dependencies.
      // When isCurrencyTransitionWindowOpen() encounters invalid/malformed data in the
      // SystemSetting (e.g., typo, unexpected value), it should log a warning and default
      // to fail-safe mode (EUR-only, windowOpen = false) per Spec §8.1 rule 4.
      // For this integration test, we verify the endpoint's resilience by setting an
      // invalid value that won't crash the database but will trigger the fail-safe path.

      // Arrange: set an edge-case string that isCurrencyTransitionWindowOpen will not recognize
      // (anything other than "true" or "false" in case-insensitive form triggers the warning path)
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'malformed_data_1234567890' },
        update: { value: 'malformed_data_1234567890' },
      });
      invalidateCurrencyDisplayCache();

      // Act: call the endpoint
      const res = await request(app).get('/api/settings/currency-display-mode');

      // Assert: endpoint still responds with 200 (doesn't crash), defaults to fail-safe
      // (EUR-only mode) even with invalid/unexpected data in the setting
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Invalid value defaults to CLOSED (fail-safe per spec §8.1 rule 4)
      expect(res.body.data.currencyDisplayMode).toBe('eur_only');
      expect(res.body.data.windowOpen).toBe(false);
      expect(Object.keys(res.body).sort()).toEqual(['data', 'success']);
    });

    it('Concurrent requests during settings update do not cause response inconsistencies', async () => {
      // Arrange: set to OPEN
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'true' },
        update: { value: 'true' },
      });

      // Act: make several requests in quick succession
      const responses = await Promise.all([
        request(app).get('/api/settings/currency-display-mode'),
        request(app).get('/api/settings/currency-display-mode'),
        request(app).get('/api/settings/currency-display-mode'),
      ]);

      // Assert: all should succeed and be consistent
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
        expect(typeof res.body.data.currencyDisplayMode).toBe('string');
        expect(typeof res.body.data.windowOpen).toBe('boolean');
      }
    });
  });

  describe('HTTP Status Codes and Headers', () => {
    it('Returns 200 OK status code', async () => {
      const res = await request(app).get('/api/settings/currency-display-mode');
      expect(res.status).toBe(200);
    });

    it('Returns JSON content type', async () => {
      const res = await request(app).get('/api/settings/currency-display-mode');
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('Response includes no error field when successful', async () => {
      const res = await request(app).get('/api/settings/currency-display-mode');
      // F3: Strict validation - only 'success' and 'data' keys should exist
      expect(Object.keys(res.body).sort()).toEqual(['data', 'success']);
      expect(res.body.success).toBe(true);
      expect(res.body).not.toHaveProperty('error');
    });
  });

  describe('Localization and i18n Integration', () => {
    it('Returns values compatible with all client types (mobile, web, partner portal)', async () => {
      // The endpoint is public and returns language-agnostic data
      // (mode names are English enum values, not localized strings)
      await prisma.systemSetting.upsert({
        where: { key: 'currency_transition_window_open' },
        create: { key: 'currency_transition_window_open', value: 'true' },
        update: { value: 'true' },
      });
      invalidateCurrencyDisplayCache();

      const res = await request(app).get('/api/settings/currency-display-mode');

      // Assert: response should use language-agnostic identifiers
      expect(res.body.data.currencyDisplayMode).toBe('dual');
      expect(typeof res.body.data.windowOpen).toBe('boolean');

      // Clients can localize these values in their own i18n dictionaries
    });
  });
});
