import { Router } from 'express';
import { MarketingChannel, CampaignStatus, AutomationStatus, MarketingListType, UserStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email.service';
import { smsService } from '../services/sms.service';
import { notificationService } from '../services/notification.service';
import { sendWebPushToUser } from '../lib/webPush';
import { logger } from '../utils/logger';
import { syncMarketingListSizes } from '../jobs/scheduler';
import { getOrCreateUnsubscribeToken, buildUnsubscribeUrl, addUnsubscribeFooter } from '../lib/unsubscribeToken';
import { parsePagination } from '../utils/pagination';
import { detach } from '../utils/detach';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

const READ  = [requirePermission('marketing.read')];
const WRITE = [requirePermission('marketing.write')];

// ─── Templates ────────────────────────────────────────────────────────────────

router.get('/templates', ...READ, async (req, res, next) => {
  try {
    const { type, category, search } = req.query as Record<string, string>;
    const { skip, take, page: pageNum, limit: limitNum } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });

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

    res.json({ items, total, page: pageNum, limit: limitNum });
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
    const { name, type, category, subject, subjectEn, body, bodyEn } = req.body as {
      name: string; type: MarketingChannel; category?: string; subject?: string; subjectEn?: string; body?: string; bodyEn?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    if (!Object.values(MarketingChannel).includes(type)) return res.status(400).json({ error: 'invalid type' });

    const item = await prisma.marketingTemplate.create({
      data: {
        name: name.trim(),
        type,
        category: category?.trim() || null,
        subject: subject?.trim() || null,
        subjectEn: subjectEn?.trim() || null,
        body: body?.trim() ?? '',
        bodyEn: bodyEn?.trim() || null,
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

    const { name, type, category, subject, subjectEn, body, bodyEn } = req.body as {
      name: string; type: MarketingChannel; category?: string; subject?: string; subjectEn?: string; body?: string; bodyEn?: string;
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
        subjectEn: subjectEn?.trim() || null,
        body: body?.trim() ?? '',
        bodyEn: bodyEn?.trim() || null,
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
  const list = await prisma.marketingList.findUnique({ where: { id: listId }, select: { size: true, syncKey: true } });
  if (!list) return fallback;
  // For auto-managed lists use the nightly-computed size; for STATIC use member row count
  if (list.syncKey) return list.size > 0 ? list.size : fallback;
  const count = await prisma.marketingListMember.count({ where: { listId } });
  return count > 0 ? count : fallback;
}

// Unified shape for both static-member and dynamic-list dispatch paths
type DispatchRecipient =
  | {
      kind: 'USER';
      userId: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      marketingConsent: boolean;
      marketingConsentEmail: boolean;
      marketingConsentPhone: boolean;
      phone: string;
      preferredLanguage: string;
    }
  | {
      kind: 'PARTNER';
      partnerId: string;
      email: string | null;
      businessName: string;
      linkedUserId: string | null;
      linkedUserEmail: string | null; // fallback when Partner.email is null
      linkedUserConsent: boolean | null; // channel-agnostic; null = no linked User → implicit B2B consent
      linkedUserConsentEmail: boolean | null; // email-specific; null = no linked User → implicit B2B consent
      linkedUserPhone: string | null;
      linkedUserConsentPhone: boolean | null;
    };

// Build recipients for auto-managed (DYNAMIC/SEGMENT) lists by re-running the
// same criteria used by syncMarketingListSizes — ensures campaigns actually fire.
async function buildRecipientsFromSyncKey(syncKey: string): Promise<DispatchRecipient[]> {
  const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const userSel = { id: true, email: true, firstName: true, lastName: true, marketingConsent: true, marketingConsentEmail: true, marketingConsentPhone: true, phone: true, preferredLanguage: true } as const;
  const toUser = (u: { id: string; email: string; firstName: string | null; lastName: string | null; marketingConsent: boolean; marketingConsentEmail: boolean; marketingConsentPhone: boolean; phone: string; preferredLanguage: string }): DispatchRecipient => ({
    kind: 'USER', userId: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, marketingConsent: u.marketingConsent, marketingConsentEmail: u.marketingConsentEmail, marketingConsentPhone: u.marketingConsentPhone, phone: u.phone, preferredLanguage: u.preferredLanguage,
  });

  const partnerSel = { id: true, email: true, businessName: true, user: { select: { id: true, email: true, marketingConsent: true, marketingConsentEmail: true, marketingConsentPhone: true, phone: true } } } as const;
  const toPartner = (p: { id: string; email: string | null; businessName: string; user: { id: string; email: string; marketingConsent: boolean; marketingConsentEmail: boolean; marketingConsentPhone: boolean; phone: string } | null }): DispatchRecipient => ({
    kind: 'PARTNER', partnerId: p.id, email: p.email, businessName: p.businessName,
    linkedUserId: p.user?.id ?? null, linkedUserEmail: p.user?.email ?? null, linkedUserConsent: p.user?.marketingConsent ?? null, linkedUserConsentEmail: p.user?.marketingConsentEmail ?? null,
    linkedUserPhone: p.user?.phone ?? null, linkedUserConsentPhone: p.user?.marketingConsentPhone ?? null,
  });

  switch (syncKey) {
    case 'all_active_subscribers': {
      const rows = await prisma.user.findMany({
        where: { status: { not: UserStatus.DELETED }, subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING'] } } } },
        select: userSel,
      });
      return rows.map(toUser);
    }
    case 'premium_holders': {
      const rows = await prisma.user.findMany({
        where: { status: { not: UserStatus.DELETED }, subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING'] }, plan: { in: ['PREMIUM_MONTHLY', 'PREMIUM_WEEKLY'] as any } } } },
        select: userSel,
      });
      return rows.map(toUser);
    }
    case 'basic_holders': {
      const rows = await prisma.user.findMany({
        where: { status: { not: UserStatus.DELETED }, subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING'] }, plan: 'BASIC' } } },
        select: userSel,
      });
      return rows.map(toUser);
    }
    case 'inactive_users_90d': {
      const rows = await prisma.user.findMany({
        where: {
          status: { not: UserStatus.DELETED },
          subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } } },
          OR: [{ lastActivityAt: { lt: cutoff90d } }, { lastActivityAt: null, createdAt: { lt: cutoff90d } }],
        },
        select: userSel,
      });
      return rows.map(toUser);
    }
    case 'email_consent_active': {
      const rows = await prisma.user.findMany({
        where: { marketingConsentEmail: true, status: { not: UserStatus.DELETED } },
        select: userSel,
      });
      return rows.map(toUser);
    }
    case 'active_partners': {
      const rows = await prisma.partner.findMany({ where: { status: 'ACTIVE' }, select: partnerSel });
      return rows.map(toPartner);
    }
    case 'potential_partners': {
      const rows = await prisma.partner.findMany({ where: { status: 'PENDING' }, select: partnerSel });
      return rows.map(toPartner);
    }
    default:
      logger.warn(`[marketing] Unknown syncKey "${syncKey}" — no dynamic recipients built`);
      return [];
  }
}

// Dispatch a campaign to all recipients. Returns dispatched count.
async function dispatchCampaign(campaignId: string): Promise<number> {
  const campaign = await prisma.marketingCampaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      list: {
        include: {
          members: {
            include: {
              partner: {
                select: { id: true, email: true, businessName: true, user: { select: { id: true, email: true, marketingConsent: true, marketingConsentEmail: true, marketingConsentPhone: true, phone: true } } },
              },
              user: { select: { id: true, email: true, firstName: true, lastName: true, marketingConsent: true, marketingConsentEmail: true, marketingConsentPhone: true, phone: true, preferredLanguage: true } },
            },
          },
        },
      },
    },
  });

  if (!campaign?.template || !campaign.list) return 0;

  const { template, list } = campaign;

  // For auto-managed lists (DYNAMIC/SEGMENT) build recipients from live DB query so
  // campaigns are never silently empty just because member rows were never populated.
  const recipients: DispatchRecipient[] = list.syncKey
    ? await buildRecipientsFromSyncKey(list.syncKey)
    : list.members.map((m): DispatchRecipient => {
        if (m.memberType === 'USER' && m.user) {
          return { kind: 'USER', userId: m.user.id, email: m.user.email, firstName: m.user.firstName, lastName: m.user.lastName, marketingConsent: m.user.marketingConsent, marketingConsentEmail: m.user.marketingConsentEmail, marketingConsentPhone: m.user.marketingConsentPhone, phone: m.user.phone, preferredLanguage: m.user.preferredLanguage };
        }
        return {
          kind: 'PARTNER',
          partnerId: m.partnerId!,
          email: m.partner?.email ?? null,
          businessName: m.partner?.businessName ?? '',
          linkedUserId: m.partner?.user?.id ?? null,
          linkedUserEmail: m.partner?.user?.email ?? null,
          linkedUserConsent: m.partner?.user?.marketingConsent ?? null,
          linkedUserConsentEmail: m.partner?.user?.marketingConsentEmail ?? null,
          linkedUserPhone: m.partner?.user?.phone ?? null,
          linkedUserConsentPhone: m.partner?.user?.marketingConsentPhone ?? null,
        };
      });

  let dispatched = 0;

  for (const recipient of recipients) {
    try {
      if (campaign.type === 'EMAIL') {
        let email: string | null = null;
        let recipientName = 'BoomCard member';

        if (recipient.kind === 'USER') {
          if (!recipient.marketingConsentEmail) continue;
          email = recipient.email;
          recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || recipientName;
        } else {
          // Partner email: respect explicit opt-out by linked User; null = no linked User = send
          if (recipient.linkedUserConsentEmail === false) continue;
          email = recipient.email ?? recipient.linkedUserEmail;
          recipientName = recipient.businessName;
        }

        if (email) {
          const useEn = recipient.kind === 'USER' && recipient.preferredLanguage === 'en';
          const subject = (useEn && template.subjectEn) ? template.subjectEn : (template.subject ?? template.name);
          let html = (useEn && template.bodyEn) ? template.bodyEn : (template.body || `<p>${template.name}</p>`);

          // §12 — append unsubscribe footer + RFC 8058 headers for every marketing email
          const unsubUserId = recipient.kind === 'USER' ? recipient.userId : recipient.linkedUserId;
          if (unsubUserId) {
            const unsubToken = await getOrCreateUnsubscribeToken(unsubUserId);
            const unsubUrl = buildUnsubscribeUrl(unsubToken);
            html = addUnsubscribeFooter(html, unsubUrl);
            await emailService.sendEmail({
              to: email,
              subject,
              html,
              headers: {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            });
          } else {
            await emailService.sendEmail({ to: email, subject, html });
          }
          dispatched++;
        }
      } else if (campaign.type === 'PUSH') {
        if (recipient.kind === 'USER' && !recipient.marketingConsent) continue;
        if (recipient.kind === 'PARTNER' && recipient.linkedUserConsent === false) continue;
        const targetUserId = recipient.kind === 'USER' ? recipient.userId : recipient.linkedUserId;
        if (targetUserId) {
          await sendWebPushToUser(targetUserId, { title: template.name, body: template.subject ?? template.name });
          dispatched++;
        }
      } else if (campaign.type === 'SMS') {
        const useEn = recipient.kind === 'USER' && recipient.preferredLanguage === 'en';
        const smsText = (useEn && template.bodyEn) ? template.bodyEn : (template.body || template.name);
        // Strip HTML tags in case template body was authored with HTML markup
        const plainText = smsText.replace(/<[^>]*>/g, '').trim();

        if (recipient.kind === 'USER') {
          if (!recipient.phone || !recipient.marketingConsentPhone) continue;
          await smsService.sendSms(recipient.phone, plainText);
          dispatched++;
        } else if (recipient.kind === 'PARTNER') {
          // Partners receive SMS via their linked User's phone (same consent gate as push/in-app).
          // linkedUserConsentPhone === null means no linked User → skip (cannot reliably obtain phone).
          if (!recipient.linkedUserPhone || recipient.linkedUserConsentPhone !== true) continue;
          await smsService.sendSms(recipient.linkedUserPhone, plainText);
          dispatched++;
        }
      }

      // In-app notification: EMAIL and PUSH types, for both USER and PARTNER recipients (spec §9.1 template #8).
      // For USER recipients: create notification row directly.
      // For PARTNER recipients: call notifyPartnerMarketing() which respects the linked User's marketingConsent (spec §5.4).
      if (campaign.type !== 'SMS') {
        if (recipient.kind === 'USER' && recipient.marketingConsent) {
          await prisma.notification.create({
            data: { userId: recipient.userId, type: 'MARKETING', title: template.name, message: template.subject ?? template.name, priority: 'low' },
          });
        } else if (recipient.kind === 'PARTNER' && recipient.linkedUserId) {
          // Spec §9.1 template #8 (Marketing) is canonical. Partners receive in-app Marketing
          // via the linked User's notification context. notifyPartnerMarketing() enforces
          // marketingConsent gate (spec §5.4, Clash 6.1).
          await notificationService.notifyPartnerMarketing({
            partnerUserId: recipient.linkedUserId,
            title: template.name,
            message: template.subject ?? template.name,
            data: { campaignId },
          });
        }
      }
    } catch (err) {
      logger.error(`[marketing] dispatch error for recipient:`, err);
    }
  }

  // BUG 5: only mark the template "used" when at least one message was actually
  // sent. SMS templates previously incremented usageCount on every campaign even
  // though the dispatcher logs and drops the message — producing the contradictory
  // "БЕЗ ДОСТАВКА" badge with thousands of uses.
  if (template.id && dispatched > 0) {
    await prisma.marketingTemplate.update({
      where: { id: template.id },
      data: { usageCount: { increment: dispatched }, lastUsed: new Date() },
    });
  }

  return dispatched;
}

// Self-heal legacy SCHEDULED-without-scheduledAt rows. Runs at most once per
// process: the POST/PUT guards ensure no fresh rows can hit this state, so we
// don't need to re-check on every campaigns GET (was a side-effect on read).
const SCHEDULED_BACKFILL_FLAG = 'marketing.scheduled_backfill_v1';
let scheduledBackfillPromise: Promise<void> | null = null;
async function selfHealLegacyScheduled(): Promise<void> {
  if (scheduledBackfillPromise) return scheduledBackfillPromise;
  // NB: `.catch` binds tighter than `=`, so the cached promise IS the catch
  // chain — it never rejects to callers. The handler nulls the cache so the
  // next request retries; in-flight callers all resolve cleanly to undefined.
  scheduledBackfillPromise = (async () => {
    const flag = await prisma.systemSetting.findUnique({ where: { key: SCHEDULED_BACKFILL_FLAG } });
    if (flag) return;
    const broken = await prisma.marketingCampaign.count({
      where: { status: 'SCHEDULED', scheduledAt: null },
    });
    if (broken > 0) {
      await prisma.marketingCampaign.updateMany({
        where: { status: 'SCHEDULED', scheduledAt: null },
        data: { status: 'DRAFT' },
      });
      logger.info(`[marketing] one-shot self-heal: reset ${broken} SCHEDULED rows with no scheduledAt to DRAFT`);
    }
    await prisma.systemSetting.upsert({
      where: { key: SCHEDULED_BACKFILL_FLAG },
      create: { key: SCHEDULED_BACKFILL_FLAG, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
  })().catch((err) => {
    logger.error('[marketing] self-heal failed; will retry on next request', err);
    scheduledBackfillPromise = null;
  });
  return scheduledBackfillPromise;
}

router.get('/campaigns', ...READ, async (req, res, next) => {
  try {
    // Fire-and-await the one-shot legacy fix. After the first successful run
    // a SystemSetting flag short-circuits this on every subsequent request,
    // and the in-process promise prevents duplicate work mid-startup.
    await selfHealLegacyScheduled();

    const { status, type, search, dateFrom, dateTo, sortBy, sortDir } = req.query as Record<string, string>;
    const { skip, take, page: pageNum, limit: limitNum } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });

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

    res.json({ items, total, page: pageNum, limit: limitNum });
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

    // Spec §8: a SCHEDULED campaign must have a future send time. Otherwise
    // status and scheduledAt drift apart (BUG 2: "ПЛАНИРАНА with no date").
    if (resolvedStatus === 'SCHEDULED' && !scheduledAt) {
      return res.status(400).json({ error: 'Планираните кампании изискват дата и час за изпращане.' });
    }

    const audience = await resolveAudience(listId, 0);

    if (resolvedStatus === 'SCHEDULED' && listId && audience === 0) {
      return res.status(400).json({ error: 'Избраният списък няма получатели — изберете непразен списък преди планиране.' });
    }

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

    // Same scheduledAt invariant as POST — applies whether the status is being
    // changed to SCHEDULED or the row is already SCHEDULED and the field is being
    // cleared. Without this, an edit could break the invariant the create endpoint
    // enforces.
    if (resolvedStatus === 'SCHEDULED' && !scheduledAt) {
      return res.status(400).json({ error: 'Планираните кампании изискват дата и час за изпращане.' });
    }

    // Use fallback 0 when the caller explicitly passes a listId so the empty-list
    // guard below cannot be defeated by a stale existing.audience value.
    const audienceFallback = listId ? 0 : existing.audience;
    const audience = await resolveAudience(listId, audienceFallback);

    if (resolvedStatus === 'SCHEDULED' && listId && audience === 0) {
      return res.status(400).json({ error: 'Избраният списък няма получатели — изберете непразен списък преди планиране.' });
    }

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

    // Spec §8: SCHEDULED status requires a scheduledAt in the future.
    // The inline "Планирай" button used to flip status to SCHEDULED without
    // setting a date, leaving campaigns in the same broken state as BUG 2.
    if (status === 'SCHEDULED' && !existing.scheduledAt) {
      return res.status(400).json({ error: 'Не може да се планира кампания без дата и час. Редактирайте я и задайте време за изпращане.' });
    }

    // Mirror the SENT-with-empty-list guard for the SCHEDULED transition: a
    // scheduled campaign that fires against a 0-member list creates a phantom
    // dispatch with audience=0 and obscures real intent. Block it up-front.
    if (status === 'SCHEDULED' && existing.listId && existing.status !== 'SCHEDULED') {
      const audienceList = await prisma.marketingList.findUnique({
        where: { id: existing.listId },
        select: { size: true, syncKey: true },
      });
      const effectiveCount = audienceList?.syncKey
        ? (audienceList.size ?? 0)
        : await prisma.marketingListMember.count({ where: { listId: existing.listId } });
      if (effectiveCount === 0) {
        return res.status(422).json({ error: 'Не може да се планира: избраният списък няма получатели.' });
      }
    }

    // Guard: sending requires a template and a non-empty audience list
    if (status === 'SENT' && existing.status !== 'SENT') {
      if (!existing.templateId) {
        return res.status(422).json({ error: 'Cannot send: campaign has no template. Assign a template first.' });
      }
      if (!existing.listId) {
        return res.status(422).json({ error: 'Cannot send: campaign has no audience list. Assign a list first.' });
      }
      // For auto-managed (DYNAMIC/SEGMENT) lists the member rows are never populated;
      // use list.size which the nightly cron keeps accurate. For STATIC lists fall
      // back to an actual member count so we catch lists that were emptied manually.
      const audienceList = await prisma.marketingList.findUnique({
        where: { id: existing.listId },
        select: { size: true, syncKey: true },
      });
      const effectiveCount = audienceList?.syncKey
        ? (audienceList.size ?? 0)
        : await prisma.marketingListMember.count({ where: { listId: existing.listId } });
      if (effectiveCount === 0) {
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

    // Dispatch after status is recorded — errors are non-fatal (campaign is already SENT).
    // On success: audience is updated to the actual dispatched count.
    // On failure: audience is set to 0 so the admin can see the discrepancy and retry.
    if (status === 'SENT' && existing.status !== 'SENT') {
      detach(dispatchCampaign(req.params.id)
        .then((count) => {
          logger.info(`[marketing] campaign ${req.params.id} dispatched to ${count} recipients`);
          return prisma.marketingCampaign.update({
            where: { id: req.params.id },
            data: { audience: count, openRate: null, clickRate: null },
          });
        }), (err) => {
          logger.error('[marketing] dispatch error:', err);
          // The audience-reset write is a fire-and-forget DB call in the error
          // branch; register it through detach() so it settles inside this
          // request's test boundary instead of a later, unrelated suite's.
          detach(prisma.marketingCampaign.update({
            where: { id: req.params.id },
            data: { audience: 0 },
          }), (dbErr) => logger.error('[marketing] failed to reset audience on dispatch error:', dbErr));
        });
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
        status: { not: UserStatus.DELETED },
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
        status: { in: ['ACTIVE', 'PENDING', 'INACTIVE'] },
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
      } else {
        // Always normalise to canonical Bulgarian name/type/description and wire up syncKey.
        // Idempotent: if already correct the DB write is a no-op at the row level.
        await prisma.marketingList.update({
          where: { id: existing.id },
          data: { syncKey: def.syncKey, name: def.name, type: def.type, description: def.description },
        });
        results.push({ syncKey: def.syncKey, action: existing.syncKey ? 'ok' : 'updated' });
      }
    }

    // BUG 4: previously this endpoint just created the list rows and left
    // size=0 until the 2:30 AM cron — leaving segments visibly empty for hours
    // and confusing the operator into thinking "Инициализирай списъци" did nothing.
    // Run the size sync inline so counts reflect real data immediately.
    try {
      await syncMarketingListSizes();
    } catch (err) {
      logger.error('[marketing] inline list-size sync failed during ensure-defaults', err);
      // Non-fatal: the lists exist; counts will catch up at 2:30 AM.
    }

    res.json({
      results,
      note: 'Размерите са преизчислени на момента; нощен крон в 02:30 ги поддържа актуални.',
    });
  } catch (error) {
    next(error);
  }
});

// GAP 4: derive whom this list targets (subscribers vs partners vs mixed)
// so the operator can tell at a glance which campaigns it's appropriate for.
// Spec §8 talks about "campaigns to subscribers and partners" with segments
// for both, but the UI was previously agnostic about which.
const SUBSCRIBER_SYNC_KEYS = new Set([
  'all_active_subscribers', 'premium_holders', 'basic_holders',
  'inactive_users_90d', 'email_consent_active',
]);
const PARTNER_SYNC_KEYS = new Set(['active_partners', 'potential_partners']);

type AudienceKind = 'SUBSCRIBERS' | 'PARTNERS' | 'MIXED' | 'EMPTY';

// Resolve audienceKind for a batch of lists in a single SQL roundtrip
// (was N+1: 2 count() queries per list). For SEGMENT/DYNAMIC lists the
// member table is empty (size lives in MarketingList.size), so we fall
// back on `size > 0` → MIXED to avoid the prior bug where a 5670-member
// segment was labelled "празен".
async function deriveAudienceKindMap(
  lists: Array<{ id: string; syncKey: string | null; size: number; type: string }>,
): Promise<Record<string, AudienceKind>> {
  const out: Record<string, AudienceKind> = {};
  const needsMemberCount: string[] = [];

  for (const l of lists) {
    if (l.syncKey && SUBSCRIBER_SYNC_KEYS.has(l.syncKey)) { out[l.id] = 'SUBSCRIBERS'; continue; }
    if (l.syncKey && PARTNER_SYNC_KEYS.has(l.syncKey))    { out[l.id] = 'PARTNERS';    continue; }
    needsMemberCount.push(l.id);
  }

  if (needsMemberCount.length > 0) {
    const grouped = await prisma.marketingListMember.groupBy({
      by: ['listId', 'memberType'],
      where: { listId: { in: needsMemberCount } },
      _count: { _all: true },
    });
    const perList = new Map<string, { user: number; partner: number }>();
    for (const id of needsMemberCount) perList.set(id, { user: 0, partner: 0 });
    for (const g of grouped) {
      const bucket = perList.get(g.listId)!;
      if (g.memberType === 'USER')    bucket.user    += g._count._all;
      if (g.memberType === 'PARTNER') bucket.partner += g._count._all;
    }
    for (const l of lists) {
      if (out[l.id]) continue;
      const c = perList.get(l.id)!;
      if (c.user > 0 && c.partner > 0) out[l.id] = 'MIXED';
      else if (c.user > 0)             out[l.id] = 'SUBSCRIBERS';
      else if (c.partner > 0)          out[l.id] = 'PARTNERS';
      // SEGMENT/DYNAMIC custom lists materialise no member rows but
      // carry a size from the nightly cron — treat as MIXED rather than
      // the misleading EMPTY label.
      else if (l.size > 0)             out[l.id] = 'MIXED';
      else                             out[l.id] = 'EMPTY';
    }
  }

  return out;
}

router.get('/lists', ...READ, async (req, res, next) => {
  try {
    const { type, search } = req.query as Record<string, string>;
    const { skip, take, page: pageNum, limit: limitNum } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });

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

    const audienceMap = await deriveAudienceKindMap(items);
    const itemsWithAudience = items.map((l) => ({ ...l, audienceKind: audienceMap[l.id] ?? 'EMPTY' }));

    res.json({ items: itemsWithAudience, total, page: pageNum, limit: limitNum });
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

    // Guard: block deletion only if there are future-scheduled campaigns
    // (SCHEDULED or PAUSED may still send). SENT campaigns are immutable
    // historical records and should not block cleanup of their source list.
    const activeCampaignCount = await prisma.marketingCampaign.count({
      where: { listId: req.params.id, status: { in: ['SCHEDULED', 'PAUSED'] } },
    });
    if (activeCampaignCount > 0) {
      return res.status(409).json({
        error: `Списъкът се използва от ${activeCampaignCount} активна/планирана кампания(и). Изтрийте или дублирайте кампаниите първо.`,
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

    // DYNAMIC and SEGMENT lists are auto-managed by the scheduler. Allow manual
    // additions as admin exceptions but warn explicitly (and document in the response).
    const isDynamicManaged = list.type === 'DYNAMIC' || list.type === 'SEGMENT';

    const { partnerId, userId } = req.body as { partnerId?: string; userId?: string };
    if (!partnerId && !userId) return res.status(400).json({ error: 'partnerId or userId is required' });
    if (partnerId && userId) return res.status(400).json({ error: 'provide either partnerId or userId, not both' });

    const memberType = userId ? 'USER' : 'PARTNER';

    // Verify the target entity exists and guard against dual-role duplication:
    // a person can hold both a User and a Partner account; prevent them appearing
    // twice in the same list by checking the other role already present.
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Check if a Partner linked to this user already exists in the list
      const partnerDuplicate = await prisma.marketingListMember.findFirst({
        where: { listId: req.params.id, memberType: 'PARTNER', partner: { userId } },
      });
      if (partnerDuplicate) {
        return res.status(409).json({ error: 'This person is already a member of this list as a Partner. Adding them again as a User would create a duplicate.' });
      }
    }
    if (partnerId) {
      const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, userId: true } });
      if (!partner) return res.status(404).json({ error: 'Partner not found' });

      // Check if the partner's linked user already exists in the list
      if (partner.userId) {
        const userDuplicate = await prisma.marketingListMember.findFirst({
          where: { listId: req.params.id, memberType: 'USER', userId: partner.userId },
        });
        if (userDuplicate) {
          return res.status(409).json({ error: 'The user linked to this partner is already a member of this list. Adding the partner would create a duplicate.' });
        }
      }
    }

    const member = await prisma.marketingListMember.create({
      data: { listId: req.params.id, memberType, partnerId: partnerId || null, userId: userId || null },
      include: {
        partner: { select: { id: true, businessName: true, email: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    // Keep list.size in sync for STATIC lists; DYNAMIC/SEGMENT sizes are managed by cron
    if (!isDynamicManaged) {
      const count = await prisma.marketingListMember.count({ where: { listId: req.params.id } });
      await prisma.marketingList.update({ where: { id: req.params.id }, data: { size: count } });
    }

    res.status(201).json({ ...member, _warning: isDynamicManaged ? 'This is an auto-managed list. Manual members may be overwritten at the next nightly sync.' : undefined });
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

    // Fetch list type before delete to mirror the POST /members size-update guard
    const parentList = await prisma.marketingList.findUnique({ where: { id: req.params.id }, select: { type: true } });

    await prisma.marketingListMember.delete({ where: { id: req.params.memberId } });

    // Keep list.size in sync — DYNAMIC/SEGMENT sizes are managed by the nightly cron
    if (parentList?.type === 'STATIC') {
      const count = await prisma.marketingListMember.count({ where: { listId: req.params.id } });
      await prisma.marketingList.update({ where: { id: req.params.id }, data: { size: count } });
    }

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

    // BUG 5: SMS templates inherited a usageCount from before the dispatcher
    // counted only successful sends. Since the SMS provider has never been
    // wired up, none of those "uses" produced a delivery — reset to 0 so the
    // column matches reality and stops contradicting the "провайдър липсва" badge.
    // Gated behind a one-shot SystemSetting flag so future legitimate dispatch
    // counts (once a provider lands) are not wiped on every admin click.
    const SMS_RESET_FLAG = 'marketing.sms_usage_reset_v1';
    const smsResetFlag = await prisma.systemSetting.findUnique({ where: { key: SMS_RESET_FLAG } });
    const smsUsageReset = !smsResetFlag
      ? await prisma.marketingTemplate.updateMany({
          where: { type: 'SMS', usageCount: { gt: 0 } },
          data: { usageCount: 0, lastUsed: null },
        })
      : { count: 0 };
    if (!smsResetFlag) {
      await prisma.systemSetting.upsert({
        where: { key: SMS_RESET_FLAG },
        create: { key: SMS_RESET_FLAG, value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });
    }

    // Sync required templates — always update content so code is the source of truth.
    // Using find+update instead of upsert because template name has no unique DB constraint.
    const syncTpl = async (
      name: string,
      data: { type: MarketingChannel; category?: string; subject?: string; subjectEn?: string; body: string; bodyEn?: string },
    ) => {
      const existing = await prisma.marketingTemplate.findFirst({ where: { name } });
      if (existing) {
        return prisma.marketingTemplate.update({ where: { id: existing.id }, data });
      }
      return prisma.marketingTemplate.create({ data: { name, ...data } });
    };

    // Indices 0-3 are ACTIVE automations. 4-8 are new spec-required templates with their automations.
    // 9-10 (Registration, Support Contact) are free-standing templates used directly by emailService.
    const [
      tplCashbackEarned,
      tplCashbackExpiring,
      tplPartnerWelcome,
      tplPartnerApproved,
      tplPartnerMonthlySummary,
      tplSupportReply,
      tplInactiveUserNudge,
      tplPartnerTransaction,
    ] = await Promise.all([
      syncTpl('Cashback Earned Notification', {
        type: 'EMAIL',
        category: 'threshold',
        subject: 'Достигнахте ниво — вашият кешбек е начислен!',
        subjectEn: 'You reached a cashback milestone — your cashback has been credited!',
        body: `<h2>Достигнахте ниво за кешбек!</h2>
<p>Поздравления — натрупахте достатъчно покупки и кешбек е начислен по вашия BoomCard акаунт.</p>
<p>Продължете да пазарувате при партньорите ни и печелете още.</p>
<p>Екипът на BoomCard</p>`,
        bodyEn: `<h2>You reached a cashback milestone!</h2>
<p>Congratulations — you've made enough purchases and cashback has been credited to your BoomCard account.</p>
<p>Keep shopping at our partners and earn even more.</p>
<p>The BoomCard Team</p>`,
      }),
      syncTpl('Cashback Expiring Soon', {
        type: 'EMAIL',
        category: 'cashback',
        subject: 'Вашият кешбек в BoomCard изтича скоро — използвайте го навреме',
        subjectEn: 'Your BoomCard cashback is expiring soon — use it before it\'s gone',
        body: `<h2>Кешбекът ви предстои да изтече!</h2>
<p>Имате натрупан кешбек в BoomCard акаунта ви, който предстои да изтече. Не забравяйте да го използвате при някой от партньорите ни.</p>
<p><strong>Как да го използвате:</strong> Просто покажете вашата BoomCard карта при плащане в партньорски обект — кешбекът ще бъде приложен автоматично.</p>
<p>Намерете най-близкия партньор в приложението BoomCard и започнете да спестявате днес.</p>
<p>Екипът на BoomCard</p>`,
        bodyEn: `<h2>Your cashback is about to expire!</h2>
<p>You have accumulated cashback in your BoomCard account that is about to expire. Don't forget to use it at one of our partners.</p>
<p><strong>How to use it:</strong> Simply show your BoomCard card when paying at a partner location — your cashback will be applied automatically.</p>
<p>Find the nearest partner in the BoomCard app and start saving today.</p>
<p>The BoomCard Team</p>`,
      }),
      syncTpl('Partner Welcome Email', {
        type: 'EMAIL',
        category: 'partner_request',
        subject: 'Добре дошли в мрежата на партньорите на BoomCard!',
        subjectEn: 'Welcome to the BoomCard partner network!',
        body: `<h2>Добре дошли на борда, партньор!</h2>
<p>Благодарим ви, че се присъединихте към мрежата на партньорите на BoomCard. Вашата заявка е получена и в момента се разглежда.</p>
<p>Ето какво предстои:</p>
<ul>
  <li>Нашият екип ще разгледа заявката ви в рамките на 1–2 работни дни</li>
  <li>Ще получите имейл потвърждение след одобрение на акаунта</li>
  <li>След одобрение клиентите на BoomCard ще могат да натрупват кешбек при вас</li>
</ul>
<p>При въпроси се свържете с нас на <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>Екипът на BoomCard</p>`,
        bodyEn: `<h2>Welcome aboard, partner!</h2>
<p>Thank you for joining the BoomCard partner network. Your application has been received and is currently under review.</p>
<p>Here's what happens next:</p>
<ul>
  <li>Our team will review your application within 1–2 business days</li>
  <li>You'll receive an email confirmation once your account is approved</li>
  <li>After approval, BoomCard customers will be able to earn cashback at your location</li>
</ul>
<p>If you have any questions, contact us at <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>The BoomCard Team</p>`,
      }),
      syncTpl('Partner Approved', {
        type: 'EMAIL',
        category: 'onboarding',
        subject: 'Поздравления — вашият партньорски акаунт в BoomCard е активен!',
        subjectEn: 'Congratulations — your BoomCard partner account is now active!',
        body: `<h2>Вие сте активни в BoomCard!</h2>
<p>Страхотна новина — вашият партньорски акаунт е одобрен. Клиентите на BoomCard вече могат да натрупват кешбек при вас.</p>
<p><strong>Какво означава това за вас:</strong></p>
<ul>
  <li>Вашият бизнес вече е видим за всички потребители на BoomCard в района</li>
  <li>Потребителите ще натрупват кешбек при всяка покупка при вас</li>
  <li>Можете да следите посещенията и кешбек активността в партньорския портал на BoomCard</li>
</ul>
<p>Влезте в партньорския портал, за да попълните профила си и да привлечете повече клиенти.</p>
<p>Добре дошли в мрежата!</p>
<p>Екипът на BoomCard</p>`,
        bodyEn: `<h2>You're live on BoomCard!</h2>
<p>Great news — your partner account has been approved. BoomCard customers can now earn cashback at your location.</p>
<p><strong>What this means for you:</strong></p>
<ul>
  <li>Your business is now visible to all BoomCard users in the area</li>
  <li>Customers will earn cashback on every purchase they make with you</li>
  <li>You can track visits and cashback activity in the BoomCard partner portal</li>
</ul>
<p>Log in to the partner portal to complete your profile and attract more customers.</p>
<p>Welcome to the network!</p>
<p>The BoomCard Team</p>`,
      }),
      // Spec §8.2 / §8.3 — Partner monthly financial summary (billing.month_end trigger, ACTIVE).
      // Sent by the scheduler at the start of each month for the previous period.
      syncTpl('Partner Monthly Financial Summary', {
        type: 'EMAIL',
        category: 'billing',
        subject: 'Месечен финансов отчет — BoomCard',
        subjectEn: 'Monthly financial summary — BoomCard',
        body: `<h2>Месечен финансов отчет</h2>
<p>Здравейте,</p>
<p>Месечният ви финансов отчет от BoomCard е готов. Можете да го разгледате в партньорския портал.</p>
<p>В отчета ще намерите:</p>
<ul>
  <li>Брой транзакции за периода</li>
  <li>Общ оборот</li>
  <li>Дължим кешбек към BoomCard</li>
</ul>
<p>При въпроси по отчета се свържете с нас на <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>Екипът на BoomCard</p>`,
        bodyEn: `<h2>Monthly Financial Summary</h2>
<p>Hello,</p>
<p>Your monthly BoomCard financial summary is ready. You can view it in the partner portal.</p>
<p>The report includes:</p>
<ul>
  <li>Number of transactions for the period</li>
  <li>Total revenue</li>
  <li>Cashback owed to BoomCard</li>
</ul>
<p>For questions about the report contact us at <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>The BoomCard Team</p>`,
      }),
      // Spec §8.2 — "Support отговор": fires on support.reply trigger when a staff member replies
      // to a support or change-request ticket (§11). DRAFT until the ticketing system (§11) is live;
      // set to ACTIVE when the ticket reply endpoint calls fireAutomation('support.reply', ...).
      syncTpl('Support Reply Notification', {
        type: 'EMAIL',
        category: 'support',
        subject: 'Нов отговор по вашето запитване — BoomCard',
        subjectEn: 'New reply to your inquiry — BoomCard',
        body: `<h2>Получихте отговор по вашето запитване!</h2>
<p>Здравейте,</p>
<p>Нашият екип отговори на вашето запитване. Влезте в профила си, за да прочетете пълния отговор.</p>
<p>При допълнителни въпроси отговорете директно на този имейл или пишете на <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>Екипът на BoomCard</p>`,
        bodyEn: `<h2>You have a new reply to your inquiry!</h2>
<p>Hello,</p>
<p>Our team has replied to your inquiry. Log in to your account to read the full response.</p>
<p>For further questions reply directly to this email or write to <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>The BoomCard Team</p>`,
      }),
      // Spec §8.3 / scheduler notifyInactiveUsers() — re-engagement nudge for users inactive 30 days.
      // Fires via user.inactive_30d trigger (daily at 4:30 AM, narrow 24h window to prevent re-firing).
      syncTpl('Inactive User Re-engagement', {
        type: 'EMAIL',
        category: 'reengagement',
        subject: 'Скучаем ви — вашият кешбек ви чака в BoomCard',
        subjectEn: 'We miss you — your cashback is waiting in BoomCard',
        body: `<h2>Добре дошли обратно!</h2>
<p>Здравейте,</p>
<p>Забелязахме, че не сте посещавали партньорите на BoomCard от известно време. Вашият акаунт е активен и кешбекът ви ви чака.</p>
<p>Открийте нови партньори и оферти в приложението BoomCard — може да изненадате себе си.</p>
<p>При въпроси сме насреща на <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>Екипът на BoomCard</p>`,
        bodyEn: `<h2>Welcome back!</h2>
<p>Hello,</p>
<p>We noticed you haven't visited any BoomCard partners for a while. Your account is active and your cashback is waiting for you.</p>
<p>Discover new partners and offers in the BoomCard app — you might be surprised.</p>
<p>If you have questions we're here at <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>The BoomCard Team</p>`,
      }),
      // Spec §8.2 — "Нова транзакция" for partners: optional, controlled by partner settings (§8.2).
      // DRAFT by default — activated per-partner when the partner settings toggle is built.
      // Trigger: partner.transaction (fired from transaction processing when partner opts in).
      syncTpl('Partner New Transaction Alert', {
        type: 'EMAIL',
        category: 'partner_transaction',
        subject: 'Нова транзакция в BoomCard — вашият бизнес',
        subjectEn: 'New BoomCard transaction — your business',
        body: `<h2>Нова транзакция!</h2>
<p>Здравейте,</p>
<p>Регистрирана е нова транзакция при вашия бизнес чрез BoomCard. Влезте в партньорския портал, за да видите детайлите.</p>
<p>При въпроси се свържете с нас на <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>Екипът на BoomCard</p>`,
        bodyEn: `<h2>New transaction!</h2>
<p>Hello,</p>
<p>A new transaction has been registered at your business through BoomCard. Log in to the partner portal to view the details.</p>
<p>If you have questions contact us at <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>The BoomCard Team</p>`,
      }),
      // Spec §8.2 — Registration transactional welcome: sent directly by emailService.sendWelcomeEmail()
      // at registration (auth.routes.ts). Seeded here for admin reference and future marketing sequences.
      syncTpl('Registration Welcome Email', {
        type: 'EMAIL',
        category: 'registration',
        subject: 'Добре дошли в BoomCard!',
        subjectEn: 'Welcome to BoomCard!',
        body: `<h2>Добре дошли в BoomCard!</h2>
<p>Радваме се, че се присъединихте към нас. Вашият акаунт е създаден успешно.</p>
<p>С BoomCard ще получавате кешбек при покупки при нашите партньори директно по сметката ви.</p>
<p><strong>Как да започнете:</strong></p>
<ul>
  <li>Изтеглете приложението BoomCard</li>
  <li>Разгледайте нашите партньори наблизо</li>
  <li>Пазарувайте и натрупвайте кешбек автоматично</li>
</ul>
<p>При въпроси сме на ваше разположение на <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>Екипът на BoomCard</p>`,
        bodyEn: `<h2>Welcome to BoomCard!</h2>
<p>We're glad you joined us. Your account has been created successfully.</p>
<p>With BoomCard you'll receive cashback on purchases at our partners directly to your account.</p>
<p><strong>How to get started:</strong></p>
<ul>
  <li>Download the BoomCard app</li>
  <li>Explore our nearby partners</li>
  <li>Shop and accumulate cashback automatically</li>
</ul>
<p>If you have any questions, we're here for you at <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>The BoomCard Team</p>`,
      }),
      // Spec §8.2 — Incoming support acknowledgement: sent directly by emailService when user
      // submits a support request. Not the same as 'Support Reply Notification' (outbound reply).
      syncTpl('Support Contact Email', {
        type: 'EMAIL',
        category: 'support',
        subject: 'Получихме вашето запитване — BoomCard поддръжка',
        subjectEn: 'We received your inquiry — BoomCard support',
        body: `<h2>Получихме вашето запитване!</h2>
<p>Благодарим ви, че се свързахте с нас. Нашият екип ще разгледа въпроса ви и ще отговори в рамките на 1–2 работни дни.</p>
<p>Референтният номер на вашето запитване е запазен в системата ни.</p>
<p>При спешни въпроси можете да пишете директно на <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>Екипът на BoomCard</p>`,
        bodyEn: `<h2>We received your inquiry!</h2>
<p>Thank you for reaching out. Our team will review your question and respond within 1–2 business days.</p>
<p>Your inquiry reference number has been saved in our system.</p>
<p>For urgent questions you can write directly to <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p>
<p>The BoomCard Team</p>`,
      }),
    ]);

    // Spec §8.3 — all automation defaults. Each entry is find-by-trigger + create-if-missing.
    // ACTIVE = fires immediately when triggered. DRAFT = template ready, trigger not yet live.
    const specDefaults: Array<{
      trigger: string;
      name: string;
      templateId: string;
      status: AutomationStatus;
    }> = [
      {
        trigger: 'cashback.threshold_reached',
        name: 'Cashback Milestone Alert',
        templateId: tplCashbackEarned.id,
        status: 'ACTIVE' as AutomationStatus,
      },
      {
        trigger: 'cashback.expiring',
        name: 'Expiring Cashback Warning',
        templateId: tplCashbackExpiring.id,
        status: 'ACTIVE',
      },
      {
        trigger: 'partner.created',
        name: 'New Partner Welcome',
        templateId: tplPartnerWelcome.id,
        status: 'ACTIVE',
      },
      // Spec §8.3 — fires at POST /api/auth/partner/activate (link click), not at admin-approve time.
      {
        trigger: 'partner.approved',
        name: 'Partner Approved Notification',
        templateId: tplPartnerApproved.id,
        status: 'ACTIVE',
      },
      // Spec §8.2/#8.3 — billing.month_end: scheduler fires this for every active partner at month start.
      // DRAFT: notificationService.notifyPartnerMonthlyStatement() already sends a rich email (with
      // actual figures) AND an in-app notification. Activating this automation would send a second,
      // generic email with no financial data. Keep DRAFT until automationDispatcher supports template
      // variable interpolation so the automation can replace the service-level email entirely.
      {
        trigger: 'billing.month_end',
        name: 'Partner Monthly Financial Summary',
        templateId: tplPartnerMonthlySummary.id,
        status: 'DRAFT',
      },
      // Spec §8.2 — support.reply: ACTIVE. Fires from adminHelp.routes.ts POST /:id/reply
      // when a staff member replies to any ticket. Creates an in-app notification for
      // the creator and sends the template email (consent-gated).
      {
        trigger: 'support.reply',
        name: 'Support Reply Notification',
        templateId: tplSupportReply.id,
        status: 'ACTIVE',
      },
      // Spec §8.3 / scheduler notifyInactiveUsers() — 30-day inactivity re-engagement.
      {
        trigger: 'user.inactive_30d',
        name: 'Inactive User Re-engagement',
        templateId: tplInactiveUserNudge.id,
        status: 'ACTIVE',
      },
      // Spec §8.2 — optional per-partner transaction alert. DRAFT until partner settings toggle is built.
      {
        trigger: 'partner.transaction',
        name: 'Partner New Transaction Alert',
        templateId: tplPartnerTransaction.id,
        status: 'DRAFT',
      },
    ];

    const results: { trigger: string; action: 'created' | 'updated' | 'ok' }[] = [];
    for (const def of specDefaults) {
      const existing = await prisma.marketingAutomation.findUnique({ where: { trigger: def.trigger } });
      if (!existing) {
        await prisma.marketingAutomation.create({ data: def });
        results.push({ trigger: def.trigger, action: 'created' });
      } else if (existing.templateId !== def.templateId) {
        // Template was deleted and re-seeded with a new ID — update the pointer so
        // the automation doesn't silently skip with a dangling FK.
        await prisma.marketingAutomation.update({
          where: { trigger: def.trigger },
          data: { templateId: def.templateId },
        });
        results.push({ trigger: def.trigger, action: 'updated' });
      } else {
        results.push({ trigger: def.trigger, action: 'ok' });
      }
    }

    res.json({ results, milestoneTriggerFixed: milestoneFix.count, smsUsageReset: smsUsageReset.count });
  } catch (error) {
    next(error);
  }
});

router.get('/automations', ...READ, async (req, res, next) => {
  try {
    const { status, search, trigger } = req.query as Record<string, string>;
    const { skip, take, page: pageNum, limit: limitNum } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });

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
          template: { select: { id: true, name: true, type: true } },
        },
      }),
      prisma.marketingAutomation.count({ where }),
    ]);

    res.json({ items, total, page: pageNum, limit: limitNum });
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

    // Guard: cannot activate without a template (mirror of PUT/PATCH guard)
    if ((status ?? 'DRAFT') === 'ACTIVE' && !templateId) {
      return res.status(422).json({
        error: 'Cannot activate: automation has no template. Assign a template first.',
      });
    }

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
  } catch (error: any) {
    // P2002 = unique constraint violation; trigger is the only @unique field on this model
    if (error?.code === 'P2002') {
      return res.status(409).json({
        error: `Trigger '${req.body?.trigger}' is already assigned to another automation. Each trigger can only have one automation.`,
      });
    }
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
