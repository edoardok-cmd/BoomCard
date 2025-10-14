# Barsy Integration - Proof of Concept Plan

## Overview
This document outlines the approach to integrate Barsy POS system as a proof of concept for BoomCard's integration capabilities.

## Research Findings
- **System**: Barsy (formerly Barsi) - Bulgarian POS system
- **Website**: barsy.bg
- **Documentation**: barsyhelp.com
- **Status**: Has API capabilities (per search results)

## Integration Approaches

### Approach 1: Real Integration (Production-Ready POC)
**Timeline**: 2-4 weeks (depending on Barsy's API complexity)

#### Phase 1: Documentation & Planning (Week 1)
- [ ] Contact Barsy for API documentation
- [ ] Request test/sandbox account
- [ ] Review API endpoints and authentication
- [ ] Design data flow architecture
- [ ] Identify required database schema changes

#### Phase 2: Backend Implementation (Week 2)
- [ ] Create database schema for Barsy integration
- [ ] Implement authentication (OAuth2 or API key)
- [ ] Build API client for Barsy
- [ ] Create webhook endpoint to receive transactions
- [ ] Implement transaction parsing and storage
- [ ] Add error handling and retry logic

#### Phase 3: Frontend & Testing (Week 3)
- [ ] Update IntegrationsPage with real Barsy data
- [ ] Build connection flow with real credentials
- [ ] Implement test connection functionality
- [ ] Add transaction sync UI
- [ ] Create admin dashboard for monitoring

#### Phase 4: Validation (Week 4)
- [ ] End-to-end testing with sandbox data
- [ ] Security audit (credential encryption)
- [ ] Performance testing
- [ ] Documentation for partners

**What You'll Need from Barsy**:
1. API documentation (endpoints, methods, data formats)
2. Authentication details (API keys, OAuth2 flow)
3. Webhook documentation (transaction events)
4. Test credentials for sandbox environment
5. Rate limits and usage quotas
6. Support contact for technical issues

---

### Approach 2: Simulated Integration (Demo POC)
**Timeline**: 3-5 days

This creates a **working demo** that shows how the integration would function, using simulated Barsy responses.

#### What This Includes:
1. **Database Schema** - Real tables for storing integration data
2. **Simulated API** - Mock Barsy API that returns realistic data
3. **Transaction Generator** - Creates fake transactions as if from Barsy
4. **Full UI Flow** - Complete connection and management interface
5. **Webhook Simulator** - Mimics real-time transaction events

#### Implementation Steps:

**Day 1-2: Database & Backend**
```typescript
// Add to Prisma schema
model Integration {
  id                String   @id @default(uuid())
  name              String   // "Barsy"
  type              String   // "POS"
  apiVersion        String   // "1.0"
  webhookUrl        String?
  status            String   // "available", "beta", "coming_soon"
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model PartnerIntegration {
  id                String   @id @default(uuid())
  partnerId         String
  integrationId     String
  status            String   // "active", "inactive", "error"
  credentials       String   // Encrypted JSON
  settings          String?  // JSON
  lastSyncAt        DateTime?
  lastSyncStatus    String?
  connectedAt       DateTime @default(now())
  updatedAt         DateTime @updatedAt

  partner           Partner     @relation(fields: [partnerId], references: [id])
  integration       Integration @relation(fields: [integrationId], references: [id])
  transactions      Transaction[]
}

// Enhanced Transaction model
model Transaction {
  id                String   @id @default(uuid())
  partnerId         String
  integrationId     String?
  externalId        String?  // Barsy transaction ID
  amount            Float
  currency          String
  description       String?
  customerId        String?
  status            String
  metadata          String?  // JSON with Barsy-specific data
  createdAt         DateTime @default(now())

  partner           Partner             @relation(fields: [partnerId], references: [id])
  integration       PartnerIntegration? @relation(fields: [integrationId], references: [id])
}
```

**Day 2-3: Simulated Barsy API Client**
```typescript
// backend-api/src/services/barsy-simulator.service.ts
class BarsySimulator {
  // Simulates Barsy API authentication
  async authenticate(apiKey: string, merchantId: string) {
    // Validate format
    if (!apiKey.startsWith('barsy_')) {
      throw new Error('Invalid API key format');
    }

    return {
      success: true,
      token: 'sim_token_' + Date.now(),
      expiresIn: 3600
    };
  }

  // Simulates fetching recent transactions
  async getTransactions(credentials: any, fromDate: Date) {
    return [
      {
        id: 'barsy_txn_' + Math.random().toString(36),
        amount: Math.floor(Math.random() * 10000) / 100,
        currency: 'BGN',
        timestamp: new Date(),
        customerId: 'cust_' + Math.floor(Math.random() * 1000),
        items: [
          { name: 'Кафе', quantity: 1, price: 3.50 },
          { name: 'Круасан', quantity: 1, price: 4.20 }
        ],
        paymentMethod: 'card',
        status: 'completed'
      },
      // ... more transactions
    ];
  }

  // Simulates webhook event
  generateWebhookEvent() {
    return {
      event: 'transaction.completed',
      timestamp: new Date().toISOString(),
      data: {
        transactionId: 'barsy_txn_' + Math.random().toString(36),
        merchantId: 'merchant_123',
        amount: 15.80,
        currency: 'BGN',
        customer: {
          id: 'cust_456',
          phone: '+359888123456'
        }
      }
    };
  }
}
```

**Day 3-4: Backend Routes**
```typescript
// backend-api/src/routes/barsy-integration.routes.ts
router.post('/integrations/barsy/connect', authenticate, async (req, res) => {
  const { apiKey, merchantId } = req.body;

  // Validate credentials with simulator
  const authResult = await barsySimulator.authenticate(apiKey, merchantId);

  if (authResult.success) {
    // Store in database (encrypted)
    const integration = await prisma.partnerIntegration.create({
      data: {
        partnerId: req.user.partnerId,
        integrationId: 'barsy',
        status: 'active',
        credentials: encrypt(JSON.stringify({ apiKey, merchantId })),
        connectedAt: new Date()
      }
    });

    // Start simulated transaction sync
    await startTransactionSync(integration.id);

    res.json({ success: true, integration });
  }
});

// Webhook endpoint
router.post('/webhooks/barsy', async (req, res) => {
  const { event, data } = req.body;

  if (event === 'transaction.completed') {
    // Process transaction
    await processTransaction(data);
  }

  res.json({ received: true });
});
```

**Day 4-5: Transaction Sync Simulator**
```typescript
// Simulates real-time transactions coming from Barsy
class TransactionSyncSimulator {
  async startSync(integrationId: string) {
    // Generate transaction every 30-60 seconds
    setInterval(async () => {
      const transaction = barsySimulator.generateWebhookEvent();

      await prisma.transaction.create({
        data: {
          partnerId: integration.partnerId,
          integrationId: integrationId,
          externalId: transaction.data.transactionId,
          amount: transaction.data.amount,
          currency: transaction.data.currency,
          status: 'completed',
          metadata: JSON.stringify(transaction.data),
          createdAt: new Date()
        }
      });

      // Trigger webhook to frontend (via WebSocket or polling)
      notifyFrontend(integrationId, transaction);
    }, Math.random() * 30000 + 30000); // 30-60 seconds
  }
}
```

#### Benefits of Simulated Approach:
✅ **Quick to implement** - No waiting for Barsy API access
✅ **Full feature demonstration** - Shows all capabilities
✅ **Easy to iterate** - Adjust simulated behavior quickly
✅ **Works for demos/investors** - Looks completely real
✅ **Template for real integration** - Code structure is the same
✅ **Can test edge cases** - Simulate errors, delays, etc.

#### Limitations:
❌ **Not production-ready** - Doesn't connect to real Barsy
❌ **No real validation** - Can't verify actual API behavior
❌ **Requires replacement** - Must swap simulator with real API client later

---

## Recommended Approach

### Hybrid Strategy: Start Simulated, Transition to Real

**Phase 1: Immediate (Week 1)**
- Build simulated integration to demonstrate concept
- Use for demos, investor presentations, user testing
- Validate UI/UX and business logic

**Phase 2: Parallel (Weeks 1-2)**
- Contact Barsy for API access
- Review documentation while simulation runs
- Identify differences between simulation and reality

**Phase 3: Integration (Weeks 3-4)**
- Replace simulator with real API client
- Keep same database schema and UI
- Test with Barsy sandbox
- Deploy to production

**Benefits**:
- ✅ Show working demo immediately
- ✅ Don't wait for Barsy response
- ✅ Learn API requirements while building
- ✅ Easy transition (same architecture)

---

## Technical Requirements for Real Integration

### What Barsy Must Provide:
1. **Authentication Method**
   - OAuth2 flow, or
   - API key + Merchant ID, or
   - JWT tokens

2. **Transaction API**
   - GET /transactions - List recent transactions
   - GET /transactions/:id - Get transaction details
   - Query parameters: date range, status, pagination

3. **Webhook Support**
   - POST to our endpoint on new transaction
   - Events: transaction.created, transaction.completed, transaction.refunded
   - Webhook signature for validation

4. **Data Format**
   ```json
   {
     "id": "txn_123",
     "merchant_id": "merchant_456",
     "amount": 25.50,
     "currency": "BGN",
     "timestamp": "2025-01-15T10:30:00Z",
     "customer": {
       "id": "cust_789",
       "phone": "+359888123456"
     },
     "items": [
       { "name": "Product", "quantity": 1, "price": 25.50 }
     ],
     "payment_method": "card",
     "status": "completed"
   }
   ```

### What We Need to Build:
1. **Database Schema** (Integration, PartnerIntegration, enhanced Transaction)
2. **API Client** - TypeScript/Node.js client for Barsy API
3. **Webhook Handler** - Secure endpoint to receive events
4. **Credential Encryption** - Store API keys securely
5. **Sync Engine** - Periodic sync + real-time webhooks
6. **Error Handling** - Retry logic, logging, alerting
7. **Admin Dashboard** - Monitor sync status, view logs
8. **Partner UI** - Connection flow, settings, transaction list

---

## Security Considerations

1. **Credential Storage**
   - Encrypt API keys at rest (AES-256)
   - Never log credentials
   - Rotate keys regularly

2. **Webhook Validation**
   - Verify webhook signatures
   - Check timestamp to prevent replay attacks
   - Rate limit webhook endpoint

3. **API Communication**
   - Always use HTTPS
   - Validate SSL certificates
   - Implement request signing

4. **Access Control**
   - Partners can only see their own integrations
   - Admin-only access to raw credentials
   - Audit log for all changes

---

## Testing Strategy

### Simulated Integration Testing:
- ✅ Connection flow works
- ✅ Credentials are stored encrypted
- ✅ Transactions appear in dashboard
- ✅ Real-time updates work
- ✅ Error handling is correct

### Real Integration Testing:
- ✅ Authentication with Barsy succeeds
- ✅ Can fetch historical transactions
- ✅ Webhooks are received and processed
- ✅ Transaction data maps correctly
- ✅ Handles Barsy API errors gracefully
- ✅ Respects rate limits
- ✅ Sync state recovers after failures

---

## Cost Estimate

### Simulated Integration:
- **Time**: 3-5 days
- **Complexity**: Low-Medium
- **Risk**: Low (no external dependencies)

### Real Integration:
- **Time**: 2-4 weeks (depending on API complexity)
- **Complexity**: Medium-High
- **Risk**: Medium (depends on Barsy API quality)

### Hybrid Approach:
- **Total Time**: 3-5 weeks
- **Immediate Value**: Day 3-5 (simulated demo)
- **Production Value**: Week 3-5 (real integration)

---

## Next Steps

### Immediate Actions:
1. **Contact Barsy** - Email/call for API documentation and test access
2. **Start Simulation** - Begin building simulated integration (don't wait)
3. **Review Architecture** - Ensure database schema supports integrations

### Questions to Ask Barsy:
1. Do you have a REST API for third-party integrations?
2. What authentication method do you use?
3. Can you provide test/sandbox credentials?
4. Do you support webhooks for real-time transaction notifications?
5. What is your API rate limit?
6. Do you have client libraries (Node.js, Python)?
7. What data do transactions include (items, customer info)?
8. How do you handle refunds and cancellations?
9. Is there API documentation we can review?
10. Do you have technical support for integration partners?

---

## Conclusion

**Recommendation**: Start with **simulated integration** immediately while pursuing real Barsy API access in parallel. This approach:
- ✅ Provides immediate demo capability
- ✅ Validates business logic and UI
- ✅ Doesn't block on external parties
- ✅ Easy to swap simulation for real API
- ✅ De-risks the integration process

The simulation will take 3-5 days and provide a fully working demo. Meanwhile, contact Barsy for API access. When/if they provide it, you can swap the simulator for the real client in 1-2 weeks.

If Barsy doesn't have an API or won't provide access, the simulation becomes your "integration" - it's functional enough for demos and can help you design the real integration when they're ready.
