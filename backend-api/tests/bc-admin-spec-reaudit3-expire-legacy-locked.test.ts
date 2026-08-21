/**
 * Integration tests for BC-ADMIN-SPEC-REAUDIT3-EXPIRE-LEGACY-LOCKED-2
 *
 * Tests cover:
 * - DEFECT: expireEntry guards only new-world LOCKED, missing legacy derived-Locked rows
 *   (cashbackStatus null, status CANCELLED, future cashbackExpiresAt)
 * - FIX: Extended guard rejects both new-world and legacy derived-Locked entries
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { app } from '../src/server';
import jwt from 'jsonwebtoken';
import { genTestPhone } from './helpers/test-utils';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  const payload = {
    id: userId,
    email: `test-${userId}@test.local`,
    role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

describe('BC-ADMIN-SPEC-REAUDIT3-EXPIRE-LEGACY-LOCKED-2', () => {
  let superAdminToken: string;
  let superAdminUser: { id: string };
  let userId: string;
  let walletId: string;
  const testId = Date.now();

  beforeAll(async () => {
    // Create SUPER_ADMIN user for auth (with unique email)
    superAdminUser = await prisma.user.create({
      data: {
        email: `super-admin-${testId}@test.local`,
        passwordHash: 'hash',
        firstName: 'Super',
        lastName: 'Admin',
        phone: genTestPhone(),
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        emailVerified: true,
      },
    });
    superAdminToken = generateTestToken(superAdminUser.id, 'SUPER_ADMIN');

    // Create a regular user
    const user = await prisma.user.create({
      data: {
        email: `user-${testId}@test.local`,
        passwordHash: 'hash',
        firstName: 'Test',
        lastName: 'User',
        phone: genTestPhone(),
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    userId = user.id;

    // Create wallet
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        balance: 1000,
        availableBalance: 1000,
        pendingBalance: 0,
        currency: 'BGN',
      },
    });
    walletId = wallet.id;
  });

  afterAll(async () => {
    // BC-QA-045-FOLLOWUP-3: this previously stopped at wallets/transactions —
    // "user deletion has FK constraints" — and left BOTH `superAdminUser` and
    // `user` behind. superAdminUser in particular is exactly the leaked
    // non-archived SUPER_ADMIN fixture class that defeats
    // sa-guard-races.test.ts DEFECT 3's bootstrap precondition. The actual FK
    // blocker is WalletTransaction.wallet (no onDelete: Cascade) — Wallet
    // itself DOES cascade from User, but only once no WalletTransaction still
    // references it — so transactions/wallet must still be deleted BEFORE the
    // users, same order as before; this just continues on to delete the users.
    await prisma.walletTransaction.deleteMany({ where: { walletId } });
    await prisma.wallet.deleteMany({ where: { id: walletId } });
    const ids = [superAdminUser.id, userId].filter(Boolean);
    if (ids.length) {
      // AuditLog.actorUserId has no onDelete: Cascade — the SUPER_ADMIN
      // fixture drives admin routes under test, which may write audit rows.
      await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    }
  });

  describe('expireEntry guard against legacy derived-Locked rows', () => {
    it('should reject new-world LOCKED entries with 409', async () => {
      // Create a new-world LOCKED entry
      const entry = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'CASHBACK_CREDIT',
          amount: 100,
          balanceBefore: 1000,
          balanceAfter: 1100,
          status: 'COMPLETED',
          currency: 'BGN',
          cashbackStatus: 'LOCKED',
          cashbackExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        },
      });

      const res = await request(app)
        .post(`/api/admin/cashback/entries/${entry.id}/expire`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Cannot expire a LOCKED cashback entry/);
      expect(res.body.error).toMatch(/Locked exits only to Paid or Voided/);
    });

    it('should reject legacy derived-Locked entries (CANCELLED status with future expiresAt) with 409', async () => {
      // Create a legacy entry that derives to Locked:
      // cashbackStatus = null, status = CANCELLED, future cashbackExpiresAt
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const entry = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'CASHBACK_CREDIT',
          amount: 100,
          balanceBefore: 1000,
          balanceAfter: 1100,
          status: 'CANCELLED',
          currency: 'BGN',
          cashbackStatus: null,
          cashbackExpiresAt: futureDate,
        },
      });

      // Verify the entry derives to Locked via deriveCashbackEntryStatus
      // (cashbackStatus null + status CANCELLED + future expiresAt → Locked)

      const res = await request(app)
        .post(`/api/admin/cashback/entries/${entry.id}/expire`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Cannot expire a LOCKED cashback entry/);
      expect(res.body.error).toMatch(/Locked exits only to Paid or Voided/);
    });

    it('should allow expiring legacy CANCELLED entries with past cashbackExpiresAt (derives to Expired)', async () => {
      // Create a legacy entry that derives to Expired:
      // cashbackStatus = null, status = CANCELLED, past cashbackExpiresAt
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const entry = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'CASHBACK_CREDIT',
          amount: 100,
          balanceBefore: 1000,
          balanceAfter: 1100,
          status: 'CANCELLED',
          currency: 'BGN',
          cashbackStatus: null,
          cashbackExpiresAt: pastDate,
        },
      });

      const res = await request(app)
        .post(`/api/admin/cashback/entries/${entry.id}/expire`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      // Should succeed because it's already Expired, not Locked
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify the entry was marked as EXPIRED
      const updatedEntry = await prisma.walletTransaction.findUnique({ where: { id: entry.id } });
      expect(updatedEntry?.cashbackStatus).toBe('EXPIRED');
    });

    it('should reject legacy FAILED entries (derive to Locked) with 409', async () => {
      // FAILED status (legacy, without explicit cashbackStatus) derives to Locked per
      // deriveCashbackEntryStatus (line 715), so it must be rejected with 409
      const entry = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'CASHBACK_CREDIT',
          amount: 100,
          balanceBefore: 1000,
          balanceAfter: 1100,
          status: 'FAILED',
          currency: 'BGN',
          cashbackStatus: null,
        },
      });

      const res = await request(app)
        .post(`/api/admin/cashback/entries/${entry.id}/expire`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Cannot expire a LOCKED cashback entry/);
      expect(res.body.error).toMatch(/Locked exits only to Paid or Voided/);
    });

    it('should allow expiring CLEARED entries and decrement wallet balance', async () => {
      // Create a CLEARED entry (should be allowed to expire)
      const entry = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'CASHBACK_CREDIT',
          amount: 100,
          balanceBefore: 1000,
          balanceAfter: 1100,
          status: 'COMPLETED',
          currency: 'BGN',
          cashbackStatus: 'CLEARED',
        },
      });

      const walletBefore = await prisma.wallet.findUnique({ where: { id: walletId } });
      const balanceBefore = walletBefore?.balance ?? 0;

      const res = await request(app)
        .post(`/api/admin/cashback/entries/${entry.id}/expire`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify the entry was marked as EXPIRED
      const updatedEntry = await prisma.walletTransaction.findUnique({ where: { id: entry.id } });
      expect(updatedEntry?.cashbackStatus).toBe('EXPIRED');

      // Verify wallet balance was decremented
      const walletAfter = await prisma.wallet.findUnique({ where: { id: walletId } });
      expect(walletAfter?.balance).toBe(balanceBefore - 100);
    });

    it('should allow expiring legacy COMPLETED entries (without decrementing balance)', async () => {
      // Create a legacy COMPLETED entry without explicit cashbackStatus.
      // Per deriveCashbackEntryStatus, such entries can be Paid, Expired, or Cleared.
      // Since we lack latestWithdrawalAt data, we cannot determine if they are Cleared vs Paid,
      // so we do NOT decrement the wallet balance to avoid incorrectly debiting a Paid entry.
      const entry = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'CASHBACK_CREDIT',
          amount: 100,
          balanceBefore: 1000,
          balanceAfter: 1100,
          status: 'COMPLETED',
          currency: 'BGN',
          cashbackStatus: null,
          // No cashbackPaidAt, so it could be Cleared or Paid depending on latestWithdrawalAt
        },
      });

      const walletBefore = await prisma.wallet.findUnique({ where: { id: walletId } });
      const balanceBefore = walletBefore?.balance ?? 0;

      const res = await request(app)
        .post(`/api/admin/cashback/entries/${entry.id}/expire`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify the entry was marked as EXPIRED
      const updatedEntry = await prisma.walletTransaction.findUnique({ where: { id: entry.id } });
      expect(updatedEntry?.cashbackStatus).toBe('EXPIRED');

      // Verify wallet balance was NOT decremented (safety measure: legacy entries lack data to determine Cleared vs Paid)
      const walletAfter = await prisma.wallet.findUnique({ where: { id: walletId } });
      expect(walletAfter?.balance).toBe(balanceBefore);
    });

    it('should allow expiring PENDING entries with adminOverride=true', async () => {
      // Create a PENDING entry (normally not allowed to expire)
      const entry = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'CASHBACK_CREDIT',
          amount: 100,
          balanceBefore: 1000,
          balanceAfter: 1100,
          status: 'PENDING',
          currency: 'BGN',
          cashbackStatus: 'PENDING',
        },
      });

      const res = await request(app)
        .post(`/api/admin/cashback/entries/${entry.id}/expire`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ adminOverride: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify the entry was marked as EXPIRED
      const updatedEntry = await prisma.walletTransaction.findUnique({ where: { id: entry.id } });
      expect(updatedEntry?.cashbackStatus).toBe('EXPIRED');
    });
  });
});
