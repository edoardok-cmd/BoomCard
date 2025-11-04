# DEVELOPER C - MOBILE APP IMPLEMENTATION PLAN

**Role:** Mobile App Developer (React Native/Expo)
**Timeline:** Days 5-10 (40-48 hours)
**Priority:** CRITICAL PATH
**Technologies:** React Native, Expo SDK 54, TypeScript, Stripe React Native

---

## OVERVIEW

You will implement the mobile app payment and scanning features including:
- QR scanner for BOOM-Stickers
- Payment screens (Stripe integration)
- Wallet screens
- Card management
- Receipt upload functionality

**Prerequisites:**
- Developer A must complete Wallet API (Day 2)
- Developer B must complete Card API (Day 5)

---

## PHASE 1: PAYMENT SCREENS (Days 5-6, 16 hours)

### TASK 1.1: Install Stripe SDK Dependencies (30 mins)

**Verify in `boomcard-mobile/package.json`:**
```json
{
  "@stripe/stripe-react-native": "^0.55.1"
}
```

**Already installed! ✓**

---

### TASK 1.2: Setup Stripe Provider (1 hour)

**File:** `boomcard-mobile/App.tsx`

**Wrap app with StripeProvider:**

```typescript
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';

const STRIPE_PUBLISHABLE_KEY = Constants.expoConfig?.extra?.stripePublishableKey ||
  'pk_test_51SPa5NFFte7x2hqqQrZJf25fX8yHIfZOrO7vvc11LFvWcPoDGonM0ggtIp2c3QVJCC2z0QqnMSlnf0RbqDT8pMqu00gDH6DuZc';

function App() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <AuthProvider>
        <NavigationContainer>
          {/* ... rest of app */}
        </NavigationContainer>
      </AuthProvider>
    </StripeProvider>
  );
}
```

---

### TASK 1.3: Create Wallet Screen (3 hours)

**File:** `boomcard-mobile/src/screens/payments/WalletScreen.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Card, Button, FAB, List, Chip } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { walletApi } from '../../api/wallet.api';
import { formatCurrency } from '../../utils/format';

export function WalletScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState({
    balance: 0,
    availableBalance: 0,
    pendingBalance: 0,
    currency: 'BGN',
  });
  const [transactions, setTransactions] = useState([]);
  const [statistics, setStatistics] = useState({
    totalCashback: 0,
    totalTopups: 0,
    totalSpent: 0,
  });

  const loadWalletData = async () => {
    try {
      const [balanceData, txData, statsData] = await Promise.all([
        walletApi.getBalance(),
        walletApi.getTransactions({ limit: 10 }),
        walletApi.getStatistics(),
      ]);

      setBalance(balanceData);
      setTransactions(txData.transactions);
      setStatistics(statsData);
    } catch (error) {
      console.error('Failed to load wallet:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadWalletData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadWalletData();
  };

  const handleTopUp = () => {
    navigation.navigate('TopUp');
  };

  const getTransactionIcon = (type: string) => {
    const icons = {
      TOP_UP: 'plus-circle',
      CASHBACK_CREDIT: 'gift',
      PURCHASE: 'shopping',
      REFUND: 'undo',
      WITHDRAWAL: 'minus-circle',
    };
    return icons[type] || 'swap-horizontal';
  };

  const getTransactionColor = (type: string) => {
    const colors = {
      TOP_UP: '#4caf50',
      CASHBACK_CREDIT: '#ff9800',
      PURCHASE: '#f44336',
      REFUND: '#2196f3',
      WITHDRAWAL: '#f44336',
    };
    return colors[type] || '#757575';
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading wallet...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Balance Card */}
        <Card style={styles.balanceCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.balanceLabel}>
              Available Balance
            </Text>
            <Text variant="displayMedium" style={styles.balanceAmount}>
              {formatCurrency(balance.availableBalance, balance.currency)}
            </Text>

            {balance.pendingBalance > 0 && (
              <View style={styles.pendingContainer}>
                <Chip icon="clock" mode="outlined">
                  {formatCurrency(balance.pendingBalance, balance.currency)} pending
                </Chip>
              </View>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Total Cashback
                </Text>
                <Text variant="titleMedium" style={styles.statValue}>
                  {formatCurrency(statistics.totalCashback, balance.currency)}
                </Text>
              </View>

              <View style={styles.statItem}>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Total Spent
                </Text>
                <Text variant="titleMedium" style={styles.statValue}>
                  {formatCurrency(statistics.totalSpent, balance.currency)}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Recent Transactions */}
        <Card style={styles.transactionsCard}>
          <Card.Title title="Recent Transactions" />
          <Card.Content>
            {transactions.length === 0 ? (
              <Text style={styles.emptyText}>No transactions yet</Text>
            ) : (
              transactions.map((tx: any) => (
                <List.Item
                  key={tx.id}
                  title={tx.description || tx.type}
                  description={new Date(tx.createdAt).toLocaleDateString()}
                  left={(props) => (
                    <List.Icon
                      {...props}
                      icon={getTransactionIcon(tx.type)}
                      color={getTransactionColor(tx.type)}
                    />
                  )}
                  right={() => (
                    <Text
                      style={[
                        styles.transactionAmount,
                        { color: tx.amount >= 0 ? '#4caf50' : '#f44336' },
                      ]}
                    >
                      {tx.amount >= 0 ? '+' : ''}
                      {formatCurrency(tx.amount, balance.currency)}
                    </Text>
                  )}
                />
              ))
            )}

            {transactions.length > 0 && (
              <Button
                mode="text"
                onPress={() => navigation.navigate('TransactionHistory')}
              >
                View All Transactions
              </Button>
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Top Up FAB */}
      <FAB
        style={styles.fab}
        icon="plus"
        label="Top Up"
        onPress={handleTopUp}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCard: {
    margin: 16,
    elevation: 4,
  },
  balanceLabel: {
    opacity: 0.7,
    marginBottom: 8,
  },
  balanceAmount: {
    fontWeight: 'bold',
    marginBottom: 16,
  },
  pendingContainer: {
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    opacity: 0.6,
    marginBottom: 4,
  },
  statValue: {
    fontWeight: '600',
  },
  transactionsCard: {
    margin: 16,
    marginTop: 0,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
    paddingVertical: 24,
  },
  transactionAmount: {
    fontWeight: '600',
    fontSize: 16,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
```

