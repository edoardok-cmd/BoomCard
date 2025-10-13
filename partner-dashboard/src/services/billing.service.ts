/**
 * Billing Service
 *
 * Handles all billing-related API calls including subscriptions,
 * payment methods, invoices, and pricing plans
 */

import { apiService } from './api.service';

export interface Subscription {
  id: string;
  partnerId: string;
  planId: string;
  planName: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethod {
  id: string;
  partnerId: string;
  type: 'card';
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  partnerId: string;
  subscriptionId: string;
  number: string;
  date: Date;
  dueDate: Date;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'void';
  pdfUrl?: string;
  description?: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  nameEn: string;
  nameBg: string;
  description: string;
  descriptionEn: string;
  descriptionBg: string;
  price: {
    monthly: number;
    annual: number;
  };
  currency: string;
  features: string[];
  featuresEn: string[];
  featuresBg: string[];
  maxTransactions: number;
  maxLocations: number;
  analyticsLevel: 'basic' | 'advanced' | 'enterprise';
  supportLevel: 'email' | 'priority' | 'dedicated';
  featured?: boolean;
  active: boolean;
}

export interface CreateSubscriptionData {
  planId: string;
  paymentMethodId: string;
  billing: 'monthly' | 'annual';
}

export interface UpdateSubscriptionData {
  planId?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface AddPaymentMethodData {
  cardNumber: string;
  cardholderName: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  setAsDefault?: boolean;
}

export interface BillingStats {
  totalSpent: number;
  currency: string;
  invoicesPaid: number;
  invoicesPending: number;
  nextBillingDate: Date | null;
  subscriptionStatus: Subscription['status'] | null;
}

class BillingService {
  /**
   * Get current subscription for partner
   */
  async getCurrentSubscription(): Promise<Subscription> {
    const response = await apiService.get<Subscription>('/billing/subscription');
    return response;
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string): Promise<Subscription> {
    const response = await apiService.get<Subscription>(`/billing/subscriptions/${subscriptionId}`);
    return response;
  }

  /**
   * Create a new subscription
   */
  async createSubscription(data: CreateSubscriptionData): Promise<Subscription> {
    const response = await apiService.post<Subscription>('/billing/subscriptions', data);
    return response;
  }

  /**
   * Update current subscription
   */
  async updateSubscription(data: UpdateSubscriptionData): Promise<Subscription> {
    const response = await apiService.put<Subscription>('/billing/subscription', data);
    return response;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(immediately: boolean = false): Promise<Subscription> {
    const response = await apiService.post<Subscription>('/billing/subscription/cancel', {
      immediately,
    });
    return response;
  }

  /**
   * Reactivate canceled subscription
   */
  async reactivateSubscription(): Promise<Subscription> {
    const response = await apiService.post<Subscription>('/billing/subscription/reactivate');
    return response;
  }

  /**
   * Get all payment methods
   */
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const response = await apiService.get<PaymentMethod[]>('/billing/payment-methods');
    return response;
  }

  /**
   * Get payment method by ID
   */
  async getPaymentMethod(paymentMethodId: string): Promise<PaymentMethod> {
    const response = await apiService.get<PaymentMethod>(`/billing/payment-methods/${paymentMethodId}`);
    return response;
  }

  /**
   * Add a new payment method
   */
  async addPaymentMethod(data: AddPaymentMethodData): Promise<PaymentMethod> {
    const response = await apiService.post<PaymentMethod>('/billing/payment-methods', data);
    return response;
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(paymentMethodId: string): Promise<PaymentMethod> {
    const response = await apiService.put<PaymentMethod>(
      `/billing/payment-methods/${paymentMethodId}/default`
    );
    return response;
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(paymentMethodId: string): Promise<void> {
    await apiService.delete(`/billing/payment-methods/${paymentMethodId}`);
  }

  /**
   * Get all invoices
   */
  async getInvoices(limit?: number): Promise<Invoice[]> {
    const params = limit ? { limit } : {};
    const response = await apiService.get<Invoice[]>('/billing/invoices', params);
    return response;
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<Invoice> {
    const response = await apiService.get<Invoice>(`/billing/invoices/${invoiceId}`);
    return response;
  }

  /**
   * Download invoice PDF
   */
  async downloadInvoice(invoiceId: string): Promise<Blob> {
    const response = await apiService.get<Blob>(
      `/billing/invoices/${invoiceId}/download`,
      {},
      { responseType: 'blob' }
    );
    return response;
  }

  /**
   * Retry payment for failed invoice
   */
  async retryInvoicePayment(invoiceId: string): Promise<Invoice> {
    const response = await apiService.post<Invoice>(`/billing/invoices/${invoiceId}/retry`);
    return response;
  }

  /**
   * Get all pricing plans
   */
  async getPricingPlans(): Promise<PricingPlan[]> {
    const response = await apiService.get<PricingPlan[]>('/billing/plans');
    return response;
  }

  /**
   * Get pricing plan by ID
   */
  async getPricingPlan(planId: string): Promise<PricingPlan> {
    const response = await apiService.get<PricingPlan>(`/billing/plans/${planId}`);
    return response;
  }

  /**
   * Get billing statistics
   */
  async getBillingStats(): Promise<BillingStats> {
    const response = await apiService.get<BillingStats>('/billing/stats');
    return response;
  }

  /**
   * Generate billing portal URL (for Stripe-like providers)
   */
  async getBillingPortalUrl(returnUrl?: string): Promise<{ url: string }> {
    const response = await apiService.post<{ url: string }>('/billing/portal', {
      returnUrl: returnUrl || window.location.href,
    });
    return response;
  }
}

export default new BillingService();
