/**
 * Payment Button Component
 * Initiates Paysera payment flow
 */

import { useState } from 'react';
import { paymentService } from '../services/payment.service';
import { CreditCard, Loader2 } from 'lucide-react';

interface PaymentButtonProps {
  amount: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, any>;
  className?: string;
  variant?: 'primary' | 'secondary' | 'success';
  size?: 'sm' | 'md' | 'lg';
}

export function PaymentButton({
  amount,
  currency = 'BGN',
  description = 'Wallet top-up',
  metadata,
  className = '',
  variant = 'primary',
  size = 'md',
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      // Validate amount
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Create payment and redirect to Paysera
      await paymentService.initiatePayment({
        amount,
        currency,
        description,
        metadata,
      });

      // User will be redirected to Paysera, so no further action needed
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.response?.data?.message || err.message || 'Payment failed');
      setLoading(false);
    }
  };

  // Variant styles
  const variantStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
  };

  // Size styles
  const sizeStyles = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <div className="w-full">
      <button
        onClick={handlePayment}
        disabled={loading}
        className={`
          w-full flex items-center justify-center font-semibold rounded-lg
          transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="w-5 h-5 mr-2" />
            Pay {amount.toFixed(2)} {currency}
          </>
        )}
      </button>

      {error && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