---

### TASK 1.4: Create Wallet API Client (1 hour)

**File:** `boomcard-mobile/src/api/wallet.api.ts`

```typescript
import { apiClient } from './client';

export const walletApi = {
  /**
   * Get wallet balance
   */
  async getBalance() {
    const response = await apiClient.get('/wallet/balance');
    return response.data;
  },

  /**
   * Get wallet transactions
   */
  async getTransactions(params?: {
    type?: string;
    limit?: number;
    offset?: number;
  }) {
    const response = await apiClient.get('/wallet/transactions', { params });
    return response.data;
  },

  /**
   * Get wallet statistics
   */
  async getStatistics() {
    const response = await apiClient.get('/wallet/statistics');
    return response.data;
  },

  /**
   * Create top-up payment intent
   */
  async createTopUp(amount: number, paymentMethodId?: string) {
    const response = await apiClient.post('/wallet/topup', {
      amount,
      paymentMethodId,
    });
    return response.data;
  },
};
```

---

### TASK 1.5: Create Top Up Screen (4 hours)

**File:** `boomcard-mobile/src/screens/payments/TopUpScreen.tsx`

```typescript
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, Button, TextInput, HelperText } from 'react-native-paper';
import { CardField, useStripe, useConfirmPayment } from '@stripe/stripe-react-native';
import { walletApi } from '../../api/wallet.api';
import { useNavigation } from '@react-navigation/native';

const PRESET_AMOUNTS = [10, 20, 50, 100, 200];

export function TopUpScreen() {
  const navigation = useNavigation();
  const { confirmPayment } = useConfirmPayment();

  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);

  const handlePresetAmount = (value: number) => {
    setAmount(value.toString());
  };

  const handleTopUp = async () => {
    const amountValue = parseFloat(amount);

    if (!amountValue || amountValue < 5) {
      Alert.alert('Error', 'Minimum top-up amount is 5 BGN');
      return;
    }

    if (amountValue > 10000) {
      Alert.alert('Error', 'Maximum top-up amount is 10,000 BGN');
      return;
    }

    if (!cardComplete) {
      Alert.alert('Error', 'Please enter valid card details');
      return;
    }

    setLoading(true);

    try {
      // Create payment intent
      const { paymentIntent, transaction } = await walletApi.createTopUp(amountValue);

      // Confirm payment with Stripe
      const { error, paymentIntent: confirmedPayment } = await confirmPayment(
        paymentIntent.clientSecret,
        {
          paymentMethodType: 'Card',
        }
      );

      if (error) {
        Alert.alert('Payment Failed', error.message);
        return;
      }

      if (confirmedPayment?.status === 'Succeeded') {
        Alert.alert(
          'Success',
          `Your wallet has been topped up with ${amountValue} BGN`,
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Title title="Top Up Wallet" />
        <Card.Content>
          {/* Preset Amounts */}
          <Text variant="labelLarge" style={styles.label}>
            Quick Amounts
          </Text>
          <View style={styles.presetContainer}>
            {PRESET_AMOUNTS.map((value) => (
              <Button
                key={value}
                mode={amount === value.toString() ? 'contained' : 'outlined'}
                style={styles.presetButton}
                onPress={() => handlePresetAmount(value)}
              >
                {value} BGN
              </Button>
            ))}
          </View>

          {/* Custom Amount */}
          <TextInput
            label="Custom Amount (BGN)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
          />
          <HelperText type="info">
            Minimum: 5 BGN • Maximum: 10,000 BGN
          </HelperText>

          {/* Card Details */}
          <Text variant="labelLarge" style={styles.label}>
            Card Details
          </Text>
          <View style={styles.cardFieldContainer}>
            <CardField
              postalCodeEnabled={false}
              placeholders={{
                number: '4242 4242 4242 4242',
              }}
              cardStyle={styles.cardField}
              style={styles.cardFieldWrapper}
              onCardChange={(cardDetails) => {
                setCardComplete(cardDetails.complete);
              }}
            />
          </View>

          {/* Payment Button */}
          <Button
            mode="contained"
            onPress={handleTopUp}
            loading={loading}
            disabled={loading || !amount || !cardComplete}
            style={styles.payButton}
          >
            {loading ? 'Processing...' : `Pay ${amount || '0'} BGN`}
          </Button>

          <HelperText type="info" style={styles.secureNote}>
            🔒 Your payment is secure and encrypted
          </HelperText>
        </Card.Content>
      </Card>

      {/* Test Cards Info (only in development) */}
      {__DEV__ && (
        <Card style={styles.card}>
          <Card.Title title="Test Cards (Development)" />
          <Card.Content>
            <Text variant="bodySmall">
              • Success: 4242 4242 4242 4242{'\n'}
              • Declined: 4000 0000 0000 0002{'\n'}
              • 3D Secure: 4000 0025 0000 3155
            </Text>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    margin: 16,
  },
  label: {
    marginTop: 16,
    marginBottom: 8,
  },
  presetContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  presetButton: {
    flex: 1,
    minWidth: '30%',
  },
  input: {
    marginTop: 8,
  },
  cardFieldContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  cardFieldWrapper: {
    height: 50,
  },
  cardField: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
  },
  payButton: {
    marginTop: 24,
    paddingVertical: 8,
  },
  secureNote: {
    textAlign: 'center',
    marginTop: 8,
  },
});
```

