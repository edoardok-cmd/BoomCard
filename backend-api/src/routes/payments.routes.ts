import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { v4 as uuid } from 'uuid';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/payments/transactions
 * Get user's transactions
 */
router.get('/transactions', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, type } = req.query;

  // Mock data - replace with real database query
  const mockTransactions = {
    data: [
      {
        id: uuid(),
        type: 'booking',
        status: 'completed',
        amount: 150.00,
        currency: 'BGN',
        fee: 7.50,
        tax: 30.00,
        netAmount: 112.50,
        description: 'Booking payment for Restaurant ABC',
        descriptionBg: 'Плащане за резервация в Ресторант ABC',
        createdAt: new Date().toISOString(),
      },
      {
        id: uuid(),
        type: 'subscription',
        status: 'completed',
        amount: 49.99,
        currency: 'BGN',
        fee: 2.50,
        tax: 10.00,
        netAmount: 37.49,
        description: 'Monthly subscription',
        descriptionBg: 'Месечен абонамент',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    total: 2,
    page: parseInt(page as string),
    limit: parseInt(limit as string),
    totalPages: 1,
  };

  res.json(mockTransactions);
}));

/**
 * GET /api/payments/transactions/:id
 * Get transaction by ID
 */
router.get('/transactions/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const mockTransaction = {
    id,
    type: 'booking',
    status: 'completed',
    amount: 150.00,
    currency: 'BGN',
    fee: 7.50,
    tax: 30.00,
    netAmount: 112.50,
    description: 'Booking payment',
    descriptionBg: 'Плащане за резервация',
    paymentMethod: 'card',
    cardLast4: '4242',
    bookingId: uuid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  res.json(mockTransaction);
}));

/**
 * POST /api/payments/intents
 * Create payment intent
 */
router.post('/intents', asyncHandler(async (req, res) => {
  const { amount, currency, paymentMethod, description, descriptionBg, bookingId } = req.body;

  // TODO: Integrate with Stripe
  const mockIntent = {
    id: `pi_${uuid()}`,
    clientSecret: `pi_${uuid()}_secret_${uuid()}`,
    amount,
    currency: currency || 'BGN',
    status: 'requires_payment_method',
    paymentMethod,
    description,
    descriptionBg,
    bookingId,
    createdAt: new Date().toISOString(),
  };

  res.status(201).json(mockIntent);
}));

/**
 * POST /api/payments/intents/:id/confirm
 * Confirm payment intent
 */
router.post('/intents/:id/confirm', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paymentMethodId } = req.body;

  // TODO: Confirm with Stripe
  const mockConfirmation = {
    id: uuid(),
    paymentIntentId: id,
    status: 'completed',
    amount: 150.00,
    currency: 'BGN',
    paymentMethod: 'card',
    cardLast4: '4242',
    createdAt: new Date().toISOString(),
  };

  res.json(mockConfirmation);
}));

/**
 * POST /api/payments/intents/:id/cancel
 * Cancel payment intent
 */
router.post('/intents/:id/cancel', asyncHandler(async (req, res) => {
  const { id } = req.params;

  res.json({
    id,
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
  });
}));

/**
 * GET /api/payments/cards
 * Get user's saved payment cards
 */
router.get('/cards', asyncHandler(async (req, res) => {
  const mockCards = [
    {
      id: uuid(),
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2025,
      isDefault: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: uuid(),
      brand: 'mastercard',
      last4: '5555',
      expMonth: 6,
      expYear: 2026,
      isDefault: false,
      createdAt: new Date(Date.now() - 2592000000).toISOString(),
    },
  ];

  res.json(mockCards);
}));

/**
 * POST /api/payments/cards
 * Add payment card
 */
router.post('/cards', asyncHandler(async (req, res) => {
  const { cardToken, setAsDefault } = req.body;

  // TODO: Add card via Stripe
  const mockCard = {
    id: uuid(),
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2025,
    isDefault: setAsDefault || false,
    createdAt: new Date().toISOString(),
  };

  res.status(201).json(mockCard);
}));

/**
 * DELETE /api/payments/cards/:id
 * Remove payment card
 */
router.delete('/cards/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  res.json({
    success: true,
    message: 'Card removed successfully',
  });
}));

/**
 * POST /api/payments/cards/:id/default
 * Set default card
 */
router.post('/cards/:id/default', asyncHandler(async (req, res) => {
  const { id } = req.params;

  res.json({
    success: true,
    message: 'Default card updated',
  });
}));

/**
 * POST /api/payments/refunds
 * Request refund
 */
router.post('/refunds', asyncHandler(async (req, res) => {
  const { transactionId, amount, reason, reasonBg } = req.body;

  const mockRefund = {
    id: uuid(),
    transactionId,
    amount,
    status: 'pending',
    reason,
    reasonBg,
    createdAt: new Date().toISOString(),
  };

  res.status(201).json(mockRefund);
}));

/**
 * GET /api/payments/wallet/balance
 * Get wallet balance
 */
router.get('/wallet/balance', asyncHandler(async (req, res) => {
  const mockBalance = {
    balance: 450.50,
    availableBalance: 450.50,
    pendingBalance: 0,
    currency: 'BGN',
    lastUpdated: new Date().toISOString(),
  };

  res.json(mockBalance);
}));

/**
 * POST /api/payments/wallet/add-funds
 * Add funds to wallet
 */
router.post('/wallet/add-funds', asyncHandler(async (req, res) => {
  const { amount, paymentMethodId } = req.body;

  const mockTransaction = {
    id: uuid(),
    type: 'wallet_deposit',
    amount,
    status: 'completed',
    createdAt: new Date().toISOString(),
  };

  res.status(201).json(mockTransaction);
}));

/**
 * GET /api/payments/statistics
 * Get payment statistics
 */
router.get('/statistics', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const mockStats = {
    totalRevenue: 15420.00,
    totalTransactions: 127,
    successRate: 98.4,
    averageTransaction: 121.42,
    totalRefunds: 3,
    refundAmount: 450.00,
    byPaymentMethod: {
      card: 89,
      paypal: 23,
      wallet: 15,
    },
    revenueByMonth: [
      { month: '2025-01', revenue: 4850 },
      { month: '2025-02', revenue: 5320 },
      { month: '2025-03', revenue: 5250 },
    ],
  };

  res.json(mockStats);
}));

export default router;
