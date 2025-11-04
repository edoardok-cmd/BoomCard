# Paysera Payment Integration - Quick Start

This guide shows how to quickly integrate Paysera payments into your existing pages.

## 1. Import the PaymentButton Component

```typescript
import { PaymentButton } from '@/components/PaymentButton';
```

## 2. Add Payment Button to Your Page

### Example: Wallet Page with Top-Up Options

```typescript
import { useState } from 'react';
import { PaymentButton } from '@/components/PaymentButton';

export function WalletPage() {
  const [selectedAmount, setSelectedAmount] = useState(50);
  const [customAmount, setCustomAmount] = useState('');

  const predefinedAmounts = [20, 50, 100, 200];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Wallet Top-Up</h1>

      {/* Current Balance */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg p-6 mb-8 text-white">
        <p className="text-sm opacity-90">Current Balance</p>
        <p className="text-4xl font-bold mt-2">125.50 BGN</p>
      </div>

      {/* Predefined Amounts */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Select Amount</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {predefinedAmounts.map((amount) => (
            <button
              key={amount}
              onClick={() => {
                setSelectedAmount(amount);
                setCustomAmount('');
              }}
              className={`
                p-4 rounded-lg border-2 font-semibold transition-all
                ${
                  selectedAmount === amount
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }
              `}
            >
              {amount} BGN
            </button>
          ))}
        </div>
      </div>

      {/* Custom Amount */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Or Enter Custom Amount</h2>
        <input
          type="number"
          value={customAmount}
          onChange={(e) => {
            setCustomAmount(e.target.value);
            setSelectedAmount(0);
          }}
          placeholder="Enter amount (BGN)"
          className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-600 focus:outline-none"
          min="1"
          step="0.01"
        />
      </div>

      {/* Payment Button */}
      <PaymentButton
        amount={customAmount ? parseFloat(customAmount) : selectedAmount}
        currency="BGN"
        description="Wallet top-up"
        metadata={{ source: 'wallet_page' }}
        size="lg"
        variant="primary"
      />

      {/* Payment Info */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-2">Payment Information</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>✓ Secure payment powered by Paysera</li>
          <li>✓ Supports cards, bank transfers, and e-wallets</li>
          <li>✓ Instant balance update after payment</li>
          <li>✓ Transaction fees: 1.5% + €0.10</li>
        </ul>
      </div>
    </div>
  );
}
```

## 3. PaymentButton Props

```typescript
interface PaymentButtonProps {
  amount: number;           // Amount in BGN (required)
  currency?: string;        // Default: 'BGN'
  description?: string;     // Default: 'Wallet top-up'
  metadata?: object;        // Additional data to store
  className?: string;       // Custom CSS classes
  variant?: 'primary' | 'secondary' | 'success'; // Button style
  size?: 'sm' | 'md' | 'lg'; // Button size
}
```

## 4. Example: Subscription Payment

```typescript
import { PaymentButton } from '@/components/PaymentButton';

export function SubscriptionPage() {
  const plans = [
    { id: 'basic', name: 'Basic', price: 29.99 },
    { id: 'premium', name: 'Premium', price: 59.99 },
    { id: 'enterprise', name: 'Enterprise', price: 99.99 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {plans.map((plan) => (
        <div key={plan.id} className="border rounded-lg p-6">
          <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
          <p className="text-3xl font-bold mb-6">
            {plan.price} BGN<span className="text-sm">/month</span>
          </p>

          <PaymentButton
            amount={plan.price}
            description={`${plan.name} subscription`}
            metadata={{
              plan_id: plan.id,
              plan_name: plan.name,
              subscription: true,
            }}
            variant="primary"
          />
        </div>
      ))}
    </div>
  );
}
```

## 5. Example: Checkout Page

```typescript
import { useState } from 'react';
import { PaymentButton } from '@/components/PaymentButton';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export function CheckoutPage() {
  const [cart] = useState<CartItem[]>([
    { id: '1', name: 'Product A', price: 25.50, quantity: 2 },
    { id: '2', name: 'Product B', price: 15.00, quantity: 1 },
  ]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.20; // 20% VAT
  const total = subtotal + tax;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Checkout</h1>

      {/* Cart Items */}
      <div className="border rounded-lg p-6 mb-6">
        {cart.map((item) => (
          <div key={item.id} className="flex justify-between mb-4">
            <div>
              <p className="font-semibold">{item.name}</p>
              <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
            </div>
            <p className="font-semibold">
              {(item.price * item.quantity).toFixed(2)} BGN
            </p>
          </div>
        ))}

        <div className="border-t pt-4 mt-4">
          <div className="flex justify-between mb-2">
            <p>Subtotal:</p>
            <p>{subtotal.toFixed(2)} BGN</p>
          </div>
          <div className="flex justify-between mb-2">
            <p>VAT (20%):</p>
            <p>{tax.toFixed(2)} BGN</p>
          </div>
          <div className="flex justify-between font-bold text-lg">
            <p>Total:</p>
            <p>{total.toFixed(2)} BGN</p>
          </div>
        </div>
      </div>

      {/* Payment Button */}
      <PaymentButton
        amount={total}
        description="Order payment"
        metadata={{
          cart_items: cart.map((item) => item.id),
          subtotal,
          tax,
        }}
        size="lg"
      />
    </div>
  );
}
```