---

### TASK 1.6: Create Payment Methods Screen (3 hours)

**File:** `boomcard-mobile/src/screens/payments/PaymentMethodsScreen.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, Button, List, IconButton, FAB } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { paymentsApi } from '../../api/payments.api';

export function PaymentMethodsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);

  const loadCards = async () => {
    try {
      const data = await paymentsApi.getPaymentMethods();
      setCards(data.cards || []);
    } catch (error) {
      console.error('Failed to load cards:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, []);

  const handleSetDefault = async (cardId: string) => {
    try {
      await paymentsApi.setDefaultPaymentMethod(cardId);
      Alert.alert('Success', 'Default card updated');
      loadCards();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleRemoveCard = async (cardId: string) => {
    Alert.alert(
      'Remove Card',
      'Are you sure you want to remove this card?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await paymentsApi.removePaymentMethod(cardId);
              Alert.alert('Success', 'Card removed');
              loadCards();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const getCardIcon = (brand: string) => {
    const icons: Record<string, string> = {
      visa: 'credit-card',
      mastercard: 'credit-card',
      amex: 'credit-card',
    };
    return icons[brand.toLowerCase()] || 'credit-card';
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading cards...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        {cards.length === 0 ? (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.emptyText}>No saved cards</Text>
              <Text style={styles.emptySubtext}>
                Add a card to make payments faster
              </Text>
            </Card.Content>
          </Card>
        ) : (
          cards.map((card: any) => (
            <Card key={card.id} style={styles.card}>
              <List.Item
                title={`${card.brand.toUpperCase()} •••• ${card.last4}`}
                description={`Expires ${card.expiryMonth}/${card.expiryYear}`}
                left={(props) => (
                  <List.Icon {...props} icon={getCardIcon(card.brand)} />
                )}
                right={() => (
                  <View style={styles.cardActions}>
                    {card.isDefault && (
                      <Text style={styles.defaultBadge}>DEFAULT</Text>
                    )}
                    {!card.isDefault && (
                      <Button
                        mode="text"
                        onPress={() => handleSetDefault(card.id)}
                      >
                        Set Default
                      </Button>
                    )}
                    <IconButton
                      icon="delete"
                      onPress={() => handleRemoveCard(card.id)}
                    />
                  </View>
                )}
              />
            </Card>
          ))
        )}
      </ScrollView>

      <FAB
        style={styles.fab}
        icon="plus"
        label="Add Card"
        onPress={() => navigation.navigate('AddCard')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    margin: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 18,
    marginBottom: 8,
  },
  emptySubtext: {
    textAlign: 'center',
    opacity: 0.6,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  defaultBadge: {
    backgroundColor: '#4caf50',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
```

