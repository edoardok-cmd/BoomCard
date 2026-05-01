import { Router } from 'express';
import { MarketingChannel, CampaignStatus, AutomationStatus, MarketingListType, UserStatus } from '@prisma/client';
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
        // SMS provider not implemented — log only; do NOT count as dispatched
        const targetEmail = member.memberType === 'USER'
          ? member.user?.email
          : member.partner?.email ?? member.partner?.user?.email;
        logger.info(`[marketing] SMS dispatch skipped (no provider) for ${targetEmail ?? 'unknown'}`);
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
      if (dateTo)   (where.scheduledAt as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59.999Z');
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

// ─── Member search helpers ────────────────────────────────────────────────────

router.get('/users/search', ...READ, async (req, res, next) => {
  try {
    const { q = '' } = req.query as { q?: string };
    const term = q.trim();
    if (!term) return res.json([]);

    const users = await prisma.user.findMany({
      where: {
        status: { not: 'DELETED' as any },
        OR: [
          { email: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.get('/partners/search', ...READ, async (req, res, next) => {
  try {
    const { q = '' } = req.query as { q?: string };
    const term = q.trim();
    if (!term) return res.json([]);

    const partners = await prisma.partner.findMany({
      where: {
        OR: [
          { businessName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: { id: true, businessName: true, email: true, status: true },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    res.json(partners);
  } catch (error) {
    next(error);
  }
});

// ─── Lists ────────────────────────────────────────────────────────────────────

// Default lists that spec §8 requires to exist. Called by the frontend
// "Инициализирай списъци" button and also at app startup.
const DEFAULT_LISTS: Array<{
  syncKey: string;
  name: string;
  legacyNames?: string[];
  type: MarketingListType;
  description: string;
}> = [
  { syncKey: 'all_active_subscribers', name: 'Всички активни абонати', legacyNames: ['All Active Subscribers'],       type: 'SEGMENT', description: 'Потребители с активен абонамент, дали съгласие за маркетинг имейли.' },
  { syncKey: 'premium_holders',        name: 'Premium абонати',        legacyNames: ['Premium Card Holders'],         type: 'SEGMENT', description: 'Абонати с план Premium или Light (Weekly).' },
  { syncKey: 'basic_holders',          name: 'Basic абонати',          type: 'SEGMENT', description: 'Абонати с план Basic.' },
  { syncKey: 'inactive_users_90d',     name: 'Неактивни абонати (90+ дни)', legacyNames: ['Inactive Users — 90+ Days'], type: 'DYNAMIC', description: 'Потребители без активност повече от 90 дни. Обновява се нощем.' },
  { syncKey: 'email_consent_active',   name: 'Имейл съгласие — активно', legacyNames: ['Email Consent — Active'],    type: 'DYNAMIC', description: 'Всички потребители с marketingConsentEmail = true. Обновява се нощем.' },
  { syncKey: 'active_partners',        name: 'Активни партньори',      type: 'SEGMENT', description: 'Партньори със статус ACTIVE.' },
  { syncKey: 'potential_partners',     name: 'Потенциални партньори',   type: 'SEGMENT', description: 'Партньори в процес на одобрение (статус PENDING).' },
];

router.post('/lists/ensure-defaults', ...WRITE, async (req, res, next) => {
  try {
    const results: { syncKey: string; action: 'created' | 'updated' | 'ok' }[] = [];

    for (const def of DEFAULT_LISTS) {
      // 1. Canonical syncKey lookup
      let existing = await prisma.marketingList.findUnique({ where: { syncKey: def.syncKey } });
      // 2. Current BG name
      if (!existing) existing = await prisma.marketingList.findFirst({ where: { name: def.name } });
      // 3. Legacy English names (pre-i18n seed data)
      if (!existing && def.legacyNames) {
        for (const legacyName of def.legacyNames) {
          existing = await prisma.marketingList.findFirst({ where: { name: legacyName } });
          if (existing) break;
        }
      }

      if (!existing) {
        await prisma.marketingList.create({
          data: { syncKey: def.syncKey, name: def.name, type: def.type, description: def.description, size: 0 },
        });
        results.push({ syncKey: def.syncKey, action: 'created' });
      } else if (!existing.syncKey) {
        await prisma.marketingList.update({ where: { id: existing.id }, data: { syncKey: def.syncKey } });
        results.push({ syncKey: def.syncKey, action: 'updated' });
      } else {
        results.push({ syncKey: def.syncKey, action: 'ok' });
      }
    }

    res.json({ results });
  } catch (error) {
    next(error);
  }
});

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
          size: true, syncKey: true, updatedAt: true, createdAt: true,
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
        // Only allow manual size updates for STATIC lists; preserve the
        // cron-computed value for DYNAMIC/SEGMENT lists so a metadata edit
        // (rename, description update) never resets the nightly count to 0.
        size: type === 'STATIC' ? (size ?? existing.size) : existing.size,
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

    // Guard: block deletion if any non-DRAFT campaign references this list
    const activeCampaignCount = await prisma.marketingCampaign.count({
      where: { listId: req.params.id, status: { not: 'DRAFT' } },
    });
    if (activeCampaignCount > 0) {
      return res.status(409).json({
        error: `Списъкът се използва от ${activeCampaignCount} активна кампания(и). Архивирайте или изтрийте кампаниите първо.`,
      });
    }

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

// Spec §8 required: ensure the 4 mandatory automations exist in the DB.
// Idempotent — safe to call on every page load. Also fixes wrong trigger strings.
router.post('/automations/ensure-defaults', ...WRITE, async (req, res, next) => {
  try {
    // Fix any automations still using the retired cashback.milestone trigger
    const milestoneFix = await prisma.marketingAutomation.updateMany({
      where: { trigger: 'cashback.milestone' },
      data: { trigger: 'cashback.threshold_reached' },
    });

    // Find or create the required templates
    const findOrCreateTpl = async (
      name: string,
      data: { type: MarketingChannel; subject?: string; body: string },
    ) => {
      const existing = await prisma.marketingTemplate.findFirst({ where: { name } });
      if (existing) return existing;
      return prisma.marketingTemplate.create({ data: { name, ...data } });
    };

    const [tplCashbackEarned, tplCashbackExpiring, tplPartnerWelcome, tplPartnerApproved] =
      await Promise.all([
        prisma.marketingTemplate.findFirst({ where: { name: 'Cashback Earned Notification' } }),
        findOrCreateTpl('Cashback Expiring Soon', {
          type: 'EMAIL',
          subject: "Your BoomCard cashback is expiring soon — use it before it's gone",
          body: `<h2>Your cashback is about to expire!</h2>
<p>You have cashback credit on your BoomCard that is due to expire shortly. Make sure to spend it at any participating partner before it's lost.</p>
<p><strong>How to use it:</strong> Simply present your BoomCard at checkout at any partner location — your cashback will be applied automatically.</p>
<p>Find the nearest partner in the BoomCard app and start saving today.</p>
<p>The BoomCard Team</p>`,
        }),
        findOrCreateTpl('Partner Welcome Email', {
          type: 'EMAIL',
          subject: 'Welcome to the BoomCard Partner Network!',
          body: `<h2>Welcome aboard, partner!</h2>
<p>Thank you for joining the BoomCard Partner Network. Your application has been received and is currently under review.</p>
<p>Here's what happens next:</p>
<ul>
  <li>Our team will review your application within 1–2 business days</li>
  <li>You'll receive a confirmation email once your account is approved</li>
  <li>After approval, BoomCard members will start earning cashback at your location</li>
</ul>
<p>If you have any questions, reach out to <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>The BoomCard Team</p>`,
        }),
        findOrCreateTpl('Partner Approved', {
          type: 'EMAIL',
          subject: 'Congratulations — your BoomCard partner account is live!',
          body: `<h2>You're live on BoomCard!</h2>
<p>Great news — your partner account has been approved. BoomCard members can now earn cashback at your location.</p>
<p><strong>What this means for you:</strong></p>
<ul>
  <li>Your business is now visible to all BoomCard members in your area</li>
  <li>Members will earn cashback on every purchase they make at your location</li>
  <li>You can track visits and cashback activity in the BoomCard Partner Portal</li>
</ul>
<p>Log in to the Partner Portal to complete your profile and attract more customers.</p>
<p>Welcome to the network!</p>
<p>The BoomCard Team</p>`,
        }),
      ]);

    // Ensure each of the 4 spec-required automations exists (find by trigger)
    const specDefaults: Array<{
      trigger: string;
      name: string;
      templateId: string | null;
      status: AutomationStatus;
    }> = [
      {
        trigger: 'cashback.threshold_reached',
        name: 'Cashback Threshold Alert',
        templateId: tplCashbackEarned?.id ?? null,
        status: tplCashbackEarned ? 'ACTIVE' : 'DRAFT',
      },
      {
        trigger: 'cashback.expiring',
        name: 'Expiring Cashback Warning',
        templateId: tplCashbackExpiring?.id ?? null,
        status: 'ACTIVE',
      },
      {
        trigger: 'partner.created',
        name: 'New Partner Welcome',
        templateId: tplPartnerWelcome?.id ?? null,
        status: 'ACTIVE',
      },
      {
        trigger: 'partner.approved',
        name: 'Partner Approved Notification',
        templateId: tplPartnerApproved?.id ?? null,
        status: 'ACTIVE',
      },
    ];

    const results: { trigger: string; action: 'created' | 'ok' }[] = [];
    for (const def of specDefaults) {
      const existing = await prisma.marketingAutomation.findFirst({ where: { trigger: def.trigger } });
      if (!existing) {
        await prisma.marketingAutomation.create({ data: def });
        results.push({ trigger: def.trigger, action: 'created' });
      } else {
        results.push({ trigger: def.trigger, action: 'ok' });
      }
    }

    res.json({ results, milestoneTriggerFixed: milestoneFix.count });
  } catch (error) {
    next(error);
  }
});

router.get('/automations', ...READ, async (req, res, next) => {
  try {
    const { status, search, trigger, page = '1', limit = '25' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Parameters<typeof prisma.marketingAutomation.findMany>[0]['where'] = {};
    if (status && Object.values(AutomationStatus).includes(status as AutomationStatus)) {
      where.status = status as AutomationStatus;
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (trigger) {
      where.trigger = { contains: trigger, mode: 'insensitive' };
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

    // Mirror the PATCH guard: cannot activate without a template
    if (status === 'ACTIVE' && !templateId) {
      return res.status(422).json({
        error: 'Cannot activate: automation has no template. Assign a template first.',
      });
    }

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

    // Guard: cannot activate an automation that has no template — it would fire but send nothing
    if (status === 'ACTIVE' && !existing.templateId) {
      return res.status(422).json({
        error: 'Cannot activate: automation has no template. Assign a template first.',
      });
    }

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
