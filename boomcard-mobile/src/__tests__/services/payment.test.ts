/**
 * Unit Tests: Payment Service
 *
 * Tests the mobile Paysera payment flow:
 * - Payment initiation
 * - Browser redirect handling
 * - Deep link parsing
 * - Status polling
 */

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// Mock the API client
jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

// Mock plans service
jest.mock('../../services/plans.service', () => ({
  plansService: {
    createSubscriptionPayment: jest.fn(),
    pollSubscriptionStatus: jest.fn(),
    checkSubscriptionStatus: jest.fn(),
  },
}));

import apiClient from '../../api/client';
import { paymentService } from '../../services/payment.service';

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Payment Initiation ─────────────────────────────────────

  describe('initiatePayment', () => {
    it('should create payment via API and return payment result', async () => {
      const mockPayment = {
        orderId: 'TEST-ORDER-001',
        transactionId: 'TX-001',
        paymentUrl: 'https://paysera.com/pay?data=abc&sign=xyz',
        amount: 5000,
        currency: 'BGN',
        status: 'pending',
      };

      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { success: true, data: mockPayment },
      });

      const result = await paymentService.initiatePayment({
        amount: 50.0,
        currency: 'BGN',
        description: 'Test top-up',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/payments/create',
        expect.objectContaining({
          amount: 50.0,
          currency: 'BGN',
        })
      );

      expect(result.orderId).toBe('TEST-ORDER-001');
      expect(result.paymentUrl).toContain('paysera.com');
    });

    it('should default to BGN currency', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            orderId: 'ORD-002',
            paymentUrl: 'https://paysera.com/pay',
            amount: 1000,
            currency: 'BGN',
            status: 'pending',
          },
        },
      });

      await paymentService.initiatePayment({ amount: 10.0 });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/payments/create',
        expect.objectContaining({
          currency: 'BGN',
        })
      );
    });

    it('should throw on API failure', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { success: false },
      });

      await expect(
        paymentService.initiatePayment({ amount: 10.0 })
      ).rejects.toThrow('Failed to initiate payment');
    });
  });

  // ─── Browser Payment ──────────────────────────────────────────

  describe('openPaymentBrowser', () => {
    it('should open WebBrowser with payment URL', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
        type: 'success',
        url: 'boomcard://payment-result?status=success',
      });

      (Linking.createURL as jest.Mock).mockReturnValue('boomcard://');

      const result = await paymentService.openPaymentBrowser(
        'https://paysera.com/pay?data=abc',
        'ORDER-001'
      );

      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should return cancel when user cancels', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
        type: 'cancel',
      });

      const result = await paymentService.openPaymentBrowser(
        'https://paysera.com/pay',
        'ORDER-002'
      );

      expect(result).toBe('cancel');
    });

    it('should detect cancel from redirect URL', async () => {
      (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
        type: 'success',
        url: 'boomcard://payment-result?status=cancel',
      });

      const result = await paymentService.openPaymentBrowser(
        'https://paysera.com/pay',
        'ORDER-003'
      );

      expect(result).toBe('cancel');
    });
  });

  // ─── Payment Status ───────────────────────────────────────────

  describe('checkPaymentStatus', () => {
    it('should return payment status by order ID', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            orderId: 'ORDER-001',
            status: 'completed',
            amount: 50.0,
            currency: 'BGN',
          },
        },
      });

      const status = await paymentService.checkPaymentStatus('ORDER-001');

      expect(apiClient.get).toHaveBeenCalledWith('/api/payments/ORDER-001/status');
      expect(status.status).toBe('completed');
    });
  });

  // ─── Payment History ──────────────────────────────────────────

  describe('getPaymentHistory', () => {
    it('should fetch payment history with pagination', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          data: [],
          pagination: { total: 0, limit: 20, offset: 0 },
        },
      });

      await paymentService.getPaymentHistory(20, 0);

      expect(apiClient.get).toHaveBeenCalledWith('/api/payments/history', {
        params: { limit: 20, offset: 0 },
      });
    });
  });

  // ─── Payment Methods ──────────────────────────────────────────

  describe('getPaymentMethods', () => {
    it('should fetch supported payment methods', async () => {
      (apiClient.get as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            methods: ['card', 'bank_transfer'],
            currencies: ['BGN', 'EUR'],
          },
        },
      });

      const result = await paymentService.getPaymentMethods();

      expect(apiClient.get).toHaveBeenCalledWith('/api/payments/methods');
      expect(result).toBeTruthy();
    });
  });
});