---

### TASK 1.7: Create Payments API Client (1 hour)

**File:** `boomcard-mobile/src/api/payments.api.ts`

```typescript
import { apiClient } from './client';

export const paymentsApi = {
  /**
   * Get saved payment methods
   */
  async getPaymentMethods() {
    const response = await apiClient.get('/payments/cards');
    return response.data;
  },

  /**
   * Add payment method
   */
  async addPaymentMethod(paymentMethodId: string) {
    const response = await apiClient.post('/payments/cards', {
      paymentMethodId,
    });
    return response.data;
  },

  /**
   * Remove payment method
   */
  async removePaymentMethod(paymentMethodId: string) {
    await apiClient.delete(`/payments/cards/${paymentMethodId}`);
  },

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(paymentMethodId: string) {
    const response = await apiClient.post(
      `/payments/cards/${paymentMethodId}/default`
    );
    return response.data;
  },
};
```

---

### TASK 1.8: Update Navigation (1.5 hours)

**File:** `boomcard-mobile/src/navigation/AppNavigator.tsx`

**Add payment screens to stack:**

```typescript
// Import screens
import { WalletScreen } from '../screens/payments/WalletScreen';
import { TopUpScreen } from '../screens/payments/TopUpScreen';
import { PaymentMethodsScreen } from '../screens/payments/PaymentMethodsScreen';
import { TransactionHistoryScreen } from '../screens/payments/TransactionHistoryScreen';

// In Stack.Navigator
<Stack.Screen
  name="Wallet"
  component={WalletScreen}
  options={{ title: 'My Wallet' }}
/>
<Stack.Screen
  name="TopUp"
  component={TopUpScreen}
  options={{ title: 'Top Up Wallet' }}
/>
<Stack.Screen
  name="PaymentMethods"
  component={PaymentMethodsScreen}
  options={{ title: 'Payment Methods' }}
/>
<Stack.Screen
  name="TransactionHistory"
  component={TransactionHistoryScreen}
  options={{ title: 'Transaction History' }}
/>
```

---

## PHASE 2: CARD & QR SCANNER (Days 7-8, 16 hours)

### TASK 2.1: Create Card Display Screen (3 hours)