## 6. Using Payment Service Directly

If you need more control, use the `paymentService` directly:

```typescript
import { paymentService } from '@/services/payment.service';

async function handleCustomPayment() {
  try {
    // Create payment
    const response = await paymentService.createPayment({
      amount: 50.00,
      currency: 'BGN',
      description: 'Custom payment',
      metadata: { custom: 'data' },
    });

    // Get payment URL
    const { paymentUrl, orderId } = response.data;

    // Store order ID for later verification
    localStorage.setItem('pendingOrderId', orderId);

    // Redirect to Paysera
    window.location.href = paymentUrl;
  } catch (error) {
    console.error('Payment failed:', error);
  }
}
```

## 7. Checking Payment Status

```typescript
import { useEffect, useState } from 'react';
import { paymentService } from '@/services/payment.service';

export function OrderStatusPage({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await paymentService.checkPaymentStatus(orderId);
        setStatus(response.data.status);
      } catch (error) {
        setStatus('error');
      }
    };

    checkStatus();

    // Poll every 5 seconds
    const interval = setInterval(checkStatus, 5000);

    return () => clearInterval(interval);
  }, [orderId]);

  return (
    <div>
      <p>Payment Status: {status}</p>
    </div>
  );
}
```

## 8. Payment History

```typescript
import { useEffect, useState } from 'react';
import { paymentService } from '@/services/payment.service';

export function PaymentHistoryPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await paymentService.getPaymentHistory(20, 0);
        setPayments(response.data);
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Payment History</h1>

      <div className="space-y-4">
        {payments.map((payment) => (
          <div key={payment.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold">{payment.description}</p>
                <p className="text-sm text-gray-600">
                  {new Date(payment.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold">
                  {payment.amount.toFixed(2)} {payment.currency}
                </p>
                <span
                  className={`
                    text-sm px-2 py-1 rounded
                    ${
                      payment.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : payment.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }
                  `}
                >
                  {payment.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 9. Supported Currencies

```typescript
// Get supported currencies dynamically
import { paymentService } from '@/services/payment.service';

useEffect(() => {
  const loadMethods = async () => {
    const response = await paymentService.getPaymentMethods();
    console.log('Supported currencies:', response.data.currencies);
    // ['BGN', 'EUR', 'USD', 'GBP', 'PLN', 'CZK', 'RON']
  };

  loadMethods();
}, []);
```

## 10. Error Handling

```typescript
import { useState } from 'react';
import { paymentService } from '@/services/payment.service';

export function PaymentForm() {
  const [error, setError] = useState<string | null>(null);

  const handlePayment = async () => {
    setError(null);

    try {
      await paymentService.initiatePayment({
        amount: 50.00,
        currency: 'BGN',
        description: 'Payment',
      });
    } catch (err: any) {
      // Handle different error types
      if (err.response?.status === 401) {
        setError('Please log in to continue');
      } else if (err.response?.status === 400) {
        setError(err.response.data.message || 'Invalid payment details');
      } else {
        setError('Payment failed. Please try again.');
      }
    }
  };

  return (
    <div>
      <button onClick={handlePayment}>Pay Now</button>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
```

## Next Steps

1. **Test in Development**: Use `PAYSERA_TEST_MODE=true` and test card `4111 1111 1111 1111`
2. **Style the Components**: Customize `PaymentButton` with your brand colors
3. **Add Loading States**: Show spinners while payments process
4. **Handle Errors**: Show user-friendly error messages
5. **Monitor Payments**: Check Sentry for payment errors
6. **Go Live**: Switch `PAYSERA_TEST_MODE=false` when ready

## Troubleshooting

**Payment button not working?**
- Check browser console for errors
- Verify JWT token is valid
- Ensure backend is running
- Check network tab for API calls

**Redirect not working?**
- Verify `FRONTEND_URL` and `API_BASE_URL` are correct
- Check Paysera webhook URL is set
- Review server logs for callback errors

**Balance not updating?**
- Check webhook received (server logs)
- Verify transaction status in database
- Look for Sentry errors
- Manually check payment status via API

For more help, see [PAYSERA_SETUP_GUIDE.md](./PAYSERA_SETUP_GUIDE.md).
