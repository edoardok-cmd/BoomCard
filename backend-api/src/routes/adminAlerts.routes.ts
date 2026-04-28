import { Router } from 'express';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { getAlerts } from '../services/adminAlerts.service';

const router = Router();

router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('dashboard.read'), async (_req, res, next) => {
  try {
    const result = await getAlerts();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
