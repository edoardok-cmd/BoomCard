/**
 * Partner Types Routes (Admin only)
 *
 * Provides CRUD for PartnerType records and management of
 * PlanTypeAccess rules — replacing the hardcoded PLAN_REDEEMABLE_TIERS
 * and PARTNER_TIER_MAX_DISCOUNT constants.
 */

import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { partnerTypeService } from '../services/partnerType.service';
import { SubscriptionPlan } from '@prisma/client';
import { CASHBACK_MATRIX_STEPS } from '../constants/receipt.constants';

const router = Router();

// All routes require admin authentication
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

// ────────────────────────────────────────────────────────────
// GET /api/admin/partner-types
// List all partner types with partner counts and plan access
// ────────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const types = await partnerTypeService.getAllTypes();
    res.json({ success: true, data: types });
  }),
);

// ────────────────────────────────────────────────────────────
// POST /api/admin/partner-types
// Create a new partner type
// ────────────────────────────────────────────────────────────
router.post(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, nameBg, description, descriptionBg, maxDiscountRate, color, sortOrder, isActive } = req.body;

    if (!name || maxDiscountRate === undefined) {
      return res.status(400).json({ success: false, error: 'name and maxDiscountRate are required' });
    }

    const rate = Number(maxDiscountRate);
    if (!isFinite(rate) || !(CASHBACK_MATRIX_STEPS as readonly number[]).includes(rate)) {
      return res.status(400).json({
        success: false,
        error: `maxDiscountRate must be one of: ${CASHBACK_MATRIX_STEPS.join(', ')}`,
      });
    }

    try {
      const type = await partnerTypeService.createType({
        name: String(name).trim(),
        nameBg: nameBg ? String(nameBg).trim() : undefined,
        description: description ? String(description).trim() : undefined,
        descriptionBg: descriptionBg ? String(descriptionBg).trim() : undefined,
        maxDiscountRate: rate,
        color: color ? String(color).trim() : '#6b7280',
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      });
      res.status(201).json({ success: true, data: type });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({ success: false, error: `A partner type named "${name}" already exists` });
      }
      throw err;
    }
  }),
);

// ────────────────────────────────────────────────────────────
// PUT /api/admin/partner-types/:id
// Update a partner type
// ────────────────────────────────────────────────────────────
router.put(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, nameBg, description, descriptionBg, maxDiscountRate, color, sortOrder, isActive } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (nameBg !== undefined) updateData.nameBg = nameBg ? String(nameBg).trim() : null;
    if (description !== undefined) updateData.description = description ? String(description).trim() : null;
    if (descriptionBg !== undefined) updateData.descriptionBg = descriptionBg ? String(descriptionBg).trim() : null;
    if (color !== undefined) updateData.color = String(color).trim();
    if (sortOrder !== undefined) updateData.sortOrder = Number(sortOrder);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (maxDiscountRate !== undefined) {
      const rate = Number(maxDiscountRate);
      if (!isFinite(rate) || !(CASHBACK_MATRIX_STEPS as readonly number[]).includes(rate)) {
        return res.status(400).json({
          success: false,
          error: `maxDiscountRate must be one of: ${CASHBACK_MATRIX_STEPS.join(', ')}`,
        });
      }
      updateData.maxDiscountRate = rate;
    }

    try {
      const type = await partnerTypeService.updateType(req.params.id, updateData);
      res.json({ success: true, data: type });
    } catch (err: any) {
      if (err.message === 'Partner type not found') return res.status(404).json({ success: false, error: err.message });
      if (err.code === 'P2002') {
        return res.status(409).json({ success: false, error: `A partner type with that name already exists` });
      }
      throw err;
    }
  }),
);

// ────────────────────────────────────────────────────────────
// DELETE /api/admin/partner-types/:id
// Delete a partner type (blocked if partners are assigned)
// ────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      await partnerTypeService.deleteType(req.params.id);
      res.json({ success: true, message: 'Partner type deleted' });
    } catch (err: any) {
      if (err.message === 'Partner type not found') return res.status(404).json({ success: false, error: err.message });
      if (err.message.startsWith('Cannot delete')) return res.status(409).json({ success: false, error: err.message });
      throw err;
    }
  }),
);

// ────────────────────────────────────────────────────────────
// GET /api/admin/partner-types/:id/plan-access
// Get plan access rules for a partner type
// ────────────────────────────────────────────────────────────
router.get(
  '/:id/plan-access',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const type = await partnerTypeService.getTypeById(req.params.id);
    if (!type) return res.status(404).json({ success: false, error: 'Partner type not found' });

    const access = await partnerTypeService.getPlanAccess(req.params.id);
    res.json({ success: true, data: access });
  }),
);

// ────────────────────────────────────────────────────────────
// PUT /api/admin/partner-types/:id/plan-access
// Replace all plan access rules for a partner type
// Body: { rules: [{ plan: "BASIC", canView: true, canRedeem: true }, ...] }
// ────────────────────────────────────────────────────────────
router.put(
  '/:id/plan-access',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ success: false, error: 'rules must be an array' });
    }

    const validPlans = Object.values(SubscriptionPlan);
    for (const rule of rules) {
      if (!validPlans.includes(rule.plan)) {
        return res.status(400).json({
          success: false,
          error: `Invalid plan "${rule.plan}". Must be one of: ${validPlans.join(', ')}`,
        });
      }
    }

    try {
      const access = await partnerTypeService.setPlanAccess(req.params.id, rules);
      res.json({ success: true, data: access });
    } catch (err: any) {
      if (err.message === 'Partner type not found') return res.status(404).json({ success: false, error: err.message });
      throw err;
    }
  }),
);

export default router;
