# BOOMCARD - FOCUSED COMPLETION PLAN

**Goal:** Complete Stripe Payment Integration (80% → 100%) and BOOM-Sticker System (90% → 100%)

**Timeline:** 5-7 days

---

## WHAT'S ALREADY BUILT ✅

### Mobile App (Impressive Progress!)
- ✅ **OCR Service** - Backend integration, multilingual support, confidence scoring
- ✅ **GPS Validation** - 60-meter radius with Haversine formula
- ✅ **Receipt Scanner** - Full camera integration, GPS validation, OCR processing
- ✅ **API Client** - JWT auth, token refresh, file upload support
- ✅ **Venues API** - Discovery, search, GPS-based nearby venues
- ✅ **Offers/Loyalty APIs** - Complete feature set
- ✅ **Production Build** - EAS Build ready for App Store/Play Store

### Backend
- ✅ **Stripe Service** - Complete payment intents, customers, webhooks (445 lines)
- ✅ **Sticker Service** - Complete QR generation, scanning, fraud detection (801 lines)
- ✅ **Receipt Service** - OCR, fraud detection, cashback calculation
- ✅ **Database Models** - All models exist (User, Receipt, Sticker, Card, etc.)

---

## WHAT NEEDS TO BE COMPLETED 🎯

### PHASE 1: Backend Payment System (Days 1-2)

**Priority:** CRITICAL | **Effort:** 16-20 hours

#### Task 1.1: Create Wallet System (6-8 hours)

**Problem:** No wallet to store cashback earnings

**Solution:**

**File:** `backend-api/prisma/schema.prisma`

Add Wallet models:
```prisma
model Wallet {
  id               String   @id @default(uuid())
  userId           String   @unique
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  balance          Float    @default(0.0)
  availableBalance Float    @default(0.0)
  pendingBalance   Float    @default(0.0)
  currency         String   @default("BGN")

  isLocked         Boolean  @default(false)
  lockedReason     String?

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  transactions     WalletTransaction[]

  @@map("wallets")
}

model WalletTransaction {
  id              String   @id @default(uuid())
  walletId        String
  wallet          Wallet   @relation(fields: [walletId], references: [id], onDelete: Cascade)

  type            WalletTransactionType
  amount          Float
  balanceBefore   Float
  balanceAfter    Float
  status          WalletTransactionStatus @default(COMPLETED)
  description     String?

  receiptId       String?
  receipt         Receipt? @relation(fields: [receiptId], references: [id])
  stickerScanId   String?
  stickerScan     StickerScan? @relation(fields: [stickerScanId], references: [id])
  transactionId   String?  @unique
  transaction     Transaction? @relation(fields: [transactionId], references: [id])

  stripePaymentIntentId String?
  metadata        Json?

  createdAt       DateTime @default(now())

  @@index([walletId])
  @@index([type])
  @@map("wallet_transactions")
}

enum WalletTransactionType {
  TOP_UP
  WITHDRAWAL
  CASHBACK_CREDIT
  PURCHASE
  REFUND
}

enum WalletTransactionStatus {
  PENDING
  COMPLETED
  FAILED
  CANCELLED
}
```

**Run migration:**
```bash
cd backend-api
npx prisma migrate dev --name add_wallet_system
npx prisma generate
```

---

#### Task 1.2: Create Wallet Service (4 hours)

**File:** `backend-api/src/services/wallet.service.ts`

```typescript
import { PrismaClient, WalletTransactionType } from '@prisma/client';

const prisma = new PrismaClient();

export class WalletService {
  async getOrCreateWallet(userId: string) {
    let wallet = await prisma.wallet.findUnique({ where: { userId } });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId, balance: 0, availableBalance: 0, pendingBalance: 0 },
      });
    }

    return wallet;
  }

  async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      pendingBalance: wallet.pendingBalance,
      currency: wallet.currency,
    };
  }

  async credit(params: {
    userId: string;
    amount: number;
    type: WalletTransactionType;
    description?: string;
    receiptId?: string;
    stickerScanId?: string;
  }) {
    const { userId, amount, type, description, receiptId, stickerScanId } = params;

    if (amount <= 0) throw new Error('Credit amount must be positive');

    const wallet = await this.getOrCreateWallet(userId);

    const newBalance = wallet.balance + amount;
    const newAvailableBalance = wallet.availableBalance + amount;

    const [updatedWallet, transaction] = await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: {
          balance: newBalance,
          availableBalance: newAvailableBalance,
        },
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          status: 'COMPLETED',
          description,
          receiptId,
          stickerScanId,
        },
      }),
    ]);

    return { wallet: updatedWallet, transaction };
  }

  async getTransactions(userId: string, limit = 50, offset = 0) {
    const wallet = await this.getOrCreateWallet(userId);

    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { receipt: true, stickerScan: true },
    });

    return { transactions, total: transactions.length };
  }
}

export const walletService = new WalletService();
```