**File:** `boomcard-mobile/src/screens/cards/MyCardScreen.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Text, Card, Button, Chip } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { cardApi } from '../../api/card.api';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;

const CARD_GRADIENTS = {
  STANDARD: ['#757575', '#424242'],
  PREMIUM: ['#ffd700', '#ffed4e'],
  PLATINUM: ['#e5e5e5', '#ffffff'],
};

export function MyCardScreen() {
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<any>(null);
  const [statistics, setStatistics] = useState<any>(null);

  const loadCard = async () => {
    try {
      const [cardData, statsData] = await Promise.all([
        cardApi.getMyCard(),
        cardApi.getStatistics(),
      ]);

      setCard(cardData);
      setStatistics(statsData);
    } catch (error) {
      console.error('Failed to load card:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCard();
  }, []);

  if (loading || !card) {
    return (
      <View style={styles.centered}>
        <Text>Loading card...</Text>
      </View>
    );
  }

  const qrData = JSON.stringify({
    cardNumber: card.cardNumber,
    userId: card.userId,
    type: card.cardType,
    issuedAt: card.issuedAt,
  });

  return (
    <ScrollView style={styles.container}>
      {/* Card Visual */}
      <View style={styles.cardContainer}>
        <LinearGradient
          colors={CARD_GRADIENTS[card.cardType]}
          style={styles.cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLogo}>BOOMCARD</Text>
              <Chip mode="flat" textStyle={styles.tierText}>
                {card.cardType}
              </Chip>
            </View>

            <View style={styles.qrContainer}>
              <View style={styles.qrWrapper}>
                <QRCode
                  value={qrData}
                  size={140}
                  backgroundColor="white"
                  color="black"
                  logo={require('../../../assets/icon.png')}
                  logoSize={30}
                  logoBackgroundColor="white"
                  logoBorderRadius={15}
                />
              </View>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.cardNumber}>{card.cardNumber}</Text>
              <Text style={styles.memberSince}>
                Member since {new Date(card.issuedAt).getFullYear()}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Benefits */}
      <Card style={styles.benefitsCard}>
        <Card.Title title="Your Benefits" />
        <Card.Content>
          {card.benefits.features.map((feature: string, index: number) => (
            <Text key={index} style={styles.benefitItem}>
              ✓ {feature}
            </Text>
          ))}
        </Card.Content>
      </Card>

      {/* Statistics */}
      {statistics && (
        <Card style={styles.statsCard}>
          <Card.Title title="Your Activity" />
          <Card.Content>
            <View style={styles.statRow}>
              <View style={styles.statItem}>
                <Text variant="headlineMedium" style={styles.statValue}>
                  {statistics.receiptsScanned}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Receipts Scanned
                </Text>
              </View>

              <View style={styles.statItem}>
                <Text variant="headlineMedium" style={styles.statValue}>
                  {statistics.stickersScanned}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Stickers Scanned
                </Text>
              </View>
            </View>

            <View style={styles.cashbackContainer}>
              <Text variant="titleLarge" style={styles.cashbackAmount}>
                {statistics.totalCashbackEarned.toFixed(2)} BGN
              </Text>
              <Text variant="bodySmall" style={styles.cashbackLabel}>
                Total Cashback Earned
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Upgrade Card (if not Platinum) */}
      {card.cardType !== 'PLATINUM' && (
        <Card style={styles.upgradeCard}>
          <Card.Title title="Upgrade Your Card" />
          <Card.Content>
            <Text>
              Unlock more cashback and exclusive benefits with a higher tier card
            </Text>
            <Button mode="contained" style={styles.upgradeButton}>
              View Upgrade Options
            </Button>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    padding: 16,
  },
  cardGradient: {
    borderRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 24,
    height: CARD_WIDTH * 0.63, // Standard credit card ratio
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLogo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  tierText: {
    color: 'white',
    fontWeight: 'bold',
  },
  qrContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrWrapper: {
    backgroundColor: 'white',
    padding: 8,
    borderRadius: 12,
  },
  cardFooter: {
    marginTop: 'auto',
  },
  cardNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  memberSince: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  benefitsCard: {
    margin: 16,
    marginTop: 0,
  },
  benefitItem: {
    paddingVertical: 4,
  },
  statsCard: {
    margin: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontWeight: 'bold',
    color: '#2196f3',
  },
  statLabel: {
    opacity: 0.6,
    textAlign: 'center',
  },
  cashbackContainer: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
  },
  cashbackAmount: {
    color: '#ff9800',
    fontWeight: 'bold',
  },
  cashbackLabel: {
    opacity: 0.6,
  },
  upgradeCard: {
    margin: 16,
  },
  upgradeButton: {
    marginTop: 16,
  },
});
```

