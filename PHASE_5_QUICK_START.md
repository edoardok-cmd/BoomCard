# Phase 5 Quick Start Guide

## 🚀 Getting Started with Payments, Loyalty & Messaging

This guide will help you quickly integrate the new Phase 5 features into your BoomCard Partner Dashboard.

---

## ✅ What's Already Done

All Phase 5 code is complete and ready to use:

- ✅ **Services** - All API services implemented
- ✅ **Hooks** - 60+ React Query hooks ready
- ✅ **Translations** - Bilingual support merged into locale files
- ✅ **TypeScript** - Full type safety
- ✅ **Documentation** - Comprehensive guides available

---

## 1. Quick Setup (5 minutes)

### Step 1: Environment Variables

Add to your `.env` file:

```bash
# Payment Gateways
REACT_APP_STRIPE_PUBLIC_KEY=pk_test_your_key_here
REACT_APP_PAYPAL_CLIENT_ID=your_client_id_here

# WebSocket URLs (for messaging & notifications)
REACT_APP_WS_URL=ws://localhost:4000

# Feature Flags
REACT_APP_ENABLE_PAYMENTS=true
REACT_APP_ENABLE_LOYALTY=true
REACT_APP_ENABLE_MESSAGING=true
```

### Step 2: Initialize Messaging (App.tsx)

```typescript
// src/App.tsx
import { useMessagingConnection } from './hooks/useMessaging';

function App() {
  // Connect to messaging WebSocket automatically
  useMessagingConnection();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Your app */}
    </QueryClientProvider>
  );
}
```

**That's it!** You're ready to use all Phase 5 features.

---

## 2. Using Payments (Copy & Paste Examples)

### Example 1: Display Payment Methods

```typescript
// src/pages/PaymentsPage.tsx
import { usePaymentCards, useSetDefaultCard, useRemovePaymentCard } from '../hooks/usePayments';
import { useLanguage } from '../contexts/LanguageContext';

export function PaymentMethodsPage() {
  const { language } = useLanguage();
  const { data: cards, isLoading } = usePaymentCards();
  const setDefault = useSetDefaultCard();
  const removeCard = useRemovePaymentCard();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{language === 'bg' ? 'Методи за плащане' : 'Payment Methods'}</h1>

      {cards?.map(card => (
        <div key={card.id} className="card-item">
          <div>
            {card.brand} •••• {card.last4}
            {card.isDefault && <span className="badge">Default</span>}
          </div>

          <div>
            {!card.isDefault && (
              <button onClick={() => setDefault.mutate(card.id)}>
                Set as Default
              </button>
            )}
            <button onClick={() => removeCard.mutate(card.id)}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Example 2: Process a Payment

```typescript
import { useCreatePaymentIntent, useConfirmPayment } from '../hooks/usePayments';

export function BookingCheckout({ booking }) {
  const createIntent = useCreatePaymentIntent();
  const confirmPayment = useConfirmPayment();
  const [paymentIntentId, setPaymentIntentId] = useState(null);

  const handlePay = async () => {
    // Step 1: Create payment intent
    const intent = await createIntent.mutateAsync({
      amount: booking.totalAmount,
      currency: 'BGN',
      paymentMethod: 'card',
      description: 'Booking payment',
      descriptionBg: 'Плащане за резервация',
      bookingId: booking.id,
    });

    setPaymentIntentId(intent.id);

    // Step 2: Confirm payment (integrate with Stripe Elements here)
    await confirmPayment.mutateAsync({
      intentId: intent.id,
      paymentMethodId: 'pm_card_visa', // From Stripe
    });

    // Done! Payment complete
  };

  return (
    <button onClick={handlePay} disabled={createIntent.isPending}>
      {createIntent.isPending ? 'Processing...' : 'Pay Now'}
    </button>
  );
}
```

### Example 3: Display Transaction History

```typescript
import { useTransactions } from '../hooks/usePayments';

