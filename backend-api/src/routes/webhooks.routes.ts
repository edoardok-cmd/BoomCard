import { Router, Request, Response } from 'express';
import { stripeService } from '../services/stripe.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 *
 * IMPORTANT: This route must use raw body, not JSON parsed body
 * Configure in server.ts before express.json() middleware
 */
router.post(
  '/stripe',
  async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'];

    if (!signature || typeof signature !== 'string') {
      logger.warn('Webhook received without Stripe signature');
      return res.status(400).json({ error: 'Missing Stripe signature' });
    }

    try {
      // Verify webhook signature and construct event
      const event = stripeService.verifyWebhookSignature(
        req.body, // Raw body buffer
        signature
      );

      logger.info(`Webhook received: ${event.type} (${event.id})`);

      // Handle the event asynchronously
      stripeService.handleWebhookEvent(event).catch((error) => {
        logger.error(`Error handling webhook event ${event.type}:`, error);
      });

      // Immediately respond to Stripe
      res.json({ received: true });
    } catch (error) {
      logger.error('Webhook signature verification failed:', error);
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }
);

export default router;
