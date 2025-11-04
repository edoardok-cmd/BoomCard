# Developer D: Frontend Web Dashboard - Stripe Payment UI & Admin Features

## 📋 Implementation Plan

### Phase 1: Stripe Payment Integration ✅

#### 1.1 Stripe Setup (Backend - Already Complete)
- ✅ Stripe service implementation ([stripe.service.ts](backend-api/src/services/stripe.service.ts))
- ✅ Payment routes ([payments.routes.ts](backend-api/src/routes/payments.routes.ts))
- ✅ Payment intents API
- ✅ Card management API
- ✅ Webhook handling
- ✅ Transaction tracking

#### 1.2 Frontend Payment Components (To Implement)

**File: partner-dashboard/src/components/payments/PaymentMethodCard.tsx**
```typescript
// Display saved payment methods
// Features:
// - Card brand and last 4 digits
// - Expiry date
// - Set as default
// - Delete card option
```

**File: partner-dashboard/src/components/payments/AddPaymentMethodModal.tsx**
```typescript
// Stripe Elements integration
// Features:
// - Card number input
// - CVC input
// - Expiry date input
// - Billing address
// - Save card option
// - 3D Secure handling
```

**File: partner-dashboard/src/components/payments/PaymentHistory.tsx**
```typescript
// Transaction history table
// Features:
// - Date, amount, status
// - Payment method used
// - Receipt download
// - Refund request
// - Filters and search
```

**File: partner-dashboard/src/components/payments/WalletBalance.tsx**
```typescript
// Wallet balance widget
// Features:
// - Current balance display
// - Top-up button
// - Transaction history link
// - Cashback earned
```

#### 1.3 Payment Pages

**File: partner-dashboard/src/pages/PaymentsPage.tsx**
```typescript
// Main payments dashboard
// Sections:
// - Wallet balance card
// - Payment methods list
// - Recent transactions
// - Top-up wallet section
```

**File: partner-dashboard/src/pages/SubscriptionPage.tsx**
```typescript
// Subscription management
// Features:
// - Current plan display
// - Plan comparison table
// - Upgrade/downgrade buttons
// - Billing cycle toggle
// - Cancel subscription
```

**File: partner-dashboard/src/pages/CheckoutPage.tsx**
```typescript
// Checkout flow
// Steps:
// 1. Item/service selection
// 2. Payment method selection
// 3. Review and confirm
// 4. Payment processing
// 5. Success/failure feedback
```

### Phase 2: Admin Features

#### 2.1 Admin Dashboard

**File: partner-dashboard/src/pages/admin/AdminDashboardPage.tsx**
```typescript
// Admin overview dashboard
// Stats:
// - Total users
// - Total receipts (approved/pending/rejected)
// - Total cashback paid
// - Revenue metrics
// - Active partners
// Charts:
// - User growth
// - Receipt submissions over time
// - Payment volume
// - Top merchants
```

#### 2.2 User Management

**File: partner-dashboard/src/pages/admin/UsersManagementPage.tsx**
```typescript
// User administration
// Features:
// - User list with filters
// - Search by email/name
// - User detail view
// - Edit user profile
// - Suspend/activate user
// - View user activity
// - Loyalty tier management
```

**File: partner-dashboard/src/components/admin/UserDetailsModal.tsx**
```typescript
// User detail modal
// Information:
// - Profile data
// - Registration date
// - Last login
// - Total receipts
// - Total cashback
// - Payment methods
// - Transaction history
// Actions:
// - Edit profile
// - Reset password
// - Suspend account
// - Delete account
```

#### 2.3 Receipt Management

**File: partner-dashboard/src/pages/admin/ReceiptReviewPage.tsx**
```typescript
// Receipt review dashboard
// Features:
// - Pending receipts queue
// - Receipt detail view
// - OCR data display
// - GPS validation info
// - Fraud score display
// - Approve/reject buttons
// - Add review notes
// - Bulk actions
```

**File: partner-dashboard/src/components/admin/ReceiptReviewCard.tsx**
```typescript
// Individual receipt review card
// Shows:
// - Receipt image
// - OCR extracted data
// - User-entered data
// - GPS coordinates and distance
// - Fraud detection results
// - Similar receipts (duplicates)
// Actions:
// - Approve
// - Reject with reason
// - Request more info
// - Flag for fraud
```

#### 2.4 Partner/Venue Management

**File: partner-dashboard/src/pages/admin/PartnersManagementPage.tsx**
```typescript
// Partner administration
// Features:
// - Partner list with filters
// - Add new partner
// - Edit partner details
// - Activate/deactivate
// - Set cashback rates
// - Manage venues
// - View partner analytics
```

