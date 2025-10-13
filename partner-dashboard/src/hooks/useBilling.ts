/**
 * Billing Hooks
 *
 * React Query hooks for billing operations including subscriptions,
 * payment methods, invoices, and pricing plans
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import billingService, {
  Subscription,
  PaymentMethod,
  Invoice,
  PricingPlan,
  BillingStats,
  CreateSubscriptionData,
  UpdateSubscriptionData,
  AddPaymentMethodData,
} from '../services/billing.service';
import toast from 'react-hot-toast';

/**
 * Hook to get current subscription
 */
export function useCurrentSubscription() {
  return useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => billingService.getCurrentSubscription(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

/**
 * Hook to get subscription by ID
 */
export function useSubscription(subscriptionId: string | undefined) {
  return useQuery({
    queryKey: ['billing', 'subscription', subscriptionId],
    queryFn: () => billingService.getSubscription(subscriptionId!),
    enabled: !!subscriptionId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to create a new subscription
 */
export function useCreateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSubscriptionData) => billingService.createSubscription(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      toast.success('Subscription created successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create subscription');
    },
  });
}

/**
 * Hook to update current subscription
 */
export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSubscriptionData) => billingService.updateSubscription(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      toast.success('Subscription updated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update subscription');
    },
  });
}

/**
 * Hook to cancel subscription
 */
export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (immediately: boolean = false) => billingService.cancelSubscription(immediately),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      toast.success('Subscription canceled');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to cancel subscription');
    },
  });
}

/**
 * Hook to reactivate subscription
 */
export function useReactivateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => billingService.reactivateSubscription(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      toast.success('Subscription reactivated!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to reactivate subscription');
    },
  });
}

/**
 * Hook to get all payment methods
 */
export function usePaymentMethods() {
  return useQuery({
    queryKey: ['billing', 'payment-methods'],
    queryFn: () => billingService.getPaymentMethods(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to get payment method by ID
 */
export function usePaymentMethod(paymentMethodId: string | undefined) {
  return useQuery({
    queryKey: ['billing', 'payment-method', paymentMethodId],
    queryFn: () => billingService.getPaymentMethod(paymentMethodId!),
    enabled: !!paymentMethodId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to add a new payment method
 */
export function useAddPaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AddPaymentMethodData) => billingService.addPaymentMethod(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'payment-methods'] });
      toast.success('Payment method added successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add payment method');
    },
  });
}

/**
 * Hook to set default payment method
 */
export function useSetDefaultPaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentMethodId: string) => billingService.setDefaultPaymentMethod(paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'payment-methods'] });
      toast.success('Default payment method updated!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update default payment method');
    },
  });
}

/**
 * Hook to delete payment method
 */
export function useDeletePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentMethodId: string) => billingService.deletePaymentMethod(paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'payment-methods'] });
      toast.success('Payment method deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete payment method');
    },
  });
}

/**
 * Hook to get all invoices
 */
export function useInvoices(limit?: number) {
  return useQuery({
    queryKey: ['billing', 'invoices', limit],
    queryFn: () => billingService.getInvoices(limit),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to get invoice by ID
 */
export function useInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['billing', 'invoice', invoiceId],
    queryFn: () => billingService.getInvoice(invoiceId!),
    enabled: !!invoiceId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to download invoice
 */
export function useDownloadInvoice() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const blob = await billingService.downloadInvoice(invoiceId);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return blob;
    },
    onSuccess: () => {
      toast.success('Invoice downloaded!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to download invoice');
    },
  });
}

/**
 * Hook to retry invoice payment
 */
export function useRetryInvoicePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invoiceId: string) => billingService.retryInvoicePayment(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] });
      toast.success('Payment retry initiated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to retry payment');
    },
  });
}

/**
 * Hook to get all pricing plans
 */
export function usePricingPlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => billingService.getPricingPlans(),
    staleTime: 30 * 60 * 1000, // 30 minutes - plans don't change often
  });
}

/**
 * Hook to get pricing plan by ID
 */
export function usePricingPlan(planId: string | undefined) {
  return useQuery({
    queryKey: ['billing', 'plan', planId],
    queryFn: () => billingService.getPricingPlan(planId!),
    enabled: !!planId,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Hook to get billing statistics
 */
export function useBillingStats() {
  return useQuery({
    queryKey: ['billing', 'stats'],
    queryFn: () => billingService.getBillingStats(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to get billing portal URL
 */
export function useGetBillingPortalUrl() {
  return useMutation({
    mutationFn: (returnUrl?: string) => billingService.getBillingPortalUrl(returnUrl),
    onSuccess: (data) => {
      // Redirect to billing portal
      window.location.href = data.url;
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to open billing portal');
    },
  });
}

export default {
  useCurrentSubscription,
  useSubscription,
  useCreateSubscription,
  useUpdateSubscription,
  useCancelSubscription,
  useReactivateSubscription,
  usePaymentMethods,
  usePaymentMethod,
  useAddPaymentMethod,
  useSetDefaultPaymentMethod,
  useDeletePaymentMethod,
  useInvoices,
  useInvoice,
  useDownloadInvoice,
  useRetryInvoicePayment,
  usePricingPlans,
  usePricingPlan,
  useBillingStats,
  useGetBillingPortalUrl,
};
