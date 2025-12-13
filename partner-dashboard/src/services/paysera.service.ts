import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface CreatePaymentParams {
  amount: number;
  description: string;
  currency?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  success: boolean;
  data: {
    orderId: string;
    transactionId: string;
    paymentUrl: string;
    amount: number;
    currency: string;
    status: string;
  };
}

export interface PaymentStatusResponse {
  success: boolean;
  data: {
    orderId: string;
    status: string;
    amount: number;
    currency: string;
    description: string;
    createdAt: string;
    metadata: any;
  };
}

class PayseraService {
  /**
   * Create a Paysera payment
   */
  async createPayment(
    token: string,
    params: CreatePaymentParams
  ): Promise<PaymentResponse> {
    try {
      const response = await axios.post(
        `${API_URL}/api/payments/create`,
        {
          amount: params.amount,
          description: params.description,
          currency: params.currency || 'EUR',
          metadata: params.metadata,
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Paysera payment creation error:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to create payment'
      );
    }
  }

  /**
   * Check payment status
   */
  async getPaymentStatus(
    token: string,
    orderId: string
  ): Promise<PaymentStatusResponse> {
    try {
      const response = await axios.get(
        `${API_URL}/api/payments/${orderId}/status`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Payment status check error:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to check payment status'
      );
    }
  }

  /**
   * Get payment history
   */
  async getPaymentHistory(
    token: string,
    limit = 20,
    offset = 0
  ): Promise<any> {
    try {
      const response = await axios.get(
        `${API_URL}/api/payments/history`,
        {
          params: { limit, offset },
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Payment history fetch error:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to fetch payment history'
      );
    }
  }

  /**
   * Get supported payment methods
   */
  async getSupportedMethods(): Promise<any> {
    try {
      const response = await axios.get(
        `${API_URL}/api/payments/methods`
      );

      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch payment methods:', error);
      throw new Error('Failed to fetch payment methods');
    }
  }
}

export const payseraService = new PayseraService();
