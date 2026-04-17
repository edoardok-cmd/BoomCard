import { Router, Response } from 'express';
import { offersService } from '../services/offers.service';
import { authenticate, authorize, optionalAuthenticate, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { uploadSingle, validateMagicBytes } from '../middleware/upload.middleware';
import { imageUploadService } from '../services/imageUpload.service';

const router = Router();

// ------------------------------------------------------------------
// Helper: resolve the caller's active subscription plan.
// Uses req.user if present, then queries the DB.
// ------------------------------------------------------------------
async function resolveUserPlan(req: AuthRequest) {
  if (!req.user) return null;
  if (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') return null; // admins bypass — isAdmin flag handles it
  return offersService.getUserActivePlan(req.user.id);
}

// ------------------------------------------------------------------
// GET /api/offers/tags
// Public — returns all distinct tags used across active offers
// ------------------------------------------------------------------
router.get('/tags', optionalAuthenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const tags = await offersService.getAllTags();
    res.json({ success: true, data: tags });
  } catch (error: any) {
    logger.error('Failed to fetch offer tags:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch offer tags' });
  }
});

// ------------------------------------------------------------------
// GET /api/offers/top
// Public — but tier-filtered by subscription plan
// ------------------------------------------------------------------
router.get('/top', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const userPlan = await resolveUserPlan(req);
    const offers = await offersService.getTopOffers(limit, userPlan, isAdmin);

    res.json({ success: true, data: offers });
  } catch (error: any) {
    logger.error('Failed to fetch top offers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch top offers' });
  }
});

// ------------------------------------------------------------------
// GET /api/offers/featured
// Public — but tier-filtered by subscription plan
// ------------------------------------------------------------------
router.get('/featured', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const userPlan = await resolveUserPlan(req);
    const offers = await offersService.getFeaturedOffers(limit, userPlan, isAdmin);

    res.json({ success: true, data: offers });
  } catch (error: any) {
    logger.error('Failed to fetch featured offers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch featured offers' });
  }
});

// ------------------------------------------------------------------
// GET /api/offers
// Public — tier-filtered by subscription plan
// ------------------------------------------------------------------
router.get('/', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const userPlan = await resolveUserPlan(req);
    // tags query param: comma-separated or repeated: ?tags=spa,wellness or ?tags=spa&tags=wellness
    const rawTags = req.query.tags;
    const tags = rawTags
      ? (Array.isArray(rawTags) ? rawTags : (rawTags as string).split(',')).map(t => (t as string).trim()).filter(Boolean)
      : undefined;

    const filters = {
      category: req.query.category as string,
      city: req.query.city as string,
      minDiscount: req.query.minDiscount ? parseFloat(req.query.minDiscount as string) : undefined,
      search: req.query.search as string,
      isFeatured: req.query.featured === 'true' ? true : undefined,
      tags,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      userPlan,
      isAdmin,
    };

    const result = await offersService.getOffers(filters);
    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Failed to fetch offers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch offers' });
  }
});

// ------------------------------------------------------------------
// GET /api/offers/partner/:partnerId
// Public — tier-filtered
// ------------------------------------------------------------------
router.get('/partner/:partnerId', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const userPlan = await resolveUserPlan(req);
    const filters = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      userPlan,
      isAdmin,
    };

    const result = await offersService.getOffersByPartner(req.params.partnerId, filters);
    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Failed to fetch partner offers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch partner offers' });
  }
});

// ------------------------------------------------------------------
// GET /api/offers/city/:city
// Public — tier-filtered
// ------------------------------------------------------------------
router.get('/city/:city', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const userPlan = await resolveUserPlan(req);
    const filters = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      userPlan,
      isAdmin,
    };

    const result = await offersService.getOffersByCity(req.params.city, filters);
    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Failed to fetch city offers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch city offers' });
  }
});

// ------------------------------------------------------------------
// GET /api/offers/category/:category
// Public — tier-filtered
// ------------------------------------------------------------------
router.get('/category/:category', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const userPlan = await resolveUserPlan(req);
    const filters = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      userPlan,
      isAdmin,
    };

    const result = await offersService.getOffersByCategory(req.params.category, filters);
    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Failed to fetch category offers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch category offers' });
  }
});

// ------------------------------------------------------------------
// POST /api/offers/:id/activate
// Redeem an offer — requires authenticated user with appropriate tier.
// Increments usageCount and returns a one-time redemption code.
// ------------------------------------------------------------------
router.post(
  '/:id/activate',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { latitude, longitude } = req.body;
      const lat = latitude !== undefined ? parseFloat(latitude) : undefined;
      const lon = longitude !== undefined ? parseFloat(longitude) : undefined;
      const result = await offersService.redeemOffer(
        req.params.id,
        req.user!.id,
        req.user!.role,
        lat,
        lon,
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      const msg = error.message || '';
      const isLocationError = msg.includes('Location access is required') || msg.includes('must be within') || msg.includes('away.');
      const status = msg.includes('not found') ? 404
        : msg.includes('subscription') || msg.includes('limit') || isLocationError ? 403
        : 400;
      const safeMessage = status === 404 ? 'Offer not found'
        : isLocationError ? msg
        : status === 403 ? 'Subscription required or usage limit reached'
        : 'Unable to activate offer';
      res.status(status).json({ success: false, error: safeMessage });
    }
  },
);