---

#### Task 1.3: Create Wallet Routes (2 hours)

**File:** `backend-api/src/routes/wallet.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { walletService } from '../services/wallet.service';

const router = Router();
router.use(authenticate);

// GET /api/wallet/balance
router.get('/balance', async (req, res) => {
  const userId = req.user!.id;
  const balance = await walletService.getBalance(userId);
  res.json(balance);
});

// GET /api/wallet/transactions
router.get('/transactions', async (req, res) => {
  const userId = req.user!.id;
  const { limit, offset } = req.query;

  const result = await walletService.getTransactions(
    userId,
    limit ? parseInt(limit as string) : undefined,
    offset ? parseInt(offset as string) : undefined
  );

  res.json(result);
});

export default router;
```

**Mount routes in `server.ts`:**
```typescript
import walletRoutes from './routes/wallet.routes';

app.use('/api/wallet', walletRoutes);
```

---

#### Task 1.4: Integrate Stripe Webhooks with Wallet (4 hours)

**File:** `backend-api/src/services/stripe.service.ts`

**Find and replace the webhook handlers (lines 382-441):**

```typescript
import { walletService } from './wallet.service';

// In handlePaymentSucceeded method (around line 383)
private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const { userId, type } = paymentIntent.metadata;

  if (!userId) return;

  // Create transaction record
  await prisma.transaction.upsert({
    where: { stripePaymentId: paymentIntent.id },
    create: {
      userId,
      type: (type || 'PURCHASE') as any,
      status: 'COMPLETED',
      amount: paymentIntent.amount / 100,
      finalAmount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      paymentMethod: 'CARD',
      stripePaymentId: paymentIntent.id,
      completedAt: new Date(),
    },
    update: { status: 'COMPLETED', completedAt: new Date() },
  });

  // If wallet top-up, credit the wallet
  if (type === 'WALLET_TOPUP') {
    await walletService.credit({
      userId,
      amount: paymentIntent.amount / 100,
      type: 'TOP_UP',
      description: 'Wallet top-up via card payment',
    });
  }
}

// In handlePaymentFailed method (around line 391)
private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const { userId, type } = paymentIntent.metadata;

  if (!userId) return;

  await prisma.transaction.upsert({
    where: { stripePaymentId: paymentIntent.id },
    create: {
      userId,
      type: (type || 'PURCHASE') as any,
      status: 'FAILED',
      amount: paymentIntent.amount / 100,
      finalAmount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      paymentMethod: 'CARD',
      stripePaymentId: paymentIntent.id,
    },
    update: { status: 'FAILED' },
  });
}
```

---

### PHASE 2: Backend Card & Sticker Integration (Days 3-4)

**Priority:** HIGH | **Effort:** 16-20 hours

#### Task 2.1: Create Card Management API (6 hours)

**File:** `backend-api/src/services/card.service.ts`

```typescript
import { PrismaClient, CardType } from '@prisma/client';
import QRCode from 'qrcode';

const prisma = new PrismaClient();

export class CardService {
  async createCard(userId: string, cardType: CardType = 'STANDARD') {
    const existingCard = await prisma.card.findFirst({ where: { userId } });
    if (existingCard) throw new Error('User already has a card');

    const cardNumber = this.generateCardNumber();

    const qrCodeData = JSON.stringify({
      cardNumber,
      userId,
      type: cardType,
      issuedAt: new Date().toISOString(),
    });

    const qrCodeUrl = await QRCode.toDataURL(qrCodeData, {
      errorCorrectionLevel: 'H',
      width: 300,
    });

    return prisma.card.create({
      data: {
        userId,
        cardNumber,
        cardType,
        status: 'ACTIVE',
        qrCode: qrCodeUrl,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000), // 3 years
      },
    });
  }

  async getUserCard(userId: string) {
    return prisma.card.findFirst({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  private generateCardNumber(): string {
    const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part3 = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BOOM-${part1}-${part2}-${part3}`;
  }

  getCardBenefits(cardType: CardType) {
    return {
      STANDARD: { cashbackRate: 0.05, bonusCashback: 0, monthlyFee: 0 },
      PREMIUM: { cashbackRate: 0.07, bonusCashback: 0.02, monthlyFee: 9.99 },
      PLATINUM: { cashbackRate: 0.10, bonusCashback: 0.05, monthlyFee: 19.99 },
    }[cardType];
  }
}