**File: partner-dashboard/src/pages/admin/VenuesManagementPage.tsx**
```typescript
// Venue management
// Features:
// - Venue list with map view
// - Add new venue
// - Edit venue details
// - Set GPS coordinates
// - Configure sticker settings
// - Cashback rate configuration
// - Opening hours management
```

#### 2.5 Financial Management

**File: partner-dashboard/src/pages/admin/PaymentsAdminPage.tsx**
```typescript
// Payment administration
// Features:
// - All transactions list
// - Payment status tracking
// - Refund processing
// - Revenue reports
// - Export to CSV/Excel
// - Payout management
```

**File: partner-dashboard/src/pages/admin/CashbackAdminPage.tsx**
```typescript
// Cashback management
// Features:
// - Pending cashback queue
// - Cashback approval
// - Payment batches
// - Failed payments retry
// - Cashback analytics
// - Export reports
```

#### 2.6 Analytics & Reports

**File: partner-dashboard/src/pages/admin/AnalyticsAdminPage.tsx**
```typescript
// Advanced analytics
// Reports:
// - User acquisition metrics
// - Receipt submission trends
// - Fraud detection stats
// - Revenue breakdown
// - Partner performance
// - Cashback ROI
// - Geographic distribution
// Exports:
// - PDF reports
// - Excel exports
// - Scheduled emails
```

#### 2.7 System Settings

**File: partner-dashboard/src/pages/admin/SettingsAdminPage.tsx**
```typescript
// System configuration
// Settings:
// - GPS radius configuration
// - OCR confidence thresholds
// - Fraud detection rules
// - Rate limits
// - Email templates
// - Feature flags
// - API keys management
// - Webhook configuration
```

### Phase 3: Implementation Details

#### 3.1 Stripe Components Installation

```bash
cd partner-dashboard
npm install @stripe/stripe-js @stripe/react-stripe-js
```

#### 3.2 Stripe Provider Setup

**File: partner-dashboard/src/App.tsx (Update)**
```typescript
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

function App() {
  return (
    <Elements stripe={stripePromise}>
      {/* Rest of app */}
    </Elements>
  );
}
```

#### 3.3 Payment Method Form

**File: partner-dashboard/src/components/payments/CardForm.tsx**
```typescript
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

export function CardForm() {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) return;

    const cardElement = elements.getElement(CardElement);

    // Create payment method
    const { error, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
      billing_details: {
        name: billingName,
        email: userEmail,
      },
    });

    if (error) {
      // Handle error
      return;
    }

    // Send paymentMethod.id to backend
    await savePaymentMethod(paymentMethod.id);
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardElement
        options={{
          style: {
            base: {
              fontSize: '16px',
              color: '#424770',
              '::placeholder': {
                color: '#aab7c4',
              },
            },
            invalid: {
              color: '#9e2146',
            },
          },
        }}
      />
      <button type="submit" disabled={!stripe}>
        Save Card
      </button>
    </form>
  );
}
```

#### 3.4 Payment Intent Flow

**File: partner-dashboard/src/services/payment.service.ts**
```typescript
export class PaymentService {
  // Create payment intent
  static async createPaymentIntent(amount: number, currency: string = 'BGN') {
    const response = await api.post('/api/payments/intents', {
      amount: Math.round(amount * 100), // Convert to cents
      currency,
    });
    return response.data;
  }

  // Confirm payment
  static async confirmPayment(paymentIntentId: string, paymentMethodId: string) {
    const response = await api.post(`/api/payments/intents/${paymentIntentId}/confirm`, {
      paymentMethodId,
    });
    return response.data;
  }

  // Handle 3D Secure if needed
  static async handle3DSecure(stripe, clientSecret) {
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret);

    if (error) {
      throw new Error(error.message);
    }

    return paymentIntent;
  }
}
```

#### 3.5 Admin Role Protection

**File: partner-dashboard/src/components/ProtectedAdminRoute.tsx**
```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function ProtectedAdminRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" />;
  }

  return <>{children}</>;
}
```

#### 3.6 Admin Navigation

