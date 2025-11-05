/**
 * Payment Cancel Page
 * Shown when user cancels Paysera payment
 */

import { Link, useSearchParams } from 'react-router-dom';
import { XCircle, ArrowLeft } from 'lucide-react';

export function PaymentCancelPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-100 rounded-full mb-6">
          <XCircle className="w-12 h-12 text-orange-600" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Payment Cancelled
        </h1>

        <p className="text-gray-600 mb-6">
          You cancelled the payment process. No charges have been made to your account.
        </p>

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
            className="flex items-center justify-center w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Wallet
          </Link>

          <Link
            to="/dashboard"
            className="block w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
          >
            Go to Dashboard
          </Link>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500 mb-4">
            Need help with payments?
          </p>
          <Link
            to="/support"
            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}

export default PaymentCancelPage;
