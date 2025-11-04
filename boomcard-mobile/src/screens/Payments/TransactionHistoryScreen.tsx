/**
 * Transaction History Screen
 *
 * Display all wallet transactions with filtering
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Card, List, Chip, SegmentedButtons } from 'react-native-paper';
import { walletApi } from '../../api/wallet.api';
import { formatCurrency, formatDateTime } from '../../utils/format';

export default function TransactionHistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');

  const loadTransactions = async () => {
    try {
      const params = filter !== 'all' ? { type: filter } : {};
      const data = await walletApi.getTransactions(params);
      setTransactions(data.transactions || []);
    } catch (error: any) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [filter]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadTransactions();
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

  const renderTransaction = ({ item }: { item: any }) => (
    <Card style={styles.transactionCard}>
      <List.Item
        title={item.description || item.type}
        description={formatDateTime(item.createdAt)}
        left={(props) => (
          <List.Icon
            {...props}
            icon={getTransactionIcon(item.type)}
            color={getTransactionColor(item.type)}
          />
        )}
        right={() => (
          <View style={styles.amountContainer}>
            <Text
              style={[
                styles.amount,
                { color: item.amount >= 0 ? '#4caf50' : '#f44336' },
              ]}
            >
              {item.amount >= 0 ? '+' : ''}
              {formatCurrency(item.amount, 'BGN')}
            </Text>
            <Chip
              mode="outlined"
              style={styles.statusChip}
              textStyle={styles.statusText}
            >
              {item.status}
            </Chip>
          </View>
        )}
      />
    </Card>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading transactions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SegmentedButtons
        value={filter}
        onValueChange={setFilter}
        buttons={[
          { value: 'all', label: 'All' },
          { value: 'TOP_UP', label: 'Top Ups' },
          { value: 'CASHBACK_CREDIT', label: 'Cashback' },
          { value: 'PURCHASE', label: 'Purchases' },
        ]}
        style={styles.filterButtons}
      />

      <FlatList
        data={transactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No transactions found</Text>
          </View>
        }
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
  filterButtons: {
    margin: 16,
  },
  transactionCard: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  amountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amount: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 4,
  },
  statusChip: {
    height: 24,
  },
  statusText: {
    fontSize: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    opacity: 0.6,
  },
});
