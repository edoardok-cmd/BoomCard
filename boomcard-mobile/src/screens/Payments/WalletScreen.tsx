/**
 * Wallet Screen
 *
 * Display wallet balance, pending balance, and recent transactions
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { Text, Card, Button, FAB, List, Chip } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { walletApi } from '../../api/wallet.api';
import { formatDualCurrency } from '../../utils/format';

const getCashbackExpiryLabel = (item: any, t: any, locale: string): string | null => {
  if (item.type !== 'CASHBACK_CREDIT' || !item.cashbackExpiresAt) return null;
  const expiresAt = new Date(item.cashbackExpiresAt);
  const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return null;
  return t('wallet.cashbackExpiry', {
    date: expiresAt.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB'),
  });
};

export default function WalletScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState<{
    balance: number;
    availableBalance: number;
    pendingBalance: number;
    currency: string;
    isLocked: boolean;
    lastUpdated: string | null;
    payoutThreshold: number;
    payoutThresholdEUR: number;
    canRequestPayout: boolean;
  }>({
    balance: 0,
    availableBalance: 0,
    pendingBalance: 0,
    currency: 'BGN',
    isLocked: false,
    lastUpdated: null,
    payoutThreshold: 0,
    payoutThresholdEUR: 0,
    canRequestPayout: false,
  });
  const [payoutLoading, setPayoutLoading] = useState(false);
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

  const handleRequestPayout = async () => {
    setPayoutLoading(true);
    try {
      await walletApi.requestPayout();
      Alert.alert(t('wallet.requestPayout'), t('wallet.payoutSuccess'));
      loadWalletData();
    } catch (error: any) {
      Alert.alert(t('wallet.payoutError'), error.message || t('errors.unknownError'));
    } finally {
      setPayoutLoading(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    const icons: Record<string, string> = {
      TOP_UP: 'plus-circle',
      CASHBACK_CREDIT: 'gift',
      PURCHASE: 'shopping',
      REFUND: 'undo',
      WITHDRAWAL: 'minus-circle',
      ADJUSTMENT: 'tune',
    };
    return icons[type] || 'swap-horizontal';
  };

  const getTransactionColor = (type: string) => {
    const colors: Record<string, string> = {
      TOP_UP: '#10B981',
      CASHBACK_CREDIT: '#F59E0B',
      PURCHASE: '#EF4444',
      REFUND: '#3B82F6',
      WITHDRAWAL: '#EF4444',
      ADJUSTMENT: '#64748B',
    };
    return colors[type] || '#64748B';
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
        {/* Locked wallet banner */}
        {balance.isLocked && (
          <Card style={styles.lockedBanner}>
            <Card.Content>
              <Text style={styles.lockedText}>{t('wallet.walletLocked')}</Text>
            </Card.Content>
          </Card>
        )}

        {/* Balance Card */}
        <Card style={styles.balanceCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.balanceLabel}>
              {t('wallet.availableBalance')}
            </Text>
            <Text variant="displayMedium" style={styles.balanceAmount}>
              {formatDualCurrency(balance.availableBalance)}
            </Text>

            {balance.lastUpdated && (
              <Text variant="bodySmall" style={styles.lastUpdatedText}>
                {t('wallet.lastUpdated', { date: new Date(balance.lastUpdated).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) })}
              </Text>
            )}

            {balance.pendingBalance > 0 && (
              <View style={styles.pendingContainer}>
                <Chip icon="clock" mode="outlined">
                  {formatDualCurrency(balance.pendingBalance)} {t('wallet.pending')}
                </Chip>
              </View>
            )}

            {/* Cashback validity notice — 60-day cascading expiry per document section 5 */}
            <View style={styles.cashbackValidityRow}>
              <Text variant="bodySmall" style={styles.cashbackValidityText}>
                {t('wallet.cashbackValidity', 'Cashback is valid for 60 days. Oldest amounts expire first.')}
              </Text>
            </View>

            {/* Payout threshold and request button */}
            <View style={styles.payoutRow}>
              <Text variant="bodySmall" style={styles.payoutThresholdText}>
                {balance.isLocked
                  ? t('wallet.walletLocked')
                  : balance.canRequestPayout
                    ? t('wallet.payoutThresholdMet')
                    : t('wallet.payoutThresholdNotMet', {
                        amount: formatDualCurrency(balance.payoutThreshold - balance.availableBalance),
                      })}
              </Text>
              <Button
                mode="contained"
                onPress={handleRequestPayout}
                loading={payoutLoading}
                disabled={!balance.canRequestPayout || payoutLoading || balance.isLocked}
                style={[styles.payoutButton, !balance.canRequestPayout && styles.payoutButtonDisabled]}
                labelStyle={styles.payoutButtonLabel}
              >
                {t('wallet.requestPayout')}
              </Button>
            </View>

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
              transactions.map((tx: any) => {
                const expiryLabel = getCashbackExpiryLabel(tx, t, locale);
                return (
                  <List.Item
                    key={tx.id}
                    title={tx.description || tx.type}
                    description={new Date(tx.createdAt).toLocaleDateString(i18n.language === 'bg' ? 'bg-BG' : 'en-GB')}
                    left={(props) => (
                      <List.Icon
                        {...props}
                        icon={getTransactionIcon(tx.type)}
                        color={getTransactionColor(tx.type)}
                      />
                    )}
                    right={() => (
                      <View style={styles.txRight}>
                        <Text
                          style={[
                            styles.transactionAmount,
                            { color: tx.amount >= 0 ? '#10B981' : '#EF4444' },
                          ]}
                        >
                          {tx.amount >= 0 ? '+' : ''}
                          {formatDualCurrency(Math.abs(tx.amount))}
                        </Text>
                        {expiryLabel && (
                          <Text style={styles.txExpiry}>{expiryLabel}</Text>
                        )}
                      </View>
                    )}
                  />
                );
              })
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
    backgroundColor: '#FAFBFC',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedBanner: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
    borderWidth: 1,
  },
  lockedText: {
    color: '#EF4444',
    fontWeight: '600',
    textAlign: 'center',
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
    marginBottom: 4,
  },
  lastUpdatedText: {
    opacity: 0.45,
    marginBottom: 12,
  },
  pendingContainer: {
    marginBottom: 12,
  },
  cashbackValidityRow: {
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  cashbackValidityText: {
    opacity: 0.55,
    fontStyle: 'italic',
  },
  payoutRow: {
    marginTop: 12,
    gap: 8,
  },
  payoutThresholdText: {
    opacity: 0.65,
    marginBottom: 4,
  },
  payoutButton: {
    backgroundColor: '#D4A843',
    borderRadius: 8,
  },
  payoutButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  payoutButtonLabel: {
    color: '#000',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
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
  txRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  txExpiry: {
    fontSize: 10,
    color: '#F59E0B',
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#D4A843',
  },
});
