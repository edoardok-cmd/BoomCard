import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  paymentsService,
  Transaction,
  PaymentCard,
  PaymentIntent,
  Refund,
  Invoice,
  Payout,
  WalletBalance,
  PaymentStatistics,
  CreatePaymentData,
  TransactionType,
  PaymentStatus,
  PaymentMethod,
} from '../services/payments.service';
import toast from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Hook to fetch transactions with filters
 */
export function useTransactions(filters?: {
  type?: TransactionType;
  status?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  userId?: string;
  partnerId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => paymentsService.getTransactions(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch a single transaction by ID
 */
export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: ['transaction', id],
    queryFn: () => paymentsService.getTransactionById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to create payment intent
 */
export function useCreatePaymentIntent() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePaymentData) => paymentsService.createPaymentIntent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(
        language === 'bg'
          ? 'Плащането е инициирано успешно'
          : 'Payment initiated successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно инициализиране на плащане'
            : 'Failed to initiate payment')
      );
    },
  });
}

/**
 * Hook to confirm payment
 */
export function useConfirmPayment() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ intentId, paymentMethodId }: { intentId: string; paymentMethodId?: string }) =>
      paymentsService.confirmPayment(intentId, paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      toast.success(
        language === 'bg' ? 'Плащането е потвърдено' : 'Payment confirmed successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно потвърждаване на плащане' : 'Payment confirmation failed')
      );
    },
  });
}

/**
 * Hook to cancel payment
 */
export function useCancelPayment() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ intentId, reason }: { intentId: string; reason?: string }) =>
      paymentsService.cancelPayment(intentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(
        language === 'bg' ? 'Плащането е отменено' : 'Payment cancelled successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно отменяне на плащане' : 'Failed to cancel payment')
      );
    },
  });
}

/**
 * Hook to fetch payment cards
 */
export function usePaymentCards() {
  return useQuery({
    queryKey: ['payment-cards'],
    queryFn: () => paymentsService.getPaymentCards(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to add payment card
 */
export function useAddPaymentCard() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cardToken, setAsDefault }: { cardToken: string; setAsDefault?: boolean }) =>
      paymentsService.addPaymentCard(cardToken, setAsDefault),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cards'] });
      toast.success(
        language === 'bg' ? 'Картата е добавена успешно' : 'Card added successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно добавяне на карта' : 'Failed to add card')
      );
    },
  });
}

/**
 * Hook to remove payment card
 */
export function useRemovePaymentCard() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cardId: string) => paymentsService.removePaymentCard(cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cards'] });
      toast.success(
        language === 'bg' ? 'Картата е премахната' : 'Card removed successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно премахване на карта' : 'Failed to remove card')
      );
    },
  });
}

/**
 * Hook to set default card
 */
export function useSetDefaultCard() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cardId: string) => paymentsService.setDefaultCard(cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-cards'] });
      toast.success(
        language === 'bg'
          ? 'Основната карта е зададена'
          : 'Default card set successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно задаване на основна карта'
            : 'Failed to set default card')
      );
    },
  });
}

/**
 * Hook to request refund
 */
export function useRequestRefund() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      transactionId,
      amount,
      reason,
      reasonBg,
    }: {
      transactionId: string;
      amount: number;
      reason: string;
      reasonBg: string;
    }) => paymentsService.requestRefund(transactionId, amount, reason, reasonBg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
      toast.success(
        language === 'bg'
          ? 'Заявката за връщане е изпратена'
          : 'Refund request submitted successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешна заявка за връщане'
            : 'Failed to submit refund request')
      );
    },
  });
}

/**
 * Hook to fetch refunds
 */
export function useRefunds(transactionId?: string) {
  return useQuery({
    queryKey: ['refunds', transactionId],
    queryFn: () => paymentsService.getRefunds(transactionId),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to process refund (admin/partner)
 */
export function useProcessRefund() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      refundId,
      action,
      notes,
    }: {
      refundId: string;
      action: 'approve' | 'reject';
      notes?: string;
    }) => paymentsService.processRefund(refundId, action, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      const message =
        variables.action === 'approve'
          ? language === 'bg'
            ? 'Връщането е одобрено'
            : 'Refund approved'
          : language === 'bg'
          ? 'Връщането е отхвърлено'
          : 'Refund rejected';
      toast.success(message);
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешна обработка на връщане' : 'Failed to process refund')
      );
    },
  });
}

/**
 * Hook to fetch invoices
 */
export function useInvoices(filters?: {
  status?: Invoice['status'];
  userId?: string;
  partnerId?: string;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ['invoices', filters],
    queryFn: () => paymentsService.getInvoices(filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch invoice by ID
 */
export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => paymentsService.getInvoiceById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to download invoice PDF
 */
export function useDownloadInvoice() {
  const { language } = useLanguage();

  return useMutation({
    mutationFn: (id: string) => paymentsService.downloadInvoice(id),
    onSuccess: (blob, id) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(
        language === 'bg' ? 'Фактурата е изтеглена' : 'Invoice downloaded successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно изтегляне на фактура' : 'Failed to download invoice')
      );
    },
  });
}

/**
 * Hook to fetch payment statistics
 */
export function usePaymentStatistics(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['payment-statistics', startDate, endDate],
    queryFn: () => paymentsService.getStatistics(startDate, endDate),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch payouts
 */
export function usePayouts(partnerId?: string) {
  return useQuery({
    queryKey: ['payouts', partnerId],
    queryFn: () => paymentsService.getPayouts(partnerId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to request payout (partner)
 */
export function useRequestPayout() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ amount, method }: { amount: number; method: Payout['method'] }) =>
      paymentsService.requestPayout(amount, method),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      toast.success(
        language === 'bg'
          ? 'Заявката за изплащане е изпратена'
          : 'Payout request submitted successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешна заявка за изплащане'
            : 'Failed to submit payout request')
      );
    },
  });
}

