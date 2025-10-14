import { Router, Request, Response } from 'express';
import { offersService } from '../services/offers.service';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/offers/top
 * Get top offers (highest discounts or featured)
 * Public endpoint
 */
router.get('/top', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offers = await offersService.getTopOffers(limit);

    res.json({
      success: true,
      data: offers,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top offers',
      message: error.message,
    });
  }
});

/**
 * GET /api/offers/featured
 * Get featured offers only
 * Public endpoint
 */
router.get('/featured', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offers = await offersService.getFeaturedOffers(limit);

    res.json({
      success: true,
      data: offers,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch featured offers',
      message: error.message,
    });
  }
});

/**
 * GET /api/offers
 * Get all offers with filters
 * Public endpoint
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = {
      category: req.query.category as string,
      city: req.query.city as string,
      minDiscount: req.query.minDiscount ? parseFloat(req.query.minDiscount as string) : undefined,
      search: req.query.search as string,
      isFeatured: req.query.featured === 'true',
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
    };

    const result = await offersService.getOffers(filters);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch offers',
      message: error.message,
    });
  }
});

/**
 * GET /api/offers/:id
 * Get single offer by ID
 * Public endpoint
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const offer = await offersService.getOfferById(req.params.id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found',
      });
    }

    res.json({
      success: true,
      data: offer,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch offer',
      message: error.message,
    });
  }
});

/**
 * GET /api/offers/partner/:partnerId
 * Get offers by partner
 * Public endpoint
 */
router.get('/partner/:partnerId', async (req: Request, res: Response) => {
  try {
    const filters = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
    };

    const result = await offersService.getOffersByPartner(req.params.partnerId, filters);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch partner offers',
      message: error.message,
    });
  }
});

/**
 * GET /api/offers/city/:city
 * Get offers by city
 * Public endpoint
 */
router.get('/city/:city', async (req: Request, res: Response) => {
  try {
    const filters = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
    };

    const result = await offersService.getOffersByCity(req.params.city, filters);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch city offers',
      message: error.message,
    });
  }
});

/**
 * GET /api/offers/category/:category
 * Get offers by category
 * Public endpoint
 */
router.get('/category/:category', async (req: Request, res: Response) => {
  try {
    const filters = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 10,
    };

    const result = await offersService.getOffersByCategory(req.params.category, filters);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch category offers',
      message: error.message,
    });
  }
});

/**
 * POST /api/offers
 * Create new offer
 * Protected endpoint - requires authentication
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const offer = await offersService.createOffer(req.body);

    res.status(201).json({
      success: true,
      data: offer,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to create offer',
      message: error.message,
    });
  }
});

/**
 * PUT /api/offers/:id
 * Update offer
 * Protected endpoint - requires authentication
 */
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const offer = await offersService.updateOffer(req.params.id, req.body);

    res.json({
      success: true,
      data: offer,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to update offer',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/offers/:id/featured
 * Toggle featured status (Admin only)
 * Protected endpoint - requires authentication
 */
router.patch('/:id/featured', authenticate, async (req: Request, res: Response) => {
  try {
    const { isFeatured, featuredOrder } = req.body;
    const offer = await offersService.toggleFeaturedStatus(req.params.id, isFeatured, featuredOrder);

    res.json({
      success: true,
      data: offer,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to update featured status',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/offers/:id
 * Delete offer
 * Protected endpoint - requires authentication
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    await offersService.deleteOffer(req.params.id);

    res.json({
      success: true,
      message: 'Offer deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete offer',
      message: error.message,
    });
  }
});

export default router;