---

### TASK 2.2: Create Card API Client (30 mins)

**File:** `boomcard-mobile/src/api/card.api.ts`

```typescript
import { apiClient } from './client';

export const cardApi = {
  /**
   * Get user's card
   */
  async getMyCard() {
    const response = await apiClient.get('/cards/my-card');
    return response.data;
  },

  /**
   * Get card benefits
   */
  async getBenefits() {
    const response = await apiClient.get('/cards/benefits');
    return response.data;
  },

  /**
   * Get card statistics
   */
  async getStatistics() {
    // Assuming card ID is in the card object
    const card = await this.getMyCard();
    const response = await apiClient.get(`/cards/${card.id}/statistics`);
    return response.data;
  },

  /**
   * Validate card
   */
  async validateCard(cardNumber: string) {
    const response = await apiClient.post('/cards/validate', { cardNumber });
    return response.data;
  },
};
```

---

### TASK 2.3: Create Sticker Scanner Screen (5 hours)

**File:** `boomcard-mobile/src/screens/stickers/StickerScannerScreen.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, Portal, Modal, TextInput, HelperText } from 'react-native-paper';
import { CameraView, Camera } from 'expo-camera';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { stickerApi } from '../../api/sticker.api';

export function StickerScannerScreen() {
  const navigation = useNavigation();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [showAmountModal, setShowAmountModal] = useState(false);
  const [stickerId, setStickerId] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const cameraStatus = await Camera.requestCameraPermissionsAsync();
    const locationStatus = await Location.requestForegroundPermissionsAsync();

    setHasPermission(
      cameraStatus.status === 'granted' && locationStatus.status === 'granted'
    );
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;

    setScanned(true);
    setStickerId(data);
    setShowAmountModal(true);
  };

  const handleConfirmScan = async () => {
    const amount = parseFloat(billAmount);

    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid bill amount');
      return;
    }

    setProcessing(true);

    try {
      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Initiate scan
      const scan = await stickerApi.scanSticker({
        stickerId,
        billAmount: amount,
        gpsLatitude: location.coords.latitude,
        gpsLongitude: location.coords.longitude,
      });

      setShowAmountModal(false);
      setBillAmount('');

      // Navigate to receipt upload
      navigation.navigate('UploadReceipt', {
        scanId: scan.id,
        billAmount: amount,
        cashbackAmount: scan.cashbackAmount,
      });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || error.message);
      setScanned(false);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    setShowAmountModal(false);
    setBillAmount('');
    setScanned(false);
  };

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <Text>Requesting permissions...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          Camera and location permissions are required
        </Text>
        <Button mode="contained" onPress={requestPermissions}>
          Grant Permissions
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>

          <Text style={styles.instructions}>
            Scan the QR code on the BOOM-Sticker
          </Text>
        </View>
      </CameraView>

      {/* Amount Input Modal */}
      <Portal>
        <Modal
          visible={showAmountModal}
          onDismiss={handleCancel}
          contentContainerStyle={styles.modal}
        >
          <Text variant="headlineSmall" style={styles.modalTitle}>
            Enter Bill Amount
          </Text>

          <TextInput
            label="Bill Amount (BGN)"
            value={billAmount}
            onChangeText={setBillAmount}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
            autoFocus
          />

          <HelperText type="info">
            You will earn 5-10% cashback on this amount
          </HelperText>

          <View style={styles.modalButtons}>
            <Button
              mode="outlined"
              onPress={handleCancel}
              style={styles.button}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleConfirmScan}
              style={styles.button}
              loading={processing}
              disabled={processing}
            >
              Continue
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 16,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: 'white',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  instructions: {
    color: 'white',
    marginTop: 32,
    textAlign: 'center',
    fontSize: 16,
  },
  modal: {
    backgroundColor: 'white',
    padding: 24,
    margin: 20,
    borderRadius: 8,
  },
  modalTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 8,
  },
  button: {
    flex: 1,
  },
});
```

---

### TASK 2.4: Create Upload Receipt Screen (4 hours)

**File:** `boomcard-mobile/src/screens/stickers/UploadReceiptScreen.tsx`