export const cardService = new CardService();
```

**File:** `backend-api/src/routes/cards.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { cardService } from '../services/card.service';

const router = Router();
router.use(authenticate);

// POST /api/cards
router.post('/', async (req, res) => {
  const userId = req.user!.id;
  const { cardType } = req.body;

  const card = await cardService.createCard(userId, cardType);
  res.status(201).json(card);
});

// GET /api/cards/my-card
router.get('/my-card', async (req, res) => {
  const userId = req.user!.id;
  const card = await cardService.getUserCard(userId);

  if (!card) {
    return res.status(404).json({ error: 'No card found' });
  }

  const benefits = cardService.getCardBenefits(card.cardType);
  res.json({ ...card, benefits });
});

export default router;
```

**Mount in server.ts:**
```typescript
import cardRoutes from './routes/cards.routes';
app.use('/api/cards', cardRoutes);
```

---

#### Task 2.2: Integrate Cashback with Wallet (6 hours)

**File:** `backend-api/src/services/sticker.service.ts`

**Find line 461-462 (the TODO comments) and replace with:**

```typescript
import { walletService } from './wallet.service';

// In approveScan method
await walletService.credit({
  userId: scan.userId,
  amount: scan.cashbackAmount,
  type: 'CASHBACK_CREDIT',
  description: `Cashback from sticker scan at ${scan.sticker.location.locationName}`,
  stickerScanId: scan.id,
});
```

**File:** `backend-api/src/services/receipt.service.ts`

**Find approveReceipt method and add:**

```typescript
import { walletService } from './wallet.service';

async approveReceipt(receiptId: string, adminNotes?: string) {
  const receipt = await prisma.receipt.update({
    where: { id: receiptId },
    data: { status: 'APPROVED', reviewedAt: new Date(), adminNotes },
  });

  // Credit cashback to wallet
  await walletService.credit({
    userId: receipt.userId,
    amount: receipt.cashbackAmount,
    type: 'CASHBACK_CREDIT',
    description: `Cashback from receipt at ${receipt.merchantName}`,
    receiptId: receipt.id,
  });

  return receipt;
}
```

---

#### Task 2.3: Auto-Create Card on Registration (2 hours)

**File:** `backend-api/src/services/auth.service.ts`

**Find the register method and add:**

```typescript
import { cardService } from './card.service';
import { walletService } from './wallet.service';

// After user creation
const user = await prisma.user.create({
  data: { email, password: hashedPassword, name, role },
});

// Auto-create card and wallet
await Promise.all([
  cardService.createCard(user.id, 'STANDARD'),
  walletService.getOrCreateWallet(user.id),
]);
```

---

### PHASE 3: Mobile Payment Integration (Days 5-6)

**Priority:** HIGH | **Effort:** 12-16 hours

#### Task 3.1: Create Wallet API Client (1 hour)

**File:** `boomcard-mobile/src/api/wallet.api.ts`

```typescript
import apiClient from './client';

export class WalletApi {
  static async getBalance() {
    return await apiClient.get('/api/wallet/balance');
  }

  static async getTransactions(params?: { limit?: number; offset?: number }) {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    return await apiClient.get(`/api/wallet/transactions?${queryParams}`);
  }
}

export default WalletApi;
```

---

#### Task 3.2: Create Card API Client (1 hour)

**File:** `boomcard-mobile/src/api/card.api.ts`

```typescript
import apiClient from './client';

export class CardApi {
  static async getMyCard() {
    return await apiClient.get('/api/cards/my-card');
  }

  static async getBenefits() {
    return await apiClient.get('/api/cards/benefits');
  }
}