**File: partner-dashboard/src/components/AdminSidebar.tsx**
```typescript
export function AdminSidebar() {
  return (
    <aside className="admin-sidebar">
      <nav>
        <NavLink to="/admin/dashboard">
          <DashboardIcon /> Dashboard
        </NavLink>
        <NavLink to="/admin/users">
          <UsersIcon /> Users
        </NavLink>
        <NavLink to="/admin/receipts">
          <ReceiptIcon /> Receipts
        </NavLink>
        <NavLink to="/admin/partners">
          <PartnersIcon /> Partners
        </NavLink>
        <NavLink to="/admin/venues">
          <VenueIcon /> Venues
        </NavLink>
        <NavLink to="/admin/payments">
          <PaymentIcon /> Payments
        </NavLink>
        <NavLink to="/admin/cashback">
          <CashbackIcon /> Cashback
        </NavLink>
        <NavLink to="/admin/analytics">
          <AnalyticsIcon /> Analytics
        </NavLink>
        <NavLink to="/admin/settings">
          <SettingsIcon /> Settings
        </NavLink>
      </nav>
    </aside>
  );
}
```

### Phase 4: Testing Requirements

#### 4.1 Payment Testing
- Test card numbers (Stripe test mode):
  - Success: `4242 4242 4242 4242`
  - Decline: `4000 0000 0000 0002`
  - 3D Secure: `4000 0027 6000 3184`

#### 4.2 Admin Testing
- Test admin user creation
- Test role-based access control
- Test all CRUD operations
- Test bulk actions
- Test data exports

### Phase 5: Security Considerations

#### 5.1 Payment Security
- ✅ Never store raw card numbers
- ✅ Use Stripe.js for PCI compliance
- ✅ Implement 3D Secure
- ✅ Validate amounts server-side
- ✅ Log all payment attempts
- ✅ Implement rate limiting

#### 5.2 Admin Security
- ✅ Require admin authentication
- ✅ Implement audit logging
- ✅ Two-factor authentication (optional)
- ✅ Session timeout for admin users
- ✅ IP whitelist (optional)
- ✅ Activity monitoring

### Phase 6: UI/UX Guidelines

#### 6.1 Payment UI Best Practices
- Clear pricing display
- Progress indicators during payment
- Error messages user-friendly
- Success confirmation with receipt
- Support for multiple payment methods
- Mobile-responsive design

#### 6.2 Admin UI Best Practices
- Data tables with pagination
- Advanced filtering and search
- Bulk action confirmations
- Keyboard shortcuts
- Export options visible
- Quick action buttons

### Implementation Checklist

**Stripe Integration:**
- [ ] Install Stripe packages
- [ ] Configure Stripe provider
- [ ] Create payment method form
- [ ] Implement payment intent flow
- [ ] Handle 3D Secure
- [ ] Add payment method management
- [ ] Create wallet top-up flow
- [ ] Add subscription management
- [ ] Test payment flows
- [ ] Add error handling

**Admin Features:**
- [ ] Create admin layout
- [ ] Implement admin routing
- [ ] Add role-based access control
- [ ] Create admin dashboard
- [ ] Build user management
- [ ] Build receipt review system
- [ ] Add partner/venue management
- [ ] Create financial admin tools
- [ ] Add analytics and reports
- [ ] Implement system settings
- [ ] Add audit logging
- [ ] Test all admin features

**Integration:**
- [ ] Connect frontend to payment APIs
- [ ] Connect frontend to admin APIs
- [ ] Add real-time updates (WebSocket)
- [ ] Implement notifications
- [ ] Add activity tracking
- [ ] Create export functionality

### Timeline Estimate

**Week 1-2: Stripe Payment Integration**
- Days 1-3: Setup and basic integration
- Days 4-7: Payment flows and testing
- Days 8-10: Wallet and subscriptions
- Days 11-14: Polish and edge cases

**Week 3-4: Admin Features**
- Days 15-17: Admin layout and routing
- Days 18-21: User and receipt management
- Days 22-24: Partner/venue management
- Days 25-28: Financial and analytics tools

**Week 5: Testing and Polish**
- Days 29-31: Integration testing
- Days 32-33: Security audit
- Days 34-35: Performance optimization

**Total: 5 weeks**

---

## 📊 Current Status

**Backend APIs:** ✅ Complete
- Payment routes implemented
- Stripe service working
- Transaction tracking ready
- Webhook handling configured

**Frontend:** 🚧 To Implement
- Stripe UI components needed
- Admin dashboard pages needed
- Payment flows to build
- Admin tools to create

**Next Steps:**
1. Install Stripe React packages
2. Create payment component library
3. Build admin dashboard layout
4. Implement payment flows
5. Add admin management tools
6. Test end-to-end
7. Deploy to production

---

**This plan provides a complete roadmap for implementing Stripe payment UI and admin features in the BoomCard frontend dashboard.**
