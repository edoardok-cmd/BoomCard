import { SubscriptionPlan } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CreatePartnerTypeData {
  name: string;
  nameBg?: string;
  description?: string;
  descriptionBg?: string;
  maxDiscountRate: number;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdatePartnerTypeData extends Partial<CreatePartnerTypeData> {}

export interface PlanAccessRule {
  plan: SubscriptionPlan;
  canView: boolean;
  canRedeem: boolean;
}

class PartnerTypeService {
  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async getAllTypes() {
    return prisma.partnerType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { partners: true } },
        planAccess: true,
      },
    });
  }

  async getActiveTypes() {
    return prisma.partnerType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getTypeById(id: string) {
    return prisma.partnerType.findUnique({
      where: { id },
      include: {
        _count: { select: { partners: true } },
        planAccess: true,
      },
    });
  }

  async createType(data: CreatePartnerTypeData) {
    if (data.maxDiscountRate < 0 || data.maxDiscountRate > 100) {
      throw new Error('maxDiscountRate must be between 0 and 100');
    }
    return prisma.partnerType.create({ data });
  }

  async updateType(id: string, data: UpdatePartnerTypeData) {
    if (data.maxDiscountRate !== undefined && (data.maxDiscountRate < 0 || data.maxDiscountRate > 100)) {
      throw new Error('maxDiscountRate must be between 0 and 100');
    }
    const existing = await prisma.partnerType.findUnique({ where: { id } });
    if (!existing) throw new Error('Partner type not found');
    return prisma.partnerType.update({ where: { id }, data });
  }

  async deleteType(id: string) {
    const existing = await prisma.partnerType.findUnique({
      where: { id },
      include: { _count: { select: { partners: true } } },
    });
    if (!existing) throw new Error('Partner type not found');
    if (existing._count.partners > 0) {
      throw new Error(
        `Cannot delete partner type "${existing.name}" — ${existing._count.partners} partner(s) are assigned to it. Reassign them first.`,
      );
    }
    await prisma.partnerType.delete({ where: { id } });
  }

  // ─── Plan Access ─────────────────────────────────────────────────────────────

  async getPlanAccess(partnerTypeId: string) {
    return prisma.planTypeAccess.findMany({
      where: { partnerTypeId },
      orderBy: { plan: 'asc' },
    });
  }

  /**
   * Replace all plan-access rules for a partner type in one atomic operation.
   */
  async setPlanAccess(partnerTypeId: string, rules: PlanAccessRule[]) {
    const existing = await prisma.partnerType.findUnique({ where: { id: partnerTypeId } });
    if (!existing) throw new Error('Partner type not found');

    await prisma.$transaction([
      prisma.planTypeAccess.deleteMany({ where: { partnerTypeId } }),
      prisma.planTypeAccess.createMany({
        data: rules.map(r => ({ partnerTypeId, plan: r.plan, canView: r.canView, canRedeem: r.canRedeem })),
      }),
    ]);

    return prisma.planTypeAccess.findMany({ where: { partnerTypeId }, orderBy: { plan: 'asc' } });
  }

  // ─── Access Helpers (replace hardcoded constants) ─────────────────────────────

  /**
   * Returns IDs of partner types whose offers a user on the given plan can REDEEM.
   * Admins should bypass this (pass isAdmin=true to skip).
   * null plan = unauthenticated user.
   */
  async getRedeemableTypeIdsForPlan(plan: SubscriptionPlan | null): Promise<string[]> {
    if (plan === null) {
      // Unauthenticated: only types explicitly granted canRedeem to LIGHT
      // (treat as least-permissive plan, same as before)
      const rows = await prisma.planTypeAccess.findMany({
        where: { plan: SubscriptionPlan.LIGHT, canRedeem: true },
        select: { partnerTypeId: true },
      });
      return rows.map(r => r.partnerTypeId);
    }
    const rows = await prisma.planTypeAccess.findMany({
      where: { plan, canRedeem: true },
      select: { partnerTypeId: true },
    });
    return rows.map(r => r.partnerTypeId);
  }

  /**
   * Returns IDs of partner types whose offers a user on the given plan can VIEW.
   * null plan = unauthenticated.
   */
  async getVisibleTypeIdsForPlan(plan: SubscriptionPlan | null): Promise<string[] | null> {
    // If every active partner type is visible to the plan, return null (no filter)
    const allTypes = await prisma.partnerType.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const effectivePlan = plan ?? SubscriptionPlan.LIGHT;
    const visibleRows = await prisma.planTypeAccess.findMany({
      where: { plan: effectivePlan, canView: true },
      select: { partnerTypeId: true },
    });
    const visibleIds = visibleRows.map(r => r.partnerTypeId);

    if (visibleIds.length >= allTypes.length) return null; // all visible — no filter needed
    return visibleIds;
  }

  /**
   * Returns the max discount rate for a partner type.
   */
  async getMaxDiscountForType(partnerTypeId: string): Promise<number> {
    const type = await prisma.partnerType.findUnique({
      where: { id: partnerTypeId },
      select: { maxDiscountRate: true },
    });
    if (!type) throw new Error('Partner type not found');
    return type.maxDiscountRate;
  }
}

export const partnerTypeService = new PartnerTypeService();