export default CardApi;
```

---

#### Task 3.3: Implement Real Card/Wallet Screen (6-8 hours)

**File:** `boomcard-mobile/src/screens/Card/CardWalletScreen.tsx`

**Replace entire file with:**

```typescript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import CardApi from '../../api/card.api';
import WalletApi from '../../api/wallet.api';

const CARD_GRADIENTS = {
  STANDARD: ['#757575', '#424242'],
  PREMIUM: ['#ffd700', '#ffed4e'],
  PLATINUM: ['#e5e5e5', '#ffffff'],
};

const CardWalletScreen = ({ navigation }: any) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [card, setCard] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [cardRes, balanceRes, txRes] = await Promise.all([
        CardApi.getMyCard(),
        WalletApi.getBalance(),
        WalletApi.getTransactions({ limit: 5 }),
      ]);

      if (cardRes.success) setCard(cardRes.data);
      if (balanceRes.success) setBalance(balanceRes.data);
      if (txRes.success) setTransactions(txRes.data.transactions);
    } catch (error) {
      console.error('Failed to load card/wallet:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!card) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No card found</Text>
      </View>
    );
  }

  const qrData = JSON.stringify({
    cardNumber: card.cardNumber,
    userId: card.userId,
    type: card.cardType,
  });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {/* Card Display */}
      <LinearGradient
        colors={CARD_GRADIENTS[card.cardType as keyof typeof CARD_GRADIENTS]}
        style={styles.card}
      >
        <Text style={styles.cardTitle}>BOOMCARD</Text>
        <Text style={styles.cardType}>{card.cardType}</Text>

        <View style={styles.qrContainer}>
          <QRCode value={qrData} size={120} backgroundColor="white" />
        </View>

        <Text style={styles.cardNumber}>{card.cardNumber}</Text>
      </LinearGradient>

      {/* Wallet Balance */}
      {balance && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>
            {balance.availableBalance.toFixed(2)} {balance.currency}
          </Text>
          {balance.pendingBalance > 0 && (
            <Text style={styles.pendingBalance}>
              + {balance.pendingBalance.toFixed(2)} pending
            </Text>
          )}
        </View>
      )}

      {/* Recent Transactions */}
      <View style={styles.transactionsCard}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions yet</Text>
        ) : (
          transactions.map((tx) => (
            <View key={tx.id} style={styles.transactionItem}>
              <View>
                <Text style={styles.txDescription}>{tx.description}</Text>
                <Text style={styles.txDate}>
                  {new Date(tx.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={[styles.txAmount, tx.amount >= 0 && styles.txAmountPositive]}>
                {tx.amount >= 0 ? '+' : ''}
                {tx.amount.toFixed(2)} BGN
              </Text>
            </View>
          ))
        )}

        <TouchableOpacity
          style={styles.viewAllButton}
          onPress={() => navigation.navigate('TransactionHistory')}
        >
          <Text style={styles.viewAllText}>View All Transactions</Text>
        </TouchableOpacity>
      </View>

      {/* Card Benefits */}
      <View style={styles.benefitsCard}>
        <Text style={styles.sectionTitle}>Card Benefits</Text>
        {card.benefits.features.map((feature: string, index: number) => (
          <Text key={index} style={styles.benefitItem}>• {feature}</Text>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    margin: 16,
    borderRadius: 16,
    padding: 24,
    minHeight: 220,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  cardType: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginBottom: 16,
  },
  qrContainer: {
    backgroundColor: 'white',
    padding: 8,
    borderRadius: 8,
    alignSelf: 'center',
    marginVertical: 16,
  },
  cardNumber: {
    color: '#FFFFFF',
    fontSize: 16,
    letterSpacing: 2,
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#6B7280',
    fontSize: 14,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginVertical: 8,
  },
  pendingBalance: {
    color: '#F59E0B',
    fontSize: 14,
  },
  transactionsCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6B7280',
    padding: 20,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  txDescription: {
    fontSize: 14,
    color: '#1F2937',
  },
  txDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  txAmountPositive: {
    color: '#10B981',
  },
  viewAllButton: {
    marginTop: 12,
    padding: 12,
    alignItems: 'center',
  },
  viewAllText: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  benefitsCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
  },
  benefitItem: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
  },
});

export default CardWalletScreen;
```

---

### PHASE 4: Testing & Integration (Day 7)

**Priority:** HIGH | **Effort:** 6-8 hours

#### Task 4.1: Backend Integration Tests (3 hours)

**File:** `backend-api/tests/integration/cashback-flow.test.ts`

```typescript
import request from 'supertest';
import app from '../../src/server';

