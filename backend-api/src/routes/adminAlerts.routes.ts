import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getAlerts } from '../services/adminAlerts.service';

const router = Router();

router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (_req, res, next) => {
  try {
    const result = await getAlerts();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