```typescript
import React, { useState } from 'react';
import { View, StyleSheet, Image, Alert } from 'react-native';
import { Text, Card, Button } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { useRoute, useNavigation } from '@react-navigation/native';
import { stickerApi } from '../../api/sticker.api';

export function UploadReceiptScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { scanId, billAmount, cashbackAmount } = route.params as any;

  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    if (!image) {
      Alert.alert('Error', 'Please select a receipt image');
      return;
    }

    setUploading(true);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('image', {
        uri: image,
        type: 'image/jpeg',
        name: 'receipt.jpg',
      } as any);

      // Upload receipt
      await stickerApi.uploadReceipt(scanId, formData);

      Alert.alert(
        'Success',
        `Receipt uploaded! You will earn ${cashbackAmount.toFixed(2)} BGN cashback once approved.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('StickerScans'),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to upload receipt');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge" style={styles.title}>
            Upload Your Receipt
          </Text>

          <View style={styles.infoRow}>
            <Text>Bill Amount:</Text>
            <Text style={styles.value}>{billAmount.toFixed(2)} BGN</Text>
          </View>

          <View style={styles.infoRow}>
            <Text>Expected Cashback:</Text>
            <Text style={[styles.value, styles.cashback]}>
              {cashbackAmount.toFixed(2)} BGN
            </Text>
          </View>

          {image ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: image }} style={styles.image} />
              <Button mode="text" onPress={() => setImage(null)}>
                Remove Image
              </Button>
            </View>
          ) : (
            <View style={styles.imagePickers}>
              <Button
                mode="contained"
                icon="camera"
                onPress={pickImage}
                style={styles.imageButton}
              >
                Take Photo
              </Button>
              <Button
                mode="outlined"
                icon="image"
                onPress={pickFromGallery}
                style={styles.imageButton}
              >
                Choose from Gallery
              </Button>
            </View>
          )}

          <Button
            mode="contained"
            onPress={handleUpload}
            loading={uploading}
            disabled={!image || uploading}
            style={styles.uploadButton}
          >
            {uploading ? 'Uploading...' : 'Upload Receipt'}
          </Button>

          <Text variant="bodySmall" style={styles.note}>
            Make sure the receipt is clear and shows the total amount
          </Text>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  card: {
    flex: 1,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  value: {
    fontWeight: '600',
  },
  cashback: {
    color: '#ff9800',
  },
  imageContainer: {
    marginVertical: 16,
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: 8,
  },
  imagePickers: {
    marginVertical: 24,
    gap: 12,
  },
  imageButton: {
    paddingVertical: 8,
  },
  uploadButton: {
    marginTop: 16,
    paddingVertical: 8,
  },
  note: {
    textAlign: 'center',
    opacity: 0.6,
    marginTop: 16,
  },
});
```

---

## ACCEPTANCE CRITERIA

### Phase 1 (Payment Screens) ✅
- [ ] Stripe SDK integrated
- [ ] Wallet screen shows balance
- [ ] Can top up wallet with card
- [ ] Payment succeeds with test cards
- [ ] Wallet balance updates after top-up
- [ ] Payment methods screen lists cards
- [ ] Can set default card
- [ ] Can remove cards

### Phase 2 (Card & Scanner) ✅
- [ ] Card screen displays QR code
- [ ] QR code scannable
- [ ] Camera permissions work
- [ ] Can scan BOOM-Sticker QR codes
- [ ] GPS location captured
- [ ] Can enter bill amount
- [ ] Can upload receipt photo
- [ ] Receipt upload succeeds

---

## TESTING CHECKLIST

- [ ] Test payment with Stripe test cards
- [ ] Test failed payment handling
- [ ] Test wallet balance updates
- [ ] Test QR scanner with real QR codes
- [ ] Test camera permissions denied
- [ ] Test location permissions denied
- [ ] Test receipt upload with various image sizes
- [ ] Test offline scenarios

---

## DEPENDENCIES

**Depends On:**
- Developer A Day 2 (Wallet API)
- Developer B Day 5 (Card API)

**Blocks:**
- QA testing

---

## NOTES

- Use Stripe test keys in development
- Test cards: 4242 4242 4242 4242 (success)
- QR scanner needs real device (simulator limited)
- Location must be enabled for sticker scans
- Receipt images auto-compressed to reduce size

---

**Status Updates:** Daily in team channel