// ------------------------------------------------------------------
// GET /api/offers/:id
// Public — returns 404 if the caller cannot access the partner tier
// ------------------------------------------------------------------
router.get('/:id', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const userPlan = await resolveUserPlan(req);
    const offer = await offersService.getOfferById(req.params.id, userPlan, isAdmin);

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    res.json({ success: true, data: offer });
  } catch (error: any) {
    logger.error('Failed to fetch offer:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch offer' });
  }
});

// ------------------------------------------------------------------
// POST /api/offers
// Admin-only: partners no longer create offers; discount is partner-wide.
// ------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const offer = await offersService.createOffer(req.body, req.user!.id, req.user!.role);
      res.status(201).json({ success: true, data: offer });
    } catch (error: any) {
      const msg = error.message || '';
      logger.error('createOffer error:', { message: msg, stack: error.stack });
      const status = msg.includes('not authorized') || msg.includes('not found') ? 403 : 400;
      const safeMessage = status === 403 ? 'Not authorized to create offers for this partner' : 'Invalid offer data';
      res.status(status).json({ success: false, error: safeMessage });
    }
  },
);

// ------------------------------------------------------------------
// PUT /api/offers/:id
// Admin-only: partners no longer edit offers.
// ------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const offer = await offersService.updateOffer(req.params.id, req.body, req.user!.id, req.user!.role);
      res.json({ success: true, data: offer });
    } catch (error: any) {
      const msg = error.message || '';
      const status = msg.includes('Not authorized') ? 403 : msg.includes('not found') ? 404 : 400;
      const safeMessage = status === 403 ? 'Not authorized to update this offer'
        : status === 404 ? 'Offer not found'
        : 'Invalid offer data';
      res.status(status).json({ success: false, error: safeMessage });
    }
  },
);

// ------------------------------------------------------------------
// PATCH /api/offers/:id/featured
// Admin / Super Admin only — toggles the featured flag.
// ------------------------------------------------------------------
router.patch(
  '/:id/featured',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { isFeatured, featuredOrder } = req.body;
      const offer = await offersService.toggleFeaturedStatus(req.params.id, isFeatured, featuredOrder);
      res.json({ success: true, data: offer });
    } catch (error: any) {
      logger.error('Failed to update featured status:', error);
      res.status(500).json({ success: false, error: 'Failed to update featured status' });
    }
  },
);

// ------------------------------------------------------------------
// POST /api/offers/:id/image
// Admin-only: partners no longer upload offer images.
// ------------------------------------------------------------------
router.post(
  '/:id/image',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  uploadSingle,
  validateMagicBytes,
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }
    try {
      const imageUrl = await offersService.uploadOfferImage(
        req.params.id,
        req.file,
        req.user!.id,
        req.user!.role,
      );
      res.json({ success: true, data: { imageUrl } });
    } catch (error: any) {
      const msg = error.message || '';
      logger.error('Failed to upload offer image:', error);
      const status = msg.includes('Not authorized') ? 403 : msg.includes('not found') ? 404 : 500;
      const safeMessage = status === 403 ? 'Not authorized to upload images for this offer'
        : status === 404 ? 'Offer not found'
        : 'Failed to upload image';
      res.status(status).json({ success: false, error: safeMessage });
    }
  },
);

// ------------------------------------------------------------------
// DELETE /api/offers  (bulk)
// Admin only — deletes multiple offers by IDs in the request body.
// ------------------------------------------------------------------
router.delete(
  '/',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
    }
    const deleted = await offersService.bulkDeleteOffers(ids);
    res.json({ success: true, deleted });
  }),
);

// ------------------------------------------------------------------
// DELETE /api/offers/:id
// Admin-only: partners no longer delete offers.
// ------------------------------------------------------------------
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      await offersService.deleteOffer(req.params.id, req.user!.id, req.user!.role);
      res.json({ success: true, message: 'Offer deleted successfully' });
    } catch (error: any) {
      const msg = error.message || '';
      const status = msg.includes('Not authorized') ? 403 : msg.includes('not found') ? 404 : 500;
      const safeMessage = status === 403 ? 'Not authorized to delete this offer'
        : status === 404 ? 'Offer not found'
        : 'Failed to delete offer';
      res.status(status).json({ success: false, error: safeMessage });
    }
  },
);

export default router;
