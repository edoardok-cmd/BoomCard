import { Router, Response } from 'express';
import { offersService } from '../services/offers.service';
import { authenticate, authorize, optionalAuthenticate, AuthRequest } from '../middleware/auth.middleware';

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
    res.status(500).json({ success: false, error: 'Failed to fetch top offers', message: error.message });
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
    res.status(500).json({ success: false, error: 'Failed to fetch featured offers', message: error.message });
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
    const filters = {
      category: req.query.category as string,
      city: req.query.city as string,
      minDiscount: req.query.minDiscount ? parseFloat(req.query.minDiscount as string) : undefined,
      search: req.query.search as string,
      isFeatured: req.query.featured === 'true' ? true : undefined,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
      userPlan,
      isAdmin,
    };

    const result = await offersService.getOffers(filters);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch offers', message: error.message });
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
    res.status(500).json({ success: false, error: 'Failed to fetch partner offers', message: error.message });
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
    res.status(500).json({ success: false, error: 'Failed to fetch city offers', message: error.message });
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
    res.status(500).json({ success: false, error: 'Failed to fetch category offers', message: error.message });
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
      const result = await offersService.redeemOffer(req.params.id, req.user!.id, req.user!.role);
      res.json({ success: true, data: result });
    } catch (error: any) {
      const status = error.message.includes('not found') ? 404
        : error.message.includes('subscription') || error.message.includes('limit') ? 403
        : 400;
      res.status(status).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: 'Failed to fetch offer', message: error.message });
  }
});

// ------------------------------------------------------------------
// POST /api/offers
// Requires PARTNER or ADMIN role.
// The service verifies that the partner belongs to req.user.
// ------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const offer = await offersService.createOffer(req.body, req.user!.id, req.user!.role);
      res.status(201).json({ success: true, data: offer });
    } catch (error: any) {
      const status = error.message.includes('not authorized') || error.message.includes('not found') ? 403 : 400;
      res.status(status).json({ success: false, error: 'Failed to create offer', message: error.message });
    }
  },
);

// ------------------------------------------------------------------
// PUT /api/offers/:id
// Requires PARTNER or ADMIN role.
// The service verifies that the offer belongs to req.user's partner.
// ------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const offer = await offersService.updateOffer(req.params.id, req.body, req.user!.id, req.user!.role);
      res.json({ success: true, data: offer });
    } catch (error: any) {
      const status = error.message.includes('Not authorized') ? 403 : error.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, error: 'Failed to update offer', message: error.message });
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
      res.status(500).json({ success: false, error: 'Failed to update featured status', message: error.message });
    }
  },
);

// ------------------------------------------------------------------
// DELETE /api/offers/:id
// Requires PARTNER or ADMIN role.
// The service verifies that the offer belongs to req.user's partner.
// ------------------------------------------------------------------
router.delete(
  '/:id',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      await offersService.deleteOffer(req.params.id, req.user!.id, req.user!.role);
      res.json({ success: true, message: 'Offer deleted successfully' });
    } catch (error: any) {
      const status = error.message.includes('Not authorized') ? 403 : error.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: 'Failed to delete offer', message: error.message });
    }
  },
);

export default router;
