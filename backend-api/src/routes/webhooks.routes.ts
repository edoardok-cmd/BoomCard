import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Webhook Routes
 *
 * Payment gateway webhooks are handled in their respective route files:
 * - Paysera callbacks: /api/payments/callback (in payments.paysera.routes.ts)
 *
 * This file is reserved for future webhook integrations.
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

export default router;
