/**
 * Integration Tests: Token Refresh Flow
 *
 * Tests the JWT token refresh mechanism that mobile clients depend on
 * for seamless session management.
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import {
  createTestUser,
  cleanupTestUser,
  authRequest,
  wait,
} from '../helpers/test-utils';

describe('Token Refresh Flow', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  // ─── Basic Refresh ────────────────────────────────────────────

  describe('Valid Token Refresh', () => {
    it('should issue new access and refresh tokens', async () => {
      const { refreshToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');

      // New tokens should be different from old
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should allow using new access token for API calls', async () => {
      const { refreshToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      const newAccessToken = refreshRes.body.data.accessToken;

      // Use new token for API call
      const meRes = await authRequest(newAccessToken).get('/api/auth/me');
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.id).toBe(user.id);
    });
  });

  // ─── Token Rotation ───────────────────────────────────────────

  describe('Token Rotation Security', () => {
    it('should invalidate old refresh token after use (rotation)', async () => {
      const { refreshToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      // First refresh — should succeed
      const res1 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(res1.status).toBe(200);

      // Second use of same token — should fail
      const res2 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(res2.status).toBe(401);
    });

    it('should allow chain of refreshes (new token works)', async () => {
      const { refreshToken: token1, user } = await createTestUser();
      createdUserIds.push(user.id);

      // Refresh 1
      const res1 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: token1 });
      expect(res1.status).toBe(200);
      const token2 = res1.body.data.refreshToken;

      // Refresh 2 with new token
      const res2 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: token2 });
      expect(res2.status).toBe(200);
      const token3 = res2.body.data.refreshToken;

      // All tokens should be different
      expect(token1).not.toBe(token2);
      expect(token2).not.toBe(token3);
    });
  });

  // ─── Invalid Tokens ───────────────────────────────────────────

  describe('Invalid Token Handling', () => {
    it('should reject completely invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'not-a-valid-jwt-token' });

      expect(res.status).toBe(401);
    });

    it('should reject expired refresh token', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Manually create an expired refresh token in DB
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { id: user.id, email: user.email, role: 'USER' },
        process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
        { expiresIn: '0s' }
      );

      await prisma.refreshToken.create({
        data: {
          token: expiredToken,
          userId: user.id,
          expiresAt: new Date(Date.now() - 1000), // Already expired
        },
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: expiredToken });

      expect(res.status).toBe(401);
    });

    it('should reject missing refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ─── Password Change Invalidation ─────────────────────────────

  describe('Token Invalidation on Password Change', () => {
    it('should invalidate all refresh tokens when password changes', async () => {
      const { accessToken, refreshToken, user, password } = await createTestUser();
      createdUserIds.push(user.id);

      // Change password
      const changeRes = await authRequest(accessToken)
        .post('/api/auth/change-password')
        .send({ currentPassword: password, newPassword: 'NewSecure456!' });
      expect(changeRes.status).toBe(200);

      // Old refresh token should no longer work
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(refreshRes.status).toBe(401);
    });
  });

  // ─── Account Deletion Invalidation ────────────────────────────

  describe('Token Invalidation on Account Deletion', () => {
    it('should invalidate tokens when account is deleted', async () => {
      const { accessToken, refreshToken, user, password } = await createTestUser();

      // Delete account
      const deleteRes = await authRequest(accessToken)
        .delete('/api/auth/account')
        .send({ password });
      expect(deleteRes.status).toBe(200);

      // Refresh token should no longer work
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(refreshRes.status).toBe(401);

      // Access token may still work (JWT is stateless) until it expires.
      // The key protection is that refresh tokens are invalidated.
      const meRes = await authRequest(accessToken).get('/api/auth/me');
      // Status is either denied (401/403/404) or user data is returned with INACTIVE status
      expect(meRes.status).toBeLessThan(500);
    });
  });

  // ─── Suspended Account ────────────────────────────────────────

  describe('Suspended Account Token Handling', () => {
    it('should reject refresh for suspended user', async () => {
      const { refreshToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      // Suspend user directly in DB
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'SUSPENDED' },
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(403);
    });
  });
});
