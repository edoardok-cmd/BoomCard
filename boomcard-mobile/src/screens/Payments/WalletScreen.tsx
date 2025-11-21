/**
 * Wallet Screen
 *
 * Display wallet balance, pending balance, and recent transactions
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Card, Button, FAB, List, Chip } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { walletApi } from '../../api/wallet.api';
import { formatDualCurrency } from '../../utils/format';

export default function WalletScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState({
    balance: 0,
    availableBalance: 0,
    pendingBalance: 0,
    currency: 'BGN',
  });
  const [transactions, setTransactions] = useState<any[]>([]);
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
      setTransactions(txData.transactions || []);
      setStatistics(statsData);
    } catch (error: any) {
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
    (navigation as any).navigate('TopUp');
  };

  const getTransactionIcon = (type: string) => {
    const icons: Record<string, string> = {
      TOP_UP: 'plus-circle',
      CASHBACK_CREDIT: 'gift',
      PURCHASE: 'shopping',
      REFUND: 'undo',
      WITHDRAWAL: 'minus-circle',
    };
    return icons[type] || 'swap-horizontal';
  };

  const getTransactionColor = (type: string) => {
    const colors: Record<string, string> = {
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
        <Text>{t('wallet.loadingWallet')}</Text>
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
              {t('wallet.availableBalance')}
            </Text>
            <Text variant="displayMedium" style={styles.balanceAmount}>
              {formatDualCurrency(balance.availableBalance)}
            </Text>

            {balance.pendingBalance > 0 && (
              <View style={styles.pendingContainer}>
                <Chip icon="clock" mode="outlined">
                  {formatDualCurrency(balance.pendingBalance)} {t('wallet.pending')}
                </Chip>
              </View>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text variant="bodySmall" style={styles.statLabel}>
                  {t('wallet.totalCashback')}
                </Text>
                <Text variant="titleMedium" style={styles.statValue}>
                  {formatDualCurrency(statistics.totalCashback)}
                </Text>
              </View>

              <View style={styles.statItem}>
                <Text variant="bodySmall" style={styles.statLabel}>
                  {t('wallet.totalSpent')}
                </Text>
                <Text variant="titleMedium" style={styles.statValue}>
                  {formatDualCurrency(statistics.totalSpent)}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Recent Transactions */}
        <Card style={styles.transactionsCard}>
          <Card.Title title={t('wallet.recentTransactions')} />
          <Card.Content>
            {transactions.length === 0 ? (
              <Text style={styles.emptyText}>{t('wallet.noTransactions')}</Text>
            ) : (
              transactions.map((tx: any) => (
                <List.Item
                  key={tx.id}
                  title={tx.description || tx.type}
                  description={new Date(tx.createdAt).toLocaleDateString('bg-BG')}
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
                      {formatDualCurrency(Math.abs(tx.amount))}
                    </Text>
                  )}
                />
              ))
            )}

            {transactions.length > 0 && (
              <Button
                mode="text"
                onPress={() => (navigation as any).navigate('TransactionHistory')}
              >
                {t('wallet.viewAllTransactions')}
              </Button>
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Top Up FAB */}
      <FAB
        style={styles.fab}
        icon="plus"
        label={t('wallet.topUp')}
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
