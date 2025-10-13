import { Router } from 'express';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// TODO: Implement venues routes
// See BACKEND_IMPLEMENTATION_GUIDE.md for complete implementation

router.get('/', asyncHandler(async (req, res) => {
  res.status(501).json({ error: 'Not implemented - see BACKEND_IMPLEMENTATION_GUIDE.md' });
}));

export default router;
