/**
 * Payment Success Page
 * Shown after successful Paysera payment
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { paymentService } from '../services/payment.service';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

type PaymentState = 'loading' | 'success' | 'failed' | 'error';

export function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');

  const [state, setState] = useState<PaymentState>('loading');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const verifyPayment = async () => {
      if (!orderId) {
        setState('error');
        setError('No order ID provided');
        return;
      }

      try {
        // Poll payment status (max 10 attempts, 2 seconds between)
        const response = await paymentService.pollPaymentStatus(orderId, 10, 2000);

        setPaymentData(response.data);

        if (response.data.status === 'completed') {
          setState('success');
        } else if (response.data.status === 'failed') {
          setState('failed');
          setError('Payment was not completed successfully');
        } else {
          setState('error');
          setError('Payment status unclear. Please contact support.');
        }
      } catch (err: any) {
        console.error('Payment verification error:', err);
        setState('error');
        setError(err.message || 'Failed to verify payment. Please contact support.');
      }
    };

    verifyPayment();
  }, [orderId]);

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Verifying Payment
          </h2>
          <p className="text-gray-600">
            Please wait while we confirm your payment...
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-6" />

          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Payment Successful!
          </h1>

          <p className="text-gray-600 mb-6">
            Your wallet has been topped up successfully.
          </p>

          {paymentData && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Amount:</span>
                <span className="font-semibold text-gray-900">
                  {paymentData.amount.toFixed(2)} {paymentData.currency}
                </span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Order ID:</span>
                <span className="font-mono text-sm text-gray-900">
                  {paymentData.orderId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Date:</span>
                <span className="text-gray-900">
                  {new Date(paymentData.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Link
              to="/wallet"
              className="block w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              View Wallet
            </Link>

            <Link
              to="/dashboard"
              className="block w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Failed or Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <XCircle className="w-20 h-20 text-red-600 mx-auto mb-6" />

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {state === 'failed' ? 'Payment Failed' : 'Verification Error'}
        </h1>

        <p className="text-gray-600 mb-2">
          {state === 'failed'
            ? 'Your payment could not be processed.'
            : 'We encountered an error verifying your payment.'}
        </p>

        {error && (
          <p className="text-sm text-red-600 mb-6">
            {error}
          </p>
        )}

        {orderId && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <div className="flex justify-between">
              <span className="text-gray-600">Order ID:</span>
              <span className="font-mono text-sm text-gray-900">
                {orderId}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Link
            to="/wallet"
            className="block w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Try Again
          </Link>

          <Link
            to="/support"
            className="block w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}

export default PaymentSuccessPage;