describe('Cashback Integration Flow', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@boomcard.com',
        password: 'Test123!',
        name: 'Test User',
      });

    authToken = res.body.token;
    userId = res.body.user.id;
  });

  test('User registration creates card and wallet', async () => {
    // Check card exists
    const cardRes = await request(app)
      .get('/api/cards/my-card')
      .set('Authorization', `Bearer ${authToken}`);

    expect(cardRes.status).toBe(200);
    expect(cardRes.body.cardNumber).toMatch(/^BOOM-/);

    // Check wallet exists
    const walletRes = await request(app)
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${authToken}`);

    expect(walletRes.status).toBe(200);
    expect(walletRes.body.balance).toBe(0);
  });

  test('Receipt approval credits wallet', async () => {
    // Implementation...
  });
});
```

#### Task 4.2: Mobile Integration Tests (3 hours)

Test the full flow:
1. Register → Auto-create card & wallet
2. Scan receipt → Upload → OCR processing
3. Admin approves → Cashback credited to wallet
4. Check wallet balance updates

---

## ACCEPTANCE CRITERIA ✅

### Stripe Payment Integration (100%)
- [ ] Wallet database models created and migrated
- [ ] Wallet service with credit/debit operations
- [ ] Wallet API endpoints (balance, transactions)
- [ ] Stripe webhooks save to database
- [ ] Payment success credits wallet (for top-ups)
- [ ] Default payment method detection works
- [ ] Integration tests pass

### BOOM-Sticker System (100%)
- [ ] Card management API (create, get card)
- [ ] Card auto-created on user registration
- [ ] QR code generated for each card
- [ ] Sticker scan approval credits wallet
- [ ] Receipt approval credits wallet
- [ ] Card tier affects cashback rate
- [ ] Integration tests pass

### Mobile Integration
- [ ] Wallet API client implemented
- [ ] Card API client implemented
- [ ] Card/Wallet screen shows real data
- [ ] QR code displays correctly
- [ ] Balance updates after cashback
- [ ] Transaction history displays
- [ ] Refresh works correctly

---

## TIMELINE SUMMARY

| Phase | Days | Hours | Priority |
|-------|------|-------|----------|
| Backend Wallet System | 1-2 | 16-20 | CRITICAL |
| Backend Card & Cashback | 3-4 | 16-20 | HIGH |
| Mobile Integration | 5-6 | 12-16 | HIGH |
| Testing & Polish | 7 | 6-8 | HIGH |
| **TOTAL** | **7 days** | **50-64 hours** | - |

---

## QUICK START

### Day 1: Get Started

```bash
# Backend
cd backend-api

# 1. Add wallet models to schema.prisma (copy from Task 1.1)
# 2. Run migration
npx prisma migrate dev --name add_wallet_system
npx prisma generate

# 3. Create wallet service and routes (copy from Tasks 1.2 & 1.3)
# 4. Update Stripe webhooks (copy from Task 1.4)

# Test
npm test

# Mobile (Day 5)
cd ../boomcard-mobile

# 1. Create wallet.api.ts and card.api.ts
# 2. Update CardWalletScreen.tsx
# 3. Test on device

npm start
```

---

## NOTES

- Your existing mobile work (OCR, GPS, venues) is excellent and production-ready
- The backend has all the infrastructure, just needs wallet/card APIs
- Stripe is already configured with test keys
- AWS S3 is working for image uploads
- Focus on backend first (Days 1-4), then mobile integration (Days 5-6)
- Testing on Day 7 ensures everything works end-to-end

---

## SUPPORT

**Questions?**
- Stripe issues: Check dashboard logs at dashboard.stripe.com
- Database issues: Use `npx prisma studio` to inspect data
- Mobile issues: Check React Native debugger

**Daily Check-ins:**
- [ ] Day 1: Wallet system working
- [ ] Day 2: Webhooks integrated
- [ ] Day 3: Card API complete
- [ ] Day 4: Cashback integration done
- [ ] Day 5: Mobile wallet screen working
- [ ] Day 6: Full mobile integration
- [ ] Day 7: All tests passing

---

**Ready to start?** Begin with Phase 1, Task 1.1 (Add Wallet Models)!
