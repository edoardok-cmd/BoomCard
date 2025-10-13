/**
 * Payments Service
 *
 * Complete payment processing system with:
 * - Multiple payment methods (card, wallet, bank transfer)
 * - Payment gateway integration (Stripe, PayPal, etc.)
 * - Transaction management
 * - Refunds and disputes
 * - Payment history
 * - Invoicing
 * - Split payments
 * - Recurring payments/subscriptions
 */

import { apiService } from './api.service';

export type PaymentMethod = 'card' | 'paypal' | 'apple_pay' | 'google_pay' | 'bank_transfer' | 'wallet';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed';

export type Currency = 'BGN' | 'EUR' | 'USD';

export type TransactionType =
  | 'booking'
  | 'offer_redemption'
  | 'subscription'
  | 'refund'
  | 'payout'
  | 'commission';

export interface PaymentCard {
  id: string;
  userId: string;
  brand: string; // visa, mastercard, amex
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  holderName: string;
  billingAddress?: Address;
  createdAt: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  status: PaymentStatus;

  // Amount details
  amount: number;
  currency: Currency;
  fee: number;
  tax: number;
  netAmount: number;

  // Payment details
  paymentMethod: PaymentMethod;
  paymentMethodDetails?: {
    last4?: string;
    brand?: string;
    email?: string; // for PayPal
  };

  // Related entities
  userId: string;
  userName: string;
  userEmail: string;
  partnerId?: string;
  partnerName?: string;
  bookingId?: string;
  offerId?: string;
  subscriptionId?: string;

  // Description
  description: string;
  descriptionBg: string;

  // Gateway details
  gatewayId?: string; // Stripe payment intent ID, PayPal transaction ID, etc.
  gateway?: 'stripe' | 'paypal' | 'internal';

  // Status tracking
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failureReason?: string;
  failureReasonBg?: string;

  // Receipt
  receiptUrl?: string;
  invoiceId?: string;

  // Metadata
  metadata?: Record<string, any>;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: Currency;
  clientSecret: string;
  status: PaymentStatus;
  paymentMethod?: PaymentMethod;
  description: string;
  metadata?: Record<string, any>;
}

export interface Refund {
  id: string;
  transactionId: string;
  amount: number;
  currency: Currency;
  reason: string;
  reasonBg: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  processedBy?: string;
  notes?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  transactionId: string;
  userId: string;
  partnerId?: string;

  // Amounts
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  currency: Currency;

  // Status
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

  // Dates
  issueDate: string;
  dueDate: string;
  paidAt?: string;

  // Items
  items: InvoiceItem[];

  // Addresses
  billingAddress: Address;

  // Files
  pdfUrl?: string;

  // Metadata
  notes?: string;
  createdAt: string;
}

export interface InvoiceItem {
  description: string;
  descriptionBg: string;
  quantity: number;
  unitPrice: number;
  total: number;
  tax?: number;
}

export interface Payout {
  id: string;
  partnerId: string;
  amount: number;
  currency: Currency;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  method: 'bank_transfer' | 'paypal' | 'stripe';
  accountDetails: {
    accountNumber?: string;
    routingNumber?: string;
    email?: string;
    last4?: string;
  };
  period: {
    startDate: string;
    endDate: string;
  };
  transactionIds: string[];
  createdAt: string;
  processedAt?: string;
  failureReason?: string;
}

export interface PaymentStatistics {
  totalRevenue: number;
  totalTransactions: number;
  successRate: number;
  averageTransactionValue: number;
  totalRefunds: number;
  refundRate: number;
  disputeRate: number;
  byPaymentMethod: Record<PaymentMethod, {
    count: number;
    amount: number;
    percentage: number;
  }>;
  byStatus: Record<PaymentStatus, number>;
  revenueByDate: Array<{ date: string; amount: number }>;
  topCustomers: Array<{
    userId: string;
    userName: string;
    totalSpent: number;
    transactionCount: number;
  }>;
}

export interface CreatePaymentData {
  amount: number;
  currency: Currency;
  paymentMethod: PaymentMethod;
  description: string;
  descriptionBg: string;
  bookingId?: string;
  offerId?: string;
  metadata?: Record<string, any>;
}

export interface WalletBalance {
  userId: string;
  balance: number;
  currency: Currency;
  pendingBalance: number;
  totalEarned: number;
  totalSpent: number;
  lastUpdated: string;
}

class PaymentsService {
  private readonly baseUrl = '/payments';

