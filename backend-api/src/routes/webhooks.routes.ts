import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { stripeService } from '../services/stripe.service';

const router = Router();

/**
 * Webhook Routes
 *
 * Payment gateway webhooks are handled in their respective route files:
 * - Paysera callbacks: /api/payments/callback (in payments.paysera.routes.ts)
 * - Stripe webhooks: /api/webhooks/stripe (below)
 */

/**
 * GET /api/webhooks/health
 * Webhook health check
 */
router.get('/health', async (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Webhooks endpoint is healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/webhooks/stripe
 * Stripe webhook receiver — verifies signature, then dispatches to handler.
 * Raw body middleware is mounted in server.ts (before express.json()).
 */
router.post('/stripe', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string | undefined;

  if (!signature) {
    logger.warn('Stripe webhook received without signature header');
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  try {
    const event = stripeService.verifyWebhookSignature(req.body, signature);

    // Process synchronously so Stripe sees a non-200 on failure and retries.
    // Fire-and-forget (200 before processing) would permanently lose events
    // if the process crashes or the handler throws.
    await stripeService.handleWebhookEvent(event);

    res.status(200).json({ received: true });
  } catch (error: any) {
    // Signature verification failures → 401
    if (error.statusCode === 401 || error.message?.includes('signature')) {
      logger.error('Stripe webhook signature verification failed:', error);
      res.status(401).json({ error: 'Invalid signature' });
    } else {
      // Processing failures → 500, Stripe will retry
      logger.error('Stripe webhook processing failed:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
});

export default router;