export function TransactionsHistory() {
  const { data: transactions } = useTransactions({
    limit: 20,
    page: 1,
  });

  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Date</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {transactions?.data.map(tx => (
          <tr key={tx.id}>
            <td>{tx.id}</td>
            <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
            <td>{tx.amount} {tx.currency}</td>
            <td>{tx.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## 3. Using Loyalty Program (Copy & Paste Examples)

### Example 1: Display User's Loyalty Status

```typescript
import { useLoyaltyAccount, useTierBenefits } from '../hooks/useLoyalty';

export function LoyaltyDashboard() {
  const { data: account } = useLoyaltyAccount();
  const { data: tiers } = useTierBenefits();

  const currentTierBenefits = tiers?.find(t => t.tier === account?.tier);

  return (
    <div>
      <div className="tier-card">
        <h2>{account?.tier} Tier</h2>
        <p>{account?.availablePoints} Points Available</p>

        <div className="progress-bar">
          <div style={{ width: `${account?.tierProgress}%` }} />
        </div>
        <p>
          {account?.pointsToNextTier} points to {account?.nextTier}
        </p>
      </div>

      <h3>Your Benefits</h3>
      {currentTierBenefits?.perks.map(perk => (
        <div key={perk.name}>
          <strong>{perk.name}</strong>
          <p>{perk.description}</p>
        </div>
      ))}
    </div>
  );
}
```

### Example 2: Browse & Redeem Rewards

```typescript
import { useRewards, useRedeemReward, useRewardAvailability } from '../hooks/useLoyalty';

export function RewardsCatalog() {
  const { data: rewards } = useRewards({ type: 'discount' });
  const redeemReward = useRedeemReward();

  return (
    <div className="rewards-grid">
      {rewards?.data.map(reward => (
        <RewardCard key={reward.id} reward={reward} />
      ))}
    </div>
  );
}

function RewardCard({ reward }) {
  const { language } = useLanguage();
  const { data: availability } = useRewardAvailability(reward.id);
  const redeemReward = useRedeemReward();

  return (
    <div className="reward-card">
      <img src={reward.imageUrl} alt={reward.name} />
      <h3>{language === 'bg' ? reward.nameBg : reward.name}</h3>
      <p className="points">{reward.pointsCost} points</p>

      <button
        onClick={() => redeemReward.mutate(reward.id)}
        disabled={!availability?.available}
      >
        {availability?.available ? 'Redeem' : 'Not Available'}
      </button>
    </div>
  );
}
```

### Example 3: Show Referral Program

```typescript
import { useReferralCode, useUserReferrals } from '../hooks/useLoyalty';

export function ReferralSection() {
  const { data: referralData } = useReferralCode();
  const { data: referrals } = useUserReferrals();

  const copyCode = () => {
    navigator.clipboard.writeText(referralData?.code);
    toast.success('Referral code copied!');
  };

  return (
    <div>
      <h2>Invite Friends & Earn Points</h2>

      <div className="referral-code-box">
        <code>{referralData?.code}</code>
        <button onClick={copyCode}>Copy</button>
      </div>

      <button onClick={() => navigator.share({ url: referralData?.url })}>
        Share Link
      </button>

      <h3>Your Referrals ({referrals?.length})</h3>
      {referrals?.map(ref => (
        <div key={ref.id}>
          {ref.status === 'completed' ? '✓' : '⏳'}
          {ref.status === 'completed'
            ? `${ref.referrerPointsAwarded} points earned`
            : 'Pending'}
        </div>
      ))}
    </div>
  );
}
```

---

## 4. Using Messaging (Copy & Paste Examples)

### Example 1: Conversation List

```typescript
import { useConversations, useUnreadCount } from '../hooks/useMessaging';
import { Link } from 'react-router-dom';

export function MessagingInbox() {
  const { data: conversations } = useConversations();
  const { data: unreadCount } = useUnreadCount();

  return (
    <div>
      <h1>
        Messages
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </h1>

      <div className="conversations-list">
        {conversations?.data.map(conv => (
          <Link key={conv.id} to={`/messages/${conv.id}`}>
            <div className="conversation-item">
              <div className="avatar">
                {conv.participants[0]?.avatar}
              </div>

              <div className="content">
                <h4>{conv.title}</h4>
                <p>{conv.lastMessage?.content}</p>
                <span className="time">
                  {new Date(conv.lastMessageAt).toLocaleTimeString()}
                </span>
              </div>

              {conv.unreadCount > 0 && (
                <span className="unread-badge">{conv.unreadCount}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

### Example 2: Chat Interface with Real-Time Updates

```typescript
import {
  useMessages,
  useSendMessage,
  useMarkAsRead,
  useNewMessageSubscription,
} from '../hooks/useMessaging';
import { useState, useCallback } from 'react';

export function ChatInterface({ conversationId }) {
  const { data: messagesData } = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();
  const [messageText, setMessageText] = useState('');

  // Subscribe to new messages in real-time
  const handleNewMessage = useCallback((newMessage) => {
    // Message is already in cache via React Query
    // Mark it as read
    markAsRead.mutate({ conversationId, messageId: newMessage.id });
  }, [conversationId]);

  useNewMessageSubscription(conversationId, handleNewMessage);

  const handleSend = async () => {
    if (!messageText.trim()) return;

    await sendMessage.mutateAsync({
      conversationId,
      type: 'text',
      content: messageText,
    });

    setMessageText('');
  };

  return (
    <div className="chat-interface">
      <div className="messages">
        {messagesData?.data.map(message => (
          <div
            key={message.id}
            className={`message ${message.senderId === 'me' ? 'sent' : 'received'}`}
          >
            <p>{message.content}</p>
            <span className="time">
              {new Date(message.createdAt).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>

      <div className="input-area">
        <input
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}
```

### Example 3: Message Templates

```typescript
import { useMessageTemplates, useApplyTemplate } from '../hooks/useMessaging';

export function QuickReplies({ onSelectTemplate }) {
  const { data: templates } = useMessageTemplates('booking');
  const applyTemplate = useApplyTemplate();

  const handleSelectTemplate = async (templateId) => {
    const result = await applyTemplate.mutateAsync({
      templateId,
      variables: {
        customerName: 'John',
        bookingDate: '2025-10-20',
      },
    });

    onSelectTemplate(result.content);
  };

  return (
    <div className="quick-replies">
      <h4>Quick Replies</h4>
      {templates?.map(template => (
        <button
          key={template.id}
          onClick={() => handleSelectTemplate(template.id)}
        >
          {template.name}
        </button>
      ))}
    </div>
  );
}
```

---

## 5. Common Patterns

### Pattern 1: Loading States

```typescript
const { data, isLoading, error } = useSomeHook();

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
if (!data) return null;

return <YourComponent data={data} />;
```

### Pattern 2: Mutations with Feedback

```typescript
const mutation = useSomeMutation();

const handleAction = async () => {
  try {
    await mutation.mutateAsync(data);
    // Success toast is automatic (in the hook)
  } catch (error) {
    // Error toast is automatic (in the hook)
  }
};

return (
  <button
    onClick={handleAction}
    disabled={mutation.isPending}
  >
    {mutation.isPending ? 'Processing...' : 'Submit'}
  </button>
);
```

### Pattern 3: Bilingual Display

```typescript
const { language } = useLanguage();

// For simple text
const displayText = language === 'bg' ? item.nameBg : item.name;

// For translations
const t = language === 'bg' ? bg : en;
const text = t.payments.title; // Returns "Payments" or "Плащания"
```

---

## 6. Adding New Pages

### Quick Template for a New Feature Page

```typescript
// src/pages/MyFeaturePage.tsx
import { useSomeHook } from '../hooks/useSomeFeature';
import { useLanguage } from '../contexts/LanguageContext';
import { en, bg } from '../locales';

export function MyFeaturePage() {
  const { language } = useLanguage();
  const t = language === 'bg' ? bg : en;
  const { data, isLoading, error } = useSomeHook();

  if (isLoading) return <div>{t.common.loading}</div>;
  if (error) return <div>{t.common.error}</div>;

  return (
    <div className="page-container">
      <h1>{t.myFeature.title}</h1>
      <p>{t.myFeature.subtitle}</p>

      {/* Your content */}
    </div>
  );
}
```

### Add Route

```typescript
// src/App.tsx
<Route path="/my-feature" element={<MyFeaturePage />} />
```

---

## 7. Testing Checklist

Before going to production, test these scenarios:

### Payments
- [ ] Create payment with card
- [ ] Cancel payment
- [ ] Request refund
- [ ] Add/remove payment cards
- [ ] View transaction history
- [ ] Export transactions

### Loyalty
- [ ] View loyalty dashboard
- [ ] Browse rewards catalog
- [ ] Redeem a reward
- [ ] View badges collection
- [ ] Generate referral code
- [ ] View leaderboard

### Messaging
- [ ] Send text message
- [ ] Receive message in real-time
- [ ] View conversation list
- [ ] Archive conversation
- [ ] Use message template
- [ ] Search messages

---

## 8. Troubleshooting

### Issue: "WebSocket connection failed"

**Solution:**
Check your `.env` file has the correct WebSocket URL:
```bash
REACT_APP_WS_URL=ws://localhost:4000
```

### Issue: "Payment fails immediately"

**Solution:**
Ensure your Stripe/PayPal keys are correct and you're using test keys in development:
```bash
REACT_APP_STRIPE_PUBLIC_KEY=pk_test_...
```

### Issue: "Translations not showing"

**Solution:**
1. Check that Phase 5 translations are merged into `en.ts` and `bg.ts`
2. Verify the translation key path: `t.payments.title` not `t.payment.title`

### Issue: "Hooks not working"

**Solution:**
Ensure React Query is properly initialized in your `App.tsx`:
```typescript
<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

---

## 9. Next Steps

Now that you're set up:

1. **Customize the UI** - Style components to match your brand
2. **Implement Backend** - Build the API endpoints (see service files for contracts)
3. **Add Error Boundaries** - Wrap components in error boundaries
4. **Setup Monitoring** - Add Sentry or similar for error tracking
5. **Write Tests** - Add unit and integration tests
6. **Deploy** - Follow deployment checklist in COMPLETE_IMPLEMENTATION_SUMMARY.md

---

## 10. Quick Reference

### All Hooks Available

**Payments (30+ hooks):**
- `useTransactions(filters)`
- `useCreatePaymentIntent()`
- `useConfirmPayment()`
- `usePaymentCards()`
- `useAddPaymentCard()`
- `useRequestRefund()`
- `useWalletBalance()`
- `usePaymentStatistics()`
- ...and 22 more

**Loyalty (30+ hooks):**
- `useLoyaltyAccount()`
- `useRewards(filters)`
- `useRedeemReward()`
- `useUserBadges()`
- `useReferralCode()`
- `useLeaderboard(period)`
- `useMilestones()`
- ...and 23 more

**Messaging (30+ hooks):**
- `useConversations()`
- `useMessages(conversationId)`
- `useSendMessage()`
- `useNewMessageSubscription()`
- `useMessageTemplates()`
- `useUnreadCount()`
- ...and 24 more

---

## Need Help?

- **Full Documentation:** See `PHASE_5_COMPLETE.md`
- **All Examples:** Check service files for TypeScript interfaces
- **Translations:** See `translations-phase5.ts`
- **Complete Overview:** Read `COMPLETE_IMPLEMENTATION_SUMMARY.md`

---

**You're all set!** 🎉 Start building amazing features with Phase 5!
