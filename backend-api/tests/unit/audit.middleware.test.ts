/**
 * Unit tests for deriveActionAndObject() in audit.middleware.ts
 *
 * Verifies that action strings and objectTypes are correctly derived for
 * every route shape in the admin API, including the edge cases fixed in
 * the §10 audit:
 *   - DELETE /:id/roles/:roleKey  → admin.roles.delete (not admin.SUPER_ADMIN)
 *   - POST /entries/:id/approve   → cashback.approve  (not entries.approve)
 *   - POST /:partnerId/:month/mark-paid → cashback.mark-paid
 */

import { deriveActionAndObject } from '../../src/middleware/audit.middleware';
import type { AuthRequest } from '../../src/middleware/auth.middleware';

function makeReq(method: string, baseUrl: string, path: string): AuthRequest {
  return { method, baseUrl, path, socket: {} } as unknown as AuthRequest;
}

const UUID = '11111111-2222-3333-4444-555555555555';

describe('deriveActionAndObject()', () => {
  // ─── Admin routes (/api/admin/admins) ────────────────────────────────────

  describe('admin routes', () => {
    const base = '/api/admin/admins';

    it('POST / → admin.create', () => {
      const r = deriveActionAndObject(makeReq('POST', base, '/'));
      expect(r.action).toBe('admin.create');
      expect(r.objectType).toBe('admin');
      expect(r.objectId).toBeNull();
    });

    it('PATCH /:id → admin.update', () => {
      const r = deriveActionAndObject(makeReq('PATCH', base, `/${UUID}`));
      expect(r.action).toBe('admin.update');
      expect(r.objectId).toBe(UUID);
    });

    it('DELETE /:id → admin.delete', () => {
      const r = deriveActionAndObject(makeReq('DELETE', base, `/${UUID}`));
      expect(r.action).toBe('admin.delete');
    });

    it('POST /:id/approve → admin.approve', () => {
      const r = deriveActionAndObject(makeReq('POST', base, `/${UUID}/approve`));
      expect(r.action).toBe('admin.approve');
      expect(r.objectId).toBe(UUID);
    });

    it('PATCH /:id/status → admin.status', () => {
      const r = deriveActionAndObject(makeReq('PATCH', base, `/${UUID}/status`));
      expect(r.action).toBe('admin.status');
    });

    it('DELETE /:id/roles/SUPER_ADMIN → admin.roles.delete (not admin.SUPER_ADMIN)', () => {
      const r = deriveActionAndObject(makeReq('DELETE', base, `/${UUID}/roles/SUPER_ADMIN`));
      expect(r.action).toBe('admin.roles.delete');
      expect(r.objectType).toBe('admin');
      expect(r.objectId).toBe(UUID);
    });

    it('DELETE /:id/roles/FINANCE → admin.roles.delete', () => {
      const r = deriveActionAndObject(makeReq('DELETE', base, `/${UUID}/roles/FINANCE`));
      expect(r.action).toBe('admin.roles.delete');
    });

    it('DELETE /:id/roles/RISK_REVIEW → admin.roles.delete', () => {
      const r = deriveActionAndObject(makeReq('DELETE', base, `/${UUID}/roles/RISK_REVIEW`));
      expect(r.action).toBe('admin.roles.delete');
    });

    it('POST /pending-super/:id/approve → admin.approve', () => {
      const r = deriveActionAndObject(makeReq('POST', base, `/pending-super/${UUID}/approve`));
      expect(r.action).toBe('admin.approve');
      expect(r.objectType).toBe('admin');
      expect(r.objectId).toBe(UUID);
    });

    it('DELETE /pending-super/:id → admin.delete', () => {
      const r = deriveActionAndObject(makeReq('DELETE', base, `/pending-super/${UUID}`));
      expect(r.action).toBe('admin.delete');
      expect(r.objectType).toBe('admin');
    });
  });

  // ─── Cashback routes (/api/admin/cashback) ───────────────────────────────

  describe('cashback routes', () => {
    const base = '/api/admin/cashback';

    it('POST /entries/:id/approve → cashback.approve (not entries.approve)', () => {
      const r = deriveActionAndObject(makeReq('POST', base, `/entries/${UUID}/approve`));
      expect(r.action).toBe('cashback.approve');
      expect(r.objectType).toBe('cashback');
      expect(r.objectId).toBe(UUID);
    });

    it('POST /entries/:id/lock → cashback.lock', () => {
      const r = deriveActionAndObject(makeReq('POST', base, `/entries/${UUID}/lock`));
      expect(r.action).toBe('cashback.lock');
      expect(r.objectType).toBe('cashback');
    });

    it('POST /entries/:id/expire → cashback.expire', () => {
      const r = deriveActionAndObject(makeReq('POST', base, `/entries/${UUID}/expire`));
      expect(r.action).toBe('cashback.expire');
    });

    it('POST /entries/:id/pay → cashback.pay', () => {
      const r = deriveActionAndObject(makeReq('POST', base, `/entries/${UUID}/pay`));
      expect(r.action).toBe('cashback.pay');
    });

    it('POST /:partnerId/:month/mark-paid → cashback.mark-paid', () => {
      const r = deriveActionAndObject(makeReq('POST', base, `/${UUID}/2026-05/mark-paid`));
      expect(r.action).toBe('cashback.mark-paid');
      expect(r.objectType).toBe('cashback');
      expect(r.objectId).toBe(UUID);
    });
  });

  // ─── Partner routes (/api/admin/partners) ───────────────────────────────

  describe('partner routes', () => {
    const base = '/api/admin/partners';

    it('POST /:id/approve → partner.approve', () => {
      const r = deriveActionAndObject(makeReq('POST', base, `/${UUID}/approve`));
      expect(r.action).toBe('partner.approve');
      expect(r.objectType).toBe('partner');
    });

    it('PATCH /:id/status → partner.status', () => {
      const r = deriveActionAndObject(makeReq('PATCH', base, `/${UUID}/status`));
      expect(r.action).toBe('partner.status');
    });
  });

  // ─── Subscribers routes (/api/admin/subscribers) ────────────────────────

  describe('subscriber routes', () => {
    const base = '/api/admin/subscribers';

    it('PATCH /:id → subscriber.update', () => {
      const r = deriveActionAndObject(makeReq('PATCH', base, `/${UUID}`));
      expect(r.action).toBe('subscriber.update');
      expect(r.objectType).toBe('subscriber');
    });
  });
});
