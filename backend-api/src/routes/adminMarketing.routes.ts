import { Router } from 'express';
import { MarketingChannel, CampaignStatus, AutomationStatus, MarketingListType } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email.service';
import { sendWebPushToUser } from '../lib/webPush';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

const READ  = [requirePermission('marketing.read')];
const WRITE = [requirePermission('marketing.write')];

// ─── Templates ────────────────────────────────────────────────────────────────

router.get('/templates', ...READ, async (req, res, next) => {
  try {
    const { type, category, search, page = '1', limit = '25' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Parameters<typeof prisma.marketingTemplate.findMany>[0]['where'] = {};
    if (type && Object.values(MarketingChannel).includes(type as MarketingChannel)) {
      where.type = type as MarketingChannel;
    }
    if (category) {
      where.category = category;
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      prisma.marketingTemplate.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, type: true, category: true, subject: true,
          usageCount: true, lastUsed: true, createdAt: true, updatedAt: true,
        },
      }),
      prisma.marketingTemplate.count({ where }),
    ]);

    res.json({ items, total, page: parseInt(page), limit: take });
  } catch (error) {
    next(error);
  }
});

router.get('/templates/:id', ...READ, async (req, res, next) => {
  try {
    const item = await prisma.marketingTemplate.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/templates', ...WRITE, async (req, res, next) => {
  try {
    const { name, type, category, subject, body } = req.body as {
      name: string; type: MarketingChannel; category?: string; subject?: string; body?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!Object.values(MarketingChannel).includes(type)) return res.status(400).json({ error: 'invalid type' });

    const item = await prisma.marketingTemplate.create({
      data: {
        name: name.trim(),
        type,
        category: category?.trim() || null,
        subject: subject?.trim() || null,
        body: body?.trim() ?? '',
      },
    });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.put('/templates/:id', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { name, type, category, subject, body } = req.body as {
      name: string; type: MarketingChannel; category?: string; subject?: string; body?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!Object.values(MarketingChannel).includes(type)) return res.status(400).json({ error: 'invalid type' });

    const item = await prisma.marketingTemplate.update({
      where: { id: req.params.id },
      data: {
        name: name.trim(),
        type,
        category: category?.trim() || null,
        subject: subject?.trim() || null,
        body: body?.trim() ?? '',
      },
    });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.delete('/templates/:id', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    // Guard: block deletion if any ACTIVE automation references this template
    const activeAutomationCount = await prisma.marketingAutomation.count({
      where: { templateId: req.params.id, status: 'ACTIVE' },
    });
    if (activeAutomationCount > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${activeAutomationCount} active automation(s) use this template. Pause them first.`,
      });
    }

    await prisma.marketingTemplate.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ─── Campaigns ────────────────────────────────────────────────────────────────

const CAMPAIGN_SELECT = {
  id: true, name: true, type: true, status: true, audience: true,
  scheduledAt: true, sentAt: true, openRate: true, clickRate: true,
  templateId: true, listId: true,
  template: { select: { id: true, name: true } },
  list: { select: { id: true, name: true, size: true } },
  createdAt: true,
} as const;

async function resolveAudience(listId: string | null | undefined, fallback: number): Promise<number> {
  if (!listId) return fallback;
  const count = await prisma.marketingListMember.count({ where: { listId } });
  return count > 0 ? count : fallback;
}

// Dispatch a campaign to all list members. Returns dispatched count.
async function dispatchCampaign(campaignId: string): Promise<number> {
  const campaign = await prisma.marketingCampaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      list: {
        include: {
          members: {
            include: {
              partner: { select: { id: true, email: true, businessName: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
              user: { select: { id: true, email: true, firstName: true, lastName: true, marketingConsentEmail: true } },
            },
          },
        },
      },
    },
  });

  if (!campaign?.template || !campaign.list) return 0;

  const { template } = campaign;
  const members = campaign.list.members;
  let dispatched = 0;

  for (const member of members) {
    try {
      if (campaign.type === 'EMAIL') {
        let email: string | null = null;
        let recipientName = 'BoomCard member';

        if (member.memberType === 'USER' && member.user) {
          // Respect marketing consent for email
          if (!member.user.marketingConsentEmail) continue;
          email = member.user.email;
          recipientName = [member.user.firstName, member.user.lastName].filter(Boolean).join(' ') || recipientName;
        } else if (member.partner) {
          email = member.partner.email ?? member.partner.user?.email ?? null;
          recipientName = member.partner.businessName;
        }

        if (email) {
          const subject = template.subject ?? template.name;
          const html = template.body || `<p>${template.name}</p>`;
          await emailService.sendEmail({ to: email, subject, html });
          dispatched++;
        }
      } else if (campaign.type === 'PUSH') {
        const targetUserId = member.memberType === 'USER'
          ? member.userId
          : member.partner?.user?.id ?? null;
        if (targetUserId) {
          await sendWebPushToUser(targetUserId, {
            title: template.name,
            body: template.subject ?? template.name,
          });
          dispatched++;
        }
      } else if (campaign.type === 'SMS') {
        // SMS provider not implemented — log and skip
        const targetEmail = member.memberType === 'USER'
          ? member.user?.email
          : member.partner?.email ?? member.partner?.user?.email;
        logger.info(`[marketing] SMS dispatch skipped (no provider) for ${targetEmail ?? 'unknown'}`);
        dispatched++;
      }

      // For user members: also create an in-app notification
      if (member.memberType === 'USER' && member.userId) {
        await prisma.notification.create({
          data: {
            userId: member.userId,
            type: 'MARKETING',
            title: template.name,
            message: template.subject ?? template.name,
            priority: 'low',
          },
        });
      }
    } catch (err) {
      logger.error(`[marketing] dispatch error for member ${member.id}:`, err);
    }
  }

  // Increment template usage stats
  if (template.id) {
    await prisma.marketingTemplate.update({
      where: { id: template.id },
      data: { usageCount: { increment: 1 }, lastUsed: new Date() },
    });
  }

  return dispatched;
}

router.get('/campaigns', ...READ, async (req, res, next) => {
  try {
    const { status, type, search, dateFrom, dateTo, sortBy, sortDir, page = '1', limit = '25' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Parameters<typeof prisma.marketingCampaign.findMany>[0]['where'] = {};
    if (status && Object.values(CampaignStatus).includes(status as CampaignStatus)) {
      where.status = status as CampaignStatus;
    }
    if (type && Object.values(MarketingChannel).includes(type as MarketingChannel)) {
      where.type = type as MarketingChannel;
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (dateFrom || dateTo) {
      where.scheduledAt = {};
      if (dateFrom) (where.scheduledAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo)   (where.scheduledAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const SORT_FIELDS: Record<string, string> = { name: 'name', status: 'status', sentAt: 'sentAt', scheduledAt: 'scheduledAt', createdAt: 'createdAt' };
    const orderField = SORT_FIELDS[sortBy ?? ''] ?? 'createdAt';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [items, total] = await Promise.all([
      prisma.marketingCampaign.findMany({ where, skip, take, orderBy: { [orderField]: orderDir }, select: CAMPAIGN_SELECT }),
      prisma.marketingCampaign.count({ where }),
    ]);

    res.json({ items, total, page: parseInt(page), limit: take });
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id', ...READ, async (req, res, next) => {
  try {
    const item = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id }, select: CAMPAIGN_SELECT });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns', ...WRITE, async (req, res, next) => {
  try {
    const { name, type, status, scheduledAt, templateId, listId } = req.body as {
      name: string; type: MarketingChannel; status?: CampaignStatus;
      scheduledAt?: string; templateId?: string; listId?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!Object.values(MarketingChannel).includes(type)) return res.status(400).json({ error: 'invalid type' });

    const resolvedStatus = (status === 'SENT' || status === 'PAUSED') ? 'DRAFT' : (status ?? 'DRAFT');
    const audience = await resolveAudience(listId, 0);

    const item = await prisma.marketingCampaign.create({
      data: {
        name: name.trim(),
        type,
        status: resolvedStatus,
        audience,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        templateId: templateId || null,
        listId: listId || null,
      },
      select: CAMPAIGN_SELECT,
    });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.put('/campaigns/:id', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { name, type, status, scheduledAt, templateId, listId } = req.body as {
      name: string; type: MarketingChannel; status: CampaignStatus;
      scheduledAt?: string; templateId?: string; listId?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!Object.values(MarketingChannel).includes(type)) return res.status(400).json({ error: 'invalid type' });
    const allowedStatuses: CampaignStatus[] = ['DRAFT', 'SCHEDULED', 'PAUSED'];
    const resolvedStatus = allowedStatuses.includes(status) ? status : existing.status;

    const audience = await resolveAudience(listId, existing.audience);

    const item = await prisma.marketingCampaign.update({
      where: { id: req.params.id },
      data: {
        name: name.trim(),
        type,
        status: resolvedStatus,
        audience,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        templateId: templateId || null,
        listId: listId || null,
      },
      select: CAMPAIGN_SELECT,
    });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.patch('/campaigns/:id/status', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { status } = req.body as { status: CampaignStatus };
    if (!Object.values(CampaignStatus).includes(status)) return res.status(400).json({ error: 'invalid status' });

    // Guard: sending requires a template and a non-empty audience list
    if (status === 'SENT' && existing.status !== 'SENT') {
      if (!existing.templateId) {
        return res.status(422).json({ error: 'Cannot send: campaign has no template. Assign a template first.' });
      }
      if (!existing.listId) {
        return res.status(422).json({ error: 'Cannot send: campaign has no audience list. Assign a list first.' });
      }
      const memberCount = await prisma.marketingListMember.count({ where: { listId: existing.listId } });
      if (memberCount === 0) {
        return res.status(422).json({ error: 'Cannot send: the audience list has 0 members.' });
      }
    }

    const extraData: Record<string, unknown> = {};
    if (status === 'SENT' && existing.status !== 'SENT') {
      extraData.sentAt = new Date();
    }
    if (status === 'DRAFT') {
      extraData.sentAt = null;
    }

    const item = await prisma.marketingCampaign.update({
      where: { id: req.params.id },
      data: { status, ...extraData },
      select: CAMPAIGN_SELECT,
    });

    // Dispatch after status is recorded — errors are non-fatal (campaign is already SENT)
    if (status === 'SENT' && existing.status !== 'SENT') {
      dispatchCampaign(req.params.id)
        .then((count) => {
          logger.info(`[marketing] campaign ${req.params.id} dispatched to ${count} recipients`);
          return prisma.marketingCampaign.update({
            where: { id: req.params.id },
            data: { audience: count },
          });
        })
        .catch((err) => logger.error('[marketing] dispatch error:', err));
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.delete('/campaigns/:id', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.marketingCampaign.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ─── Lists ────────────────────────────────────────────────────────────────────

router.get('/lists', ...READ, async (req, res, next) => {
  try {
    const { type, search, page = '1', limit = '25' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Parameters<typeof prisma.marketingList.findMany>[0]['where'] = {};
    if (type && Object.values(MarketingListType).includes(type as MarketingListType)) {
      where.type = type as MarketingListType;
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      prisma.marketingList.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, type: true, description: true,
          size: true, updatedAt: true, createdAt: true,
        },
      }),
      prisma.marketingList.count({ where }),
    ]);

    res.json({ items, total, page: parseInt(page), limit: take });
  } catch (error) {
    next(error);
  }
});

router.get('/lists/:id', ...READ, async (req, res, next) => {
  try {
    const item = await prisma.marketingList.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/lists', ...WRITE, async (req, res, next) => {
  try {
    const { name, type, description, size } = req.body as {
      name: string; type: MarketingListType; description?: string; size?: number;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!Object.values(MarketingListType).includes(type)) return res.status(400).json({ error: 'invalid type' });

    const item = await prisma.marketingList.create({
      data: {
        name: name.trim(),
        type,
        description: description?.trim() ?? '',
        size: size ?? 0,
      },
    });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.put('/lists/:id', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingList.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { name, type, description, size } = req.body as {
      name: string; type: MarketingListType; description?: string; size?: number;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!Object.values(MarketingListType).includes(type)) return res.status(400).json({ error: 'invalid type' });

    const item = await prisma.marketingList.update({
      where: { id: req.params.id },
      data: {
        name: name.trim(),
        type,
        description: description?.trim() ?? '',
        size: size ?? 0,
      },
    });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.delete('/lists/:id', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingList.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.marketingList.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// List members — add/remove partners and users from a list
router.get('/lists/:id/members', ...READ, async (req, res, next) => {
  try {
    const list = await prisma.marketingList.findUnique({ where: { id: req.params.id } });
    if (!list) return res.status(404).json({ error: 'Not found' });

    const members = await prisma.marketingListMember.findMany({
      where: { listId: req.params.id },
      include: {
        partner: { select: { id: true, businessName: true, email: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { addedAt: 'desc' },
    });
    res.json(members);
  } catch (error) {
    next(error);
  }
});

router.post('/lists/:id/members', ...WRITE, async (req, res, next) => {
  try {
    const list = await prisma.marketingList.findUnique({ where: { id: req.params.id } });
    if (!list) return res.status(404).json({ error: 'Not found' });

    const { partnerId, userId } = req.body as { partnerId?: string; userId?: string };
    if (!partnerId && !userId) return res.status(400).json({ error: 'partnerId or userId is required' });
    if (partnerId && userId) return res.status(400).json({ error: 'provide either partnerId or userId, not both' });

    const memberType = userId ? 'USER' : 'PARTNER';

    // Verify the target entity exists
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) return res.status(404).json({ error: 'User not found' });
    }
    if (partnerId) {
      const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
      if (!partner) return res.status(404).json({ error: 'Partner not found' });
    }

    const member = await prisma.marketingListMember.create({
      data: { listId: req.params.id, memberType, partnerId: partnerId || null, userId: userId || null },
      include: {
        partner: { select: { id: true, businessName: true, email: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    // Keep list.size in sync
    const count = await prisma.marketingListMember.count({ where: { listId: req.params.id } });
    await prisma.marketingList.update({ where: { id: req.params.id }, data: { size: count } });

    res.status(201).json(member);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Member already in this list' });
    }
    next(error);
  }
});

router.delete('/lists/:id/members/:memberId', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingListMember.findFirst({
      where: { id: req.params.memberId, listId: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.marketingListMember.delete({ where: { id: req.params.memberId } });

    // Keep list.size in sync
    const count = await prisma.marketingListMember.count({ where: { listId: req.params.id } });
    await prisma.marketingList.update({ where: { id: req.params.id }, data: { size: count } });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ─── Automations ──────────────────────────────────────────────────────────────

router.get('/automations', ...READ, async (req, res, next) => {
  try {
    const { status, page = '1', limit = '25' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Parameters<typeof prisma.marketingAutomation.findMany>[0]['where'] = {};
    if (status && Object.values(AutomationStatus).includes(status as AutomationStatus)) {
      where.status = status as AutomationStatus;
    }

    const [items, total] = await Promise.all([
      prisma.marketingAutomation.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, trigger: true, status: true,
          totalRuns: true, lastRunAt: true, createdAt: true, templateId: true,
          template: { select: { id: true, name: true } },
        },
      }),
      prisma.marketingAutomation.count({ where }),
    ]);

    res.json({ items, total, page: parseInt(page), limit: take });
  } catch (error) {
    next(error);
  }
});

router.get('/automations/:id', ...READ, async (req, res, next) => {
  try {
    const item = await prisma.marketingAutomation.findUnique({
      where: { id: req.params.id },
      include: { template: { select: { id: true, name: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/automations', ...WRITE, async (req, res, next) => {
  try {
    const { name, trigger, status, templateId } = req.body as {
      name: string; trigger: string; status?: AutomationStatus; templateId?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!trigger?.trim()) return res.status(400).json({ error: 'trigger is required' });

    const item = await prisma.marketingAutomation.create({
      data: {
        name: name.trim(),
        trigger: trigger.trim(),
        status: status ?? 'DRAFT',
        templateId: templateId || null,
      },
      include: { template: { select: { id: true, name: true } } },
    });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.put('/automations/:id', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingAutomation.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { name, trigger, status, templateId } = req.body as {
      name: string; trigger: string; status: AutomationStatus; templateId?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!trigger?.trim()) return res.status(400).json({ error: 'trigger is required' });
    if (!Object.values(AutomationStatus).includes(status)) return res.status(400).json({ error: 'invalid status' });

    const item = await prisma.marketingAutomation.update({
      where: { id: req.params.id },
      data: {
        name: name.trim(),
        trigger: trigger.trim(),
        status,
        templateId: templateId || null,
      },
      include: { template: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

// Lightweight status-only toggle — avoids full PUT round-trip for pause/activate
router.patch('/automations/:id/status', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingAutomation.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { status } = req.body as { status: AutomationStatus };
    if (!Object.values(AutomationStatus).includes(status)) return res.status(400).json({ error: 'invalid status' });

    const item = await prisma.marketingAutomation.update({
      where: { id: req.params.id },
      data: { status },
      include: { template: { select: { id: true, name: true } } },
    });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.delete('/automations/:id', ...WRITE, async (req, res, next) => {
  try {
    const existing = await prisma.marketingAutomation.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.marketingAutomation.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
