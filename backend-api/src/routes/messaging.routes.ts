import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();
router.use(authenticate);

// TODO: Implement messaging routes
// See BACKEND_IMPLEMENTATION_GUIDE.md for complete implementation

router.get('/conversations', asyncHandler(async (req, res) => {
  res.status(501).json({ error: 'Not implemented - see BACKEND_IMPLEMENTATION_GUIDE.md' });
}));

export default router;