/**
 * Hook to fetch wallet balance
 */
export function useWalletBalance() {
  return useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: () => paymentsService.getWalletBalance(),
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Hook to add funds to wallet
 */
export function useAddWalletFunds() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ amount, paymentMethodId }: { amount: number; paymentMethodId: string }) =>
      paymentsService.addWalletFunds(amount, paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(
        language === 'bg'
          ? 'Средствата са добавени към портфейла'
          : 'Funds added to wallet successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно добавяне на средства'
            : 'Failed to add funds to wallet')
      );
    },
  });
}

/**
 * Hook to transfer from wallet
 */
export function useTransferFromWallet() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      amount,
      recipientId,
      description,
    }: {
      amount: number;
      recipientId: string;
      description: string;
    }) => paymentsService.transferFromWallet(amount, recipientId, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(
        language === 'bg' ? 'Преводът е успешен' : 'Transfer completed successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешен превод' : 'Failed to complete transfer')
      );
    },
  });
}

/**
 * Hook to get payment receipt
 */
export function useGetReceipt() {
  const { language } = useLanguage();

  return useMutation({
    mutationFn: (transactionId: string) => paymentsService.getReceipt(transactionId),
    onSuccess: (blob, transactionId) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${transactionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(
        language === 'bg' ? 'Разписката е изтеглена' : 'Receipt downloaded successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg' ? 'Неуспешно изтегляне на разписка' : 'Failed to download receipt')
      );
    },
  });
}

/**
 * Hook to export transactions
 */
export function useExportTransactions() {
  const { language } = useLanguage();

  return useMutation({
    mutationFn: ({ filters, format }: { filters?: any; format?: 'csv' | 'xlsx' | 'pdf' }) =>
      paymentsService.exportTransactions(filters, format),
    onSuccess: (blob, variables) => {
      // Create download link
      const format = variables.format || 'csv';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(
        language === 'bg'
          ? 'Транзакциите са експортирани'
          : 'Transactions exported successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешен експорт на транзакции'
            : 'Failed to export transactions')
      );
    },
  });
}

/**
 * Hook to create subscription
 */
export function useCreateSubscription() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, paymentMethodId }: { planId: string; paymentMethodId: string }) =>
      paymentsService.createSubscription(planId, paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(
        language === 'bg'
          ? 'Абонаментът е създаден успешно'
          : 'Subscription created successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно създаване на абонамент'
            : 'Failed to create subscription')
      );
    },
  });
}

/**
 * Hook to cancel subscription
 */
export function useCancelSubscription() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ subscriptionId, immediately }: { subscriptionId: string; immediately?: boolean }) =>
      paymentsService.cancelSubscription(subscriptionId, immediately),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(
        language === 'bg' ? 'Абонаментът е отменен' : 'Subscription cancelled successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно отменяне на абонамент'
            : 'Failed to cancel subscription')
      );
    },
  });
}

/**
 * Hook to verify payment (for webhooks/callbacks)
 */
export function useVerifyPayment() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ paymentId, signature }: { paymentId: string; signature: string }) =>
      paymentsService.verifyPayment(paymentId, signature),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешна верификация на плащане'
            : 'Failed to verify payment')
      );
    },
  });
}

/**
 * Hook to calculate commission
 */
export function useCalculateCommission(amount: number, partnerId: string) {
  return useQuery({
    queryKey: ['commission', amount, partnerId],
    queryFn: () => paymentsService.calculateCommission(amount, partnerId),
    enabled: !!amount && !!partnerId,
  });
}

/**
 * Hook to create split payment
 */
export function useCreateSplitPayment() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      amount: number;
      currency: 'BGN' | 'EUR' | 'USD';
      splits: Array<{
        partnerId: string;
        amount: number;
        description: string;
      }>;
      paymentMethod: PaymentMethod;
    }) => paymentsService.createSplitPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(
        language === 'bg'
          ? 'Разделеното плащане е създадено'
          : 'Split payment created successfully'
      );
    },
    onError: (error: any) => {
      toast.error(
        error.message ||
          (language === 'bg'
            ? 'Неуспешно създаване на разделено плащане'
            : 'Failed to create split payment')
      );
    },
  });
}

/**
 * Hook to fetch recent transactions
 */
export function useRecentTransactions(limit: number = 10) {
  return useQuery({
    queryKey: ['transactions', 'recent', limit],
    queryFn: () => paymentsService.getTransactions({ limit }),
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to fetch pending transactions
 */
export function usePendingTransactions() {
  return useQuery({
    queryKey: ['transactions', 'pending'],
    queryFn: () => paymentsService.getTransactions({ status: 'pending' }),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });
}

/**
 * Hook to fetch failed transactions
 */
export function useFailedTransactions() {
  return useQuery({
    queryKey: ['transactions', 'failed'],
    queryFn: () => paymentsService.getTransactions({ status: 'failed' }),
    staleTime: 2 * 60 * 1000,
  });
}
