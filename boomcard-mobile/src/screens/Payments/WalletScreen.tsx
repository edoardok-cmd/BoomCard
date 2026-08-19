/**
 * Wallet Screen
 *
 * Display wallet balance, pending balance, and recent transactions
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Card, Button, List, Chip } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { walletApi } from '../../api/wallet.api';
import { formatEurAmount } from '../../utils/format';

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
    expiringBalance: number;
    currency: string;
    isLocked: boolean;
    lastUpdated: string | null;
    payoutThreshold: number;
    payoutIban: string | null;
    payoutBeneficiaryName: string | null;
  }>({
    balance: 0,
    availableBalance: 0,
    pendingBalance: 0,
    expiringBalance: 0,
    currency: 'BGN',
    isLocked: false,
    lastUpdated: null,
    payoutThreshold: 0,
    payoutIban: null,
    payoutBeneficiaryName: null,
  });
  // W4: Locked ("Sent to payout") balance is derived from LOCKED cashback rows —
  // the balance endpoint does not expose a lockedBalance aggregate.
  const [lockedBalance, setLockedBalance] = useState(0);
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [statistics, setStatistics] = useState({
    totalCashback: 0,
    totalTopups: 0,
    totalSpent: 0,
  });

  const loadWalletData = async () => {
    const TIMEOUT_MS = 15000;
    const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
      Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))]);

    const [balanceResult, txResult, statsResult, lockedResult] = await Promise.allSettled([
      withTimeout(walletApi.getBalance()),
      withTimeout(walletApi.getTransactions({ limit: 10 })),
      withTimeout(walletApi.getStatistics()),
      withTimeout(walletApi.getTransactions({ status: 'LOCKED', limit: 100 })),
    ]);

    if (!mountedRef.current) return;

    if (balanceResult.status === 'fulfilled') setBalance((prev) => ({ ...prev, ...(balanceResult.value as any) }));
    if (txResult.status === 'fulfilled') setTransactions((txResult.value as any).transactions || []);
    if (statsResult.status === 'fulfilled') setStatistics(statsResult.value as any);
    if (lockedResult.status === 'fulfilled') {
      const lockedTx: any[] = (lockedResult.value as any)?.transactions || [];
      setLockedBalance(lockedTx.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0));
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadWalletData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadWalletData();
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
              {formatEurAmount(balance.availableBalance)}
            </Text>

            {balance.lastUpdated && (
              <Text variant="bodySmall" style={styles.lastUpdatedText}>
                {t('wallet.lastUpdated', { date: new Date(balance.lastUpdated).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) })}
              </Text>
            )}

            {/* Balance breakdown — Pending ("In Review") + Locked ("Sent to payout") (W4) */}
            {(balance.pendingBalance > 0 || lockedBalance > 0) && (
              <View style={styles.breakdownContainer}>
                {balance.pendingBalance > 0 && (
                  <Chip icon="clock" mode="outlined" style={styles.breakdownChip}>
                    {formatEurAmount(balance.pendingBalance)} · {t('wallet.inReview', 'В преглед')}
                  </Chip>
                )}
                {lockedBalance > 0 && (
                  <Chip icon="bank-transfer-out" mode="outlined" style={styles.breakdownChip}>
                    {formatEurAmount(lockedBalance)} · {t('wallet.sentToPayout', 'В обработка за плащане')}
                  </Chip>
                )}
              </View>
            )}

            {/* Expiring-soon line — links to the per-record countdown in history (W5) */}
            {balance.expiringBalance > 0 && (
              <View style={styles.cashbackValidityRow}>
                <Text variant="bodySmall" style={styles.expiringText}>
                  {t('wallet.expiringSoon', { amount: formatEurAmount(balance.expiringBalance) })}
                </Text>
                <Button
                  mode="text"
                  compact
                  onPress={() => (navigation as any).navigate('CashbackHistory')}
                  labelStyle={styles.expiringLinkLabel}
                >
                  {t('wallet.viewExpiryCountdown', 'Виж срокове')}
                </Button>
              </View>
            )}

            {/* Cashback validity notice — 60-day cascading expiry per document section 5 */}
            <View style={styles.cashbackValidityRow}>
              <Text variant="bodySmall" style={styles.cashbackValidityText}>
                {t('wallet.cashbackValidity', 'Cashback is valid for 60 days. Oldest amounts expire first.')}
              </Text>
            </View>

            {/* Payout account setup + passive auto-payout hint (W1/W9).
                There is NO user-initiated payout action — payouts are automatic. */}
            <View style={styles.payoutRow}>
              {!balance.payoutIban ? (
                <Button
                  mode="outlined"
                  icon="bank-outline"
                  onPress={() => (navigation as any).navigate('EditProfile')}
                  style={styles.setupBannerButton}
                  labelStyle={styles.setupBannerLabel}
                >
                  {t('wallet.setupPayoutAccount')}
                </Button>
              ) : (
                <Text variant="bodySmall" style={styles.ibanStoredText}>
                  {t('wallet.payoutIbanStored', { iban: `****${balance.payoutIban.slice(-4)}` })}
                </Text>
              )}

              <Text variant="bodySmall" style={styles.payoutThresholdText}>
                {balance.isLocked
                  ? t('wallet.walletLocked')
                  : t('wallet.autoPayoutHint', {
                      amount: formatEurAmount(balance.payoutThreshold),
                      defaultValue: 'Ще получите автоматично изплащане при достигане на {{amount}}.',
                    })}
              </Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text variant="bodySmall" style={styles.statLabel}>
                  {t('wallet.totalCashback')}
                </Text>
                <Text variant="titleMedium" style={styles.statValue}>
                  {formatEurAmount(statistics.totalCashback)}
                </Text>
              </View>

              <View style={styles.statItem}>
                <Text variant="bodySmall" style={styles.statLabel}>
                  {t('wallet.totalSpent')}
                </Text>
                <Text variant="titleMedium" style={styles.statValue}>
                  {formatEurAmount(statistics.totalSpent)}
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
                          {tx.amount >= 0 ? '+' : '-'}
                          {formatEurAmount(Math.abs(tx.amount))}
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
  breakdownContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  breakdownChip: {
    marginRight: 4,
  },
  expiringText: {
    color: '#F59E0B',
    fontWeight: '600',
  },
  expiringLinkLabel: {
    fontSize: 12,
    color: '#D4A843',
  },
  cashbackValidityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
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
  setupBannerButton: {
    borderColor: '#D4A843',
    borderWidth: 1.5,
    borderRadius: 8,
  },
  setupBannerLabel: {
    color: '#D4A843',
    fontWeight: '600',
  },
  ibanStoredText: {
    opacity: 0.55,
    fontStyle: 'italic',
  },
  payoutThresholdText: {
    opacity: 0.65,
    marginBottom: 4,
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
});
