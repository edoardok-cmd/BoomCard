/**
 * Pending Checkout Routes
 * Payment-first onboarding: visitor pays → profile creation → account active
 * No authentication required — uses one-time token after payment confirmation
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { payseraService } from '../services/paysera.service';
import { emailService } from '../services/email.service';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { z } from 'zod';
import { paymentRateLimiter } from '../middleware/security.middleware';

const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('FRONTEND_URL must be set in production'); })()
  : 'http://localhost:5173');

const API_BASE_URL = process.env.API_BASE_URL || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('API_BASE_URL must be set in production'); })()
  : 'http://localhost:3000');

const ALLOWED_REDIRECT_DOMAINS = [
  'mobile.boomcard.bg',
  'boomcard.bg',
  'boomcard.eu',
  'boomcard-api.fly.dev',
  'boomcard.vercel.app',
];

function isAllowedRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      ALLOWED_REDIRECT_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const router = Router();

// ============================================
// POST /api/checkout/initiate (PUBLIC)
// Visitor selects plan → pays → lands on profile creation screen
// ============================================

const initiateCheckoutSchema = z.object({
  planId: z.string().uuid(),
  billingPeriod: z.enum(['weekly', 'monthly', 'yearly']),
  email: z.string().email(),
  paymentMethod: z.string().min(1).max(50).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  // Spec §7.1: persist the user's chosen interface language so the
  // post-payment complete-profile email is sent in the right language.
  language: z.enum(['bg', 'en']).optional(),
});

router.post(
  '/initiate',
  paymentRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parseResult = initiateCheckoutSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        errors: parseResult.error.issues,
      });
    }

    const { planId, billingPeriod, email, paymentMethod, successUrl: clientSuccessUrl, cancelUrl: clientCancelUrl, language } = parseResult.data;
    // Fall back to Accept-Language so the spec §7.1 default works even if the
    // client forgets to pass `language` explicitly.
    const headerLang = (req.headers['accept-language'] || '').toString().toLowerCase().startsWith('en') ? 'en' : 'bg';
    const checkoutLanguage: 'bg' | 'en' = language ?? headerLang as 'bg' | 'en';

    // Fetch plan — source of truth for pricing
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      return res.status(404).json({ success: false, message: 'Plan not found or inactive' });
    }

    // Validate billing period availability
    if (billingPeriod === 'weekly' && !plan.hasWeeklyOption) {
      return res.status(400).json({ success: false, message: 'Weekly billing not available for this plan' });
    }
    if (billingPeriod === 'monthly' && !plan.hasMonthlyOption) {
      return res.status(400).json({ success: false, message: 'Monthly billing not available for this plan' });
    }
    if (billingPeriod === 'yearly' && !plan.hasYearlyOption) {
      return res.status(400).json({ success: false, message: 'Yearly billing not available for this plan' });
    }

    // Get price from DB (never from client)
    let priceInCents: number;
    switch (billingPeriod) {
      case 'weekly':
        if (!plan.priceWeeklyEur) {
          return res.status(400).json({ success: false, message: 'Weekly price not configured for this plan' });
        }
        priceInCents = plan.priceWeeklyEur;
        break;
      case 'monthly':
        if (!plan.priceMonthlyEur) {
          return res.status(400).json({ success: false, message: 'Monthly price not configured for this plan' });
        }
        priceInCents = plan.priceMonthlyEur;
        break;
      case 'yearly':
        priceInCents = plan.priceYearlyEur;
        break;
    }

    const orderId = `BOOM-CHK-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Create PendingSubscription record
    await prisma.pendingSubscription.create({
      data: {
        email: email.toLowerCase(),
        planId: plan.id,
        billingPeriod,
        language: checkoutLanguage,
        payseraOrderId: orderId,
        status: 'CREATED',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Build redirect URLs
    const acceptUrl = (clientSuccessUrl && isAllowedRedirectUrl(clientSuccessUrl))
      ? `${clientSuccessUrl}?orderId=${orderId}`
      : `${FRONTEND_URL}/checkout/success?orderId=${orderId}`;
    const cancelUrl = (clientCancelUrl && isAllowedRedirectUrl(clientCancelUrl))
      ? `${clientCancelUrl}?orderId=${orderId}`
      : `${FRONTEND_URL}/checkout/cancel?orderId=${orderId}`;
    const callbackUrl = `${API_BASE_URL}/api/checkout/callback`;

    // Create Paysera payment
    const payment = await payseraService.createPayment({
      orderId,
      amount: priceInCents,
      currency: 'EUR',
      description: `BoomCard ${plan.displayName} - ${billingPeriod}`,
      acceptUrl,
      cancelUrl,
      callbackUrl,
      customerEmail: email,
      customerName: email.split('@')[0],
      paymentMethod,
      lang: 'BUL',
      country: 'BG',
    });

    logger.info(`Checkout initiated: ${orderId}, plan ${plan.planCode}, ${priceInCents / 100} EUR`);

    res.status(201).json({
      success: true,
      data: {
        orderId: payment.orderId,
        paymentUrl: payment.paymentUrl,
        plan: {
          code: plan.planCode,
          name: plan.displayName,
        },
        amount: priceInCents / 100,
        currency: 'EUR',
        billingPeriod,
      },
    });
  })
);

// ============================================
// GET /api/checkout/status/:orderId (PUBLIC)
// Frontend polls after payment redirect to check status and get the token
// ============================================

router.get(
  '/status/:orderId',
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;

    const pending = await prisma.pendingSubscription.findFirst({
      where: { payseraOrderId: orderId },
      include: {
        plan: {
          select: { planCode: true, displayNameBg: true },
        },
      },
    });

    if (!pending) {
      return res.status(404).json({ success: false, message: 'Checkout session not found' });
    }

    const isReadyForRegistration = pending.status === 'PAID';

    // Only expose the one-time token when status is exactly PAID —
    // never for COMPLETED, EXPIRED, or FAILED
    const tokenPayload = isReadyForRegistration ? pending.token : null;
    const tokenExpiresAt = isReadyForRegistration ? pending.tokenExpiresAt : null;

    res.json({
      success: true,
      data: {
        status: pending.status,
        isReadyForRegistration,
        ...(tokenPayload ? { token: tokenPayload } : {}),
        ...(tokenExpiresAt ? { tokenExpiresAt } : {}),
        plan: {
          code: pending.plan.planCode,
          nameBg: pending.plan.displayNameBg,
        },
        billingPeriod: pending.billingPeriod ?? null,
      },
    });
  })
);

// ============================================
// Paysera Callback (Webhook from Paysera)
// Marks PendingSubscription as PAID and issues one-time registration token
// Both GET and POST supported — Paysera may use either
// ============================================

async function handleCheckoutCallback(req: Request, res: Response) {
  const data = (req.query.data || req.body?.data) as string;
  const ss1 = (req.query.ss1 || req.body?.ss1) as string;
  const ss2 = (req.query.ss2 || req.body?.ss2) as string;

  logger.info('Received Paysera checkout callback');

  if (!data || !ss1) {
    logger.warn('Missing data or ss1 in checkout callback');
    return res.send(payseraService.generateCallbackResponse());
  }

  try {
    const result = await payseraService.handleCallback({ data, ss1, ss2 });

    logger.info(`Checkout callback: ${result.orderId} — status ${result.rawStatus} (${result.status})`);

    // Find the PendingSubscription for this order
    const pending = await prisma.pendingSubscription.findFirst({
      where: { payseraOrderId: result.orderId },
      include: { plan: { select: { displayName: true, displayNameBg: true } } },
    });

    if (!pending) {
      logger.warn(`PendingSubscription not found for checkout order: ${result.orderId}`);
      return res.send(payseraService.generateCallbackResponse());
    }

    if (result.status === 'success') {
      // Idempotency: skip if already PAID or COMPLETED
      if (pending.status === 'PAID' || pending.status === 'COMPLETED') {
        logger.info(`PendingSubscription ${pending.id} already ${pending.status} — skipping`);
        return res.send(payseraService.generateCallbackResponse());
      }

      // Generate one-time registration token (30-minute TTL)
      const token = crypto.randomBytes(32).toString('hex');

      await prisma.pendingSubscription.update({
        where: { id: pending.id },
        data: {
          status: 'PAID',
          token,
          tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
          paidAt: new Date(),
        },
      });

      logger.info(`PendingSubscription ${pending.id} marked PAID, registration token issued`);

      // Send complete-profile email — this is the payment confirmation + account setup
      // invite combined (spec §8.2: two emails total; welcome is sent after profile creation).
      const pendingLanguage: 'bg' | 'en' = pending.language === 'en' ? 'en' : 'bg';
      emailService.sendCompleteProfileEmail(pending.email, {
        planName: pending.plan.displayName,
        planNameBg: pending.plan.displayNameBg ?? undefined,
        completeProfileUrl: `${FRONTEND_URL}/complete-profile?token=${token}`,
        // Spec §7.1: BG default, EN only when the user explicitly used the EN UI at checkout.
        language: pendingLanguage,
      }).catch(err => logger.error('Failed to send complete-profile email:', err));

    } else if (result.status === 'failed' || result.status === 'cancelled') {
      // Only update if not already in a terminal state
      if (pending.status !== 'FAILED' && pending.status !== 'COMPLETED') {
        await prisma.pendingSubscription.update({
          where: { id: pending.id },
          data: { status: 'FAILED' },
        });
        logger.warn(`PendingSubscription ${pending.id} marked FAILED (${result.status})`);

        // Send payment failed notification
        if (pending.email) {
          emailService.sendPaymentFailedEmail(pending.email, {
            customerName: pending.email.split('@')[0],
            orderId: result.orderId,
            amount: result.amount ? result.amount / 100 : 0,
            currency: 'EUR',
            reason: result.status as 'failed' | 'cancelled',
          }).catch(err => logger.error('Failed to send checkout payment failed email:', err));
        }
      }
    }
    // For pending statuses (0, 2, 3) — wait for final callback

    return res.send(payseraService.generateCallbackResponse());
  } catch (error: any) {
    logger.error('Error processing checkout callback:', error);
    // Still respond OK to prevent Paysera from retrying indefinitely
    return res.send(payseraService.generateCallbackResponse());
  }
}

// GET and POST both supported — Paysera may use either
router.get('/callback', asyncHandler(handleCheckoutCallback));
router.post('/callback', asyncHandler(handleCheckoutCallback));

export default router;
