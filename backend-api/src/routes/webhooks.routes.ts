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

    // Acknowledge immediately so Stripe doesn't retry while we process.
    res.status(200).json({ received: true });

    // Process asynchronously — errors are logged inside handleWebhookEvent.
    stripeService.handleWebhookEvent(event).catch((err) => {
      logger.error(`Stripe webhook processing failed for ${event.type} (${event.id}):`, err);
    });
  } catch (error) {
    logger.error('Stripe webhook signature verification failed:', error);
    res.status(401).json({ error: 'Invalid signature' });
  }
});

export default router;