  /**
   * Get all transactions
   */
  async getTransactions(filters?: {
    type?: TransactionType;
    status?: PaymentStatus;
    paymentMethod?: PaymentMethod;
    userId?: string;
    partnerId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: Transaction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return apiService.get(`${this.baseUrl}/transactions`, filters);
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(id: string): Promise<Transaction> {
    return apiService.get<Transaction>(`${this.baseUrl}/transactions/${id}`);
  }

  /**
   * Create payment intent
   */
  async createPaymentIntent(data: CreatePaymentData): Promise<PaymentIntent> {
    return apiService.post<PaymentIntent>(`${this.baseUrl}/intents`, data);
  }

  /**
   * Confirm payment
   */
  async confirmPayment(intentId: string, paymentMethodId?: string): Promise<Transaction> {
    return apiService.post<Transaction>(`${this.baseUrl}/intents/${intentId}/confirm`, {
      paymentMethodId,
    });
  }

  /**
   * Cancel payment
   */
  async cancelPayment(intentId: string, reason?: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/intents/${intentId}/cancel`, {
      reason,
    });
  }

  /**
   * Get payment cards
   */
  async getPaymentCards(): Promise<PaymentCard[]> {
    return apiService.get<PaymentCard[]>(`${this.baseUrl}/cards`);
  }

  /**
   * Add payment card
   */
  async addPaymentCard(cardToken: string, setAsDefault?: boolean): Promise<PaymentCard> {
    return apiService.post<PaymentCard>(`${this.baseUrl}/cards`, {
      cardToken,
      setAsDefault,
    });
  }

  /**
   * Remove payment card
   */
  async removePaymentCard(cardId: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/cards/${cardId}`);
  }

  /**
   * Set default card
   */
  async setDefaultCard(cardId: string): Promise<PaymentCard> {
    return apiService.post<PaymentCard>(`${this.baseUrl}/cards/${cardId}/default`);
  }

  /**
   * Request refund
   */
  async requestRefund(transactionId: string, amount: number, reason: string, reasonBg: string): Promise<Refund> {
    return apiService.post<Refund>(`${this.baseUrl}/transactions/${transactionId}/refund`, {
      amount,
      reason,
      reasonBg,
    });
  }

  /**
   * Get refunds
   */
  async getRefunds(transactionId?: string): Promise<Refund[]> {
    return apiService.get<Refund[]>(`${this.baseUrl}/refunds`, {
      transactionId,
    });
  }

  /**
   * Process refund (admin/partner)
   */
  async processRefund(refundId: string, action: 'approve' | 'reject', notes?: string): Promise<Refund> {
    return apiService.post<Refund>(`${this.baseUrl}/refunds/${refundId}/process`, {
      action,
      notes,
    });
  }

  /**
   * Get invoices
   */
  async getInvoices(filters?: {
    status?: Invoice['status'];
    userId?: string;
    partnerId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Invoice[]> {
    return apiService.get<Invoice[]>(`${this.baseUrl}/invoices`, filters);
  }

  /**
   * Get invoice by ID
   */
  async getInvoiceById(id: string): Promise<Invoice> {
    return apiService.get<Invoice>(`${this.baseUrl}/invoices/${id}`);
  }

  /**
   * Download invoice PDF
   */
  async downloadInvoice(id: string): Promise<Blob> {
    return apiService.get<Blob>(`${this.baseUrl}/invoices/${id}/pdf`, {}, {
      responseType: 'blob',
    });
  }

  /**
   * Get payment statistics
   */
  async getStatistics(startDate?: string, endDate?: string): Promise<PaymentStatistics> {
    return apiService.get<PaymentStatistics>(`${this.baseUrl}/statistics`, {
      startDate,
      endDate,
    });
  }

  /**
   * Get partner payouts
   */
  async getPayouts(partnerId?: string): Promise<Payout[]> {
    return apiService.get<Payout[]>(`${this.baseUrl}/payouts`, {
      partnerId,
    });
  }

  /**
   * Request payout (partner)
   */
  async requestPayout(amount: number, method: Payout['method']): Promise<Payout> {
    return apiService.post<Payout>(`${this.baseUrl}/payouts`, {
      amount,
      method,
    });
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(): Promise<WalletBalance> {
    return apiService.get<WalletBalance>(`${this.baseUrl}/wallet/balance`);
  }

  /**
   * Add funds to wallet
   */
  async addWalletFunds(amount: number, paymentMethodId: string): Promise<Transaction> {
    return apiService.post<Transaction>(`${this.baseUrl}/wallet/add-funds`, {
      amount,
      paymentMethodId,
    });
  }

  /**
   * Transfer from wallet
   */
  async transferFromWallet(amount: number, recipientId: string, description: string): Promise<Transaction> {
    return apiService.post<Transaction>(`${this.baseUrl}/wallet/transfer`, {
      amount,
      recipientId,
      description,
    });
  }

  /**
   * Get payment receipt
   */
  async getReceipt(transactionId: string): Promise<Blob> {
    return apiService.get<Blob>(`${this.baseUrl}/transactions/${transactionId}/receipt`, {}, {
      responseType: 'blob',
    });
  }

  /**
   * Export transactions
   */
  async exportTransactions(filters?: any, format: 'csv' | 'xlsx' | 'pdf' = 'csv'): Promise<Blob> {
    return apiService.get<Blob>(`${this.baseUrl}/transactions/export`, {
      ...filters,
      format,
    }, {
      responseType: 'blob',
    });
  }

  /**
   * Setup payment subscription
   */
  async createSubscription(planId: string, paymentMethodId: string): Promise<{
    subscriptionId: string;
    status: string;
    currentPeriodEnd: string;
  }> {
    return apiService.post(`${this.baseUrl}/subscriptions`, {
      planId,
      paymentMethodId,
    });
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/subscriptions/${subscriptionId}/cancel`, {
      immediately,
    });
  }

  /**
   * Verify payment (for webhooks/callbacks)
   */
  async verifyPayment(paymentId: string, signature: string): Promise<Transaction> {
    return apiService.post<Transaction>(`${this.baseUrl}/verify`, {
      paymentId,
      signature,
    });
  }

  /**
   * Calculate commission
   */
  async calculateCommission(amount: number, partnerId: string): Promise<{
    amount: number;
    commission: number;
    partnerReceives: number;
    rate: number;
  }> {
    return apiService.get(`${this.baseUrl}/calculate-commission`, {
      amount,
      partnerId,
    });
  }

  /**
   * Split payment between multiple parties
   */
  async createSplitPayment(data: {
    amount: number;
    currency: Currency;
    splits: Array<{
      partnerId: string;
      amount: number;
      description: string;
    }>;
    paymentMethod: PaymentMethod;
  }): Promise<Transaction> {
    return apiService.post<Transaction>(`${this.baseUrl}/split-payment`, data);
  }
}

// Export singleton instance
export const paymentsService = new PaymentsService();
export default paymentsService;
