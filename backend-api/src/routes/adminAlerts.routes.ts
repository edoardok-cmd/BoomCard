import { Router } from 'express';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { getAlerts } from '../services/adminAlerts.service';

const router = Router();

// Alerts surface fraud-queue counts and system anomalies — gated on control.risk.read
// so PARTNER_MANAGER and SUPPORT (who have dashboard.read but not risk access) are excluded.
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('control.risk.read'), async (_req, res, next) => {
  try {
    const result = await getAlerts();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
